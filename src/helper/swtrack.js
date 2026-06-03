'use strict';

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { jidDecode } = _require('@whiskeysockets/baileys');

function loadConfig() {
        try {
                const configPath = path.join(process.cwd(), 'config.json');
                if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch {}
        return {};
}

// ─── SwStats: data/ceksw/swstats.json ────────────────────────────────────────
export const SW_STATS_PATH = path.join(process.cwd(), 'data', 'ceksw', 'swstats.json');

// Core writer — bisa pakai path custom (untuk jadibot) atau default (bot utama)
export function updateSwStatsAt(statsPath, number, name, reacted, emoji) {
        if (!number || !statsPath) return;
        if (loadConfig().cekswTracking === false) return;
        try {
                let stats = {};
                if (fs.existsSync(statsPath)) {
                        try { stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8')); } catch {}
                }
                if (!stats[number]) {
                        stats[number] = { name: name || number, number, reads: 0, reactions: 0, lastSeen: null, activeSW: [] };
                }
                stats[number].reads = (stats[number].reads || 0) + 1;
                if (reacted) stats[number].reactions = (stats[number].reactions || 0) + 1;
                if (name) stats[number].name = name;
                stats[number].lastSeen = new Date().toISOString();
                const tsNow = Date.now();
                const SW_TTL = 24 * 60 * 60 * 1000;
                if (!Array.isArray(stats[number].activeSW)) stats[number].activeSW = [];
                stats[number].activeSW = stats[number].activeSW.filter(t => tsNow - t < SW_TTL);
                stats[number].activeSW.push(tsNow);
                if (reacted && emoji && !['❌ Gagal', '⏭️ Skip (LID belum resolve)', '❌', 'Off ❌'].includes(emoji)) {
                        if (!stats._emojiStats) stats._emojiStats = {};
                        stats._emojiStats[emoji] = (stats._emojiStats[emoji] || 0) + 1;
                }
                const dir = path.dirname(statsPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                const { _emojiStats, ...users } = stats;
                const sorted = Object.fromEntries(
                        Object.entries(users).sort((a, b) => (b[1].reactions || 0) - (a[1].reactions || 0))
                );
                if (_emojiStats) sorted._emojiStats = _emojiStats;
                fs.writeFileSync(statsPath, JSON.stringify(sorted, null, 2), 'utf-8');
        } catch {}
}

// Shortcut untuk bot utama (path default)
export function updateSwStats(number, name, reacted, emoji) {
        updateSwStatsAt(SW_STATS_PATH, number, name, reacted, emoji);
}

// ─── SwStats: pruning activeSW yang expired dari semua user ──────────────────
export function pruneSwStats() {
        try {
                if (!fs.existsSync(SW_STATS_PATH)) return;
                let stats = {};
                try { stats = JSON.parse(fs.readFileSync(SW_STATS_PATH, 'utf-8')); } catch { return; }

                const tsNow = Date.now();
                const SW_TTL = 24 * 60 * 60 * 1000;
                let pruned = 0;

                const { _emojiStats, ...users } = stats;
                for (const [num, entry] of Object.entries(users)) {
                        if (!entry || typeof entry !== 'object') continue;
                        if (!Array.isArray(entry.activeSW)) { entry.activeSW = []; continue; }
                        const before = entry.activeSW.length;
                        entry.activeSW = entry.activeSW.filter(t => tsNow - t < SW_TTL);
                        pruned += before - entry.activeSW.length;
                }

                const sorted = Object.fromEntries(
                        Object.entries(users).sort((a, b) => (b[1].reactions || 0) - (a[1].reactions || 0))
                );
                if (_emojiStats) sorted._emojiStats = _emojiStats;
                fs.writeFileSync(SW_STATS_PATH, JSON.stringify(sorted, null, 2), 'utf-8');

                if (pruned > 0) {
                        console.log(`\x1b[32m[SwStats]\x1b[39m Pruned ${pruned} activeSW expired → data sekarang akurat realtime`);
                }
        } catch {}
}

// ─── SwTrack: per-user tracking di data/swtrack/users/ ───────────────────────
export const SW_TRACK_USER_DIR = path.join(process.cwd(), 'data', 'swtrack', 'users');
export const SW_ENTRY_TTL_MS = 26 * 60 * 60 * 1000; // 26 jam

export function getSwUserPath(number) {
        if (!number) return null;
        const num = String(number).replace(/[^0-9]/g, '');
        if (!num) return null;
        if (!fs.existsSync(SW_TRACK_USER_DIR)) fs.mkdirSync(SW_TRACK_USER_DIR, { recursive: true });
        return path.join(SW_TRACK_USER_DIR, `${num}.json`);
}

export function loadSwUser(number) {
        try {
                const p = getSwUserPath(number);
                if (p && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
        } catch {}
        return {};
}

export function saveSwUser(number, data) {
        try {
                const p = getSwUserPath(number);
                if (!p) return;
                const cutoff = Date.now() - SW_ENTRY_TTL_MS;
                const pruned = {};
                for (const [id, entry] of Object.entries(data)) {
                        if (new Date(entry.arrivedAt || 0).getTime() >= cutoff) pruned[id] = entry;
                }
                fs.writeFileSync(p, JSON.stringify(pruned, null, 2), 'utf-8');
        } catch {}
}

export function isSwUserTracked(number, msgId) {
        if (!number || !msgId) return false;
        return !!loadSwUser(number)[msgId];
}

export function markSwUserEntry(number, msgId, entry) {
        if (!number || !msgId) return;
        try {
                const data = loadSwUser(number);
                data[msgId] = { ...entry, updatedAt: new Date().toISOString() };
                saveSwUser(number, data);
        } catch {}
}

export function updateSwUserEntry(number, msgId, patch) {
        if (!number || !msgId) return;
        try {
                const data = loadSwUser(number);
                data[msgId] = { ...(data[msgId] || {}), ...patch, updatedAt: new Date().toISOString() };
                saveSwUser(number, data);
        } catch {}
}

export function getMissedSwEntries(number, excludeId) {
        try {
                const data = loadSwUser(number);
                const cutoff = Date.now() - SW_ENTRY_TTL_MS;
                return Object.values(data).filter(e => {
                        if (!e || e.id === excludeId || e.deleted) return false;
                        if (new Date(e.arrivedAt || 0).getTime() < cutoff) return false;
                        return !e.read || !e.reacted;
                });
        } catch {}
        return [];
}

export function extractSwNumber(jid) {
        if (!jid) return null;
        try { return jidDecode(jid)?.user || null; } catch { return null; }
}

// ─── Factory: buat SwTracker dengan folder custom (untuk jadibot) ─────────────
// Kembalikan { isSwUserTracked, markSwUserEntry, updateSwUserEntry, getMissedSwEntries }
// yang semuanya terisolasi ke `userDir` — tidak campur dengan bot utama.
export function createSwTracker(userDir) {
        const TTL = SW_ENTRY_TTL_MS;

        function _getPath(number) {
                if (!number) return null;
                const num = String(number).replace(/[^0-9]/g, '');
                if (!num) return null;
                if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
                return path.join(userDir, `${num}.json`);
        }

        function _load(number) {
                try {
                        const p = _getPath(number);
                        if (p && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
                } catch {}
                return {};
        }

        function _save(number, data) {
                try {
                        const p = _getPath(number);
                        if (!p) return;
                        const cutoff = Date.now() - TTL;
                        const pruned = {};
                        for (const [id, entry] of Object.entries(data)) {
                                if (new Date(entry.arrivedAt || 0).getTime() >= cutoff) pruned[id] = entry;
                        }
                        fs.writeFileSync(p, JSON.stringify(pruned, null, 2), 'utf-8');
                } catch {}
        }

        return {
                isSwUserTracked(number, msgId) {
                        if (!number || !msgId) return false;
                        return !!_load(number)[msgId];
                },
                markSwUserEntry(number, msgId, entry) {
                        if (!number || !msgId) return;
                        try {
                                const data = _load(number);
                                data[msgId] = { ...entry, updatedAt: new Date().toISOString() };
                                _save(number, data);
                        } catch {}
                },
                updateSwUserEntry(number, msgId, patch) {
                        if (!number || !msgId) return;
                        try {
                                const data = _load(number);
                                data[msgId] = { ...(data[msgId] || {}), ...patch, updatedAt: new Date().toISOString() };
                                _save(number, data);
                        } catch {}
                },
                getMissedSwEntries(number, excludeId) {
                        try {
                                const data = _load(number);
                                const cutoff = Date.now() - TTL;
                                return Object.values(data).filter(e => {
                                        if (!e || e.id === excludeId || e.deleted) return false;
                                        if (new Date(e.arrivedAt || 0).getTime() < cutoff) return false;
                                        return !e.read || !e.reacted;
                                });
                        } catch {}
                        return [];
                },
        };
}

// ─── Console log helper ───────────────────────────────────────────────────────
export const storyDebounce = new Map();

export function maskNumber(number) {
        if (!number) return '***';
        const clean = number.replace(/[^0-9]/g, '');
        if (clean.length <= 6) return clean;
        return clean.slice(0, 4) + '****' + clean.slice(-3);
}

function getDisplayWidth(str) {
        let width = 0;
        for (const char of str) {
                const code = char.codePointAt(0);
                if (code > 0x1F600 && code < 0x1F9FF) width += 2;
                else if (code > 0x2600 && code < 0x27BF) width += 2;
                else if (code > 0x1F300 && code < 0x1F5FF) width += 2;
                else if (code > 0x1F900 && code < 0x1F9FF) width += 2;
                else if (code > 0x2700 && code < 0x27BF) width += 2;
                else if (code > 0xFE00 && code < 0xFE0F) width += 0;
                else if (code > 0x3000 && code < 0x9FFF) width += 2;
                else if (code > 0xFF00 && code < 0xFFEF) width += 2;
                else width += 1;
        }
        return width;
}

function padEnd(str, targetWidth) {
        const currentWidth = getDisplayWidth(str);
        const padding = Math.max(0, targetWidth - currentWidth);
        return str + ' '.repeat(padding);
}

export function logStoryView(data) {
        const { botId, mediaType, greeting, dayName, date, time, name, number, success, reaction, delaySeconds, mode, resolve } = data;
        const cyan = '\x1b[36m';
        const white = '\x1b[37m';
        const yellow = '\x1b[33m';
        const green = '\x1b[32m';
        const blue = '\x1b[34m';
        const orange = '\x1b[38;2;255;165;0m';
        const purple = '\x1b[38;2;180;120;255m';
        const reset = '\x1b[0m';

        const boxWidth = 35;
        const labelWidth = 14;
        const contentWidth = boxWidth - labelWidth - 5;
        const title = 'AutoReadStoryWhatsApp';
        const titlePadding = Math.floor((boxWidth - title.length) / 2);

        const mediaStr = `${mediaType[0]} ${mediaType[1]}`;
        const delayStr = delaySeconds !== null ? `${delaySeconds} detik` : '-';
        const modeStr = mode === 'Off ❌' ? 'Read Only' : (mode.startsWith('Read') ? mode : 'Read+Reaction ✓');

        console.log(`${cyan}┌${'═'.repeat(boxWidth)}┐${reset}`);
        console.log(`${cyan}║${' '.repeat(titlePadding)}${yellow}${title}${reset}${cyan}${' '.repeat(boxWidth - titlePadding - title.length)}║${reset}`);
        console.log(`${cyan}├${'═'.repeat(boxWidth)}┤${reset}`);
        if (botId) {
                console.log(`${cyan}│${reset} ${white}⭔ Jadibot     : ${white}${padEnd(botId, contentWidth)}${reset}${cyan}${reset}`);
        }
        console.log(`${cyan}│${reset} ${white}⭔ Mode        : ${green}${padEnd(modeStr, contentWidth)}${reset}${cyan}${reset}`);
        console.log(`${cyan}│${reset} ${white}⭔ Tipe Story  : ${orange}${padEnd(mediaStr, contentWidth)}${reset}${cyan}${reset}`);
        console.log(`${cyan}│${reset} ${white}⭔ Selamat     : ${purple}${padEnd(greeting, contentWidth)}${reset}${cyan}${reset}`);
        console.log(`${cyan}│${reset} ${white}⭔ Hari        : ${blue}${padEnd(dayName, contentWidth)}${reset}${cyan}${reset}`);
        console.log(`${cyan}│${reset} ${white}⭔ Tanggal     : ${yellow}${padEnd(date, contentWidth)}${reset}${cyan}${reset}`);
        console.log(`${cyan}│${reset} ${white}⭔ Waktu       : ${blue}${padEnd(time, contentWidth)}${reset}${cyan}${reset}`);
        console.log(`${cyan}│${reset} ${white}⭔ Nama        : ${white}${padEnd(String(name || '').slice(0, contentWidth - 2), contentWidth)}${reset}${cyan}${reset}`);
        console.log(`${cyan}│${reset} ${white}⭔ Nomor       : ${white}${padEnd(number, contentWidth)}${reset}${cyan}${reset}`);
        console.log(`${cyan}│${reset} ${white}⭔ Berhasil    : ${green}${padEnd(success, contentWidth)}${reset}${cyan}${reset}`);
        console.log(`${cyan}│${reset} ${white}⭔ Reaksi      : ${padEnd(reaction, contentWidth)}${reset}${cyan}${reset}`);
        if (resolve) {
                const resolveColor = resolve.includes('❌') ? '\x1b[31m' : (resolve.includes('PN') ? green : (resolve.includes('Cache') ? yellow : blue));
                console.log(`${cyan}│${reset} ${white}⭔ Resolve     : ${resolveColor}${padEnd(resolve, contentWidth)}${reset}${cyan}${reset}`);
        }
        console.log(`${cyan}│${reset} ${white}⭔ Delay       : ${orange}${padEnd(delayStr, contentWidth)}${reset}${cyan}${reset}`);
        console.log(`${cyan}└${'─'.repeat(13)}···${reset}`);
}

export function getMediaTypeEmoji(type) {
        const mediaTypes = {
                imageMessage: ['Foto', '📷'],
                videoMessage: ['Video', '🎥'],
                audioMessage: ['Audio', '🎵'],
                stickerMessage: ['Sticker', '🎨'],
                documentMessage: ['Dokumen', '📄'],
                extendedTextMessage: ['Teks', '📝'],
                conversation: ['Teks', '📝'],
                protocolMessage: ['Protocol', '⚙️'],
                viewOnceMessageV2: ['View Once', '👁️'],
                viewOnceMessage: ['View Once', '👁️'],
                viewOnceMessageV2Extension: ['View Once', '👁️'],
                interactiveMessage: ['Interactive', '🎯'],
                listMessage: ['List', '📋'],
                buttonsMessage: ['Buttons', '🔘'],
                templateMessage: ['Template', '📃'],
                pollCreationMessage: ['Poll', '📊'],
                reactionMessage: ['Reaction', '💬'],
                liveLocationMessage: ['Live Location', '📍'],
                locationMessage: ['Location', '📍'],
                contactMessage: ['Contact', '👤'],
                contactsArrayMessage: ['Contacts', '👥'],
        };
        return mediaTypes[type] || ['Media', '📨'];
}
