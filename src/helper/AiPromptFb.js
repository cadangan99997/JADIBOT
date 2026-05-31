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

/**
 * ═══════════════════════════════════════════════════
 *  AI PROMPT — FACEBOOK DOWNLOADER (AiPromptFb.js)
 *  File khusus prompt AI untuk fitur .fb
 *
 *  Fungsi:
 *    1. buildFbVisionPrompt()       → prompt analisis visual thumbnail/cover
 *    2. buildFbCaptionPrompt(data)  → prompt generate caption WA lengkap
 *    3. buildFbFallbackCaption(d)   → fallback caption kalau AI gagal
 *    4. parseFbMetaHtml(html)       → ekstrak metadata dari HTML FB
 *    5. formatFbCount(n)            → format angka → "17K", "1.2M"
 * ═══════════════════════════════════════════════════
 */

/**
 * Format angka views/likes jadi readable: 17247 → "17,2K" | 1200000 → "1,2M"
 */
export function formatFbCount(n) {
    const num = Number(n);
    if (!num || isNaN(num)) return '';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace('.0', '') + 'M';
    if (num >= 1_000)     return (num / 1_000).toFixed(1).replace('.0', '') + 'K';
    return num.toLocaleString('id-ID');
}

/**
 * Decode HTML entities helper
 */
function decodeHtml(s = '') {
    return s
        .replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&[a-z]+;/g, '');
}

/**
 * Ekstrak metadata dari HTML Facebook (og: tags).
 * Return: { pageTitle, description, views, quality, mediaType, hashtags }
 */
export function parseFbMetaHtml(html = '') {
    const ogTitle   = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/)?.[1] || '';
    const ogDesc    = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/)?.[1] || '';
    const ogType    = html.match(/<meta[^>]+property="og:type"[^>]+content="([^"]+)"/)?.[1] || '';
    const ogVideo   = html.match(/<meta[^>]+property="og:video[^"]*"[^>]+content="([^"]+)"/)?.[1] || '';

    const title     = decodeHtml(ogTitle).trim();
    const desc      = decodeHtml(ogDesc).trim();

    // Coba ekstrak nama page/user dari title
    // Contoh: "Facebook Video: John Doe" atau "John Doe | Facebook" atau "Watch John Doe's video"
    const pageTitle = title
        .replace(/\s*\|\s*facebook/gi, '')
        .replace(/^facebook video[:.]?\s*/gi, '')
        .replace(/^watch\s+/gi, '')
        .replace(/'s video$/gi, '')
        .trim();

    // Views di FB kadang ada di description: "5.2K views"
    const viewsRaw = desc.match(/([\d.,]+[KkMm]?)\s*(?:views|tayangan|ditonton)/i)?.[1] || '';
    const views    = viewsRaw.toUpperCase();

    // Tipe media: video, reel, story
    const mediaType = ogType.includes('video') ? 'video'
        : html.includes('/reel/') || html.includes('reel') ? 'reel'
        : html.includes('/stories/') || html.includes('story') ? 'story'
        : 'video';

    // Hashtags dari description
    const hashtags = (desc.match(/#\w+/g) || []).slice(0, 5);

    return { pageTitle, description: desc, views, mediaType, hashtags, hasVideo: !!ogVideo };
}

/**
 * Prompt untuk Gemini Vision — analisis thumbnail/cover Facebook video.
 */
export function buildFbVisionPrompt() {
    return `Kamu adalah AI spesialis analisis konten visual Facebook.

Analisis gambar ini dengan teliti dan jawab 4 hal berikut (jawab langsung tanpa label/heading):

1. *Aksi utama*: Apa yang sedang terjadi atau ditampilkan? (spesifik, akurat)
2. *Subjek*: Siapa atau apa yang ada di sini? (orang, hewan, objek — sebut spesifik. Contoh: "pria berseragam polisi", "anjing golden retriever", "anak kecil berteriak")
3. *Setting*: Di mana latarnya? (dalam ruangan, outdoor, jalanan, warung, alam, dll)
4. *Vibe/nuansa*: Apa suasananya? (lucu, mengharukan, menegangkan, informatif, viral, absurd, dll)

Aturan WAJIB:
- Bahasa Indonesia, akurat berdasarkan yang BENAR-BENAR terlihat
- Jangan mengarang, jangan tebak-tebakan
- Jika ada hewan → sebut nama jenisnya secara spesifik
- Jika ada makanan → sebut nama makanannya
- Jika ada teks di gambar/thumbnail → sebut isinya
- Maksimal 3-4 kalimat total, ringkas dan to the point
- Jangan tulis "Berdasarkan gambar..." atau label apapun
- Jangan bilang kamu AI`;
}

/**
 * Prompt generate caption WhatsApp untuk FB — pakai formatting WA: *bold* _italic_ \`code\` > quote
 *
 * @param {object} d
 * @param {string} d.pageTitle     - Nama page/user FB
 * @param {string} d.description   - Deskripsi/caption asli dari FB
 * @param {string} d.views         - Views formatted ("5.2K")
 * @param {string} d.quality       - Kualitas video ("HD" | "SD")
 * @param {string[]} d.hashtags    - Array hashtag ["#viral", "#lucu"]
 * @param {string} d.mediaType     - "video" | "reel" | "story"
 * @param {string} d.visualDesc    - Hasil analisis visual dari Gemini Vision
 */
export function buildFbCaptionPrompt({
    pageTitle = '',
    description = '',
    views = '',
    quality = '',
    hashtags = [],
    mediaType = 'video',
    visualDesc = '',
} = {}) {
    const isReel  = mediaType === 'reel';
    const isStory = mediaType === 'story';
    const emoji   = isReel ? '🎬' : isStory ? '📖' : '▶️';
    const typeLabel = isReel ? 'Reel Facebook' : isStory ? 'Story Facebook' : 'Video Facebook';

    const parts = [];
    if (pageTitle)   parts.push(`Sumber: ${pageTitle}`);
    if (views)       parts.push(`Views: ${views}`);
    if (description) parts.push(`Deskripsi asli: "${description.substring(0, 300)}"`);
    if (hashtags.length) parts.push(`Hashtag: ${hashtags.join(' ')}`);

    const metaBlock  = parts.map(p => `- ${p}`).join('\n');
    const visualBlock = visualDesc
        ? `\nAnalisis Visual (PRIORITAS UTAMA — dari AI Vision):\n"${visualDesc.substring(0, 600)}"`
        : '';

    return `Kamu adalah Wily, asisten bot WhatsApp yang cerdas, natural, dan sedikit bercanda.
Tugasmu: buat caption WhatsApp untuk ${typeLabel} yang baru diunduh.

DATA KONTEN:
${metaBlock}${visualBlock}

FORMAT CAPTION (ikuti persis):
Baris 1  : ${emoji} *[Nama Page/User dalam bold]* — sertakan nama sumber jika ada
Baris 2-3: Deskripsi isi konten 1-2 kalimat — *WAJIB berdasarkan Analisis Visual*, bukan mengarang
           Boleh pakai _italic_ untuk kata kunci menarik, dan \`monospace\` untuk istilah/nama spesifik
Baris 4  : (opsional) Komentar santai/reaksi singkat yang nyambung — boleh lucu/ngakak kalau kontennya memang lucu
Baris 5  : > 👁️ [views] kali ditonton — pakai format quote WA (tanda >) untuk stats
           (hanya tampilkan baris ini jika ada data views)

ATURAN KETAT:
1. WAJIB gunakan formatting WA: *bold* untuk nama/judul, _italic_ untuk penekanan, \`backtick\` untuk nama spesifik/istilah, > untuk stats
2. Deskripsi konten HARUS berdasarkan Analisis Visual — jika visual bilang "pria jatuh dari motor", tulis itu; JANGAN tulis frasa generik
3. Bahasa Indonesia santai, tidak kaku, terasa seperti kawan ngirim video
4. DILARANG mengarang fakta di luar data yang diberikan
5. DILARANG sertakan URL atau link
6. DILARANG bilang kamu AI
7. Maksimal 5-6 baris total
8. DILARANG KERAS menambahkan kalimat pembuka/penutup apapun seperti "Oke siap", "Ini dia", "Berikut captionnya", "Tentu!", "Caption:" dll — langsung tulis caption saja tanpa basa-basi
9. Maksimal 8 baris — caption dikirim sebagai pesan teks terpisah, jadi boleh lebih detail tapi tetap ringkas

Caption (langsung, tanpa kalimat pembuka):`;
}

/**
 * Fallback caption sederhana jika AI total gagal.
 */
export function buildFbFallbackCaption({
    pageTitle = '',
    description = '',
    views = '',
    quality = '',
    mediaType = 'video',
} = {}) {
    const emoji = mediaType === 'reel' ? '🎬' : mediaType === 'story' ? '📖' : '▶️';
    const name  = pageTitle ? `*${pageTitle}*` : '*Facebook*';
    let text = `${emoji} ${name}\n`;
    if (description) text += description.substring(0, 120) + (description.length > 120 ? '...' : '') + '\n';
    const stats = [];
    if (views)   stats.push(`👁️ ${views}`);
    if (quality) stats.push(`🎥 ${quality}`);
    if (stats.length) text += `> ${stats.join('  ')}`;
    return text.trim();
}
