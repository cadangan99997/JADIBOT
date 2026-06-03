import { Mutex } from 'async-mutex'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { proto } from '@whiskeysockets/baileys'
import { initAuthCreds } from '@whiskeysockets/baileys/lib/Utils/auth-utils.js'
import { BufferJSON } from '@whiskeysockets/baileys/lib/Utils/generics.js'

// Semua tipe key → satu file JSON per tipe (in-memory + disk)
const CONSOLIDATED_TYPES = new Set([
	'lid-mapping',
	'device-list',
	'identity-key',
	'pre-key',
	'sender-key',
	'session',
	'tctoken',
	'app-state-sync-key',
	'app-state-sync-version',
])

// sender-key-memory: in-memory saja, tidak pernah ditulis ke disk
const MEMORY_ONLY_TYPES = new Set(['sender-key-memory'])

export async function useConsolidatedAuthState(folder) {
	const folderInfo = await stat(folder).catch(() => null)
	if (!folderInfo) {
		await mkdir(folder, { recursive: true })
	} else if (!folderInfo.isDirectory()) {
		throw new Error(`[AuthState] Bukan directory: ${folder}`)
	}

	const fixFileName = (file) => file?.replace(/\//g, '__')?.replace(/:/g, '-')

	// Mutex per consolidated file
	const consolidatedLocks = new Map()
	const getConsolidatedLock = (type) => {
		let m = consolidatedLocks.get(type)
		if (!m) { m = new Mutex(); consolidatedLocks.set(type, m) }
		return m
	}

	// Mutex per individual file (non-consolidated)
	const fileLocks = new Map()
	const getFileLock = (p) => {
		let m = fileLocks.get(p)
		if (!m) { m = new Mutex(); fileLocks.set(p, m) }
		return m
	}

	// In-memory store untuk tipe konsolidasi
	const consolidatedStore = new Map()
	// In-memory only store (sender-key-memory)
	const memoryOnlyStore = new Map()
	const writeTimers = new Map()

	// Debounced write ke disk (300ms)
	const scheduleWrite = (type) => {
		if (writeTimers.has(type)) clearTimeout(writeTimers.get(type))
		writeTimers.set(type, setTimeout(async () => {
			writeTimers.delete(type)
			const store = consolidatedStore.get(type)
			if (!store) return
			const filePath = join(folder, `__consolidated-${type}.json`)
			const obj = {}
			for (const [k, v] of store) obj[k] = v
			const lock = getConsolidatedLock(type)
			await lock.acquire().then(async (release) => {
				try {
					await writeFile(filePath, JSON.stringify(obj, BufferJSON.replacer))
				} catch (err) {
					console.error(`[AuthState] Gagal tulis consolidated ${type}:`, err.message)
				} finally { release() }
			})
		}, 300))
	}

	// Write langsung (non-debounced) — untuk migrasi & creds
	const writeConsolidatedNow = async (type) => {
		const store = consolidatedStore.get(type)
		if (!store) return
		const filePath = join(folder, `__consolidated-${type}.json`)
		const obj = {}
		for (const [k, v] of store) obj[k] = v
		await writeFile(filePath, JSON.stringify(obj, BufferJSON.replacer))
	}

	// Load tiap tipe konsolidasi + migrasi file individual
	for (const type of CONSOLIDATED_TYPES) {
		const store = new Map()
		consolidatedStore.set(type, store)
		const consolidatedPath = join(folder, `__consolidated-${type}.json`)

		// Load consolidated yang sudah ada
		try {
			const raw = await readFile(consolidatedPath, 'utf-8')
			const data = JSON.parse(raw, BufferJSON.reviver)
			for (const [k, v] of Object.entries(data)) store.set(k, v)
			if (store.size > 0) console.log(`[AuthState] ✅ ${type}: ${store.size} entries dari consolidated file`)
		} catch (_) {}

		// Migrasi file individual yang masih tersisa → hapus setelah merge
		try {
			const prefix = `${type}-`
			const allFiles = await readdir(folder)
			const toMigrate = allFiles.filter(f =>
				f.startsWith(prefix) && f.endsWith('.json') && !f.startsWith('__consolidated')
			)

			if (toMigrate.length > 0) {
				console.log(`[AuthState] 🔄 Migrasi ${toMigrate.length} file ${type}...`)
				let migrated = 0
				for (const file of toMigrate) {
					const filePath = join(folder, file)
					try {
						const raw = await readFile(filePath, 'utf-8')
						const value = JSON.parse(raw, BufferJSON.reviver)
						const id = file.slice(prefix.length, -5)
						if (!store.has(id)) store.set(id, value)
						await unlink(filePath)
						migrated++
					} catch (_) {}
				}
				if (migrated > 0) {
					console.log(`[AuthState] ✅ Migrasi selesai: ${migrated} file ${type} → 1 file consolidated`)
					await writeConsolidatedNow(type)
				}
			}
		} catch (err) {
			console.error(`[AuthState] Migrasi ${type} gagal:`, err.message)
		}
	}

	// Init memory-only stores
	for (const type of MEMORY_ONLY_TYPES) {
		memoryOnlyStore.set(type, new Map())
	}

	// Hapus file sender-key-memory yang mungkin tertinggal di disk dari useMultiFileAuthState lama
	try {
		const allFiles = await readdir(folder)
		const staleMemFiles = allFiles.filter(f => f.startsWith('sender-key-memory-') && f.endsWith('.json'))
		for (const f of staleMemFiles) {
			await unlink(join(folder, f)).catch(() => {})
		}
	} catch (_) {}

	// Helpers untuk file non-consolidated (hanya creds.json, dll)
	const writeData = async (data, file) => {
		const filePath = join(folder, fixFileName(file))
		const mutex = getFileLock(filePath)
		return mutex.acquire().then(async (release) => {
			try {
				await writeFile(filePath, JSON.stringify(data, BufferJSON.replacer))
			} finally { release() }
		})
	}

	const readData = async (file) => {
		try {
			const filePath = join(folder, fixFileName(file))
			const mutex = getFileLock(filePath)
			return await mutex.acquire().then(async (release) => {
				try {
					const data = await readFile(filePath, { encoding: 'utf-8' })
					return JSON.parse(data, BufferJSON.reviver)
				} finally { release() }
			})
		} catch { return null }
	}

	const removeData = async (file) => {
		try {
			const filePath = join(folder, fixFileName(file))
			const mutex = getFileLock(filePath)
			return mutex.acquire().then(async (release) => {
				try { await unlink(filePath) } catch {} finally { release() }
			})
		} catch {}
	}

	const creds = (await readData('creds.json')) || initAuthCreds()

	return {
		state: {
			creds,
			keys: {
				get: async (type, ids) => {
					const data = {}
					if (MEMORY_ONLY_TYPES.has(type)) {
						const store = memoryOnlyStore.get(type)
						for (const id of ids) data[id] = store?.get(id) ?? null
					} else if (CONSOLIDATED_TYPES.has(type)) {
						const store = consolidatedStore.get(type)
						for (const id of ids) {
							let value = store?.get(id) ?? null
							if (type === 'app-state-sync-key' && value) {
								try { value = proto.Message.AppStateSyncKeyData.fromObject(value) } catch (_) {}
							}
							data[id] = value
						}
					} else {
						await Promise.all(ids.map(async (id) => {
							let value = await readData(`${type}-${id}.json`)
							if (type === 'app-state-sync-key' && value) {
								try { value = proto.Message.AppStateSyncKeyData.fromObject(value) } catch (_) {}
							}
							data[id] = value
						}))
					}
					return data
				},
				set: async (data) => {
					const tasks = []
					for (const category in data) {
						if (MEMORY_ONLY_TYPES.has(category)) {
							const store = memoryOnlyStore.get(category)
							for (const id in data[category]) {
								const value = data[category][id]
								if (value != null) store.set(id, value)
								else store.delete(id)
							}
						} else if (CONSOLIDATED_TYPES.has(category)) {
							const store = consolidatedStore.get(category)
							let changed = false
							for (const id in data[category]) {
								const value = data[category][id]
								if (value != null) store.set(id, value)
								else store.delete(id)
								changed = true
							}
							if (changed) scheduleWrite(category)
						} else {
							for (const id in data[category]) {
								const value = data[category][id]
								const file = `${category}-${id}.json`
								tasks.push(value != null ? writeData(value, file) : removeData(file))
							}
						}
					}
					if (tasks.length) await Promise.all(tasks)
				}
			}
		},
		saveCreds: async () => writeData(creds, 'creds.json')
	}
}
