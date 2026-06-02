/**
 * ───────────────────────────────
 *  Base Script : Bang Dika Ardnt
 *  Recode By   : Bang Wilykun
 *  WhatsApp    : 6289688206739
 *  Telegram    : @Wilykun1994
 * ───────────────────────────────
 *  HD Image Enhancer via wink.ai
 *  (Ultra HD / Remini-style)
 * ───────────────────────────────
 */
'use strict';

const axios      = require('axios');
const FormData   = require('form-data');
const crypto     = require('node:crypto');
const path       = require('node:path');
const { CookieJar } = require('tough-cookie');
const { wrapper }   = require('axios-cookiejar-support');

const BASE_URL     = 'https://wink.ai';
const STRATEGY_URL = 'https://strategy.app.meitudata.com';
const CLIENT_ID    = '1189857605';
const VERSION      = '5.1.2';
const COUNTRY_CODE = 'ID';
const CLIENT_LANGUAGE  = 'en_US';
const CLIENT_TIMEZONE  = 'Asia/Jakarta';
const TASK_TYPE    = '12';
const CONTENT_TYPE = '1';
const EXT_VALUE    = '2';
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36';

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function makeTrace() {
    return `${crypto.randomBytes(16).toString('hex')}-${crypto.randomBytes(8).toString('hex')}-1`;
}

function traceHeaders(transaction = 'GET%20%2F%5Blocale%5D%2Fimage-enhancer%2Fupload') {
    const trace = makeTrace();
    return {
        'sentry-trace': trace,
        baggage: [
            'sentry-environment=release',
            `sentry-release=${VERSION}%20(b60d25c477f43c6dfac4107810f26d442320f4f1)`,
            'sentry-public_key=e1bf914f3448d9bc8a10c7e499d17d54',
            `sentry-trace_id=${trace.split('-')[0]}`,
            `sentry-transaction=${transaction}`,
            'sentry-sampled=true',
            'sentry-sample_rate=0.75'
        ].join(',')
    };
}

function baseParams(gnum, extra = {}) {
    return new URLSearchParams({
        client_id: CLIENT_ID,
        version: VERSION,
        country_code: COUNTRY_CODE,
        gnum,
        client_language: CLIENT_LANGUAGE,
        client_channel_id: '',
        client_timezone: CLIENT_TIMEZONE,
        ...extra
    });
}

function mimeFromBuffer(buffer) {
    if (!buffer || buffer.length < 4) return 'image/jpeg';
    const sig = buffer.slice(0, 4);
    if (sig[0] === 0x89 && sig[1] === 0x50) return 'image/png';
    if (sig[0] === 0xFF && sig[1] === 0xD8) return 'image/jpeg';
    if (sig[0] === 0x52 && sig[1] === 0x49) return 'image/webp';
    if (sig[0] === 0x47 && sig[1] === 0x49) return 'image/gif';
    return 'image/jpeg';
}

function extFromMime(mime) {
    if (mime === 'image/png') return '.png';
    if (mime === 'image/webp') return '.webp';
    return '.jpg';
}

function extractResultUrl(data) {
    const item  = data?.item_list?.[0];
    const media = item?.result?.media_info_list?.[0];
    return media?.media_data || '';
}

function extractNextMsgId(data, currentMsgId) {
    const item        = data?.item_list?.[0];
    const resultValue = item?.result?.result || '';
    const realMsgId   = item?.result?.msg_id || item?.msg_id || '';

    if (resultValue && resultValue !== currentMsgId && !resultValue.startsWith('http')) {
        return resultValue;
    }
    if (realMsgId && realMsgId !== currentMsgId && !realMsgId.startsWith('wpr_')) {
        return realMsgId;
    }
    return '';
}

/**
 * HD Image Enhancer via wink.ai
 * @param {Buffer} imageBuffer - Buffer gambar yang akan di-enhance
 * @returns {Promise<string>} - URL hasil gambar HD
 */
async function winkHdEnhance(imageBuffer) {
    const GNUM = crypto.randomUUID();

    const jar = new CookieJar();
    await jar.setCookie(`_sm=${GNUM}; Path=/; Domain=wink.ai`, BASE_URL);
    await jar.setCookie(
        `meitustat=${encodeURIComponent(JSON.stringify({ wgid: GNUM }))}; Path=/; Domain=wink.ai`,
        BASE_URL
    );

    const api = wrapper(axios.create({
        baseURL: BASE_URL,
        jar,
        withCredentials: true,
        validateStatus: () => true,
        headers: {
            accept: '*/*',
            origin: BASE_URL,
            referer: `${BASE_URL}/image-enhancer/upload`,
            'user-agent': UA,
            'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
            ab_info: JSON.stringify({ ab_codes: [], version: '1.4.4' })
        }
    }));

    const mime     = mimeFromBuffer(imageBuffer);
    const ext      = extFromMime(mime);
    const suffix   = ext;
    const fileName = `image${ext}`;
    const TASK_NAME = `Enhancer-Ultra HD-image`;

    // Step 1: get_maat_sign
    const signParams = baseParams(GNUM, { suffix, type: 'temp', count: '1' });
    const signRes = await api.get(`/api/file/get_maat_sign.json?${signParams.toString()}`, {
        headers: traceHeaders()
    });
    if (signRes.status >= 400 || signRes.data?.code !== 0) {
        throw new Error(`get_maat_sign gagal: ${JSON.stringify(signRes.data)}`);
    }
    const sign = signRes.data.data;

    // Step 2: upload policy
    const policyParams = new URLSearchParams({
        app: sign.app,
        count: String(sign.count),
        sig: sign.sig,
        sigTime: sign.sig_time,
        sigVersion: sign.sig_version,
        suffix: sign.suffix,
        type: sign.type
    });
    const policyRes = await axios.get(`${STRATEGY_URL}/upload/policy?${policyParams.toString()}`, {
        headers: {
            accept: '*/*',
            origin: BASE_URL,
            referer: `${BASE_URL}/`,
            'user-agent': UA,
            'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"'
        },
        validateStatus: () => true
    });
    if (policyRes.status >= 400 || !Array.isArray(policyRes.data) || !policyRes.data[0]?.qiniu) {
        throw new Error(`upload policy gagal: ${JSON.stringify(policyRes.data)}`);
    }
    const policy = policyRes.data[0].qiniu;

    // Step 3: upload to Qiniu
    const uploadForm = new FormData();
    uploadForm.append('file', imageBuffer, { filename: fileName, contentType: mime });
    uploadForm.append('token', policy.token);
    uploadForm.append('key', policy.key);
    uploadForm.append('fname', fileName);

    const uploadRes = await axios.post(policy.url, uploadForm, {
        headers: uploadForm.getHeaders({
            origin: BASE_URL,
            referer: `${BASE_URL}/`,
            'user-agent': UA,
            accept: '*/*'
        }),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true
    });
    if (uploadRes.status >= 400) {
        throw new Error(`upload qiniu gagal HTTP ${uploadRes.status}: ${JSON.stringify(uploadRes.data)}`);
    }
    if (!uploadRes.data?.url && !uploadRes.data?.data) {
        throw new Error(`upload qiniu response tidak valid: ${JSON.stringify(uploadRes.data)}`);
    }
    const sourceUrl  = uploadRes.data.url || uploadRes.data.data || policy.data;
    const fileKey    = policy.key;

    // Step 4: meta_info
    const metaBody = baseParams(GNUM, { file_key: fileKey });
    const metaRes = await api.post('/api/file/meta_info.json', metaBody.toString(), {
        headers: { ...traceHeaders(), 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }
    });
    if (metaRes.status >= 400 || metaRes.data?.code !== 0) {
        throw new Error(`meta_info gagal: ${JSON.stringify(metaRes.data)}`);
    }

    // Step 5: calc beans
    const typeParams = JSON.stringify({ is_mirror: 0, orientation_tag: 1, j_420_trans: '1', return_ext: '2' });
    const rightDetail = JSON.stringify({
        source: '1', touch_type: '4', function_id: '630', material_id: '63011',
        url: 'https://wink.ai/image-enhancer/upload'
    });
    const itemList = JSON.stringify([{
        type: Number(TASK_TYPE), ext_value: EXT_VALUE, content_type: Number(CONTENT_TYPE),
        duration: 0, type_params: typeParams, right_detail: rightDetail
    }]);
    const beansBody = baseParams(GNUM, { item_list: itemList });
    const beansRes = await api.post('/api/subscribe/batch_calc_need_beans.json', beansBody.toString(), {
        headers: { ...traceHeaders(), 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }
    });
    if (beansRes.status >= 400 || beansRes.data?.code !== 0) {
        throw new Error(`calc_beans gagal: ${JSON.stringify(beansRes.data)}`);
    }

    // Step 6: delivery
    const deliveryBody = baseParams(GNUM, {
        type: TASK_TYPE,
        content_type: CONTENT_TYPE,
        source_url: sourceUrl,
        type_params: typeParams,
        right_detail: rightDetail,
        ext_params: JSON.stringify({ task_name: TASK_NAME, records: TASK_TYPE }),
        with_prepare: '1'
    });
    const deliveryRes = await api.post('/api/meitu_ai/delivery.json', deliveryBody.toString(), {
        headers: { ...traceHeaders(), 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }
    });
    if (deliveryRes.status >= 400 || deliveryRes.data?.code !== 0) {
        throw new Error(`delivery gagal: ${JSON.stringify(deliveryRes.data)}`);
    }
    const deliveryData = deliveryRes.data.data || {};
    const firstMsgId   = deliveryData.msg_id || deliveryData.prepare_msg_id;
    if (!firstMsgId) throw new Error(`delivery tidak mengembalikan msg_id: ${JSON.stringify(deliveryData)}`);

    // Step 7: poll result
    let msgId = firstMsgId;
    const maxTry = 80;
    const delayMs = 3000;

    for (let i = 1; i <= maxTry; i++) {
        const queryParams = baseParams(GNUM, { msg_ids: msgId });
        const queryRes = await api.get(`/api/meitu_ai/query_batch.json?${queryParams.toString()}`, {
            headers: {
                ...traceHeaders('%2F%3Alocale%2Feditor%2Frecent-task'),
                referer: `${BASE_URL}/image-enhancer/upload`
            }
        });
        if (queryRes.status >= 400 || queryRes.data?.code !== 0) {
            throw new Error(`query_batch gagal: ${JSON.stringify(queryRes.data)}`);
        }
        const qData = queryRes.data.data;

        const nextMsgId = extractNextMsgId(qData, msgId);
        if (nextMsgId) {
            msgId = nextMsgId;
            await sleep(1000);
            continue;
        }

        const url       = extractResultUrl(qData);
        const errorCode = qData?.item_list?.[0]?.result?.error_code;
        const errorMsg  = qData?.item_list?.[0]?.result?.error_msg;

        if (url && url.startsWith('http') && errorCode === 0) {
            return url;
        }
        if (errorCode && errorCode !== 29901 && errorCode !== 0) {
            throw new Error(`task gagal: ${errorCode} ${errorMsg || ''}`);
        }
        await sleep(delayMs);
    }

    throw new Error('Timeout: hasil enhance belum selesai dalam batas waktu');
}

/**
 * Tambah badge "HD" style WhatsApp di pojok kiri bawah gambar
 * @param {Buffer} imgBuffer
 * @returns {Promise<Buffer>}
 */
async function addHdBadge(imgBuffer) {
    const sharp = require('sharp');

    const meta = await sharp(imgBuffer).metadata();
    const w = meta.width  || 500;
    const h = meta.height || 500;

    const bW = Math.round(w * 0.14);
    const bH = Math.round(bW * 0.45);
    const r  = Math.round(bH * 0.38);
    const fs = Math.round(bH * 0.52);
    const margin = Math.round(w * 0.025);

    const svg = `<svg width="${bW}" height="${bH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${bW}" height="${bH}" rx="${r}" ry="${r}" fill="rgba(0,0,0,0.60)"/>
  <rect x="1.5" y="1.5" width="${bW - 3}" height="${bH - 3}" rx="${r - 1}" ry="${r - 1}"
        fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
  <text x="50%" y="52%" dominant-baseline="central" text-anchor="middle"
        font-family="Arial Black, Arial, sans-serif" font-size="${fs}"
        font-weight="900" fill="white" letter-spacing="2">HD</text>
</svg>`;

    return sharp(imgBuffer)
        .composite([{
            input: Buffer.from(svg),
            left: margin,
            top:  h - bH - margin,
            blend: 'over'
        }])
        .jpeg({ quality: 95 })
        .toBuffer();
}

module.exports = { winkHdEnhance, addHdBadge };
