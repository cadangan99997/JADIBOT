/**
 * ───────────────────────────────
 *  Base Script : Bang Dika Ardnt
 *  Recode By   : Bang Wilykun
 *  WhatsApp    : 6289688206739
 *  Telegram    : @Wilykun1994
 * ───────────────────────────────
 *  Script ini khusus donasi/VIP
 *  Support dari kalian bikin saya
 *  makin semangat update fitur,
 *  fix bug, dan rawat script ini.
 *
 *  Dilarang menjual ulang script ini
 *  Tanpa izin resmi dari developer.
 *  Jika ketahuan = NO UPDATE / NO FIX
 *
 *  Hargai karya, gunakan dengan bijak.
 *  Terima kasih sudah support.
 * ───────────────────────────────
 */
'use strict';

import fs from 'fs';
import path from 'path';
import { loadConfig } from './utils.js';

const tmpDir = path.join(process.cwd(), 'tmp');

export function getDiskUsage() {
    try {
        const stat = fs.statfsSync(process.cwd());
        const total = stat.blocks * stat.bsize;
        const free = stat.bfree * stat.bsize;
        const used = total - free;
        const usedPercent = total > 0 ? ((used / total) * 100).toFixed(1) : '0.0';
        return { total, free, used, usedPercent: parseFloat(usedPercent) };
    } catch {
        return { total: 0, free: 0, used: 0, usedPercent: 0 };
    }
}

export function emergencyCleanup() {
    const cyan  = '\x1b[36m';
    const red   = '\x1b[31m';
    const reset = '\x1b[39m';
    console.log(`${red}[DiskGuard]${reset} Menjalankan pembersihan darurat...`);
    clearTmpFolder();
    clearOldFiles(0);
    try {
        const sessionDir = path.join(process.cwd(), 'sessions');
        if (fs.existsSync(sessionDir)) {
            const files = fs.readdirSync(sessionDir);
            let deleted = 0;
            for (const file of files) {
                // pre-key: JANGAN PERNAH DIHAPUS — kunci E2E penting
                if (file.startsWith('sender-key-') && !file.startsWith('sender-key-memory')) {
                    try { fs.unlinkSync(path.join(sessionDir, file)); deleted++; } catch {}
                }
            }
            if (deleted > 0) console.log(`${cyan}[DiskGuard]${reset} Hapus ${deleted} file sesi tidak perlu`);
        }
    } catch {}
    const disk = getDiskUsage();
    console.log(`${cyan}[DiskGuard]${reset} Disk setelah cleanup: ${disk.usedPercent}% terpakai (${formatBytes(disk.free)} tersisa)`);
}

export function ensureTmpDir() {
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
        console.log(`\x1b[32m[Cleaner]\x1b[39m Created tmp folder`);
    }
    return tmpDir;
}

export function getTmpPath(filename) {
    ensureTmpDir();
    return path.join(tmpDir, filename);
}

export function clearTmpFolder() {
    try {
        if (!fs.existsSync(tmpDir)) {
            console.log(`\x1b[33m[Cleaner]\x1b[39m tmp folder not found, creating...`);
            ensureTmpDir();
            return { success: true, deleted: 0, message: 'Folder created' };
        }

        const files = fs.readdirSync(tmpDir);
        let deletedCount = 0;
        let totalSize = 0;

        for (const file of files) {
            const filePath = path.join(tmpDir, file);
            try {
                const stat = fs.statSync(filePath);
                totalSize += stat.size;

                if (stat.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(filePath);
                }
                deletedCount++;
            } catch (err) {
                console.error(`\x1b[31m[Cleaner]\x1b[39m Failed to delete: ${file}`);
            }
        }

        const sizeStr = formatBytes(totalSize);
        console.log(`\x1b[32m[Cleaner]\x1b[39m Cleared ${deletedCount} files (${sizeStr})`);
        
        return { 
            success: true, 
            deleted: deletedCount, 
            size: totalSize,
            sizeFormatted: sizeStr,
            message: `Berhasil hapus ${deletedCount} file (${sizeStr})`
        };
    } catch (err) {
        console.error(`\x1b[31m[Cleaner]\x1b[39m Error:`, err.message);
        return { success: false, deleted: 0, message: err.message };
    }
}

export function clearOldFiles(hoursOld = 1) {
    try {
        ensureTmpDir();
        
        const files = fs.readdirSync(tmpDir);
        const now = Date.now();
        const maxAge = hoursOld * 60 * 60 * 1000;
        let deletedCount = 0;
        let totalSize = 0;

        for (const file of files) {
            const filePath = path.join(tmpDir, file);
            try {
                const stat = fs.statSync(filePath);
                const fileAge = now - stat.mtime.getTime();

                if (fileAge > maxAge) {
                    totalSize += stat.size;
                    
                    if (stat.isDirectory()) {
                        fs.rmSync(filePath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(filePath);
                    }
                    deletedCount++;
                }
            } catch (err) {
                // Skip files that can't be accessed
            }
        }

        const sizeStr = formatBytes(totalSize);
        if (deletedCount > 0) {
            console.log(`\x1b[32m[Cleaner]\x1b[39m Auto-cleared ${deletedCount} old files (${sizeStr})`);
        }

        return { 
            success: true, 
            deleted: deletedCount, 
            size: totalSize,
            sizeFormatted: sizeStr
        };
    } catch (err) {
        return { success: false, deleted: 0, message: err.message };
    }
}

export function getTmpStats() {
    try {
        ensureTmpDir();
        
        const files = fs.readdirSync(tmpDir);
        let totalSize = 0;
        let fileCount = 0;

        for (const file of files) {
            const filePath = path.join(tmpDir, file);
            try {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    const subFiles = fs.readdirSync(filePath);
                    fileCount += subFiles.length;
                    subFiles.forEach(subFile => {
                        try {
                            const subStat = fs.statSync(path.join(filePath, subFile));
                            totalSize += subStat.size;
                        } catch {}
                    });
                } else {
                    totalSize += stat.size;
                    fileCount++;
                }
            } catch {}
        }

        return {
            files: fileCount,
            size: totalSize,
            sizeFormatted: formatBytes(totalSize),
            path: tmpDir
        };
    } catch (err) {
        return { files: 0, size: 0, sizeFormatted: '0 B', path: tmpDir };
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

let _autoCleanerInterval = null;

export function stopAutoCleaner({ silent = false } = {}) {
    if (_autoCleanerInterval) {
        clearInterval(_autoCleanerInterval);
        _autoCleanerInterval = null;
        if (!silent) console.log(`\x1b[33m[Cleaner]\x1b[39m Auto-cleaner dihentikan`);
    }
}

let _diskMonitorInterval = null;

export function startDiskMonitor(warningPercent = 80, criticalPercent = 90) {
    if (_diskMonitorInterval) clearInterval(_diskMonitorInterval);

    const cyan  = '\x1b[36m';
    const yellow = '\x1b[33m';
    const red   = '\x1b[31m';
    const reset = '\x1b[39m';

    _diskMonitorInterval = setInterval(() => {
        const disk = getDiskUsage();
        if (disk.total === 0) return;

        if (disk.usedPercent >= criticalPercent) {
            console.log(`${red}[DiskGuard]${reset} ⚠️  DISK KRITIS ${disk.usedPercent}% terpakai! Memulai pembersihan darurat...`);
            emergencyCleanup();
        } else if (disk.usedPercent >= warningPercent) {
            console.log(`${yellow}[DiskGuard]${reset} Disk ${disk.usedPercent}% terpakai, membersihkan file lama...`);
            clearOldFiles(1);
            const diskAfter = getDiskUsage();
            console.log(`${cyan}[DiskGuard]${reset} Selesai. Disk sekarang: ${diskAfter.usedPercent}% (${formatBytes(diskAfter.free)} bebas)`);
        }
    }, 5 * 60 * 1000);

    return _diskMonitorInterval;
}

export function stopDiskMonitor() {
    if (_diskMonitorInterval) {
        clearInterval(_diskMonitorInterval);
        _diskMonitorInterval = null;
    }
}

export function startAutoCleaner(intervalHours = 6) {
    const config = loadConfig();
    const cleanerConfig = config.autoCleaner ?? { enabled: true };

    if (cleanerConfig.enabled === false) {
        console.log(`\x1b[33m[Cleaner]\x1b[39m Auto-cleaner dinonaktifkan (config)`);
        return null;
    }

    const hours = cleanerConfig.intervalHours || intervalHours;
    const warnPct  = cleanerConfig.diskWarnPercent  || 80;
    const critPct  = cleanerConfig.diskCritPercent  || 90;

    stopAutoCleaner({ silent: true });

    clearOldFiles(24);

    _autoCleanerInterval = setInterval(() => {
        clearOldFiles(hours);
    }, hours * 60 * 60 * 1000);

    console.log(`\x1b[32m[Cleaner]\x1b[39m Auto-cleaner aktif — interval setiap ${hours} jam`);

    startDiskMonitor(warnPct, critPct);

    const disk = getDiskUsage();
    if (disk.total > 0) {
        const color = disk.usedPercent >= 80 ? '\x1b[31m' : disk.usedPercent >= 60 ? '\x1b[33m' : '\x1b[32m';
        console.log(`\x1b[32m→ Disk     :\x1b[39m ${color}${disk.usedPercent}%\x1b[39m terpakai (${formatBytes(disk.free)} bebas dari ${formatBytes(disk.total)})`);
    }

    return _autoCleanerInterval;
}

export function restartAutoCleaner() {
    const config = loadConfig();
    const hours = config.autoCleaner?.intervalHours || 6;
    return startAutoCleaner(hours);
}

/**
 * Bersihkan file sesi yang sudah tidak dibutuhkan dari folder sessions/<nama>.
 * Berlaku untuk bot utama DAN setiap jadibot (dipanggil via cleanStaleSessionFiles(sessionDir)).
 *
 * ════════════════════════════════════════════════════════════════
 *  PETA FILE SESI — MANA YANG BOLEH DIHAPUS & MANA YANG TIDAK
 * ════════════════════════════════════════════════════════════════
 *
 *  ✅ AMAN DIHAPUS (ditangani fungsi ini):
 *  ─────────────────────────────────────────────────────────────
 *  pre-key-{id}.json          Kunci E2E calon. Hapus yg ID-nya
 *                              < (nextPreKeyId - 200). Buffer 200
 *                              melindungi dari race condition server.
 *
 *  session-{jid}.json         Sesi per kontak. Hapus jika > 30 hari
 *                              tidak aktif. WA buat sesi baru otomatis.
 *
 *  sender-key-{grup}-{id}.json Kunci grup (non-memory). Hapus > 14 hari.
 *                              WA negosiasi ulang kunci saat dibutuhkan.
 *
 *  identity-key-{jid}.json    Identitas Signal per kontak. Hapus > 60 hari
 *                              (konservatif). WA fetch ulang saat bertemu.
 *
 *  device-list-{jid}.json     Daftar perangkat kontak. Hapus > 30 hari.
 *                              WA refresh otomatis saat kirim pesan.
 *
 *  app-state-sync-key-*.json  Kunci sync WA state. Simpan 10 terbaru,
 *                              hapus sisanya. WA hanya butuh beberapa key.
 *
 *  ❌ JANGAN PERNAH DIHAPUS:
 *  ─────────────────────────────────────────────────────────────
 *  creds.json                  Kredensial sesi utama. Hapus = logout total.
 *  contacts.json               Cache semua kontak. Hapus = hilang semua kontak.
 *  groups.json                 Cache semua grup. Hapus = hilang data grup.
 *  settings.json               Pengaturan sesi lokal.
 *  app-state-sync-version-*    Versi sync state WA. Hapus = resync penuh.
 *  sender-key-memory-*.json    Cache kunci grup persistent (berbeda dengan
 *                              sender-key biasa). Hapus = gagal decode grup.
 *  tctoken-*.json              Token transport channel WA. Diperbarui aktif,
 *                              hapus bisa putus koneksi alternatif.
 *  lid-mapping-*.json          Cache LID↔PN. Hapus = resolve nomor gagal di
 *                              bot utama & jadibot (koneksi tidak akurat).
 * ════════════════════════════════════════════════════════════════
 */
export function cleanStaleSessionFiles(sessionDir, { skipConfigCheck = false } = {}) {
    if (!skipConfigCheck) {
        try {
            const config = loadConfig();
            const sc = config.sessionCleaner ?? { enabled: true };
            if (sc.enabled === false) return;
        } catch {}
    }
    try {
        if (!fs.existsSync(sessionDir)) return

        const credsPath = path.join(sessionDir, 'creds.json')
        if (!fs.existsSync(credsPath)) return

        const files = fs.readdirSync(sessionDir)
        const now = Date.now()

        // Batas usia file per kategori
        const AGE_SENDER_KEY  = 14 * 24 * 60 * 60 * 1000  // sender-key  → 14 hari
        const AGE_SESSION     = 30 * 24 * 60 * 60 * 1000  // session-*   → 30 hari
        const AGE_IDENTITY    = 60 * 24 * 60 * 60 * 1000  // identity-key→ 60 hari (konservatif)
        const AGE_DEVICE_LIST = 30 * 24 * 60 * 60 * 1000  // device-list → 30 hari
        const APP_STATE_KEEP  = 10                          // app-state-sync-key: simpan N terbaru

        let deletedSessions   = 0
        let deletedSenderKeys = 0
        let deletedIdentity   = 0
        let deletedDeviceList = 0
        let deletedAppState   = 0
        let deletedSize       = 0

        // ── Kumpulkan app-state-sync-key untuk pruning ────────────────────────
        const appStateKeyFiles = []
        for (const file of files) {
            if (file.startsWith('app-state-sync-key-') && file.endsWith('.json')) {
                try {
                    const fp = path.join(sessionDir, file)
                    const stat = fs.statSync(fp)
                    appStateKeyFiles.push({ file, fp, mtime: stat.mtimeMs, size: stat.size })
                } catch {}
            }
        }
        // Urutkan terbaru dulu, hapus yang melampaui APP_STATE_KEEP
        appStateKeyFiles.sort((a, b) => b.mtime - a.mtime)
        for (let i = APP_STATE_KEEP; i < appStateKeyFiles.length; i++) {
            try {
                fs.unlinkSync(appStateKeyFiles[i].fp)
                deletedSize += appStateKeyFiles[i].size
                deletedAppState++
            } catch {}
        }

        // ── Scan semua file lainnya ────────────────────────────────────────────
        for (const file of files) {
            const filePath = path.join(sessionDir, file)

            // pre-key: JANGAN PERNAH DIHAPUS — kunci E2E penting, biarkan WA manage sendiri
            if (file.startsWith('pre-key-') && file.endsWith('.json')) {
                continue
            }

            // session-*: hapus jika lebih dari 30 hari
            if (file.startsWith('session-') && file.endsWith('.json')) {
                try {
                    const stat = fs.statSync(filePath)
                    if (now - stat.mtimeMs > AGE_SESSION) {
                        deletedSize += stat.size
                        fs.unlinkSync(filePath)
                        deletedSessions++
                    }
                } catch {}
                continue
            }

            // sender-key-*: hapus jika lebih dari 14 hari
            // JANGAN hapus sender-key-memory-* (cache persistent per grup/broadcast)
            if (file.startsWith('sender-key-') && !file.startsWith('sender-key-memory') && file.endsWith('.json')) {
                try {
                    const stat = fs.statSync(filePath)
                    if (now - stat.mtimeMs > AGE_SENDER_KEY) {
                        deletedSize += stat.size
                        fs.unlinkSync(filePath)
                        deletedSenderKeys++
                    }
                } catch {}
                continue
            }

            // identity-key-*: hapus jika lebih dari 60 hari
            if (file.startsWith('identity-key-') && file.endsWith('.json')) {
                try {
                    const stat = fs.statSync(filePath)
                    if (now - stat.mtimeMs > AGE_IDENTITY) {
                        deletedSize += stat.size
                        fs.unlinkSync(filePath)
                        deletedIdentity++
                    }
                } catch {}
                continue
            }

            // device-list-*: hapus jika lebih dari 30 hari
            if (file.startsWith('device-list-') && file.endsWith('.json')) {
                try {
                    const stat = fs.statSync(filePath)
                    if (now - stat.mtimeMs > AGE_DEVICE_LIST) {
                        deletedSize += stat.size
                        fs.unlinkSync(filePath)
                        deletedDeviceList++
                    }
                } catch {}
                continue
            }

            // lid-mapping-*: JANGAN HAPUS — cache LID↔PN penting untuk resolve koneksi bot utama & jadibot
            if (file.startsWith('lid-mapping-') && file.endsWith('.json')) {
                continue
            }
        }

        // ── Log ringkasan ─────────────────────────────────────────────────────
        const parts = []
        if (deletedAppState   > 0) parts.push(`${deletedAppState} app-state-key`)
        if (deletedSenderKeys > 0) parts.push(`${deletedSenderKeys} sender-key`)
        if (deletedIdentity   > 0) parts.push(`${deletedIdentity} identity-key`)
        if (deletedDeviceList > 0) parts.push(`${deletedDeviceList} device-list`)
        if (deletedSessions   > 0) parts.push(`${deletedSessions} session`)

        if (parts.length > 0) {
            console.log(
                `\x1b[32m[SessionCleaner]\x1b[39m Hapus: ${parts.join(' + ')} → hemat \x1b[33m${formatBytes(deletedSize)}\x1b[39m`
            )
        }
    } catch (err) {
        console.error(`\x1b[31m[SessionCleaner]\x1b[39m Error:`, err.message)
    }
}

export default {
    ensureTmpDir,
    getTmpPath,
    clearTmpFolder,
    clearOldFiles,
    getTmpStats,
    getDiskUsage,
    emergencyCleanup,
    startAutoCleaner,
    stopAutoCleaner,
    restartAutoCleaner,
    startDiskMonitor,
    stopDiskMonitor,
    cleanStaleSessionFiles
};
