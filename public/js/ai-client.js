import { AI_PROVIDERS, STORAGE_KEYS } from "./config.js";

/**
 * Unified AI Client supporting:
 * 1) Server Proxy Mode (/api/ai) — keeps Vercel/Netlify server API keys hidden
 * 2) Direct Browser BYOK Mode — calls Gemini / Groq / OpenRouter / Custom directly
 * 3) Automatic Free-Model Fallback Chain on 429 / 404 / 503 / timeout
 * 4) Robust JSON extraction & cleanup (zero Math/LaTeX dependencies)
 */

export function stripThinkTags(rawText) {
    return String(rawText || "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();
}

export function parseRobustJson(rawText) {
    let cleaned = stripThinkTags(rawText);
    const fenceRe = new RegExp("^\\x60\\x60\\x60(?:json)?\\s*|\\s*\\x60\\x60\\x60$", "gi");
    cleaned = cleaned.replace(fenceRe, "").trim();

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    try {
        return JSON.parse(cleaned);
    } catch {
        // Remove trailing commas before closing brackets/braces and control chars
        const repaired = cleaned
            .replace(/,\s*([}\]])/g, "$1")
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
        return JSON.parse(repaired);
    }
}

export function resolveClientGeminiThinkingLevel(modelId, requestedLevel) {
    if (!requestedLevel) return null;
    const m = String(modelId || "").toLowerCase();
    const lvl = String(requestedLevel).trim().toUpperCase();

    if (m.startsWith("gemini-4-hydrogen") || m.startsWith("gemini-4-neon")) {
        if (lvl === "MINIMAL") return "LOW";
        if (["LOW", "MEDIUM", "HIGH", "XHIGH"].includes(lvl)) return lvl;
        return "MEDIUM";
    }
    if (m.startsWith("gemini-4-") || m.startsWith("gemini-3.8-")) {
        if (lvl === "MINIMAL") return "LOW";
        if (lvl === "XHIGH") return "HIGH";
        if (["LOW", "MEDIUM", "HIGH"].includes(lvl)) return lvl;
        return "MEDIUM";
    }
    if (m.startsWith("gemini-3")) {
        if (lvl === "XHIGH") return "HIGH";
        if (["MINIMAL", "LOW", "MEDIUM", "HIGH"].includes(lvl)) return lvl;
        return "LOW";
    }
    return null;
}

export function buildClientGeminiPayload({ model, systemInstruction, prompt, responseSchema, useGoogleSearch, thinkingLevel }) {
    const payload = {
        contents: [{ role: "user", parts: [{ text: String(prompt || "") }] }]
    };
    if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: String(systemInstruction) }] };
    }
    if (useGoogleSearch) {
        payload.tools = [{ google_search: {} }];
    }
    const generationConfig = {};
    if (responseSchema && !useGoogleSearch) {
        generationConfig.responseMimeType = "application/json";
        generationConfig.responseSchema = responseSchema;
    }
    const safeLevel = resolveClientGeminiThinkingLevel(model, thinkingLevel);
    if (safeLevel) {
        generationConfig.thinkingConfig = { thinkingLevel: safeLevel };
    }
    if (Object.keys(generationConfig).length > 0) {
        payload.generationConfig = generationConfig;
    }
    return payload;
}

export function getFallbackCandidateModels(providerId, primaryModel, autoFallback) {
    const cleanPrimary = String(primaryModel || "").trim();
    const cfg = AI_PROVIDERS[providerId];
    const baseList = cleanPrimary ? [cleanPrimary] : [];
    if (!autoFallback || !cfg || !Array.isArray(cfg.fallbackModels)) {
        return baseList;
    }
    for (const m of cfg.fallbackModels) {
        if (m && !baseList.includes(m)) baseList.push(m);
    }
    return baseList;
}

export const AI_SETTINGS_VERSION = 1;

export function getDefaultAiSettings() {
    return {
        settingsVersion: AI_SETTINGS_VERSION,
        provider: "gemini",
        models: {
            gemini: "gemini-3.5-flash-lite",
            groq: "openai/gpt-oss-120b",
            openrouter: "openrouter/free",
            custom: ""
        },
        keys: {
            gemini: "",
            groq: "",
            openrouter: "",
            custom: ""
        },
        customBaseUrl: "",
        thinkingLevel: "LOW",
        autoFallback: true,
        useGoogleSearchFallback: false
    };
}

export function loadAiSettings() {
    const defaults = getDefaultAiSettings();
    try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEYS.AI_SETTINGS);
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        return {
            ...defaults,
            ...parsed,
            settingsVersion: AI_SETTINGS_VERSION,
            models: { ...defaults.models, ...(parsed.models || {}) },
            keys: { ...defaults.keys, ...(parsed.keys || {}) }
        };
    } catch {
        return defaults;
    }
}

export function saveAiSettings(settings) {
    try {
        const payload = { ...settings, settingsVersion: AI_SETTINGS_VERSION };
        globalThis.localStorage?.setItem(STORAGE_KEYS.AI_SETTINGS, JSON.stringify(payload));
    } catch {
        // Ignore storage quota errors
    }
}

export function isTransientNetworkError(err) {
    if (!err) return false;
    if (err.isNetworkError) return true;
    const msg = String(err.message || "");
    return (
        err.name === "TypeError" ||
        /failed to fetch|networkerror|load failed|network request failed|err_network|socket|connection/i.test(msg)
    );
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return res;
    } catch (err) {
        clearTimeout(timer);
        if (err && err.name === "AbortError") {
            const timeoutErr = new Error(`Quá thời gian chờ (${Math.round(timeoutMs / 1000)}s)`);
            timeoutErr.name = "AbortError";
            timeoutErr.status = 504;
            timeoutErr.retryable = true;
            timeoutErr.isTimeout = true;
            throw timeoutErr;
        }
        if (isTransientNetworkError(err)) {
            err.isNetworkError = true;
            err.retryable = true;
        }
        throw err;
    }
}

export class UnifiedAiClient {
    constructor({ onLog } = {}) {
        this.onLog = typeof onLog === "function" ? onLog : () => {};
        this.settings = loadAiSettings();
        this.modelCooldowns = new Map();
        this.lastWorkingModel = null;
        this.preferServerProxy = false;
        this.serverHealth = {
            checked: false,
            proxyAvailable: false,
            serverHasAnyKey: false,
            configuredProviders: { gemini: false, groq: false, openrouter: false, custom: false },
            defaultProvider: "gemini",
            defaultModel: "gemini-3.5-flash-lite"
        };
    }

    clearModelCooldowns() {
        this.modelCooldowns.clear();
    }

    markModelCooldown(provider, model, durationMs = 180000) {
        if (!provider || !model) return;
        this.modelCooldowns.set(`${provider}:${model}`, Date.now() + durationMs);
    }

    isModelInCooldown(provider, model) {
        const key = `${provider}:${model}`;
        const expiresAt = this.modelCooldowns.get(key);
        if (!expiresAt) return false;
        if (Date.now() >= expiresAt) {
            this.modelCooldowns.delete(key);
            return false;
        }
        return true;
    }

    getOrderedCandidateModels(providerId, primaryModel, autoFallback) {
        const rawList = getFallbackCandidateModels(providerId, primaryModel, autoFallback);
        if (rawList.length <= 1) return rawList;
        const healthy = [];
        const coolingDown = [];
        for (const m of rawList) {
            if (this.isModelInCooldown(providerId, m)) coolingDown.push(m);
            else healthy.push(m);
        }
        return [...healthy, ...coolingDown];
    }

    async detectServerHealth() {
        try {
            const res = await fetchWithTimeout("/api/health", { method: "GET", cache: "no-store" }, 3500);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data && data.ok) {
                this.serverHealth = {
                    checked: true,
                    proxyAvailable: true,
                    serverHasAnyKey: Boolean(data.serverHasAnyKey),
                    configuredProviders: data.configuredProviders || this.serverHealth.configuredProviders,
                    defaultProvider: data.defaultProvider || "gemini",
                    defaultModel: data.defaultModel || "gemini-3.5-flash-lite"
                };

                const hasAnyBrowserKey = Object.values(this.settings.keys || {}).some((k) => Boolean(k && k.trim()));
                if (!hasAnyBrowserKey && data.serverHasAnyKey && data.defaultProvider) {
                    this.settings.provider = data.defaultProvider;
                    if (data.defaultModel) {
                        this.settings.models[data.defaultProvider] = data.defaultModel;
                    }
                }
                return this.serverHealth;
            }
        } catch {
            // Static hosting without /api/health
        }
        this.serverHealth.checked = true;
        this.serverHealth.proxyAvailable = false;
        return this.serverHealth;
    }

    updateSettings(partial) {
        this.settings = {
            ...this.settings,
            ...partial,
            settingsVersion: AI_SETTINGS_VERSION,
            models: { ...this.settings.models, ...(partial.models || {}) },
            keys: { ...this.settings.keys, ...(partial.keys || {}) }
        };
        this.clearModelCooldowns();
        saveAiSettings(this.settings);
    }

    getActiveProvider() {
        return this.settings.provider || "gemini";
    }

    getActiveModel(provider = this.getActiveProvider()) {
        const cfg = AI_PROVIDERS[provider] || AI_PROVIDERS.gemini;
        return (this.settings.models?.[provider] || "").trim() || cfg.defaultModel;
    }

    getBrowserKey(provider = this.getActiveProvider()) {
        return (this.settings.keys?.[provider] || "").trim();
    }

    hasServerKeyFor(provider = this.getActiveProvider()) {
        return Boolean(this.serverHealth.proxyAvailable && this.serverHealth.configuredProviders?.[provider]);
    }

    isReadyForActiveProvider() {
        const provider = this.getActiveProvider();
        if (provider === "custom") {
            const hasLocal = Boolean(this.settings.customBaseUrl?.trim() && this.getActiveModel("custom"));
            return hasLocal || this.hasServerKeyFor("custom");
        }
        return Boolean(this.getBrowserKey(provider)) || this.hasServerKeyFor(provider);
    }

    getConnectionModeLabel() {
        const provider = this.getActiveProvider();
        const model = this.getActiveModel(provider);
        const hasBrowserKey = Boolean(this.getBrowserKey(provider));
        const hasServerKey = this.hasServerKeyFor(provider);
        const shortName = AI_PROVIDERS[provider]?.shortLabel || provider;

        if (hasBrowserKey) {
            return { ready: true, mode: "byok", label: `${shortName} · ${model}`, detail: "API Key trên trình duyệt" };
        }
        if (hasServerKey) {
            return { ready: true, mode: "server", label: `${shortName} · ${model}`, detail: "Server Proxy (Key ẩn an toàn)" };
        }
        if (provider === "custom" && this.settings.customBaseUrl?.trim() && model) {
            return { ready: true, mode: "custom", label: `Custom · ${model}`, detail: this.settings.customBaseUrl.trim() };
        }
        return { ready: false, mode: "unconfigured", label: "Chưa nhập API Key AI", detail: "Nhấn để cấu hình AI miễn phí" };
    }

    async _callViaServerProxy({ provider, model, systemInstruction, prompt, responseSchema, useGoogleSearch, thinkingLevel, timeoutMs = 42000 }) {
        const res = await fetchWithTimeout(
            "/api/ai",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider,
                    model,
                    systemInstruction,
                    prompt,
                    responseSchema,
                    useGoogleSearch,
                    thinkingLevel,
                    timeoutMs,
                    customBaseUrl: this.settings.customBaseUrl || "",
                    clientApiKey: this.getBrowserKey(provider) || undefined
                })
            },
            timeoutMs + 5000
        );

        const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
        if (!res.ok || !data.ok) {
            const err = new Error(data.error || `Proxy HTTP ${res.status}`);
            err.status = res.status;
            err.retryable = Boolean(data.retryable || res.status === 429 || res.status >= 500);
            err.code = data.code;
            throw err;
        }
        return data;
    }

    async _callDirectGemini({ model, apiKey, systemInstruction, prompt, responseSchema, useGoogleSearch, thinkingLevel, timeoutMs = 36000 }) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
        const payload = buildClientGeminiPayload({
            model,
            systemInstruction,
            prompt,
            responseSchema,
            useGoogleSearch,
            thinkingLevel
        });

        const res = await fetchWithTimeout(
            endpoint,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey
                },
                body: JSON.stringify(payload)
            },
            timeoutMs
        );

        const raw = await res.text();
        if (!res.ok) {
            let msg = raw.slice(0, 240);
            try {
                msg = JSON.parse(raw)?.error?.message || msg;
            } catch {
                // keep slice
            }
            const err = new Error(`Gemini HTTP ${res.status}: ${msg}`);
            err.status = res.status;
            err.retryable = res.status === 429 || res.status >= 500;
            throw err;
        }

        const data = JSON.parse(raw);
        const candidate = data?.candidates?.[0];
        const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
        const text = parts
            .filter((p) => p && typeof p.text === "string" && !p.thought)
            .map((p) => p.text)
            .join("\n")
            .trim();

        return { ok: true, provider: "gemini", model, text, groundingLinks: [], usage: data?.usageMetadata || null };
    }

    async _callDirectOpenAICompat({ provider, model, apiKey, systemInstruction, prompt, responseSchema, timeoutMs = 38000 }) {
        let endpoint = "";
        const headers = { "Content-Type": "application/json" };
        if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

        if (provider === "groq") {
            endpoint = "https://api.groq.com/openai/v1/chat/completions";
        } else if (provider === "openrouter") {
            endpoint = "https://openrouter.ai/api/v1/chat/completions";
            headers["HTTP-Referer"] = globalThis.location?.origin || "https://thptqg-anh-2026.vercel.app";
            headers["X-Title"] = "THPTQG 2026 English Studio";
        } else {
            const base = String(this.settings.customBaseUrl || "").trim().replace(/\/+$/, "");
            if (!base) throw new Error("Chưa nhập Base URL cho Custom AI.");
            endpoint = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
        }

        const schemaHint = responseSchema
            ? `\n\nQUAN TRỌNG VỀ ĐỊNH DẠNG ĐẦU RA: Chỉ trả về ĐÚNG 1 đối tượng JSON hợp lệ (KHÔNG kèm markdown \`\`\`json hay lời giải thích ngoài JSON), tuân thủ chặt chẽ JSON Schema sau:\n${JSON.stringify(responseSchema)}`
            : "";

        const messages = systemInstruction
            ? [
                  { role: "system", content: `${systemInstruction}${schemaHint}` },
                  { role: "user", content: prompt }
              ]
            : [{ role: "user", content: `${prompt}${schemaHint}` }];

        const send = (withFormat) => {
            const reqBody = { model, messages };
            if (withFormat && responseSchema) {
                reqBody.response_format = { type: "json_object" };
            }
            return fetchWithTimeout(endpoint, { method: "POST", headers, body: JSON.stringify(reqBody) }, timeoutMs);
        };

        let res = await send(Boolean(responseSchema));
        if (res.status === 400 && responseSchema) {
            const firstErr = await res.text().catch(() => "");
            if (/response_format|json_object|unsupported/i.test(firstErr)) {
                res = await send(false);
            } else {
                const err = new Error(`${provider} HTTP 400: ${firstErr.slice(0, 240)}`);
                err.status = 400;
                throw err;
            }
        }

        const raw = await res.text();
        if (!res.ok) {
            let msg = raw.slice(0, 240);
            try {
                const j = JSON.parse(raw);
                msg = j?.error?.message || j?.message || msg;
            } catch {
                // keep slice
            }
            const err = new Error(`${provider} HTTP ${res.status}: ${msg}`);
            err.status = res.status;
            err.retryable = res.status === 429 || res.status >= 500;
            throw err;
        }

        const data = JSON.parse(raw);
        const content = data?.choices?.[0]?.message?.content || "";
        return {
            ok: true,
            provider,
            model: data?.model || model,
            text: stripThinkTags(content),
            groundingLinks: [],
            usage: data?.usage || null
        };
    }

    async _invokeSingleModel({ provider, model, systemInstruction, prompt, responseSchema, useGoogleSearch, thinkingLevel, timeoutMs }) {
        const browserKey = this.getBrowserKey(provider);
        const useServerOnly = !browserKey && this.hasServerKeyFor(provider);
        const useStickyProxy = Boolean(this.preferServerProxy && this.serverHealth.proxyAvailable);

        if (useServerOnly || useStickyProxy) {
            return this._callViaServerProxy({
                provider,
                model,
                systemInstruction,
                prompt,
                responseSchema,
                useGoogleSearch,
                thinkingLevel,
                timeoutMs: Math.min(53000, timeoutMs)
            });
        }

        if (!browserKey && provider !== "custom") {
            const err = new Error(
                `Chưa cấu hình API Key miễn phí cho ${AI_PROVIDERS[provider]?.name || provider}. Hãy mở mục "Cài đặt AI" để nhập Key.`
            );
            err.code = "MISSING_API_KEY";
            err.status = 401;
            throw err;
        }

        const directCall = () => {
            if (provider === "gemini") {
                return this._callDirectGemini({
                    model,
                    apiKey: browserKey,
                    systemInstruction,
                    prompt,
                    responseSchema,
                    useGoogleSearch,
                    thinkingLevel,
                    timeoutMs
                });
            }
            return this._callDirectOpenAICompat({
                provider,
                model,
                apiKey: browserKey,
                systemInstruction,
                prompt,
                responseSchema,
                timeoutMs
            });
        };

        try {
            return await directCall();
        } catch (err) {
            // On mobile Chrome / ISP / Google edge 502 without CORS headers, direct browser fetch throws
            // TypeError: Failed to fetch. Fall back seamlessly to same-origin /api/ai proxy for this and subsequent calls.
            if (isTransientNetworkError(err) && this.serverHealth.proxyAvailable) {
                this.preferServerProxy = true;
                this.onLog(
                    `[Mạng/CORS] Kết nối trực tiếp tới ${provider}/${model} bị gián đoạn (${err.message}) → Tự chuyển qua Server Proxy /api/ai...`,
                    "warn"
                );
                await new Promise((r) => setTimeout(r, 900));
                return this._callViaServerProxy({
                    provider,
                    model,
                    systemInstruction,
                    prompt,
                    responseSchema,
                    useGoogleSearch,
                    thinkingLevel,
                    timeoutMs: Math.min(53000, timeoutMs)
                });
            }
            throw err;
        }
    }

    async generate({ systemInstruction = "", prompt, responseSchema = null, useGoogleSearch = false, maxRetriesPerModel = 1 }) {
        const provider = this.getActiveProvider();
        const primaryModel = this.getActiveModel(provider);
        const candidateModels = this.getOrderedCandidateModels(provider, primaryModel, this.settings.autoFallback);
        if (candidateModels.length === 0) {
            throw new Error("Chưa chọn model AI. Vui lòng mở Cài đặt AI.");
        }

        const allowSearch = Boolean(useGoogleSearch && provider === "gemini" && this.settings.useGoogleSearchFallback);
        const thinkingLevel = provider === "gemini" ? this.settings.thinkingLevel || "LOW" : null;
        const browserKey = this.getBrowserKey(provider);
        const isServerProxyPrimary = (!browserKey && this.hasServerKeyFor(provider)) || Boolean(this.preferServerProxy && this.serverHealth.proxyAvailable);

        let lastError = null;
        for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
            const model = candidateModels[mIdx];
            const hasMoreCandidates = mIdx < candidateModels.length - 1;
            // Direct browser BYOK has no Vercel 60s cap; Server Proxy stays safely under Vercel 60s maxDuration
            const timeoutMs = isServerProxyPrimary
                ? hasMoreCandidates
                    ? 46000
                    : 53000
                : hasMoreCandidates
                  ? 52000
                  : 65000;
            const retriesForThisModel = hasMoreCandidates ? 1 : Math.max(1, maxRetriesPerModel);
            let delayMs = 1800;

            for (let attempt = 0; attempt <= retriesForThisModel; attempt++) {
                try {
                    const res = await this._invokeSingleModel({
                        provider,
                        model,
                        systemInstruction,
                        prompt,
                        responseSchema,
                        useGoogleSearch: allowSearch,
                        thinkingLevel,
                        timeoutMs
                    });
                    if (!res.text) {
                        const emptyErr = new Error(`Model ${model} trả về nội dung rỗng.`);
                        emptyErr.retryable = true;
                        throw emptyErr;
                    }
                    this.lastWorkingModel = { provider, model };
                    if (model !== primaryModel) {
                        this.onLog(`[AI Tự động] Đang biên soạn bằng model dự phòng nhanh "${model}".`, "success");
                    }
                    return res;
                } catch (err) {
                    lastError = err;

                    if (err.code === "MISSING_API_KEY" || err.status === 401 || err.status === 403) {
                        throw err;
                    }

                    const isNetwork = isTransientNetworkError(err);
                    const isTimeout = Boolean(err.isTimeout || err.name === "AbortError" || err.status === 504);
                    const isOverloadedOrLimited = err.status === 429 || err.status >= 500 || isTimeout;

                    if (err.status === 404) {
                        this.markModelCooldown(provider, model, 600000);
                        if (hasMoreCandidates) {
                            this.onLog(`[AI Tự động] Model "${model}" không khả dụng (404) → chuyển sang "${candidateModels[mIdx + 1]}"...`, "warn");
                            break;
                        }
                        break;
                    }

                    if (isNetwork) {
                        if (attempt < retriesForThisModel) {
                            this.onLog(
                                `[AI Mạng] Kết nối tới "${model}" tạm gián đoạn (${err.message}) → Chờ ${(delayMs / 1000).toFixed(1)}s rồi thử lại...`,
                                "warn"
                            );
                            await new Promise((r) => setTimeout(r, delayMs));
                            delayMs = Math.min(4000, delayMs + 1200);
                            continue;
                        }
                        if (hasMoreCandidates) {
                            this.onLog(
                                `[AI Mạng] "${model}" vẫn gián đoạn mạng → Chờ 1.5s và chuyển sang "${candidateModels[mIdx + 1]}"...`,
                                "warn"
                            );
                            await new Promise((r) => setTimeout(r, 1500));
                            break;
                        }
                        break;
                    }

                    if (isOverloadedOrLimited) {
                        this.markModelCooldown(provider, model, 45000);
                        if (hasMoreCandidates) {
                            const reason = isTimeout ? `phản hồi quá ${Math.round(timeoutMs / 1000)}s` : `tạm bận (${err.status})`;
                            this.onLog(`[AI Tự động] "${model}" ${reason} → chuyển sang "${candidateModels[mIdx + 1]}"...`, "warn");
                            break;
                        }
                        if (attempt < retriesForThisModel) {
                            this.onLog(`[AI Retry] ${model} tạm bận, thử lại sau ${(delayMs / 1000).toFixed(1)}s...`, "warn");
                            await new Promise((r) => setTimeout(r, delayMs));
                            delayMs *= 2;
                            continue;
                        }
                        break;
                    }

                    if (hasMoreCandidates && (err.retryable || err.status === 400)) {
                        this.onLog(`[AI Tự động] "${model}" gặp lỗi (${err.status || err.message}) → chuyển sang "${candidateModels[mIdx + 1]}"...`, "warn");
                        break;
                    }
                    if (attempt < retriesForThisModel && err.retryable) {
                        await new Promise((r) => setTimeout(r, delayMs));
                        delayMs *= 2;
                        continue;
                    }
                    break;
                }
            }
        }

        if (lastError && isTransientNetworkError(lastError)) {
            const wrapped = new Error(
                "Kết nối mạng tạm gián đoạn hoặc máy chủ Google AI đang quá tải (Failed to fetch). Hãy giữ sáng màn hình khi tạo đề, kiểm tra mạng 4G/Wi-Fi hoặc thử lại sau vài giây."
            );
            wrapped.isNetworkError = true;
            wrapped.retryable = true;
            throw wrapped;
        }
        throw lastError || new Error("Không thể kết nối máy chủ AI biên soạn đề.");
    }

    async testConnection() {
        const started = performance.now();
        const res = await this.generate({
            systemInstruction: "Return only a single valid JSON object.",
            prompt: 'Complete the English collocation "make a ___" with "decision" and return JSON {"ok": true, "answer": "decision"}.',
            responseSchema: {
                type: "OBJECT",
                properties: {
                    ok: { type: "BOOLEAN" },
                    answer: { type: "STRING" }
                },
                required: ["ok", "answer"]
            },
            maxRetriesPerModel: 0
        });
        const elapsedSec = ((performance.now() - started) / 1000).toFixed(2);
        return {
            ok: true,
            provider: res.provider,
            model: res.model,
            elapsedSec
        };
    }
}
