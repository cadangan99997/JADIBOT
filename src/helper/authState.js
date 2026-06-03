import { Mutex } from 'async-mutex'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { proto } from '@whiskeysockets/baileys'
import { initAuthCreds } from '@whiskeysockets/baileys/lib/Utils/auth-utils.js'
import { BufferJSON } from '@whiskeysockets/baileys/lib/Utils/generics.js'

// Tipe yang dikonsolidasikan ke 1 file (in-memory + satu JSON)
// lid-mapping: 11k+ files → 1 file → koneksi jauh lebih cepat
const CONSOLIDATED_TYPES = new Set(['lid-mapping', 'device-list', 'identity-key'])

export async function useConsolidatedAuthState(folder) {
	const folderInfo = await stat(folder).catch(() => null)
	if (!folderInfo) {
		await mkdir(folder, { recursive: true })
	} else if (!folderInfo.isDirectory()) {
		throw new Error(`[AuthState] Bukan directory: ${folder}`)
	}

	const fixFileName = (file) => file?.replace(/\//g, '__')?.replace(/:/g, '-')

	// Mutex per-file untuk tipe individual
	const fileLocks = new Map()
	const getFileLock = (path) => {
		let m = fileLocks.get(path)
		if (!m) { m = new Mutex(); fileLocks.set(path, m) }
		return m
	}

	// In-memory store untuk tipe yang dikonsolidasikan
	const consolidatedStore = new Map()
	const writeTimers = new Map()

	// Helper: tulis consolidated file (debounced 500ms)
	const scheduleWrite = (type) => {
		if (writeTimers.has(type)) clearTimeout(writeTimers.get(type))
		writeTimers.set(type, setTimeout(async () => {
			writeTimers.delete(type)
			const store = consolidatedStore.get(type)
			if (!store) return
			const path = join(folder, `__consolidated-${type}.json`)
			const obj = {}
			for (const [k, v] of store) obj[k] = v
			try {
				await writeFile(path, JSON.stringify(obj, BufferJSON.replacer))
			} catch (err) {
				console.error(`[AuthState] Gagal tulis consolidated ${type}:`, err.message)
			}
		}, 500))
	}

	// Load + migrasi tiap tipe konsolidasi
	for (const type of CONSOLIDATED_TYPES) {
		const store = new Map()
		consolidatedStore.set(type, store)
		const consolidatedPath = join(folder, `__consolidated-${type}.json`)

		// Load consolidated yang sudah ada
		try {
			const raw = await readFile(consolidatedPath, 'utf-8')
			const data = JSON.parse(raw, BufferJSON.reviver)
			for (const [k, v] of Object.entries(data)) store.set(k, v)
			console.log(`[AuthState] ✅ ${type}: ${store.size} entries dari consolidated file`)
		} catch (_) {}

		// Migrasi file individual yang masih tersisa
		try {
			const prefix = `${type}-`
			const allFiles = await readdir(folder)
			const toMigrate = allFiles.filter(f => f.startsWith(prefix) && f.endsWith('.json'))

			if (toMigrate.length > 0) {
				console.log(`[AuthState] 🔄 Migrasi ${toMigrate.length} file ${type} individual...`)
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
				console.log(`[AuthState] ✅ Migrasi selesai: ${migrated} file ${type} → consolidated`)

				// Tulis segera (bukan debounced) setelah migrasi
				const obj = {}
				for (const [k, v] of store) obj[k] = v
				await writeFile(consolidatedPath, JSON.stringify(obj, BufferJSON.replacer))
			}
		} catch (err) {
			console.error(`[AuthState] Migrasi ${type} gagal:`, err.message)
		}
	}

	// Read/write/remove untuk tipe individual (non-consolidated)
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
					if (CONSOLIDATED_TYPES.has(type)) {
						const store = consolidatedStore.get(type)
						for (const id of ids) {
							data[id] = store?.get(id) ?? null
						}
					} else {
						await Promise.all(ids.map(async (id) => {
							let value = await readData(`${type}-${id}.json`)
							if (type === 'app-state-sync-key' && value) {
								value = proto.Message.AppStateSyncKeyData.fromObject(value)
							}
							data[id] = value
						}))
					}
					return data
				},
				set: async (data) => {
					const tasks = []
					for (const category in data) {
						if (CONSOLIDATED_TYPES.has(category)) {
							const store = consolidatedStore.get(category)
							let changed = false
							for (const id in data[category]) {
								const value = data[category][id]
								if (value != null) {
									store.set(id, value)
								} else {
									store.delete(id)
								}
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
