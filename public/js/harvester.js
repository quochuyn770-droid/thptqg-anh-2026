import {
    RSS_FEED_SOURCES,
    WIKIPEDIA_TOPICS,
    OPENALEX_TOPICS,
    EUROPE_PMC_TOPICS,
    SOURCE_FOCUS_CONFIG
} from "./config.js";
import { csprngHex, csprngInt, csprngSample } from "./crypto-dedup.js";

/**
 * Authentic English Real-Source Harvester (7 Open Sources · Zero Paid API Keys):
 * 1. Wikipedia REST & Action API (en.wikipedia.org)
 * 2. OpenAlex Open Scholarly Works API (api.openalex.org)
 * 3. Europe PMC Biomedical & Environment API (www.ebi.ac.uk)
 * 4. The Guardian RSS
 * 5. ScienceDaily RSS
 * 6. The Conversation Atom
 * 7. NPR RSS
 *
 * Routes RSS & CORS-restricted endpoints through /api/harvest server-side proxy.
 */

async function fetchWithTimeout(url, options = {}, timeoutMs = 11000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return res;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

export function decodeXmlEntities(str) {
    return String(str || "")
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&#(\d+);/g, (_, dec) => {
            const code = Number(dec);
            return Number.isFinite(code) ? String.fromCodePoint(code) : "";
        })
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
            const code = parseInt(hex, 16);
            return Number.isFinite(code) ? String.fromCodePoint(code) : "";
        });
}

export function stripHtmlTags(raw) {
    const decoded = decodeXmlEntities(raw);
    return decoded
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<\/(p|div|li|br|h[1-6])>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Reconstructs plain English abstract text from OpenAlex abstract_inverted_index.
 */
export function reconstructOpenAlexAbstract(invertedIndex) {
    if (!invertedIndex || typeof invertedIndex !== "object") return "";
    const pairs = [];
    for (const [word, positions] of Object.entries(invertedIndex)) {
        if (!Array.isArray(positions)) continue;
        for (const pos of positions) {
            if (typeof pos === "number" && pos >= 0) {
                pairs.push([pos, word]);
            }
        }
    }
    if (pairs.length === 0) return "";
    pairs.sort((a, b) => a[0] - b[0]);
    return pairs
        .map((p) => p[1])
        .join(" ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

function extractXmlTag(block, tagNames) {
    for (const tag of tagNames) {
        const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
        const match = block.match(re);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    return "";
}

function extractAtomLink(block) {
    const altMatch = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i);
    if (altMatch && altMatch[1]) return decodeXmlEntities(altMatch[1]);
    const hrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
    if (hrefMatch && hrefMatch[1]) return decodeXmlEntities(hrefMatch[1]);
    return stripHtmlTags(extractXmlTag(block, ["link"]));
}

/**
 * Pure-JS RSS 2.0 & Atom XML feed parser (works identically in Browser & Node.js tests).
 */
export function parseFeedXml(xmlText, feedMeta = {}) {
    const raw = String(xmlText || "");
    if (!raw.trim()) return [];

    const items = [];
    const rssBlocks = raw.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    const atomBlocks = rssBlocks.length === 0 ? raw.match(/<entry\b[\s\S]*?<\/entry>/gi) || [] : [];
    const blocks = rssBlocks.length > 0 ? rssBlocks : atomBlocks;
    const isAtom = rssBlocks.length === 0 && atomBlocks.length > 0;

    for (const block of blocks) {
        const title = stripHtmlTags(extractXmlTag(block, ["title"]));
        const link = isAtom ? extractAtomLink(block) : stripHtmlTags(extractXmlTag(block, ["link", "guid"]));
        const guid = stripHtmlTags(extractXmlTag(block, ["id", "guid"])) || link || title;
        const bodyRaw = extractXmlTag(block, ["content:encoded", "content", "description", "summary"]);
        const excerpt = stripHtmlTags(bodyRaw);
        const publishedAt = stripHtmlTags(extractXmlTag(block, ["pubDate", "published", "updated"]));

        if (!title || title.length < 15) continue;
        if (!excerpt || excerpt.length < 70) continue;

        const safeUrl = /^https?:\/\//i.test(link) ? link : "";
        const slugKey = String(guid || title)
            .replace(/^https?:\/\//i, "")
            .replace(/[^a-zA-Z0-9/_-]/g, "")
            .slice(-72);

        items.push({
            sourceId: `rss:${feedMeta.providerKey || "news"}:${slugKey}`,
            sourceName: feedMeta.sourceName || "English News RSS",
            providerKey: feedMeta.providerKey || "news",
            category: "rss",
            title,
            sourceUrl: safeUrl,
            publishedAt,
            excerpt: excerpt.slice(0, 1400)
        });
    }

    return items;
}

function countWords(text) {
    return String(text || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
}

const CURATED_FALLBACK_TOPICS = [
    {
        title: "Urban Micro-Forests and Heat Island Mitigation",
        sourceName: "Curated English Theme (CSPRNG Fallback)",
        category: "academic",
        excerpt:
            "Dense urban neighborhoods often experience temperatures several degrees higher than surrounding rural landscapes due to heat-absorbing concrete and asphalt. City planners across Europe and Asia are experimenting with pocket micro-forests—compact plots planted tightly with native species using the Miyawaki method. Within three years, these dense groves develop layered canopies that lower local surface temperatures, absorb storm runoff, and create vital biodiversity corridors for pollinators and migratory birds while offering residents accessible green refuges."
    },
    {
        title: "Sleep Architecture and Adolescent Cognitive Resilience",
        sourceName: "Curated English Theme (CSPRNG Fallback)",
        category: "academic",
        excerpt:
            "Neuroscience research demonstrates that adolescent circadian rhythms naturally shift later during puberty, making early school start times biologically misaligned for many teenagers. Chronic sleep restriction impairs memory consolidation in the hippocampus, weakens emotional regulation, and reduces sustained attention during complex problem-solving tasks. Schools that have piloted delayed morning schedules report measurable improvements in attendance, academic engagement, and mental wellbeing alongside reductions in daytime fatigue."
    },
    {
        title: "Circular Fashion and Textile-to-Textile Recycling",
        sourceName: "Curated English Theme (CSPRNG Fallback)",
        category: "rss",
        excerpt:
            "Global apparel production has doubled over the past two decades, yet less than one percent of discarded garments are recycled into new clothing fibers. Most textile waste consists of blended fabrics such as cotton-polyester mixes that conventional mechanical shredding cannot cleanly separate. Emerging enzymatic and chemical recycling processes can break down blended threads at the molecular level, recovering pure cellulose and synthetic monomers that match virgin fiber strength while sharply cutting water consumption and landfill emissions."
    },
    {
        title: "Community Solar Cooperatives and Rural Energy Transition",
        sourceName: "Curated English Theme (CSPRNG Fallback)",
        category: "rss",
        excerpt:
            "While utility-scale solar farms dominate headlines, community-owned solar cooperatives are quietly accelerating the clean energy transition in smaller towns and agricultural regions. By pooling modest investments from local households, cooperatives install shared photovoltaic arrays on school roofs, warehouses, and degraded farmland. Members receive lower electricity bills and annual dividends, while retaining capital within the regional economy and strengthening grid resilience during extreme weather events."
    },
    {
        title: "Bilingual Brains and Executive Control Across the Lifespan",
        sourceName: "Curated English Theme (CSPRNG Fallback)",
        category: "academic",
        excerpt:
            "Regularly switching between two or more languages requires the human brain to constantly monitor context, suppress interference from the non-target language, and select appropriate lexical items. Longitudinal studies in cognitive psychology suggest that this lifelong mental juggling strengthens executive control networks in the prefrontal cortex. Although bilingual children may initially show slightly smaller vocabularies in each single language compared with monolingual peers, their combined conceptual vocabulary is equal or larger, and they frequently display advantages in perspective-taking and task switching."
    },
    {
        title: "AI Tutoring Systems and the Evolving Role of Classroom Teachers",
        sourceName: "Curated English Theme (CSPRNG Fallback)",
        category: "rss",
        excerpt:
            "Adaptive artificial intelligence tools can now diagnose individual learning gaps, generate tailored practice exercises, and give instant formative feedback at scale. However, educational researchers caution that software alone cannot replace the social mentoring, ethical guidance, and collaborative inquiry cultivated in human classrooms. The most effective schools treat digital tutors as assistants that handle routine drills, freeing educators to lead deeper Socratic discussions, project-based learning, and targeted emotional support."
    }
];

export class EnglishSourceHarvester {
    constructor({ vault, aiClient, onLog, onStatsChanged } = {}) {
        this.vault = vault || { sourceIds: new Set(), sessionDuplicatesBlocked: 0 };
        this.aiClient = aiClient;
        this.onLog = typeof onLog === "function" ? onLog : () => {};
        this.onStatsChanged = typeof onStatsChanged === "function" ? onStatsChanged : () => {};
    }

    /**
     * Fetches external English open sources.
     * - For RSS/Atom feeds (`preferProxy = true`), ALWAYS calls /api/harvest first when proxy is available
     *   to avoid browser CORS errors cleanly.
     * - For CORS-enabled JSON APIs (Wikipedia, OpenAlex, Europe PMC), tries direct or proxy seamlessly.
     */
    async smartFetch(url, { preferProxy = false, timeoutMs = 10000 } = {}) {
        const proxyAvailable = Boolean(this.aiClient?.serverHealth?.proxyAvailable);
        const proxyUrl = `/api/harvest?url=${encodeURIComponent(url)}`;

        if (preferProxy && proxyAvailable) {
            return await fetchWithTimeout(proxyUrl, {}, timeoutMs + 2000);
        }

        try {
            const res = await fetchWithTimeout(url, {}, timeoutMs);
            if (res.ok) return res;
            if (res.status === 401 || res.status === 403 || res.status === 404) {
                return res;
            }
            if (proxyAvailable && (res.type === "opaque" || res.status === 429 || res.status >= 500)) {
                const proxyRes = await fetchWithTimeout(proxyUrl, {}, timeoutMs + 2000);
                if (proxyRes.ok) return proxyRes;
            }
            return res;
        } catch (directErr) {
            if (proxyAvailable) {
                return await fetchWithTimeout(proxyUrl, {}, timeoutMs + 2000);
            }
            throw directErr;
        }
    }

    async harvestRssFeed(feedMeta, neededCount = 3) {
        this.onLog(`[📰 RSS Proxy] Đang kéo ${feedMeta.sourceName} qua /api/harvest...`, "info");
        try {
            const res = await this.smartFetch(feedMeta.url, { preferProxy: true, timeoutMs: 9500 });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const xml = await res.text();
            const parsed = parseFeedXml(xml, feedMeta);
            const shuffled = csprngSample(parsed, parsed.length);

            const fresh = [];
            let dupSkip = 0;
            for (const item of shuffled) {
                if (this.vault.sourceIds.has(item.sourceId)) {
                    dupSkip++;
                    this.vault.sessionDuplicatesBlocked = (this.vault.sessionDuplicatesBlocked || 0) + 1;
                    continue;
                }
                fresh.push(item);
                if (fresh.length >= neededCount) break;
            }

            this.onLog(
                `[📰 ${feedMeta.sourceName}] Nhận ${fresh.length} bài mới (chặn ${dupSkip} bài trùng Source ID).`,
                fresh.length > 0 ? "success" : "warn"
            );
            return fresh;
        } catch (err) {
            this.onLog(`[📰 ${feedMeta.sourceName}] Tạm bỏ qua (${err.message}).`, "warn");
            return [];
        }
    }

    async harvestWikipediaArticles(domainFilter = "all", neededCount = 3) {
        const pool =
            domainFilter === "all"
                ? WIKIPEDIA_TOPICS
                : WIKIPEDIA_TOPICS.filter((t) => t.domain === domainFilter);
        const chosenTopic = csprngSample(pool.length > 0 ? pool : WIKIPEDIA_TOPICS, 1)[0];
        const offset = csprngInt(0, 8);
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
            chosenTopic.query
        )}&gsrlimit=8&gsroffset=${offset}&prop=extracts|info&exintro=1&explaintext=1&inprop=url&format=json&origin=*`;

        this.onLog(`[📚 Wikipedia API] Tìm bài tiếng Anh chủ đề "${chosenTopic.query}" (offset CSPRNG #${offset})...`, "info");

        const collected = [];
        try {
            const res = await this.smartFetch(searchUrl, { preferProxy: false, timeoutMs: 8500 });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const pages = Object.values(data?.query?.pages || {});
            const shuffled = csprngSample(pages, pages.length);

            let dupSkip = 0;
            for (const p of shuffled) {
                if (!p || !p.pageid || !p.extract) continue;
                const excerpt = String(p.extract).replace(/\s+/g, " ").trim();
                if (countWords(excerpt) < 60) continue;

                const sourceId = `wiki:${p.pageid}`;
                if (this.vault.sourceIds.has(sourceId)) {
                    dupSkip++;
                    this.vault.sessionDuplicatesBlocked = (this.vault.sessionDuplicatesBlocked || 0) + 1;
                    continue;
                }
                collected.push({
                    sourceId,
                    sourceName: "Wikipedia (English)",
                    providerKey: "wikipedia",
                    category: "academic",
                    title: String(p.title || "Wikipedia Article"),
                    sourceUrl:
                        p.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(String(p.title || "").replace(/\s+/g, "_"))}`,
                    publishedAt: "",
                    excerpt: excerpt.slice(0, 1600)
                });
                if (collected.length >= neededCount) break;
            }

            // Secondary random REST summary call if search returned fewer than needed
            if (collected.length === 0) {
                const randRes = await this.smartFetch("https://en.wikipedia.org/api/rest_v1/page/random/summary", {
                    preferProxy: false,
                    timeoutMs: 7000
                });
                if (randRes.ok) {
                    const summary = await randRes.json();
                    const extract = String(summary.extract || "").trim();
                    const sid = `wiki:${summary.pageid || csprngHex(4)}`;
                    if (countWords(extract) >= 40 && !this.vault.sourceIds.has(sid)) {
                        collected.push({
                            sourceId: sid,
                            sourceName: "Wikipedia REST API",
                            providerKey: "wikipedia",
                            category: "academic",
                            title: summary.title || "Wikipedia Feature",
                            sourceUrl: summary?.content_urls?.desktop?.page || "https://en.wikipedia.org",
                            publishedAt: "",
                            excerpt: extract.slice(0, 1500)
                        });
                    }
                }
            }

            this.onLog(
                `[📚 Wikipedia] Nhận ${collected.length} bài mới (chặn ${dupSkip} trùng).`,
                collected.length > 0 ? "success" : "warn"
            );
        } catch (err) {
            this.onLog(`[📚 Wikipedia] Tạm bỏ qua (${err.message}).`, "warn");
        }
        return collected;
    }

    async harvestOpenAlexArticles(domainFilter = "all", neededCount = 3) {
        const pool =
            domainFilter === "all"
                ? OPENALEX_TOPICS
                : OPENALEX_TOPICS.filter((t) => t.domain === domainFilter);
        const chosenTopic = csprngSample(pool.length > 0 ? pool : OPENALEX_TOPICS, 1)[0];
        const page = csprngInt(1, 6);
        const url = `https://api.openalex.org/works?search=${encodeURIComponent(
            chosenTopic.query
        )}&filter=has_abstract:true,language:en,is_oa:true&per-page=10&page=${page}&select=id,title,doi,publication_year,primary_location,abstract_inverted_index`;

        this.onLog(`[🔬 OpenAlex API] Kéo công trình khoa học "${chosenTopic.query}" (trang CSPRNG #${page})...`, "info");

        const collected = [];
        try {
            const res = await this.smartFetch(url, { preferProxy: false, timeoutMs: 9500 });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const works = csprngSample(Array.isArray(data?.results) ? data.results : [], 10);

            let dupSkip = 0;
            for (const w of works) {
                const rawId = String(w.id || "").split("/").pop() || "";
                if (!rawId || !w.title || !w.abstract_inverted_index) continue;
                const sourceId = `openalex:${rawId}`;
                if (this.vault.sourceIds.has(sourceId)) {
                    dupSkip++;
                    this.vault.sessionDuplicatesBlocked = (this.vault.sessionDuplicatesBlocked || 0) + 1;
                    continue;
                }
                const abstract = reconstructOpenAlexAbstract(w.abstract_inverted_index);
                if (countWords(abstract) < 75) continue;

                const landing = w?.primary_location?.landing_page_url || w.doi || w.id || "";
                const journal = w?.primary_location?.source?.display_name || "OpenAlex Scholarly";
                collected.push({
                    sourceId,
                    sourceName: `OpenAlex · ${journal}`.slice(0, 48),
                    providerKey: "openalex",
                    category: "academic",
                    title: stripHtmlTags(w.title),
                    sourceUrl: /^https?:\/\//i.test(landing) ? landing : `https://openalex.org/${rawId}`,
                    publishedAt: w.publication_year ? String(w.publication_year) : "",
                    excerpt: abstract.slice(0, 1600)
                });
                if (collected.length >= neededCount) break;
            }

            this.onLog(
                `[🔬 OpenAlex] Nhận ${collected.length} bài khoa học mới (chặn ${dupSkip} trùng).`,
                collected.length > 0 ? "success" : "warn"
            );
        } catch (err) {
            this.onLog(`[🔬 OpenAlex] Tạm bỏ qua (${err.message}).`, "warn");
        }
        return collected;
    }

    async harvestEuropePmcArticles(domainFilter = "all", neededCount = 2) {
        const pool =
            domainFilter === "all"
                ? EUROPE_PMC_TOPICS
                : EUROPE_PMC_TOPICS.filter((t) => t.domain === domainFilter);
        const chosenTopic = csprngSample(pool.length > 0 ? pool : EUROPE_PMC_TOPICS, 1)[0];
        const query = `(${chosenTopic.query}) AND HAS_ABSTRACT:Y AND LANG:ENG`;
        const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
            query
        )}&resultType=core&format=json&pageSize=12&sort=CITED%20desc`;

        this.onLog(`[🧬 Europe PMC API] Kéo nghiên cứu sức khỏe/môi trường "${chosenTopic.query}"...`, "info");

        const collected = [];
        try {
            const res = await this.smartFetch(url, { preferProxy: false, timeoutMs: 9500 });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const list = csprngSample(Array.isArray(data?.resultList?.result) ? data.resultList.result : [], 12);

            let dupSkip = 0;
            for (const art of list) {
                const artId = art.pmcid || art.pmid || art.id;
                if (!artId || !art.title || !art.abstractText) continue;
                const sourceId = `epmc:${artId}`;
                if (this.vault.sourceIds.has(sourceId)) {
                    dupSkip++;
                    this.vault.sessionDuplicatesBlocked = (this.vault.sessionDuplicatesBlocked || 0) + 1;
                    continue;
                }
                const abstract = stripHtmlTags(art.abstractText);
                if (countWords(abstract) < 75) continue;

                const sourceUrl = art.pmcid
                    ? `https://europepmc.org/article/PMC/${art.pmcid}`
                    : `https://europepmc.org/article/MED/${art.pmid || artId}`;

                collected.push({
                    sourceId,
                    sourceName: `Europe PMC · ${art.journalTitle || "Life Sciences"}`.slice(0, 48),
                    providerKey: "europepmc",
                    category: "academic",
                    title: stripHtmlTags(art.title),
                    sourceUrl,
                    publishedAt: art.pubYear ? String(art.pubYear) : "",
                    excerpt: abstract.slice(0, 1600)
                });
                if (collected.length >= neededCount) break;
            }

            this.onLog(
                `[🧬 Europe PMC] Nhận ${collected.length} bài mới (chặn ${dupSkip} trùng).`,
                collected.length > 0 ? "success" : "warn"
            );
        } catch (err) {
            this.onLog(`[🧬 Europe PMC] Tạm bỏ qua (${err.message}).`, "warn");
        }
        return collected;
    }

    buildCuratedFallbackArticle(slotTag, index = 0) {
        const base = CURATED_FALLBACK_TOPICS[(index + csprngInt(0, CURATED_FALLBACK_TOPICS.length - 1)) % CURATED_FALLBACK_TOPICS.length];
        const uid = csprngHex(4);
        return {
            sourceId: `csprng:fallback_${slotTag}_${uid}`,
            sourceName: base.sourceName,
            providerKey: "csprng",
            category: base.category,
            title: base.title,
            sourceUrl: "",
            publishedAt: "2026",
            excerpt: `${base.excerpt} [Seed entropy: ${uid}]`
        };
    }

    /**
     * Unified 1-pass authentic English harvester across Wikipedia, OpenAlex, Europe PMC,
     * and 4 public RSS/Atom outlets (The Guardian, ScienceDaily, The Conversation, NPR).
     */
    async harvestAllExamSources(focusMode = "all_mixed") {
        const cfg = SOURCE_FOCUS_CONFIG[focusMode] || SOURCE_FOCUS_CONFIG.all_mixed;
        const domainFilter = cfg.domainFilter || "all";

        this.onLog(
            `[Gom ngữ liệu thực tế] Chế độ ${cfg.label} → Đang kéo song song Wikipedia, OpenAlex, Europe PMC & 4 nguồn RSS...`,
            "info"
        );

        const candidateFeeds =
            domainFilter === "all"
                ? RSS_FEED_SOURCES
                : RSS_FEED_SOURCES.filter((f) => f.domain === domainFilter);

        // Pick 3 distinct RSS publishers via 128-bit CSPRNG so articles come from diverse news outlets
        const byProvider = new Map();
        for (const f of candidateFeeds.length > 0 ? candidateFeeds : RSS_FEED_SOURCES) {
            if (!byProvider.has(f.providerKey)) byProvider.set(f.providerKey, []);
            byProvider.get(f.providerKey).push(f);
        }
        const pickedProviders = csprngSample(Array.from(byProvider.keys()), Math.min(3, byProvider.size));
        const pickedFeeds = pickedProviders.map((pk) => {
            const list = byProvider.get(pk);
            return csprngSample(list, 1)[0];
        });

        const [wikiRes, openAlexRes, epmcRes, ...rssLists] = await Promise.all([
            this.harvestWikipediaArticles(domainFilter, 3),
            this.harvestOpenAlexArticles(domainFilter, 3),
            this.harvestEuropePmcArticles(domainFilter, 2),
            ...pickedFeeds.map((feed) => this.harvestRssFeed(feed, 3))
        ]);

        const seenInBatch = new Set();
        const dedupeList = (arr) =>
            arr.filter((item) => {
                if (!item || !item.sourceId || seenInBatch.has(item.sourceId) || this.vault.sourceIds.has(item.sourceId)) {
                    return false;
                }
                seenInBatch.add(item.sourceId);
                return true;
            });

        const rssPool = csprngSample(dedupeList(rssLists.flat()), 16);
        const academicPool = csprngSample(dedupeList([...openAlexRes, ...epmcRes, ...wikiRes]), 16);

        // Mix according to user focus preference while maximizing publisher diversity
        const combinedPool = [];
        const rssCopy = [...rssPool];
        const acadCopy = [...academicPool];

        while (rssCopy.length > 0 || acadCopy.length > 0) {
            const pickRssFirst = cfg.rssWeight >= 0.5;
            if (pickRssFirst) {
                if (rssCopy.length > 0) combinedPool.push(rssCopy.shift());
                if (acadCopy.length > 0) combinedPool.push(acadCopy.shift());
            } else {
                if (acadCopy.length > 0) combinedPool.push(acadCopy.shift());
                if (rssCopy.length > 0) combinedPool.push(rssCopy.shift());
            }
        }

        const takeUnique = (slotTag, preferCategory = null, fallbackIdx = 0) => {
            if (preferCategory) {
                const idx = combinedPool.findIndex((item) => item.category === preferCategory);
                if (idx !== -1) return combinedPool.splice(idx, 1)[0];
            }
            if (combinedPool.length > 0) return combinedPool.shift();
            return this.buildCuratedFallbackArticle(slotTag, fallbackIdx);
        };

        // Pick 3 primary real-world articles for the 3 reading/cloze passages + 2 themes for Ad/Leaflet/Arrangement
        const longReadingSource = takeUnique("long_read", cfg.rssWeight >= 0.5 ? "rss" : "academic", 0);
        const shortReadingSource = takeUnique("short_read", cfg.rssWeight >= 0.5 ? "academic" : "rss", 1);
        const clozePassageSource = takeUnique("cloze_18_22", null, 2);
        const adThemeSource = takeUnique("ad_1_6", "rss", 3);
        const leafletThemeSource = takeUnique("leaflet_7_12", "academic", 4);
        const spares = combinedPool.slice(0, 6);

        const realCount = [longReadingSource, shortReadingSource, clozePassageSource, adThemeSource, leafletThemeSource].filter(
            (s) => s.providerKey !== "csprng"
        ).length;

        this.onLog(
            `[Hoàn tất kéo nguồn] Lấy được ${rssPool.length} bài RSS + ${academicPool.length} bài Khoa học/Wiki (${realCount}/5 vị trí dùng bài viết thật · +${spares.length} bài dự phòng).`,
            realCount > 0 ? "success" : "warn"
        );
        this.onStatsChanged();

        return {
            adThemeSource,
            leafletThemeSource,
            clozePassageSource,
            shortReadingSource,
            longReadingSource,
            spares
        };
    }
}
