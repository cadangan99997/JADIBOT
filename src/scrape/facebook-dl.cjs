'use strict';

/**
 * Handler untuk command .fb
 * @param {object} hisoka - bot socket
 * @param {object} m       - pesan
 * @param {string} query   - URL Facebook
 * @param {object} ctx     - { gemini, tolak, logCommand,
 *                            buildFbVisionPrompt, buildFbCaptionPrompt,
 *                            buildFbFallbackCaption, parseFbMetaHtml, formatFbCount }
 */
async function handleFacebookDl(hisoka, m, query, ctx) {
    const {
        gemini, tolak, logCommand,
        buildFbVisionPrompt, buildFbCaptionPrompt,
        buildFbFallbackCaption, parseFbMetaHtml, formatFbCount,
    } = ctx;

    if (!query) {
        await tolak(hisoka, m,
            '❌ Masukkan link Facebook!\n\nContoh:\n' +
            '.fb https://www.facebook.com/watch?v=xxx\n' +
            '.fb https://fb.watch/xxx\n' +
            '.fb https://www.facebook.com/reel/xxx\n' +
            '.fb https://www.facebook.com/stories/xxx'
        );
        return;
    }

    const fbUrl = query.trim();
    if (!fbUrl.includes('facebook.com') && !fbUrl.includes('fb.watch') && !fbUrl.includes('fb.com')) {
        await tolak(hisoka, m, '❌ Link tidak valid! Pastikan link dari Facebook.');
        return;
    }

    const loadingMsg = await tolak(hisoka, m, '⏳ Sedang mengunduh dari Facebook...');

    const isStory = fbUrl.includes('/stories/') || fbUrl.includes('story.php') || fbUrl.includes('/story/');
    const isReel  = fbUrl.includes('/reel/');

    let mediaData = null;
    let metaHtml  = '';

    // Fetch media + meta HTML secara paralel
    const [archiveResult, metaHtmlResult] = await Promise.allSettled([
        // Method 1: archive.lick.eu.org (primary)
        (async () => {
            const apiUrl = `https://archive.lick.eu.org/api/download/facebook?url=${encodeURIComponent(fbUrl)}`;
            const response = await fetch(apiUrl, { signal: AbortSignal.timeout(20000) });
            return response.json();
        })(),
        // Fetch meta HTML untuk og: tags
        (async () => {
            const axios = (await import('axios')).default;
            const { data } = await axios.get(fbUrl, {
                maxRedirects: 10,
                headers: {
                    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
                },
                timeout: 15000,
            });
            return data;
        })(),
    ]);

    // Proses archive result
    if (archiveResult.status === 'fulfilled') {
        const data = archiveResult.value;
        if (data.status && data.result?.media?.length > 0) {
            const mediaList = data.result.media;
            const hdMedia   = mediaList.find(item =>
                item.quality && (item.quality.toLowerCase().includes('hd') || item.quality.toLowerCase().includes('high'))
            );
            const bestMedia = hdMedia || mediaList[0];
            if (bestMedia?.url) {
                mediaData = {
                    url      : bestMedia.url,
                    quality  : hdMedia ? 'HD' : 'SD',
                    isHD     : !!hdMedia,
                    title    : data.result.metadata?.title || '',
                    thumbnail: data.result.metadata?.thumbnail || data.result.thumbnail || null,
                    isVideo  : true,
                };
            }
        }
    }

    // Proses meta HTML
    if (metaHtmlResult.status === 'fulfilled') {
        metaHtml = metaHtmlResult.value || '';
    }

    // Method 2: direct page scraping dengan Chrome UA (browser_native_hd_url hanya muncul di Chrome UA)
    if (!mediaData) {
        try {
            const axios2 = (await import('axios')).default;
            const { data: pageData } = await axios2.get(fbUrl, {
                maxRedirects: 10,
                headers: {
                    'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept'         : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'sec-fetch-dest' : 'document',
                    'sec-fetch-mode' : 'navigate',
                    'sec-fetch-site' : 'none',
                },
                timeout: 20000,
            });
            const cleaned = pageData.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
            const hdMatch  = cleaned.match(/"browser_native_hd_url":"([^"]+)"/)  || cleaned.match(/"playable_url_quality_hd":"([^"]+)"/);
            const sdMatch  = cleaned.match(/"browser_native_sd_url":"([^"]+)"/)  || cleaned.match(/"playable_url":"([^"]+)"/);
            const hdUrl    = hdMatch ? hdMatch[1].replace(/\\/g, '') : null;
            const sdUrl    = sdMatch ? sdMatch[1].replace(/\\/g, '') : null;
            const videoUrl = hdUrl || sdUrl;
            if (videoUrl && videoUrl.startsWith('https://')) {
                mediaData = {
                    url    : videoUrl,
                    quality: hdUrl ? 'HD' : 'SD',
                    isHD   : !!hdUrl,
                    isVideo: true,
                };
                console.log('[FB] method2 Chrome UA success:', hdUrl ? 'HD' : 'SD');
            }
        } catch (e) {
            console.log('[FB] method2 Chrome UA failed:', e.message);
        }
    }

    if (!mediaData?.url) {
        await m.reply({ edit: loadingMsg.key, text: '❌ Gagal mengunduh. Video/story mungkin private, perlu login, atau link tidak valid.' });
        return;
    }

    // Parse metadata dari HTML
    const parsedMeta = parseFbMetaHtml(metaHtml);
    const pageTitle  = mediaData.title || parsedMeta.pageTitle || '';
    const mediaType  = isStory ? 'story' : isReel ? 'reel' : parsedMeta.mediaType || 'video';
    const views      = parsedMeta.views || '';
    const quality    = mediaData.quality || '';
    const hashtags   = parsedMeta.hashtags || [];
    const description = parsedMeta.description || '';

    await m.reply({ edit: loadingMsg.key, text: '✅ Berhasil! Menganalisis konten...' });

    // ── Gemini Vision: analisis thumbnail ──
    let fbVisualDesc = '';
    const thumbUrl = mediaData.thumbnail || null;
    if (thumbUrl && gemini) {
        try {
            const { default: axiosLib } = await import('axios');
            const thumbRes = await axiosLib.get(thumbUrl, {
                responseType: 'arraybuffer',
                timeout      : 12000,
                headers      : { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36' },
            });
            const thumbBuf = Buffer.from(thumbRes.data);
            if (thumbBuf.length > 500) {
                const base64Thumb = thumbBuf.toString('base64');
                const mimeThumb   = thumbRes.headers['content-type']?.split(';')[0] || 'image/jpeg';
                fbVisualDesc = await gemini.chat({
                    model   : 'gemini-2.5-flash',
                    contents: [{
                        role : 'user',
                        parts: [
                            { inlineData: { mimeType: mimeThumb, data: base64Thumb } },
                            { text: buildFbVisionPrompt() },
                        ],
                    }],
                });
            }
        } catch (_) {}
    }

    // ── Generate AI caption ──
    let finalCaption = buildFbFallbackCaption({ pageTitle, description, views, quality, mediaType });

    if (gemini) {
        try {
            const captionPrompt = buildFbCaptionPrompt({
                pageTitle, description, views, quality, hashtags, mediaType,
                visualDesc: fbVisualDesc,
            });
            const aiCaption = await gemini.ask(captionPrompt);
            if (aiCaption?.trim()) finalCaption = aiCaption.trim();
        } catch (_) {}
    }

    // ── Kirim media + caption sekaligus ──
    if (mediaData.isVideo !== false) {
        await hisoka.sendMessage(m.from, {
            video  : { url: mediaData.url },
            caption: finalCaption,
        }, { quoted: m });
    } else {
        await hisoka.sendMessage(m.from, {
            image  : { url: mediaData.url },
            caption: finalCaption,
        }, { quoted: m });
    }

    logCommand(m, hisoka, 'facebook');
}

module.exports = { handleFacebookDl };
