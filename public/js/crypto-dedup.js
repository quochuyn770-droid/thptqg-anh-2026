/**
 * 128-bit CSPRNG, SHA-256 hashing, 3-Gram Jaccard similarity,
 * GDPT 2018 Legacy Format Blocker (no pronunciation/stress/old error-ID),
 * and source category helpers.
 */

export function csprngHex(bytesLen = 16) {
    const buf = new Uint8Array(bytesLen);
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(buf);
    } else {
        for (let i = 0; i < bytesLen; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function csprngInt(min, max) {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi <= lo) return lo;
    const range = hi - lo + 1;
    const arr = new Uint32Array(4);
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(arr);
    } else {
        arr[0] = Math.floor(Math.random() * 0xffffffff);
        arr[1] = Math.floor(Math.random() * 0xffffffff);
    }
    const mixed = ((arr[0] ^ arr[2]) >>> 0) + ((arr[1] ^ arr[3]) >>> 0) * 0x100000000;
    return lo + (mixed % range);
}

export function csprngSample(list, count) {
    const copy = Array.from(list);
    for (let i = copy.length - 1; i > 0; i--) {
        const j = csprngInt(0, i);
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
    }
    return copy.slice(0, Math.min(count, copy.length));
}

export function normalizeTextForHash(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFC")
        .replace(/[\*\[\]\(\)\{\}\\_,;:.!?"'`~^+=<>|-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export async function sha256Hex(rawText) {
    const norm = normalizeTextForHash(rawText);
    try {
        if (globalThis.crypto && globalThis.crypto.subtle) {
            const data = new TextEncoder().encode(norm);
            const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
            return Array.from(new Uint8Array(hashBuffer))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
        }
    } catch {
        // Fallback deterministic 256-bit hash for non-HTTPS local contexts
    }
    let out = "";
    const seeds = [
        0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35,
        0x27d4eb2f, 0x165667b1, 0xd3a2646c, 0xfd7046c5
    ];
    for (const s of seeds) {
        let h = s >>> 0;
        for (let i = 0; i < norm.length; i++) {
            h ^= norm.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        out += h.toString(16).padStart(8, "0");
    }
    return out;
}

export function extractShinglesFromNormalized(normText, k = 3) {
    const tokens = String(normText || "").split(" ").filter(Boolean);
    const set = new Set();
    if (tokens.length < k) {
        if (normText) set.add(normText);
        return set;
    }
    for (let i = 0; i <= tokens.length - k; i++) {
        set.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
    }
    return set;
}

export function extractShingles(rawText, k = 3) {
    return extractShinglesFromNormalized(normalizeTextForHash(rawText), k);
}

export function jaccardSimilarity(setA, setB) {
    if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
    for (const item of smaller) {
        if (larger.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

/**
 * GDPT 2018 (QĐ 764/QĐ-BGDĐT) Legacy English Format Blocker.
 * Rejects deprecated question stems removed in the 2025–2026 structure:
 * pronunciation, word stress, and old error identification.
 */
export function containsLegacyEnglishFormat(text) {
    if (!text) return false;
    const lower = String(text).toLowerCase();
    const bannedPatterns = [
        "underlined part differs from the other three in pronunciation",
        "differs from the other three in the position of primary stress",
        "differs from the other three in the position of stress",
        "position of primary stress",
        "underlined part that needs correction",
        "part that needs correction in each of the following",
        "phát âm khác với ba từ còn lại",
        "vị trí trọng âm chính khác",
        "tìm lỗi sai cần sửa"
    ];
    return bannedPatterns.some((pat) => lower.includes(pat));
}

export function isNewsRssSourceId(sourceId = "") {
    const s = String(sourceId).toLowerCase();
    return (
        s.startsWith("rss:") ||
        s.includes("guardian") ||
        s.includes("sciencedaily") ||
        s.includes("conversation") ||
        s.includes("npr")
    );
}

export function isAcademicSourceId(sourceId = "") {
    const s = String(sourceId).toLowerCase();
    return (
        s.startsWith("wiki:") ||
        s.startsWith("openalex:") ||
        s.startsWith("epmc:") ||
        s.includes("wikipedia") ||
        s.includes("europepmc")
    );
}

export function sanitizeVaultKey(raw, fallback = "THPTQG-ANH-2026") {
    const cleaned = String(raw || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    return cleaned || fallback;
}

/**
 * 3-Layer Content Integrity Check (GDPT 2018 Format + SHA-256 + 3-gram Jaccard > 65%)
 */
export async function evaluateContentIntegrity(contentText, vault, batchHashes, batchShingles) {
    if (containsLegacyEnglishFormat(contentText)) {
        vault.sessionLegacyRejected = (vault.sessionLegacyRejected || 0) + 1;
        return { ok: false, reason: "Vi phạm QĐ 764/QĐ-BGDĐT (chứa dạng Phát âm / Trọng âm / Tìm lỗi sai cũ)" };
    }

    const normText = normalizeTextForHash(contentText);
    const hash = await sha256Hex(contentText);
    if (vault.hashes.has(hash) || batchHashes.has(hash)) {
        vault.sessionDuplicatesBlocked = (vault.sessionDuplicatesBlocked || 0) + 1;
        return { ok: false, reason: `Trùng khớp SHA-256 tuyệt đối (${hash.slice(0, 10)})` };
    }

    const shingles = extractShinglesFromNormalized(normText, 3);
    for (const entry of vault.shingleEntries) {
        const sim = jaccardSimilarity(shingles, entry.shingles);
        if (sim > 0.65) {
            vault.sessionDuplicatesBlocked = (vault.sessionDuplicatesBlocked || 0) + 1;
            return { ok: false, reason: `Tương đồng 3-Gram Jaccard ${(sim * 100).toFixed(1)}% > 65%` };
        }
    }
    for (const other of batchShingles) {
        const sim = jaccardSimilarity(shingles, other);
        if (sim > 0.65) {
            vault.sessionDuplicatesBlocked = (vault.sessionDuplicatesBlocked || 0) + 1;
            return { ok: false, reason: `Trùng nội bộ trong cùng đề (${(sim * 100).toFixed(1)}%)` };
        }
    }

    return { ok: true, hash, normText: normText.slice(0, 480), shingles };
}
