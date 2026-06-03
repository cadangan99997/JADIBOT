/**
 * ───────────────────────────────
 *  Base Script : Bang Dika Ard
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
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { jidNormalizedUser, toNumber, jidDecode, proto, isJidGroup, delay } = _require('@whiskeysockets/baileys');
import { isPnUser } from '../helper/socketCompat.js';

import { telegram } from '../helper/index.js';
import { isNumber } from '../helper/text.js';
import { getRandomEmoji, getStatusEmojis } from '../helper/emoji.js';
import { getTmpPath } from '../helper/cleaner.js';
import {
        SW_TRACK_USER_DIR,
        updateSwStats,
        isSwUserTracked,
        markSwUserEntry,
        updateSwUserEntry,
        getMissedSwEntries,
        extractSwNumber,
        storyDebounce,
        maskNumber,
        logStoryView,
        getMediaTypeEmoji,
} from '../helper/swtrack.js';

function loadConfig() {
        try {
                const configPath = path.join(process.cwd(), 'config.json');
                if (fs.existsSync(configPath)) {
                        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                }
        } catch (err) {}
        return {};
}

function getGreeting() {
        const hour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false });
        const h = parseInt(hour);
        if (h >= 5 && h < 11) return 'Pagi 🌆';
        if (h >= 11 && h < 15) return 'Siang 🏙️';
        if (h >= 15 && h < 18) return 'Sore 🌇';
        return 'Malam 🌃';
}

// Global shared Set — semua instance (main bot + jadibot) share satu Set
// supaya story yang sama tidak diproses duplikat oleh beberapa instance
if (!global.__swProcessingSet) global.__swProcessingSet = new Set();
const swProcessingSet = global.__swProcessingSet;

export default async function (m, hisoka) {
        try {

                if (m.content && m.content.contextInfo && isNumber(m.content.contextInfo.expiration) && isPnUser(m.from)) {
                        const expiration = m.content.contextInfo.expiration;
                        const ephemeralSettingTimestamp = toNumber(m.content.contextInfo.ephemeralSettingTimestamp);
                        const contact = hisoka.contacts.read(m.from) || {};
                        hisoka.contacts.write(m.from, { ...contact, ephemeralSettingTimestamp, ephemeralDuration: expiration });
                }

                if (m.message.protocolMessage) {
                        const protocolMessage = m.message.protocolMessage;
                        const key = protocolMessage.key;
                        const type = protocolMessage.type;

                        switch (type) {
                                case proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING:
                                case proto.Message.ProtocolMessage.Type.EPHEMERAL_SYNC_RESPONSE: {
                                        const id = await hisoka.resolveLidToPN(key);
                                        const contact = hisoka.contacts.read(id) || {};
                                        hisoka.contacts.write(id, {
                                                ...contact,
                                                ephemeralSettingTimestamp: toNumber(
                                                        protocolMessage.ephemeralSettingTimestamp || m.message.messageTimestamp
                                                ),
                                                ephemeralDuration: protocolMessage.ephemeralExpiration,
                                        });
                                        break;
                                }
                                case proto.Message.ProtocolMessage.Type.REVOKE: {
                                        // ── Deteksi SW dihapus realtime ──
                                        const isStatusRevoke =
                                                m.key?.remoteJid === 'status@broadcast' ||
                                                key?.remoteJid === 'status@broadcast';
                                        if (isStatusRevoke && key?.id) {
                                                // Scan semua file user, cari msgId ini, mark deleted
                                                // (tidak pakai extractSwNumber karena bisa dapat LID bukan nomor HP)
                                                try {
                                                        if (fs.existsSync(SW_TRACK_USER_DIR)) {
                                                                const files = fs.readdirSync(SW_TRACK_USER_DIR).filter(f => f.endsWith('.json'));
                                                                for (const file of files) {
                                                                        const fp = path.join(SW_TRACK_USER_DIR, file);
                                                                        try {
                                                                                const d = JSON.parse(fs.readFileSync(fp, 'utf-8'));
                                                                                if (d[key.id]) {
                                                                                        d[key.id] = { ...d[key.id], deleted: true, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
                                                                                        fs.writeFileSync(fp, JSON.stringify(d, null, 2), 'utf-8');
                                                                                        const num = file.replace('.json', '');
                                                                                        console.log(`\x1b[90m[SwTrack] SW dihapus: ${num} → ${key.id}\x1b[39m`);
                                                                                        break;
                                                                                }
                                                                        } catch {}
                                                                }
                                                        }
                                                } catch {}
                                        }
                                        break;
                                }
                        }
                }

                if (!m.isOwner && !m.isBot && !m.status && m.message && m.type && m.type !== 'protocolMessage' && m.type !== 'reactionMessage') {
                        const config = loadConfig();
                        const autoTyping = config.autoTyping || {};
                        const autoRecording = config.autoRecording || {};
                        
                        const isPrivate = isPnUser(m.from);
                        const isGroup = isJidGroup(m.from);
                        
                        const shouldAutoType = autoTyping.enabled && 
                                ((isPrivate && autoTyping.privateChat) || (isGroup && autoTyping.groupChat));
                        
                        const shouldAutoRecord = autoRecording.enabled && 
                                ((isPrivate && autoRecording.privateChat) || (isGroup && autoRecording.groupChat));
                        
                        if (shouldAutoType || shouldAutoRecord) {
                                (async () => {
                                        try {
                                                if (shouldAutoType && !shouldAutoRecord) {
                                                        await hisoka.sendPresenceUpdate('composing', m.from);
                                                        const delayMs = (autoTyping.delaySeconds || 5) * 1000;
                                                        await delay(delayMs);
                                                        await hisoka.sendPresenceUpdate('paused', m.from);
                                                } else if (shouldAutoRecord && !shouldAutoType) {
                                                        await hisoka.sendPresenceUpdate('recording', m.from);
                                                        const delayMs = (autoRecording.delaySeconds || 5) * 1000;
                                                        await delay(delayMs);
                                                        await hisoka.sendPresenceUpdate('paused', m.from);
                                                } else if (shouldAutoType && shouldAutoRecord) {
                                                        await hisoka.sendPresenceUpdate('composing', m.from);
                                                        const typingDelayMs = (autoTyping.delaySeconds || 5) * 1000;
                                                        await delay(typingDelayMs);
                                                        await hisoka.sendPresenceUpdate('recording', m.from);
                                                        const recordingDelayMs = (autoRecording.delaySeconds || 5) * 1000;
                                                        await delay(recordingDelayMs);
                                                        await hisoka.sendPresenceUpdate('paused', m.from);
                                                }
                                        } catch (err) {
                                                console.error('\x1b[31m[AutoTyping/Recording] Error:\x1b[39m', err.message);
                                        }
                                })();
                        }
                }
                // ini baru
                if (!m.key?.fromMe && m.key?.remoteJid === 'status@broadcast' && m.message && m.type && m.type !== 'protocolMessage' && m.type !== 'reactionMessage') { // sampe sini
                        const config = loadConfig();
                        const storyConfig = config.autoReadStory || {};
                        
                        if (storyConfig.enabled === false) return;

                        // ── SwTrack: in-memory dedup (sebelum resolve, tanpa baca disk)
                        const msgId = m.key?.id;
                        if (!msgId || swProcessingSet.has(msgId)) return;
                        swProcessingSet.add(msgId);

                        const reactStatus = getStatusEmojis();
                        let usedReaction = reactStatus.length ? getRandomEmoji('status') : '❌';

                        const useRandomDelay = storyConfig.randomDelay !== false;
                        const delayMinMs = storyConfig.delayMinMs || 1000;
                        const delayMaxMs = storyConfig.delayMaxMs || 20000;
                        const fixedDelayMs = storyConfig.fixedDelayMs || 3000;
                        
                        const delayMs = useRandomDelay 
                                ? Math.floor(Math.random() * (delayMaxMs - delayMinMs)) + delayMinMs
                                : fixedDelayMs;

                        // Resolusi sender: PN diutamakan, LID disimpan untuk fallback
                        const rawParticipant = m.key?.participant || m.participant || m.sender;
                        const senderPn = m.sender && !String(m.sender).endsWith('@lid') ? m.sender : null;
                        let senderLid = rawParticipant && String(rawParticipant).endsWith('@lid') ? rawParticipant : null;
                        if (!senderLid && m.key?.participantAlt && String(m.key.participantAlt).endsWith('@lid')) {
                                senderLid = m.key.participantAlt;
                        }
                        // Lacak metode resolve buat ditampilkan di notif
                        let resolveMethod = null;
                        let resolvedPn = senderPn;
                        if (resolvedPn) resolveMethod = 'PN langsung ✓';
                        // Coba resolve PN lewat signalRepository jika belum ada
                        if (!resolvedPn && senderLid && hisoka?.signalRepository?.lidMapping?.getPNForLID) {
                                try {
                                        const r = await hisoka.signalRepository.lidMapping.getPNForLID(senderLid);
                                        if (r && !String(r).endsWith('@lid')) {
                                                resolvedPn = jidNormalizedUser(r);
                                                resolveMethod = 'Signal Lib ✓';
                                        }
                                } catch (_) {}
                        }
                        // Fallback: cache LID->PN runtime dari group metadata (bot utama)
                        if (!resolvedPn && senderLid && typeof global.__lookupLidPn === 'function') {
                                try {
                                        const r = global.__lookupLidPn(senderLid);
                                        if (r && !String(r).endsWith('@lid')) {
                                                resolvedPn = jidNormalizedUser(r);
                                                resolveMethod = 'Cache Grup ✓';
                                        }
                                } catch (_) {}
                        }
                        if (!resolvedPn && senderLid) resolveMethod = 'LID belum ke-resolve ❌';
                        if (!resolvedPn && !senderLid && rawParticipant) resolveMethod = 'Tanpa LID ⚠️';
                        const senderJid = resolvedPn || senderLid || rawParticipant;
                        const hasSender = !!senderJid;

                        // Skip story milik bot utama sendiri
                        const _botNum = (hisoka.user?.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                        const _senderNum = (resolvedPn || senderPn || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                        if (_botNum && _senderNum && _botNum === _senderNum) {
                                swProcessingSet.delete(msgId);
                                return;
                        }

                        const shouldReact = storyConfig.autoReaction !== false && reactStatus.length && hasSender;

                        // ── SwTrack: tentukan nomor dengan PN (bukan LID) lalu tulis entry awal ──
                        // resolvedPn sudah pasti bukan @lid, senderPn juga. Fallback ke null jika LID.
                        const trackNumber = resolvedPn
                                ? extractSwNumber(resolvedPn)
                                : (senderPn ? extractSwNumber(senderPn) : null);
                        if (trackNumber) {
                                if (isSwUserTracked(trackNumber, msgId)) {
                                        swProcessingSet.delete(msgId);
                                        return;
                                }
                                markSwUserEntry(trackNumber, msgId, {
                                        id: msgId,
                                        sender: resolvedPn || senderPn || rawParticipant || '',
                                        name: m.pushName || '',
                                        type: m.type || 'unknown',
                                        arrivedAt: new Date().toISOString(),
                                        read: false,
                                        reacted: false,
                                        emoji: null,
                                        resolve: resolveMethod,
                                        source: 'status',
                                        // Simpan dari awal agar retry bisa jalan walau bot crash sebelum updateSwUserEntry
                                        number: trackNumber,
                                        resolvedPn: resolvedPn || null,
                                        messageKey: m.key || null,
                                });
                        }

                        await new Promise(resolve => setTimeout(resolve, delayMs));

                        const isConnClosed = (err) => {
                                const msg = err?.message || String(err);
                                return msg.includes('Connection Closed') || msg.includes('Connection closed') || msg.includes('connection closed') || msg.includes('EPIPE') || msg.includes('write EPIPE') || msg.includes('Socket closed');
                        };

                        // Bangun beberapa varian key untuk receipt — pakai participant ASLI dari WA
                        // (LID maupun PN) supaya WA cocokkan dengan state story di server, lalu
                        // sync "sudah dilihat" ke semua device (HP & WhatsApp Web).
                        const buildKey = (participant) => ({
                                ...m.key,
                                remoteJid: 'status@broadcast',
                                ...(participant && { participant }),
                                fromMe: false,
                        });
                        const receiptKeys = [];
                        const seenParts = new Set();
                        const pushKey = (p) => {
                                if (!p) return;
                                const norm = jidNormalizedUser(p);
                                if (seenParts.has(norm)) return;
                                seenParts.add(norm);
                                receiptKeys.push(buildKey(norm));
                        };
                        // Urutan prioritas: participant asli dari key, lalu LID & PN hasil resolve
                        pushKey(rawParticipant);
                        pushKey(senderLid);
                        pushKey(resolvedPn);

                        // ── SwTrack: simpan receiptKeys & anti-miss retry ──
                        if (trackNumber) {
                                updateSwUserEntry(trackNumber, msgId, {
                                        receiptKeys,
                                        resolvedPn: resolvedPn || null,
                                        messageKey: m.key,
                                });
                                const missed = getMissedSwEntries(trackNumber, msgId)
                                        .filter(e => !swProcessingSet.has(e.id)); // skip yg masih on-progress
                                if (missed.length > 0) {
                                        const isCC = (e) => { const s = e?.message || String(e); return s.includes('Connection Closed') || s.includes('Connection closed') || s.includes('EPIPE') || s.includes('Socket closed'); };
                                        const _dayNamesR = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
                                        const _monNamesR = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
                                        for (const miss of missed) {
                                                try {
                                                        const mk = miss.receiptKeys || [];
                                                        if (mk.length > 0 && !miss.read) {
                                                                await Promise.all([
                                                                        hisoka.readMessages(mk).catch(e => { if (!isCC(e)) {} }),
                                                                        hisoka.sendReceipts(mk, 'read-self').catch(() => {}),
                                                                ]);
                                                        }
                                                        const mp = miss.resolvedPn;
                                                        let retryEmoji = null;
                                                        if (!miss.reacted && mp && miss.messageKey) {
                                                                retryEmoji = getRandomEmoji('status') || '❤️';
                                                                await hisoka.sendMessage('status@broadcast',
                                                                        { react: { key: miss.messageKey, text: retryEmoji } },
                                                                        { statusJidList: [jidNormalizedUser(hisoka.user.id), jidNormalizedUser(mp)] }
                                                                ).catch(() => { retryEmoji = null; });
                                                                updateSwUserEntry(trackNumber, miss.id, { read: true, reacted: true, emoji: retryEmoji, retriedAt: new Date().toISOString() });
                                                        } else if (mk.length > 0) {
                                                                updateSwUserEntry(trackNumber, miss.id, { read: true, retriedAt: new Date().toISOString() });
                                                        }
                                                        // Box log per-entry retry
                                                        const missJkt = new Date(new Date(miss.arrivedAt || Date.now()).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
                                                        logStoryView({
                                                                botId: hisoka.isMainBot ? null : (hisoka.user.name || maskNumber(hisoka.user.id.split(':')[0])),
                                                                mediaType: getMediaTypeEmoji(miss.type || 'extendedTextMessage'),
                                                                greeting: getGreeting(),
                                                                dayName: _dayNamesR[missJkt.getDay()] + ' 🔁',
                                                                date: `${missJkt.getDate()} ${_monNamesR[missJkt.getMonth()]} ${missJkt.getFullYear()} 🗓️`,
                                                                time: missJkt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.') + ' ⏰',
                                                                name: miss.name || trackNumber,
                                                                number: maskNumber(miss.number || trackNumber),
                                                                success: 'Retry ♻️',
                                                                reaction: retryEmoji || (miss.reacted ? miss.emoji || '✓' : 'Off ❌'),
                                                                resolve: (miss.resolve || 'PN ✓') + ' ♻️',
                                                                delaySeconds: null,
                                                                mode: 'Read+Reaction ✓',
                                                        });
                                                } catch {}
                                        }
                                }
                        }

                        // 'read' = beri tahu poster + WA sync ke device kita (hilangkan tanda hijau)
                        // Kirim per varian key supaya minimal salah satunya cocok di server WA
                        const readPromise = Promise.all(
                                receiptKeys.map(k =>
                                        hisoka.sendReceipts([k], 'read').catch(err => {
                                                if (!isConnClosed(err)) console.error('\x1b[31m[AutoRead] read failed:\x1b[39m', err?.message || String(err));
                                        })
                                )
                        );

                        // Reaction butuh statusJidList format PN. Kalau belum ke-resolve, skip reaction
                        // daripada kena 'not-acceptable' dari server.
                        const reactPromise = (shouldReact && resolvedPn) ? hisoka.sendMessage(
                                'status@broadcast',
                                {
                                        react: { key: m.key, text: usedReaction },
                                },
                                {
                                        statusJidList: [jidNormalizedUser(hisoka.user.id), jidNormalizedUser(resolvedPn)],
                                }
                        ).catch((err) => {
                                if (!isConnClosed(err)) {
                                        console.error('\x1b[31m[Reaction Error]\x1b[39m', err?.message || String(err) || 'Unknown');
                                }
                                usedReaction = '❌ Gagal';
                        }) : (shouldReact ? (() => { usedReaction = '⏭️ Skip (LID belum resolve)'; return Promise.resolve(); })() : Promise.resolve());

                        await Promise.all([readPromise, reactPromise]);

                        // Prioritaskan resolvedPn agar storyNumber berisi nomor HP (bukan LID user ID)
                        const from = jidNormalizedUser(resolvedPn || m.participant || m.sender);
                        const storyNumber = trackNumber || jidDecode(from)?.user || '';
                        const storyName = m.pushName || hisoka.getName(from, true) || storyNumber;
                        const messageDate = new Date(toNumber(m.messageTimestamp) * 1000);

                        const reactionSuccess = shouldReact && resolvedPn && usedReaction !== '❌ Gagal' && usedReaction !== '⏭️ Skip (LID belum resolve)';
                        updateSwStats(storyNumber, storyName, reactionSuccess, reactionSuccess ? usedReaction : null);

                        // ── SwTrack: update hasil ──
                        if (trackNumber) {
                                updateSwUserEntry(trackNumber, msgId, {
                                        name: storyName,
                                        number: storyNumber,
                                        resolve: resolveMethod,
                                        read: true,
                                        reacted: reactionSuccess,
                                        emoji: reactionSuccess ? usedReaction : null,
                                        processedAt: new Date().toISOString(),
                                });
                        }
                        // msgId TIDAK dihapus dari swProcessingSet setelah diproses —
                        // biarkan tetap sebagai pelindung dedup kalau WA re-deliver story yang sama

                        const now = Date.now();
                        // ini baru debounce bot utama dan jadibot
                        const botId = hisoka.user.id.split(':')[0]
                        const debounceKey = `${botId}:${from}` // sampe sini
                        const lastLog = storyDebounce.get(debounceKey);
                        const telegramConfig = loadConfig().telegram || {};
                        
                        if (lastLog) {
                                lastLog.count++;
                                storyDebounce.set(debounceKey, lastLog);
                        } else {
                                storyDebounce.set(debounceKey, { time: now, count: 1 });
                                
                                const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                                
                                const jakartaDate = new Date(messageDate.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
                                const dayName = dayNames[jakartaDate.getDay()];
                                const dateStr = `${jakartaDate.getDate()} ${monthNames[jakartaDate.getMonth()]} ${jakartaDate.getFullYear()}`;
                                const timeStr = jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');
                                
                                let successMsg = 'Ke Tele ✓';
                                if (!telegramConfig.enabled || !telegramConfig.chatId || !telegramConfig.token) {
                                        successMsg = 'Ke Tele ❌';
                                }

                                logStoryView({
                     /* ini tambahan */ botId: hisoka.isMainBot ? null : (hisoka.user.name || maskNumber(botId)),
                                        mediaType: getMediaTypeEmoji(m.type),
                                        greeting: getGreeting(),
                                        dayName: dayName + ' 🔁',
                                        date: dateStr + ' 🗓️',
                                        time: timeStr + ' ⏰',
                                        name: storyName,
                                        number: maskNumber(storyNumber),
                                        success: successMsg,
                                        reaction: shouldReact ? usedReaction : 'Off ❌',
                                        resolve: resolveMethod,
                                        delaySeconds: (delayMs / 1000).toFixed(1),
                                        mode: shouldReact ? 'Read+Reaction ✓' : 'Read Only'
                                });
                                
                                setTimeout(() => {
                                        const data = storyDebounce.get(debounceKey);
                                        if (data && data.count > 1) {
                                                console.log(`\x1b[33m   └─ +${data.count - 1} story lainnya dari ${storyName}\x1b[39m`);
                                        }
                                        storyDebounce.delete(debounceKey);
                                }, 3000);
                        }

                        if (telegramConfig.enabled && telegramConfig.chatId && telegramConfig.token) {
                                const text = `<b>From :</b> <a href="https://wa.me/${jidDecode(from).user}">@${storyName}</a>
<b>Date :</b> ${new Date(toNumber(m.messageTimestamp) * 1000).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })}
${m.text ? `<b>Caption :</b>\n\n${m.text}` : ''}`.trim();

                                if (m.isMedia) {
                                        try {
                                                const media = await m.downloadMedia();
                                                
                                                if (!media || media.length === 0) {
                                                        await telegram.send(telegramConfig.chatId, text + '\n\n<i>(Media tidak tersedia)</i>', { type: 'text', parse_mode: 'HTML' });
                                                } else {
                                                        const ext = m.type === 'imageMessage' ? 'jpg' : m.type === 'videoMessage' ? 'mp4' : m.type === 'audioMessage' ? 'mp3' : 'bin';
                                                        const tmpFile = getTmpPath(`story_${Date.now()}.${ext}`);
                                                        
                                                        try {
                                                                fs.writeFileSync(tmpFile, media);
                                                                
                                                                await telegram.send(telegramConfig.chatId, media, {
                                                                        caption: text,
                                                                        type: m.type.replace('Message', ''),
                                                                        parse_mode: 'HTML',
                                                                });
                                                                
                                                                fs.unlinkSync(tmpFile);
                                                        } catch (err) {
                                                                if (fs.existsSync(tmpFile)) {
                                                                        fs.unlinkSync(tmpFile);
                                                                }
                                                                console.error('\x1b[31m[AutoReadSW] Error sending to Telegram:\x1b[39m', err.message);
                                                        }
                                                }
                                        } catch (downloadErr) {
                                                console.error('\x1b[33m[AutoReadSW] Media unavailable:\x1b[39m', downloadErr.message);
                                                await telegram.send(telegramConfig.chatId, text + '\n\n<i>(Media tidak tersedia)</i>', { type: 'text', parse_mode: 'HTML' }).catch(() => {});
                                        }
                                } else {
                                        await telegram.send(telegramConfig.chatId, text, { type: 'text', parse_mode: 'HTML' });
                                }
                        }
                }
                // Group Linked Status (upswgc / groupStatusMessageV2)
                if (!m.key?.fromMe && isJidGroup(m.key?.remoteJid) && m.message?.groupStatusMessageV2) {
                        const config = loadConfig();
                        const storyConfig = config.autoReadStory || {};

                        if (storyConfig.enabled === false) return;

                        // ── SwTrack: in-memory dedup
                        const gsMsgId = m.key?.id;
                        if (!gsMsgId || swProcessingSet.has(gsMsgId)) return;
                        swProcessingSet.add(gsMsgId);

                        const reactStatus = getStatusEmojis();
                        let usedReaction = reactStatus.length ? getRandomEmoji('status') : '❌';

                        const useRandomDelay = storyConfig.randomDelay !== false;
                        const delayMinMs = storyConfig.delayMinMs || 1000;
                        const delayMaxMs = storyConfig.delayMaxMs || 20000;
                        const fixedDelayMs = storyConfig.fixedDelayMs || 3000;

                        const delayMs = useRandomDelay
                                ? Math.floor(Math.random() * (delayMaxMs - delayMinMs)) + delayMinMs
                                : fixedDelayMs;

                        const senderJid = m.sender || m.participant || m.key?.participant;
                        const hasSender = !!senderJid;
                        const shouldReact = storyConfig.autoReaction !== false && reactStatus.length && hasSender;

                        // ── SwTrack: tulis entry awal (group status — sender biasanya PN langsung)
                        const gsTrackNumber = senderJid && !String(senderJid).endsWith('@lid')
                                ? extractSwNumber(senderJid)
                                : null;
                        if (gsTrackNumber) {
                                if (isSwUserTracked(gsTrackNumber, gsMsgId)) {
                                        swProcessingSet.delete(gsMsgId);
                                        return;
                                }
                                markSwUserEntry(gsTrackNumber, gsMsgId, {
                                        id: gsMsgId,
                                        sender: senderJid || '',
                                        name: m.pushName || '',
                                        type: 'groupStatus',
                                        arrivedAt: new Date().toISOString(),
                                        read: false,
                                        reacted: false,
                                        emoji: null,
                                        source: 'group',
                                        number: gsTrackNumber,
                                        messageKey: m.key,
                                        resolvedPn: senderJid && !String(senderJid).endsWith('@lid') ? jidNormalizedUser(senderJid) : null,
                                });
                        }

                        await new Promise(resolve => setTimeout(resolve, delayMs));

                        const reactPromise = shouldReact ? hisoka.sendMessage(
                                m.key.remoteJid,
                                { react: { key: m.key, text: usedReaction } }
                        ).catch((err) => {
                                const msg = err?.message || String(err);
                                const connClosed = msg.includes('Connection Closed') || msg.includes('Connection closed') || msg.includes('connection closed') || msg.includes('EPIPE') || msg.includes('Socket closed');
                                if (!connClosed) console.error('\x1b[31m[GroupStatus Reaction Error]\x1b[39m', msg || 'Unknown');
                                usedReaction = '❌ Gagal';
                        }) : Promise.resolve();

                        await reactPromise;

                        // Prioritaskan gsTrackNumber (sudah PN, bukan LID) agar data akurat di swstats.json
                        const from = jidNormalizedUser(senderJid || m.key.remoteJid);
                        const storyNumber = gsTrackNumber || jidDecode(from)?.user || '';
                        const storyName = m.pushName || hisoka.getName(from, true) || storyNumber;
                        const groupName = hisoka.getName(m.key.remoteJid) || m.key.remoteJid;

                        const gsReactionSuccess = shouldReact && usedReaction !== '❌ Gagal';
                        updateSwStats(storyNumber, storyName, gsReactionSuccess, gsReactionSuccess ? usedReaction : null);

                        // ── SwTrack: update hasil handler 2 ──
                        if (gsTrackNumber) {
                                updateSwUserEntry(gsTrackNumber, gsMsgId, {
                                        name: storyName,
                                        number: storyNumber,
                                        read: true,
                                        reacted: gsReactionSuccess,
                                        emoji: gsReactionSuccess ? usedReaction : null,
                                        processedAt: new Date().toISOString(),
                                });
                        }
                        // gsMsgId TIDAK dihapus dari swProcessingSet — cegah spam re-deliver dari WA

                        const nowGs = Date.now();
                        const botIdGs = hisoka.user.id.split(':')[0];
                        const debounceKeyGs = `gs:${botIdGs}:${from}`;
                        const lastLogGs = storyDebounce.get(debounceKeyGs);

                        if (!lastLogGs) {
                                storyDebounce.set(debounceKeyGs, { time: nowGs, count: 1 });

                                const delaySeconds = (delayMs / 1000).toFixed(1);
                                const innerMsg = m.message.groupStatusMessageV2?.message;
                                const innerType = innerMsg ? Object.keys(innerMsg).find(k => k !== 'messageContextInfo') : null;
                                const mediaType = getMediaTypeEmoji(innerType);
                                const greeting = getGreeting();

                                const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                                const jakartaDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
                                const dayName = dayNames[jakartaDate.getDay()];
                                const dateStr = `${jakartaDate.getDate()} ${monthNames[jakartaDate.getMonth()]} ${jakartaDate.getFullYear()}`;
                                const timeStr = jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');

                                const mode = shouldReact ? 'Read+Reaction ✓' : 'Read Only 👁️';

                                logStoryView({
                                        botId: hisoka.isMainBot ? null : (hisoka.user.name || maskNumber(botIdGs)),
                                        mediaType,
                                        greeting,
                                        dayName,
                                        date: dateStr,
                                        time: timeStr,
                                        name: storyName,
                                        number: maskNumber(storyNumber),
                                        success: 'Grup SW ✓',
                                        reaction: shouldReact ? usedReaction : 'Off ❌',
                                        delaySeconds,
                                        mode: `${mode} [📢 ${groupName}]`,
                                });

                                setTimeout(() => {
                                        storyDebounce.delete(debounceKeyGs);
                                }, 3000);
                        }
                }
        } catch (e) {
                console.error(`\x1b[31mError in event handler:\x1b[39m\n`, e);
        }
}
