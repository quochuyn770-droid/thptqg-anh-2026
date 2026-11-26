import { handleHarvestProxyRequest } from "../lib/proxy-core.mjs";

export default async function handler(req, res) {
    try {
        if (req.method !== "GET") {
            return res.status(405).json({ ok: false, error: "Method Not Allowed" });
        }

        const rawUrl = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
        const result = await handleHarvestProxyRequest(rawUrl);
        res.setHeader("Content-Type", result.contentType);
        res.setHeader("Cache-Control", "public, max-age=180");
        return res.status(result.status).send(result.body);
    } catch (err) {
        return res.status(500).json({ ok: false, error: `Lỗi xử lý /api/harvest: ${err.message}` });
    }
}
