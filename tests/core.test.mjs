import test from "node:test";
import assert from "node:assert/strict";

import {
    getServerHealth,
    resolveGeminiThinkingLevel,
    buildGeminiPayload,
    extractGeminiResponse,
    stripInlineThinkTags,
    validateCustomBaseUrl,
    validateHarvestUrl
} from "../lib/proxy-core.mjs";
import { createAppServer } from "../scripts/local-server.mjs";
import {
    csprngHex,
    csprngInt,
    normalizeTextForHash,
    sha256Hex,
    extractShingles,
    jaccardSimilarity,
    containsLegacyEnglishFormat,
    isNewsRssSourceId,
    isAcademicSourceId,
    sanitizeVaultKey,
    evaluateContentIntegrity
} from "../public/js/crypto-dedup.js";
import {
    parseRobustJson,
    getFallbackCandidateModels,
    isTransientNetworkError,
    UnifiedAiClient
} from "../public/js/ai-client.js";
import {
    reconstructOpenAlexAbstract,
    parseFeedXml,
    EnglishSourceHarvester
} from "../public/js/harvester.js";
import {
    runFullEnglishExamPipeline,
    gradeInteractiveExam,
    computeAdaptiveOptionLayout,
    cleanClozeQuestionPrompt,
    ensureReadingPassageHighlights,
    shuffleArrangementQuestion
} from "../public/js/exam-pipeline.js";
import { parseFirebaseConfigInput } from "../public/js/storage.js";
import {
    formatPassageForPlainText,
    buildSlice1To17Text,
    buildSlice18To30Text,
    buildSlice31To40Text,
    buildAnswersAndExplanationsText,
    buildFullTxtExamDocument
} from "../public/js/export-utils.js";

test("GDPT 2018 (QĐ 764) legacy format blocker rejects pronunciation, stress, and error-ID items", () => {
    assert.equal(
        containsLegacyEnglishFormat(
            "Mark the letter A, B, C, or D whose underlined part differs from the other three in pronunciation."
        ),
        true
    );
    assert.equal(
        containsLegacyEnglishFormat(
            "Mark the letter A, B, C, or D that differs from the other three in the position of primary stress."
        ),
        true
    );
    assert.equal(
        containsLegacyEnglishFormat("Choose the underlined part that needs correction in each of the following."),
        true
    );
    assert.equal(
        containsLegacyEnglishFormat("Which of the following best paraphrases the underlined sentence in paragraph 2?"),
        false
    );
});

test("128-bit CSPRNG, SHA-256 and 3-gram Jaccard anti-duplication block duplicate passages", async () => {
    const hex = csprngHex(16);
    assert.equal(hex.length, 32);
    const r = csprngInt(10, 20);
    assert.ok(r >= 10 && r <= 20);

    const p1 = "Urban micro-forests planted with native trees cool neighborhoods and expand urban biodiversity across cities.";
    const p2Same = "Urban micro-forests planted with native trees cool neighborhoods and expand urban biodiversity across cities.";
    const p3Different = "Renewable tidal turbines harness ocean currents to provide predictable clean electricity for coastal towns.";

    const h1 = await sha256Hex(p1);
    const h2 = await sha256Hex(p2Same);
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);

    const s1 = extractShingles(p1);
    const s3 = extractShingles(p3Different);
    assert.equal(jaccardSimilarity(s1, s1), 1);
    assert.ok(jaccardSimilarity(s1, s3) < 0.2);

    const vault = {
        hashes: new Set([h1]),
        shingleEntries: [{ hash: h1, shingles: s1, preview: normalizeTextForHash(p1) }],
        sessionDuplicatesBlocked: 0,
        sessionLegacyRejected: 0
    };

    const dupRes = await evaluateContentIntegrity(p2Same, vault, new Set(), []);
    assert.equal(dupRes.ok, false);
    assert.equal(vault.sessionDuplicatesBlocked, 1);

    const freshRes = await evaluateContentIntegrity(p3Different, vault, new Set(), []);
    assert.equal(freshRes.ok, true);
});

test("Harvest URL validator allows 7 open English sources and blocks SSRF/non-allowlisted hosts", () => {
    // Allowed 7 real English open sources
    assert.equal(validateHarvestUrl("https://en.wikipedia.org/api/rest_v1/page/random/summary").ok, true);
    assert.equal(validateHarvestUrl("https://en.wikipedia.org/w/api.php?action=query&format=json").ok, true);
    assert.equal(validateHarvestUrl("https://api.openalex.org/works?search=climate").ok, true);
    assert.equal(validateHarvestUrl("https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=sleep").ok, true);
    assert.equal(validateHarvestUrl("https://www.theguardian.com/science/rss").ok, true);
    assert.equal(validateHarvestUrl("https://www.sciencedaily.com/rss/earth_climate.xml").ok, true);
    assert.equal(validateHarvestUrl("https://theconversation.com/global/articles.atom").ok, true);
    assert.equal(validateHarvestUrl("https://feeds.npr.org/1007/rss.xml").ok, true);

    // Blocked targets
    assert.equal(validateHarvestUrl("http://169.254.169.254/latest/meta-data/").ok, false);
    assert.equal(validateHarvestUrl("https://127.0.0.1:3000/api/health").ok, false);
    assert.equal(validateHarvestUrl("https://evil.example.com/rss").ok, false);
    assert.equal(validateHarvestUrl("https://theconversation.com/global/login").ok, false);
    assert.equal(validateHarvestUrl("https://feeds.npr.org/admin/secret").ok, false);

    // Custom AI Base URL SSRF guards
    assert.equal(validateCustomBaseUrl("https://api.cerebras.ai/v1").ok, true);
    assert.equal(validateCustomBaseUrl("http://169.254.169.254/v1").ok, false);
    assert.equal(validateCustomBaseUrl("https://10.0.0.1/v1").ok, false);
});

test("OpenAlex abstract reconstructor & pure-JS RSS/Atom XML parser extract clean English articles", () => {
    const abstract = reconstructOpenAlexAbstract({
        Climate: [0],
        adaptation: [1],
        requires: [2],
        resilient: [3],
        "cities.": [4]
    });
    assert.equal(abstract, "Climate adaptation requires resilient cities.");

    const rssSample = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0"><channel>
      <item>
        <title><![CDATA[How Urban Trees Lower Summer Heatwaves]]></title>
        <link>https://www.theguardian.com/environment/2026/urban-trees</link>
        <guid>guardian-urban-trees-01</guid>
        <description><![CDATA[<p>Researchers tracked twenty metropolitan districts and found dense tree canopies reduced afternoon temperatures significantly during extreme summer heatwaves.</p>]]></description>
      </item>
    </channel></rss>`;

    const rssItems = parseFeedXml(rssSample, { providerKey: "guardian", sourceName: "The Guardian · Environment" });
    assert.equal(rssItems.length, 1);
    assert.equal(rssItems[0].sourceName, "The Guardian · Environment");
    assert.equal(rssItems[0].sourceUrl, "https://www.theguardian.com/environment/2026/urban-trees");
    assert.ok(rssItems[0].sourceId.startsWith("rss:guardian:"));
    assert.ok(rssItems[0].excerpt.includes("dense tree canopies"));

    const atomSample = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>tag:theconversation.com,2026:article-555</id>
        <title>Why Teenagers Benefit From Later School Start Times</title>
        <link rel="alternate" href="https://theconversation.com/teenagers-later-school-start-555"/>
        <summary>Longitudinal neuroscience evidence shows biological shifts in melatonin release delay adolescent sleep cycles by nearly two hours.</summary>
      </entry>
    </feed>`;

    const atomItems = parseFeedXml(atomSample, { providerKey: "conversation", sourceName: "The Conversation · Global" });
    assert.equal(atomItems.length, 1);
    assert.equal(atomItems[0].sourceUrl, "https://theconversation.com/teenagers-later-school-start-555");
    assert.equal(isNewsRssSourceId(atomItems[0].sourceId), true);
    assert.equal(isAcademicSourceId("openalex:W12345"), true);
    assert.equal(sanitizeVaultKey(" lop 12a5!! "), "LOP-12A5");
});

test("JSON parser, Gemini payload rules, and model fallback cooldown work reliably", async () => {
    const parsed = parseRobustJson(`<think>Checking...</think>\n\`\`\`json\n{"ok": true, "items": [1, 2,],}\n\`\`\``);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.items, [1, 2]);

    assert.equal(resolveGeminiThinkingLevel("gemini-4-hydrogen", "MINIMAL"), "LOW");
    assert.equal(resolveGeminiThinkingLevel("gemini-3.5-flash-lite", "LOW"), "LOW");
    const payload = buildGeminiPayload({
        model: "gemini-3.5-flash-lite",
        systemInstruction: "English Expert",
        prompt: "Compile",
        responseSchema: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } } },
        useGoogleSearch: false,
        thinkingLevel: "LOW"
    });
    assert.equal(payload.generationConfig.responseMimeType, "application/json");
    assert.equal(payload.generationConfig.thinkingConfig.thinkingLevel, "LOW");

    const extracted = extractGeminiResponse({
        candidates: [{ content: { parts: [{ thought: true, text: "plan" }, { text: '{"ok":true}' }] } }]
    });
    assert.equal(extracted.text, '{"ok":true}');
    assert.equal(stripInlineThinkTags("<think>x</think>done"), "done");

    const chain = getFallbackCandidateModels("gemini", "gemini-4-hydrogen", true);
    assert.equal(chain[0], "gemini-4-hydrogen");
    assert.ok(chain.includes("gemini-3.5-flash-lite"));

    const client = new UnifiedAiClient();
    client.settings.provider = "gemini";
    client.settings.models.gemini = "gemini-4-hydrogen";
    client.settings.keys.gemini = "dummy-test-key";
    client.settings.autoFallback = true;

    const called = [];
    client._invokeSingleModel = async ({ model }) => {
        called.push(model);
        if (model === "gemini-4-hydrogen") {
            const err = new Error("HTTP 503");
            err.status = 503;
            err.retryable = true;
            throw err;
        }
        return { ok: true, provider: "gemini", model, text: '{"ok":true}', groundingLinks: [] };
    };

    const res = await client.generate({ prompt: "Pass 1" });
    assert.equal(res.model, "gemini-3.5-flash-lite");
    assert.deepEqual(called, ["gemini-4-hydrogen", "gemini-3.5-flash-lite"]);

    // Firebase config parser sanity check
    const fb = parseFirebaseConfigInput(`const firebaseConfig = { apiKey: "abc", projectId: "demo-eng" };`);
    assert.equal(fb.ok, true);
    assert.equal(fb.config.projectId, "demo-eng");
});

test("UnifiedAiClient detects Failed to fetch network errors and seamlessly falls back to same-origin /api/ai proxy", async () => {
    assert.equal(isTransientNetworkError(new TypeError("Failed to fetch")), true);
    assert.equal(isTransientNetworkError(new Error("Load failed")), true);
    assert.equal(isTransientNetworkError(new Error("Invalid API key")), false);

    const client = new UnifiedAiClient();
    client.settings.provider = "gemini";
    client.settings.models.gemini = "gemini-3.5-flash-lite";
    client.settings.keys.gemini = "dummy-browser-key";
    client.settings.autoFallback = true;
    client.serverHealth.proxyAvailable = true;

    let directCalls = 0;
    let proxyCalls = 0;
    client._callDirectGemini = async () => {
        directCalls++;
        throw new TypeError("Failed to fetch");
    };
    client._callViaServerProxy = async ({ model }) => {
        proxyCalls++;
        return { ok: true, provider: "gemini", model, text: '{"recovered":true}', groundingLinks: [] };
    };

    const res = await client.generate({ prompt: "Pass 2" });
    assert.equal(directCalls, 1);
    assert.equal(proxyCalls, 1);
    assert.equal(res.model, "gemini-3.5-flash-lite");
    assert.equal(res.text, '{"recovered":true}');
});

test("EnglishSourceHarvester routes RSS through /api/harvest and skips already-used Source IDs", async () => {
    const vault = {
        sourceIds: new Set(["wiki:999"]),
        sessionDuplicatesBlocked: 0
    };
    const harvester = new EnglishSourceHarvester({
        vault,
        aiClient: { serverHealth: { proxyAvailable: true } }
    });

    const requested = [];
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        const u = String(url);
        requested.push(u);

        if (u.startsWith("/api/harvest?url=")) {
            const xml = `<rss><channel><item><title>Clean Energy Grids Expand Rapidly in Coastal Regions</title><link>https://www.theguardian.com/environment/clean-grids</link><guid>clean-grids-1</guid><description>New battery storage facilities allow coastal communities to store solar and offshore wind electricity reliably through winter evenings.</description></item></channel></rss>`;
            return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml" } });
        }
        if (u.includes("en.wikipedia.org")) {
            return new Response(
                JSON.stringify({
                    query: {
                        pages: {
                            999: {
                                pageid: 999,
                                title: "Duplicate Wiki Page",
                                fullurl: "https://en.wikipedia.org/wiki/Dup",
                                extract: "Already used article ".repeat(25)
                            },
                            1001: {
                                pageid: 1001,
                                title: "Coral Reef Restoration",
                                fullurl: "https://en.wikipedia.org/wiki/Coral_reef_restoration",
                                extract:
                                    "Coral reef restoration involves active scientific methods to accelerate the recovery of degraded marine reefs damaged by warming waters and acidification across tropical ocean ecosystems worldwide. ".repeat(
                                        4
                                    )
                            }
                        }
                    }
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }
        if (u.includes("api.openalex.org")) {
            return new Response(
                JSON.stringify({
                    results: [
                        {
                            id: "https://openalex.org/W777888",
                            title: "Green Corridors and Urban Cooling",
                            doi: "https://doi.org/10.1000/green-corridors",
                            publication_year: 2025,
                            primary_location: { source: { display_name: "Urban Ecology" } },
                            abstract_inverted_index: Object.fromEntries(
                                "Urban ecological corridors significantly cool densely populated metropolitan areas while supporting pollinators, reducing stormwater flooding, lowering municipal energy demand, and enhancing mental health outcomes for local communities across diverse climatic regions around the globe over long observation periods."
                                    .split(" ")
                                    .map((w, idx) => [w, [idx]])
                            )
                        }
                    ]
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }
        if (u.includes("www.ebi.ac.uk/europepmc")) {
            return new Response(
                JSON.stringify({
                    resultList: {
                        result: [
                            {
                                pmcid: "PMC1234567",
                                title: "Adolescent Sleep Hygiene and Academic Focus",
                                journalTitle: "Sleep Health",
                                pubYear: "2025",
                                abstractText:
                                    "Consistent sleep schedules among secondary school students are strongly correlated with improved memory consolidation, stronger attention regulation, lower daytime anxiety, and healthier emotional resilience throughout exam semesters in multi-school longitudinal cohort trials conducted internationally. ".repeat(
                                        3
                                    )
                            }
                        ]
                    }
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }
        return new Response("Not Found", { status: 404 });
    };

    try {
        const res = await harvester.harvestAllExamSources("all_mixed");
        assert.ok(requested.some((u) => u.startsWith("/api/harvest?url=")), "RSS feeds must route via /api/harvest");
        assert.equal(vault.sessionDuplicatesBlocked >= 1, true, "Duplicate wiki:999 must be skipped and counted");
        assert.ok(res.longReadingSource.sourceId !== "wiki:999");
        assert.ok(res.shortReadingSource.sourceId !== "wiki:999");
        assert.ok(res.clozePassageSource.sourceId !== "wiki:999");
    } finally {
        globalThis.fetch = prevFetch;
    }
});

test("Sequential 4-pass English exam pipeline generates all 40 questions (6 parts), grades accurately, and builds split copies", async () => {
    const makeSrc = (id, name, cat) => ({
        sourceId: id,
        sourceName: name,
        providerKey: cat,
        category: cat,
        title: `Authentic Article ${id}`,
        sourceUrl: `https://example.org/${id}`,
        excerpt: `Authentic real-world English article excerpt for ${id} discussing innovation, environment, education, and public wellbeing.`
    });

    const harvester = {
        harvestAllExamSources: async () => ({
            adThemeSource: makeSrc("rss:guardian:ad1", "The Guardian · Education", "rss"),
            leafletThemeSource: makeSrc("wiki:101", "Wikipedia (English)", "academic"),
            clozePassageSource: makeSrc("openalex:W202", "OpenAlex · Urban Ecology", "academic"),
            shortReadingSource: makeSrc("rss:npr:303", "NPR · Science", "rss"),
            longReadingSource: makeSrc("epmc:PMC404", "Europe PMC · Sleep Health", "academic"),
            spares: [makeSrc("rss:sciencedaily:505", "ScienceDaily · Top Science", "rss")]
        })
    };

    let activeConcurrent = 0;
    let maxConcurrent = 0;
    let pass3BrokenOnce = false;
    const passOrder = [];

    const makeMcqs = (start, count, tag) =>
        Array.from({ length: count }, (_, i) => ({
            number: start + i,
            skillTag: tag,
            prompt: `Question ${start + i}: Choose the best answer for item ${start + i}.`,
            optionA: `Option A ${start + i}`,
            optionB: `Option B ${start + i}`,
            optionC: `Option C ${start + i}`,
            optionD: `Option D ${start + i}`,
            correctOption: ["A", "B", "C", "D"][i % 4],
            explanationVi: `Giải thích chi tiết bằng tiếng Việt cho câu ${start + i}.`
        }));

    const aiClient = {
        getConnectionModeLabel: () => ({ ready: true, mode: "byok", label: "Gemini Free · gemini-3.5-flash-lite", detail: "Mock" }),
        generate: async ({ prompt }) => {
            activeConcurrent += 1;
            maxConcurrent = Math.max(maxConcurrent, activeConcurrent);
            await new Promise((r) => setTimeout(r, 30));
            activeConcurrent -= 1;

            if (prompt.includes("LƯỢT 1/4")) {
                passOrder.push(1);
                return {
                    provider: "gemini",
                    model: "gemini-3.5-flash-lite",
                    text: JSON.stringify({
                        part1: {
                            instruction: "Read the advertisement and choose A, B, C, or D (1–6).",
                            title: "JOIN GREEN CAMPUS VOLUNTEERS",
                            subtitle: "Make a lasting impact this semester",
                            passage: "Students looking for (1) ______ experience in (2) ______ projects (3) ______ local parks can sign up (4) ______ Friday to (5) ______ awareness and learn (6) ______ sustainably.",
                            questions: makeMcqs(1, 6, "Advertisement Cloze")
                        },
                        part2: {
                            instruction: "Read the leaflet and choose A, B, C, or D (7–12).",
                            title: "SMART STUDY HABITS LEAFLET",
                            subtitle: "Practical guide for high school students",
                            passage: "Many learners struggle to (7) ______ distractions. Spend (8) ______ time reviewing notes (9) ______ cramming late at night to boost (10) ______, build (11) ______, and strengthen (12) ______.",
                            questions: makeMcqs(7, 6, "Leaflet Cloze")
                        },
                        vocabulary: [
                            { term: "raise awareness", pos: "collocation", cefr: "B2", meaningVi: "nâng cao nhận thức", example: "Campaigns help raise awareness." }
                        ]
                    })
                };
            }

            if (prompt.includes("LƯỢT 2/4")) {
                passOrder.push(2);
                return {
                    provider: "gemini",
                    model: "gemini-3.5-flash-lite",
                    text: JSON.stringify({
                        part3: {
                            instruction: "Mark A, B, C, or D for the best arrangement (13–17).",
                            questions: Array.from({ length: 5 }, (_, idx) => ({
                                number: 13 + idx,
                                subtype: ["dialogue_short", "dialogue_long", "letter", "paragraph_1", "paragraph_2"][idx],
                                skillTag: "Arrangement",
                                salutation: idx === 2 ? "Dear Linh," : "",
                                signOff: idx === 2 ? "Best wishes,\nNam" : "",
                                items: Array.from({ length: idx === 0 ? 3 : 5 }, (_, k) => ({
                                    label: String.fromCharCode(97 + k),
                                    text: `Cohesive sentence ${k + 1} for arrangement question ${13 + idx}.`
                                })),
                                optionA: idx === 0 ? "a-b-c" : "a-b-c-d-e",
                                optionB: idx === 0 ? "b-a-c" : "b-a-c-d-e",
                                optionC: idx === 0 ? "c-a-b" : "c-b-a-e-d",
                                optionD: idx === 0 ? "a-c-b" : "d-a-b-c-e",
                                correctOption: "A",
                                explanationVi: `Giải thích mạch liên kết câu ${13 + idx}.`
                            }))
                        },
                        part4: {
                            instruction: "Read the passage and choose the best clause/sentence (18–22).",
                            title: "Green Corridors in Modern Cities",
                            passage: "Metropolitan planners (18) ______. Connected parks, (19) ______, cool city streets. (20) ______, residents report lower stress. Moreover, (21) ______ while (22) ______.",
                            questions: makeMcqs(18, 5, "Sentence / Clause Cloze")
                        },
                        vocabulary: [
                            { term: "urban corridor", pos: "n. phr.", cefr: "B2", meaningVi: "hành lang xanh đô thị", example: "Urban corridors support biodiversity." }
                        ]
                    })
                };
            }

            if (prompt.includes("LƯỢT 3/4")) {
                if (!pass3BrokenOnce) {
                    pass3BrokenOnce = true;
                    return { provider: "gemini", model: "gemini-3.5-flash-lite", text: "{malformed" };
                }
                passOrder.push(3);
                return {
                    provider: "gemini",
                    model: "gemini-3.5-flash-lite",
                    text: JSON.stringify({
                        part5: {
                            instruction: "Read the short passage and answer questions 23–30.",
                            title: "Tidal Turbines and Coastal Reliability",
                            paragraphs: [
                                "Coastal engineers are installing underwater turbines that harness predictable ocean tides.",
                                "Unlike intermittent winds, tidal currents remain **dependable** across seasonal cycles, and **they** supply steady electricity.",
                                "__Early pilot projects faced high maintenance expenses because saltwater corrodes metal blades rapidly.__",
                                "Modern composite coatings now **mitigate** corrosion, allowing coastal grids to expand clean power."
                            ],
                            questions: makeMcqs(23, 8, "Short Reading")
                        },
                        vocabulary: [
                            { term: "mitigate", pos: "v.", cefr: "C1", meaningVi: "giảm nhẹ, làm dịu bớt", example: "Coatings mitigate corrosion." }
                        ]
                    })
                };
            }

            passOrder.push(4);
            return {
                provider: "gemini",
                model: "gemini-3.5-flash-lite",
                text: JSON.stringify({
                    part6: {
                        instruction: "Read the long passage and answer questions 31–40.",
                        title: "Adolescent Sleep Cycles and Learning Architecture",
                        paragraphs: [
                            "[I] During adolescence, biological clocks shift roughly two hours later. [II] Early bell schedules conflict with this natural rhythm. [III] Consequently, many students experience chronic fatigue. [IV] Schools piloting later start times report improved alertness.",
                            "Neuroscientists emphasize that deep sleep plays a **pivotal** role in memory consolidation, and **it** strengthens neural pathways formed during study.",
                            "__Delaying morning classes does not reduce instructional hours when districts redesign afternoon bus routes thoughtfully.__",
                            "Critics once feared extracurricular participation might **dwindle**, yet multi-year surveys show higher club engagement and healthier student wellbeing."
                        ],
                        questions: makeMcqs(31, 10, "Long Reading")
                    },
                    vocabulary: [
                        { term: "pivotal", pos: "adj.", cefr: "C1", meaningVi: "then chốt, mang tính quyết định", example: "Sleep plays a pivotal role." }
                    ]
                })
            };
        }
    };

    let savedExam = null;
    const storage = {
        activeVaultKey: "TEST-ENG-VAULT",
        vault: {
            hashes: new Set(),
            shingleEntries: [],
            sessionDuplicatesBlocked: 0,
            sessionLegacyRejected: 0
        },
        saveExamAndFingerprints: async (examDoc) => {
            savedExam = examDoc;
        }
    };

    const progressUpdates = [];
    const exam = await runFullEnglishExamPipeline({
        aiClient,
        harvester,
        storage,
        focusMode: "all_mixed",
        difficultyKey: "high",
        onProgress: (pct, msg) => progressUpdates.push({ pct, msg }),
        onEntropy: () => {},
        onLog: () => {}
    });

    // Must run strictly sequentially (1 pass at a time) to avoid Vercel timeout & RPM bursts
    assert.equal(maxConcurrent, 1, `Expected sequential 4-pass execution (maxConcurrent=1), got ${maxConcurrent}`);
    assert.deepEqual(passOrder, [1, 2, 3, 4]);
    assert.equal(pass3BrokenOnce, true);

    assert.equal(exam.totalQuestions, 40);
    assert.equal(exam.part1.questions.length, 6);
    assert.equal(exam.part2.questions.length, 6);
    assert.equal(exam.part3.questions.length, 5);
    assert.equal(exam.part4.questions.length, 5);
    assert.equal(exam.part5.questions.length, 8);
    assert.equal(exam.part6.questions.length, 10);
    assert.equal(exam.vocabulary.length, 4);
    assert.equal(savedExam.examId, exam.examId);
    assert.equal(progressUpdates.at(-1).pct, 100);

    // Interactive scoring check (0.25 pts/question)
    const userAnswers = {};
    for (const q of exam.answerKey.slice(0, 32)) {
        userAnswers[q.number] = q.answer; // 32 correct = 8.00 points
    }
    const graded = gradeInteractiveExam(exam, userAnswers);
    assert.equal(graded.correctCount, 32);
    assert.equal(graded.score, 8);
    assert.equal(graded.sectionBreakdown.length, 6);

    // Part 3 questions must never keep pre-ordered identity sequences (a-b-c / a-b-c-d-e)
    for (const q of exam.part3.questions) {
        const correctSeq = q[`option${q.correctOption}`];
        assert.notEqual(correctSeq, "a-b-c");
        assert.notEqual(correctSeq, "a-b-c-d-e");
    }

    // Mobile-safe split copy serializers & .txt export check
    const s1 = buildSlice1To17Text(exam);
    assert.ok(s1.includes("Question 1."));
    assert.ok(s1.includes("Question 17."));
    assert.ok(s1.includes("(1) ______"));
    assert.ok(s1.includes("(2) ______"));
    assert.equal(s1.includes("Question 18."), false);

    const s2 = buildSlice18To30Text(exam);
    assert.ok(s2.includes("Question 18."));
    assert.ok(s2.includes("Question 30."));
    assert.ok(s2.includes("https://example.org/rss:npr:303"));
    assert.equal(s2.includes("Question 31."), false);

    const s3 = buildSlice31To40Text(exam);
    assert.ok(s3.includes("Question 31."));
    assert.ok(s3.includes("Question 40."));
    assert.ok(s3.includes("[I]"));
    assert.ok(s3.includes("https://example.org/epmc:PMC404"));

    const sAns = buildAnswersAndExplanationsText(exam);
    assert.ok(sAns.includes("01.A"));
    assert.ok(sAns.includes("40.B"));
    assert.ok(sAns.includes("pivotal"));

    const fullTxt = buildFullTxtExamDocument(exam);
    assert.ok(fullTxt.includes("MÔN: TIẾNG ANH"));
    assert.ok(fullTxt.includes("QĐ 764/QĐ-BGDĐT"));
    assert.equal(fullTxt.includes("\\documentclass"), false, "Must contain zero LaTeX math code");
});

test("Adaptive option grid, cloze prompt cleaner, and plain-text cloze blank preservation work cleanly", () => {
    // Adaptive Option Grid thresholds: <=20 (4 cols), 21-55 (2 cols), >55 (1 col)
    assert.equal(computeAdaptiveOptionLayout(["exciting", "excited", "excitement", "excitedly"]), "opt-grid-4");
    assert.equal(computeAdaptiveOptionLayout(["a-b-c-d-e", "c-a-e-b-d", "d-b-a-c-e", "b-e-c-a-d"]), "opt-grid-4");
    assert.equal(
        computeAdaptiveOptionLayout([
            "renewable energy initiatives",
            "local community volunteer programs",
            "sustainable urban transport",
            "green architectural innovation"
        ]),
        "opt-grid-2"
    );
    assert.equal(
        computeAdaptiveOptionLayout([
            "which has significantly lowered urban summer heatwaves across metropolitan districts",
            "having dramatically transformed public transit schedules over the past decade",
            "that many municipal leaders initially doubted would attract external funding",
            "although early pilot studies suggested moderate seasonal variations in cooling"
        ]),
        "opt-grid-1"
    );
    // Formatting markers shouldn't inflate character length unnecessarily
    assert.equal(computeAdaptiveOptionLayout(["**pivotal**", "**minor**", "**trivial**", "**brief**"]), "opt-grid-4");

    // Cloze prompt cleaner strips redundant Q1-12 boilerplate & duplicate prefixes on Q23-40
    assert.equal(cleanClozeQuestionPrompt("Question 1 (Word formation — Blank 1):", 1), "");
    assert.equal(cleanClozeQuestionPrompt("Question 12 (Vocabulary — Blank 12): Choose best option", 12), "");
    assert.equal(cleanClozeQuestionPrompt("Question 18 (Blank 18):", 18), "");
    assert.equal(
        cleanClozeQuestionPrompt("Question 23: Which of the following is NOT mentioned in paragraph 2?", 23),
        "Which of the following is NOT mentioned in paragraph 2?"
    );

    // Consecutive cloze blanks (1) ______ ... (2) ______ must never be corrupted by __underline__ regex
    const clozePlain = formatPassageForPlainText(
        "Join our (1) ______ event in (2) ______ park and __enjoy a special workshop__ with **experts**."
    );
    assert.ok(clozePlain.includes("(1) ______ event in (2) ______ park"));
    assert.ok(clozePlain.includes("«enjoy a special workshop»"));
    assert.ok(clozePlain.includes("**experts**"));
});

test("ensureReadingPassageHighlights auto-bolds target words and auto-underlines paraphrase sentences when AI omits markup", () => {
    const rawParagraphs = [
        "Urban micro-forests planted with native species grow remarkably resilient over their first decade, and they absorb stormwater rapidly.",
        "Municipal planners initially hesitated because purchasing dense downtown lots seemed prohibitively expensive for small districts. However, pocket parks soon proved cost-effective by curbing flood damage.",
        "Critics worried local biodiversity would <b>dwindle</b>, yet surveys documented triple the songbird species."
    ];

    const questions = [
        {
            number: 24,
            skillTag: "Vocabulary (CLOSEST)",
            prompt: 'The word "resilient" in paragraph 1 is CLOSEST in meaning to _______.',
            targetPhrase: "resilient",
            targetParagraph: 1,
            optionA: "hardy",
            optionB: "fragile",
            optionC: "remote",
            optionD: "costly",
            correctOption: "A"
        },
        {
            number: 25,
            skillTag: "Pronoun reference",
            prompt: 'The word "they" in paragraph 1 refers to _______.',
            optionA: "planners",
            optionB: "urban micro-forests",
            optionC: "districts",
            optionD: "songbirds",
            correctOption: "B"
        },
        {
            number: 26,
            skillTag: "Paraphrase sentence",
            prompt: "Which of the following best paraphrases the underlined sentence in paragraph 2?",
            // Deliberately omit targetPhrase & __...__ markup to test token-overlap auto-underline fallback!
            optionA: "City officials were reluctant at first since acquiring compact urban land appeared too costly for smaller areas.",
            optionB: "Downtown districts refused to accept donations of unused private lots.",
            optionC: "Small municipalities banned pocket parks because of high water bills.",
            optionD: "Planners spent a decade studying storm drains before planting trees.",
            correctOption: "A"
        }
    ];

    const repaired = ensureReadingPassageHighlights(rawParagraphs, questions);
    assert.ok(repaired[0].includes("**resilient**"), "Missing CLOSEST target word must be auto-bolded");
    assert.ok(repaired[0].includes("**they**"), "Missing pronoun target word must be auto-bolded");
    assert.ok(
        repaired[1].includes("__Municipal planners initially hesitated because purchasing dense downtown lots seemed prohibitively expensive for small districts.__"),
        "Missing paraphrase sentence must be auto-underlined via token overlap"
    );
    assert.ok(repaired[2].includes("**dwindle**"), "HTML <b> tags must normalize cleanly to **...**");
});

test("shuffleArrangementQuestion enforces CSPRNG non-identity shuffle, exact key bijection, and Q15 letter framing", () => {
    const original3 = [
        "Hi Nam, did you finish the renewable energy slides?",
        "Yes, I just uploaded them to our shared folder this morning.",
        "Awesome, I will review the charts before tomorrow's presentation."
    ];
    const original5 = [
        "Thanks so much for inviting me to the robotics showcase last weekend.",
        "I was genuinely amazed by how smoothly your team's prototype navigated the obstacle course.",
        "Your explanation of the sensor calibration also gave me great ideas for our school club.",
        "Next month, we are hosting a small tech fair and would love for you to visit.",
        "Let me know if you are free on Saturday afternoon so I can reserve a guest pass."
    ];

    for (let run = 0; run < 30; run++) {
        // 3-item short dialogue (Q13) given pre-ordered a-b-c by AI
        const q13 = shuffleArrangementQuestion(
            {
                number: 13,
                subtype: "dialogue_short",
                skillTag: "Sắp xếp hội thoại ngắn",
                items: original3.map((text, idx) => ({ label: String.fromCharCode(97 + idx), text })),
                optionA: "a-b-c",
                optionB: "b-a-c",
                optionC: "c-a-b",
                optionD: "a-c-b",
                correctOption: "A",
                explanationVi: "Thứ tự đúng: a-b-c. Mở đầu hỏi tiến độ, trả lời đã nộp, cảm ơn."
            },
            13,
            "dialogue_short"
        );

        const q13CorrectSeq = q13[`option${q13.correctOption}`];
        assert.notEqual(q13CorrectSeq, "a-b-c", "Q13 must NEVER stay pre-ordered a-b-c");
        const q13Opts = new Set([q13.optionA, q13.optionB, q13.optionC, q13.optionD]);
        assert.equal(q13Opts.size, 4, "Q13 must have 4 unique permutation options");
        assert.ok(q13.explanationVi.startsWith(`Thứ tự đúng: ${q13CorrectSeq}.`), "Q13 explanation must sync with shuffled key");

        const q13Map = new Map(q13.items.map((it) => [it.label, it.text]));
        const q13Reconstructed = q13CorrectSeq.split("-").map((lbl) => q13Map.get(lbl));
        assert.deepEqual(q13Reconstructed, original3, "Q13 shuffled key must reconstruct original chronological dialogue");

        // 5-item letter (Q15) given pre-ordered a-b-c-d-e and missing salutation/signOff
        const q15 = shuffleArrangementQuestion(
            {
                number: 15,
                subtype: "letter",
                skillTag: "Sắp xếp thư / email",
                salutation: "",
                signOff: "",
                items: original5.map((text, idx) => ({ label: String.fromCharCode(97 + idx), text })),
                optionA: "a-b-c-d-e",
                optionB: "b-a-c-d-e",
                optionC: "a-c-b-d-e",
                optionD: "d-a-b-c-e",
                correctOption: "A",
                explanationVi: "Mở thư cảm ơn, khen nguyên mẫu, nêu bài học, mời dự hội chợ và chốt lịch."
            },
            15,
            "letter"
        );

        const q15CorrectSeq = q15[`option${q15.correctOption}`];
        assert.notEqual(q15CorrectSeq, "a-b-c-d-e", "Q15 must NEVER stay pre-ordered a-b-c-d-e");
        const q15Opts = new Set([q15.optionA, q15.optionB, q15.optionC, q15.optionD]);
        assert.equal(q15Opts.size, 4, "Q15 must have 4 unique permutation options");
        assert.ok(q15.salutation.length >= 4, "Q15 letter must always include salutation");
        assert.ok(q15.signOff.length >= 4, "Q15 letter must always include signOff");
        assert.ok(q15.explanationVi.startsWith(`Thứ tự đúng: ${q15CorrectSeq}.`), "Q15 explanation must sync with shuffled key");

        const q15Map = new Map(q15.items.map((it) => [it.label, it.text]));
        const q15Reconstructed = q15CorrectSeq.split("-").map((lbl) => q15Map.get(lbl));
        assert.deepEqual(q15Reconstructed, original5, "Q15 shuffled key must reconstruct original chronological letter");
    }
});

test("HTTP server serves clean English frontend (zero KaTeX/Math) and secures /api/health, /api/ai, /api/harvest", async () => {
    const server = createAppServer({ GEMINI_API_KEY: "", DEFAULT_AI_PROVIDER: "gemini" });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    try {
        const homeRes = await fetch(`${base}/`);
        assert.equal(homeRes.status, 200);
        const html = await homeRes.text();
        assert.ok(html.includes("THPTQG 2026 Tiếng Anh"));
        assert.ok(html.includes("cdn.tailwindcss.com"));
        assert.ok(html.includes("chkShowTechMeta"));
        assert.ok(html.includes("examPaperSheet"));
        assert.equal(/katex/i.test(html), false, "HTML must not include KaTeX");
        assert.equal(/\.tex\b/i.test(html), false, "HTML must not include .tex math export");

        const cssRes = await fetch(`${base}/styles.css`);
        assert.equal(cssRes.status, 200);
        assert.ok((cssRes.headers.get("content-type") || "").includes("text/css"));

        const healthRes = await fetch(`${base}/api/health`);
        assert.equal(healthRes.status, 200);
        const health = await healthRes.json();
        assert.equal(health.ok, true);
        assert.equal(health.subject, "english-gdpt2018");
        assert.equal(health.serverHasAnyKey, false);

        const healthWithKey = getServerHealth({ GEMINI_API_KEY: "dummy-env-key" });
        assert.equal(healthWithKey.serverHasAnyKey, true);
        assert.equal(healthWithKey.configuredProviders.gemini, true);

        const aiRes = await fetch(`${base}/api/ai`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "gemini", model: "gemini-3.5-flash-lite", prompt: "hello" })
        });
        assert.equal(aiRes.status, 401);
        const aiJson = await aiRes.json();
        assert.equal(aiJson.code, "MISSING_API_KEY");

        const harvestBlocked = await fetch(`${base}/api/harvest?url=${encodeURIComponent("http://127.0.0.1/secret")}`);
        assert.equal(harvestBlocked.status, 403);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
