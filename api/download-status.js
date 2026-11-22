const sourcePage = 'https://getleadwave.in/';
const installer = new URL('downloads/LeadWave-Setup.exe', sourcePage).href;

async function checkFile(signal) {
    const response = await fetch(installer, {
        headers: { Range: 'bytes=0-1' },
        signal
    });
    try {
        if ([404, 410].includes(response.status)) return 'missing';
        if (!response.ok || !response.body) return 'unknown';
        const reader = response.body.getReader();
        const prefix = [];
        try {
            while (prefix.length < 2) {
                const { done, value } = await reader.read();
                if (done) break;
                prefix.push(...value.subarray(0, 2 - prefix.length));
            }
        } finally {
            reader.releaseLock();
        }
        return prefix[0] === 0x4d && prefix[1] === 0x5a ? 'ready' : 'invalid';
    } finally {
        await response.body?.cancel();
    }
}

async function publishedLink(signal) {
    const response = await fetch(sourcePage, { signal });
    if (!response.ok) {
        await response.body?.cancel();
        return null;
    }
    const html = await response.text();
    for (const [, attributes, contents] of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
        const label = contents.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const href = attributes.match(/\shref\s*=\s*(["'])(.*?)\1/i);
        if (href && /download.*windows/i.test(label)) {
            return new URL(href[2].replace(/&amp;/g, '&'), response.url).href;
        }
    }
    return null;
}

module.exports = async function downloadStatus(request, response) {
    const signal = AbortSignal.timeout(5500);
    const [file, published] = await Promise.all([
        checkFile(signal).catch(() => 'unknown'),
        publishedLink(signal).catch(() => null)
    ]);
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json({ file, checkedUrl: installer, publishedUrl: published });
};
