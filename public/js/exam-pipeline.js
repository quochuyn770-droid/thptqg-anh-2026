import {
    DIFFICULTY_CONFIG,
    SOURCE_FOCUS_CONFIG,
    EXAM_SECTIONS_META,
    SYSTEM_INSTRUCTION_ENGLISH_2026
} from "./config.js";
import {
    csprngHex,
    csprngInt,
    csprngSample,
    normalizeTextForHash,
    sha256Hex,
    extractShinglesFromNormalized,
    evaluateContentIntegrity,
    isNewsRssSourceId
} from "./crypto-dedup.js";
import { parseRobustJson } from "./ai-client.js";

/**
 * Sequential 4-Pass English Exam Compiler (QĐ 764/QĐ-BGDĐT · GDPT 2018)
 * - 40 multiple-choice questions · 50 minutes · 10.0 points (0.25 pt/question)
 * - Strictly sequential passes with live progress updates to prevent Vercel 60s Serverless timeouts
 * - 3-Layer Anti-Duplication (Source ID + SHA-256 + 3-gram Jaccard) + GDPT 2018 Legacy Format Blocker
 * - Mandatory CSPRNG shuffle for Part 3 (Q13–17) & auto-repair of Reading Highlights (Part 5–6)
 */

const QUESTION_ITEM_SCHEMA = {
    type: "OBJECT",
    properties: {
        number: { type: "INTEGER" },
        skillTag: { type: "STRING" },
        prompt: { type: "STRING" },
        targetPhrase: { type: "STRING" },
        targetParagraph: { type: "INTEGER" },
        optionA: { type: "STRING" },
        optionB: { type: "STRING" },
        optionC: { type: "STRING" },
        optionD: { type: "STRING" },
        correctOption: { type: "STRING" },
        explanationVi: { type: "STRING" }
    },
    required: ["number", "skillTag", "prompt", "optionA", "optionB", "optionC", "optionD", "correctOption", "explanationVi"]
};

const VOCAB_ITEM_SCHEMA = {
    type: "OBJECT",
    properties: {
        term: { type: "STRING" },
        pos: { type: "STRING" },
        cefr: { type: "STRING" },
        meaningVi: { type: "STRING" },
        example: { type: "STRING" }
    },
    required: ["term", "pos", "cefr", "meaningVi", "example"]
};

const PASS1_SCHEMA = {
    type: "OBJECT",
    properties: {
        part1: {
            type: "OBJECT",
            properties: {
                instruction: { type: "STRING" },
                title: { type: "STRING" },
                subtitle: { type: "STRING" },
                passage: { type: "STRING" },
                questions: { type: "ARRAY", items: QUESTION_ITEM_SCHEMA }
            },
            required: ["instruction", "title", "passage", "questions"]
        },
        part2: {
            type: "OBJECT",
            properties: {
                instruction: { type: "STRING" },
                title: { type: "STRING" },
                subtitle: { type: "STRING" },
                passage: { type: "STRING" },
                questions: { type: "ARRAY", items: QUESTION_ITEM_SCHEMA }
            },
            required: ["instruction", "title", "passage", "questions"]
        },
        vocabulary: { type: "ARRAY", items: VOCAB_ITEM_SCHEMA }
    },
    required: ["part1", "part2", "vocabulary"]
};

const ARRANGEMENT_QUESTION_SCHEMA = {
    type: "OBJECT",
    properties: {
        number: { type: "INTEGER" },
        subtype: { type: "STRING" },
        skillTag: { type: "STRING" },
        salutation: { type: "STRING" },
        signOff: { type: "STRING" },
        items: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    label: { type: "STRING" },
                    text: { type: "STRING" }
                },
                required: ["label", "text"]
            }
        },
        optionA: { type: "STRING" },
        optionB: { type: "STRING" },
        optionC: { type: "STRING" },
        optionD: { type: "STRING" },
        correctOption: { type: "STRING" },
        explanationVi: { type: "STRING" }
    },
    required: ["number", "subtype", "skillTag", "items", "optionA", "optionB", "optionC", "optionD", "correctOption", "explanationVi"]
};

const PASS2_SCHEMA = {
    type: "OBJECT",
    properties: {
        part3: {
            type: "OBJECT",
            properties: {
                instruction: { type: "STRING" },
                questions: { type: "ARRAY", items: ARRANGEMENT_QUESTION_SCHEMA }
            },
            required: ["instruction", "questions"]
        },
        part4: {
            type: "OBJECT",
            properties: {
                instruction: { type: "STRING" },
                title: { type: "STRING" },
                passage: { type: "STRING" },
                questions: { type: "ARRAY", items: QUESTION_ITEM_SCHEMA }
            },
            required: ["instruction", "title", "passage", "questions"]
        },
        vocabulary: { type: "ARRAY", items: VOCAB_ITEM_SCHEMA }
    },
    required: ["part3", "part4", "vocabulary"]
};

const PASS3_SCHEMA = {
    type: "OBJECT",
    properties: {
        part5: {
            type: "OBJECT",
            properties: {
                instruction: { type: "STRING" },
                title: { type: "STRING" },
                paragraphs: { type: "ARRAY", items: { type: "STRING" } },
                questions: { type: "ARRAY", items: QUESTION_ITEM_SCHEMA }
            },
            required: ["instruction", "title", "paragraphs", "questions"]
        },
        vocabulary: { type: "ARRAY", items: VOCAB_ITEM_SCHEMA }
    },
    required: ["part5", "vocabulary"]
};

const PASS4_SCHEMA = {
    type: "OBJECT",
    properties: {
        part6: {
            type: "OBJECT",
            properties: {
                instruction: { type: "STRING" },
                title: { type: "STRING" },
                paragraphs: { type: "ARRAY", items: { type: "STRING" } },
                questions: { type: "ARRAY", items: QUESTION_ITEM_SCHEMA }
            },
            required: ["instruction", "title", "paragraphs", "questions"]
        },
        vocabulary: { type: "ARRAY", items: VOCAB_ITEM_SCHEMA }
    },
    required: ["part6", "vocabulary"]
};

function sanitizeOptionLetter(raw, fallback = "A") {
    const cleaned = String(raw || fallback)
        .trim()
        .toUpperCase()
        .replace(/[^ABCD]/g, "");
    return cleaned.charAt(0) || fallback;
}

function escapeRegExp(str) {
    return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strips inline formatting markers (**word**, __sentence__, <u>, <b>, <strong>) for length & text comparison.
 */
export function stripInlineFormatting(str) {
    return String(str || "")
        .replace(/<\/?(u|b|strong|em|i)>/gi, "")
        .replace(/\*\*([^*]+?)\*\*/g, "$1")
        .replace(/(^|[^_])__(?!_|\s)([^_]+?)__(?!_)/g, "$1$2")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Computes the adaptive CSS grid class for options A, B, C, D based on the longest option string:
 * - <= 20 chars -> 4 columns on 1 row (`opt-grid-4`)
 * - 21–55 chars -> 2 columns x 2 rows (`opt-grid-2`)
 * - > 55 chars  -> 1 vertical column x 4 rows (`opt-grid-1`)
 */
export function computeAdaptiveOptionLayout(options) {
    const list = Array.isArray(options)
        ? options
        : [options?.optionA, options?.optionB, options?.optionC, options?.optionD];
    const maxLen = list.reduce((acc, opt) => {
        const text = typeof opt === "string" ? opt : opt?.text || "";
        return Math.max(acc, stripInlineFormatting(text).length);
    }, 0);

    if (maxLen <= 20) return "opt-grid-4";
    if (maxLen <= 55) return "opt-grid-2";
    return "opt-grid-1";
}

/**
 * Cleans redundant cloze question prompts for Q1–12 & Q18–22 (e.g. "Question 1 (Word formation — Blank 1):"),
 * returning an empty string when no substantive stem exists so official BGDĐT numbering "Question 1." renders cleanly.
 */
export function cleanClozeQuestionPrompt(rawPrompt, questionNumber) {
    const qNum = Number(questionNumber || 0);
    const s = String(rawPrompt || "").trim();
    if (!s) return "";

    // For cloze blanks (1-12 and 18-22), official BGDĐT exams show only "Question X." + A/B/C/D
    if ((qNum >= 1 && qNum <= 12) || (qNum >= 18 && qNum <= 22)) {
        const stripped = s
            .replace(/^question\s*\d+\s*/i, "")
            .replace(/^\([^)]*\)\s*/i, "")
            .replace(/^[-–—:\.\s]+/, "")
            .replace(/^blank\s*\(?\d+\)?\s*[:.\-–—]*\s*/i, "")
            .trim();
        // If only boilerplate/blank metadata remained, return empty
        if (!stripped || /^(blank\s*\d+|choose\s+the\s+(best\s+)?option|option\s+for\s+blank\s*\d+)$/i.test(stripped)) {
            return "";
        }
        // In standard Q1-12 cloze, never show prompt text unless it is an actual sentence stem
        if (qNum >= 1 && qNum <= 12) return "";
        return stripped;
    }

    // For Reading questions (Q23–40), strip leading duplicate "Question 23:" / "Question 23." prefix
    return s.replace(/^question\s*\d+\s*[:.\-–—]?\s*/i, "").trim();
}

function normalizeParagraphMarkup(text) {
    return String(text || "")
        .replace(/<u>([\s\S]*?)<\/u>/gi, "__$1__")
        .replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi, "**$1**")
        .trim();
}

function extractParagraphIndexFromQuestion(q, totalParagraphs) {
    const explicit = Number(q?.targetParagraph);
    if (Number.isInteger(explicit) && explicit >= 1 && explicit <= totalParagraphs) {
        return explicit - 1;
    }
    const promptMatch = String(q?.prompt || "").match(/paragraph\s+(\d+)/i);
    if (promptMatch) {
        const idx = parseInt(promptMatch[1], 10) - 1;
        if (idx >= 0 && idx < totalParagraphs) return idx;
    }
    return -1;
}

function extractTargetWordFromQuestion(q) {
    if (q?.targetPhrase && String(q.targetPhrase).trim()) {
        return stripInlineFormatting(q.targetPhrase).replace(/^["“‘'`]+|["”’'`]+$/g, "").trim();
    }
    const prompt = String(q?.prompt || "");
    const boldMatch = prompt.match(/\*\*([^*]{1,45})\*\*/);
    if (boldMatch && boldMatch[1]) return boldMatch[1].trim();

    const quoteMatch = prompt.match(/(?:word|phrase|term|expression|pronoun)\s+["“‘'`]([^"”’'`]{1,45})["”’'`]/i);
    if (quoteMatch && quoteMatch[1]) return quoteMatch[1].trim();

    const bareMatch = prompt.match(/(?:word|phrase|term|expression|pronoun)\s+([A-Za-z][A-Za-z' -]{0,32}?)\s+in\s+paragraph/i);
    if (bareMatch && bareMatch[1]) return bareMatch[1].trim();

    return "";
}

function wrapFirstOccurrenceBold(paragraph, phrase) {
    const cleanPhrase = String(phrase || "").trim();
    if (!cleanPhrase) return { updated: paragraph, changed: false };

    const alreadyBoldRe = new RegExp(`\\*\\*${escapeRegExp(cleanPhrase)}\\*\\*`, "i");
    if (alreadyBoldRe.test(paragraph)) {
        return { updated: paragraph, changed: false };
    }

    // Build flexible whitespace & word-boundary regex for phrase
    const patternBody = cleanPhrase
        .split(/\s+/)
        .map(escapeRegExp)
        .join("\\s+");
    const isAlphaStart = /^[A-Za-z0-9]/.test(cleanPhrase);
    const isAlphaEnd = /[A-Za-z0-9]$/.test(cleanPhrase);
    const wordRe = new RegExp(`${isAlphaStart ? "\\b" : ""}(${patternBody})${isAlphaEnd ? "\\b" : ""}`, "i");

    // Avoid matching inside already bolded **...** spans
    const segments = paragraph.split(/(\*\*[^*]+?\*\*)/g);
    let replaced = false;
    const rebuilt = segments.map((seg) => {
        if (replaced || (seg.startsWith("**") && seg.endsWith("**"))) return seg;
        const m = seg.match(wordRe);
        if (!m) return seg;
        replaced = true;
        return seg.replace(wordRe, "**$1**");
    });

    return { updated: rebuilt.join(""), changed: replaced };
}

function tokenizeContentWords(text) {
    const stop = new Set([
        "the", "and", "for", "that", "with", "this", "from", "have", "has", "had",
        "are", "was", "were", "been", "being", "will", "would", "could", "should",
        "into", "about", "their", "there", "which", "when", "where", "while", "than",
        "then", "they", "them", "these", "those", "such", "more", "most", "some",
        "many", "much", "also", "only", "very", "over", "under", "between", "through"
    ]);
    return new Set(
        stripInlineFormatting(text)
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length >= 3 && !stop.has(w))
    );
}

function wrapSentenceUnderline(paragraph, targetSentence) {
    const cleanTarget = stripInlineFormatting(targetSentence).replace(/^["“‘'`]+|["”’'`]+$/g, "").trim();
    if (!cleanTarget || cleanTarget.length < 15) return { updated: paragraph, changed: false };

    // Build regex tolerant of whitespace and optional bold markers inside the sentence
    const tokens = cleanTarget.split(/\s+/).filter(Boolean);
    const fuzzyRe = new RegExp(
        tokens.map((t) => `(?:\\*\\*)?${escapeRegExp(t)}(?:\\*\\*)?`).join("\\s+"),
        "i"
    );
    const match = paragraph.match(fuzzyRe);
    if (!match) return { updated: paragraph, changed: false };

    const updated = paragraph.replace(fuzzyRe, (found) => `__${found}__`);
    return { updated, changed: true };
}

function splitParagraphIntoSentences(paragraph) {
    const raw = String(paragraph || "").trim();
    if (!raw) return [];
    // Split on sentence-ending punctuation followed by whitespace (preserving markers like [I])
    const matches = raw.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g);
    return (matches || [raw]).map((s) => s.trim()).filter((s) => s.length >= 20);
}

/**
 * Guarantees that every Reading Passage (Part 5 & Part 6) properly highlights:
 * 1) Target vocabulary (CLOSEST / OPPOSITE) and Pronoun reference words with **...**
 * 2) Target Paraphrase sentence with __...__ (rendered as <u>...</u>)
 * Works both at generation time and retroactively on older exams saved in IndexedDB.
 */
export function ensureReadingPassageHighlights(paragraphs, questions = []) {
    if (!Array.isArray(paragraphs) || paragraphs.length === 0) return [];
    const out = paragraphs.map(normalizeParagraphMarkup);

    for (const q of Array.isArray(questions) ? questions : []) {
        const prompt = String(q?.prompt || "");
        const skill = String(q?.skillTag || "");
        const paraIdx = extractParagraphIndexFromQuestion(q, out.length);
        const searchOrder =
            paraIdx >= 0
                ? [paraIdx, ...out.map((_, i) => i).filter((i) => i !== paraIdx)]
                : out.map((_, i) => i);

        // 1. Paraphrase sentence underline guard
        const isParaphrase = /paraphrase|underlined\s+sentence/i.test(`${prompt} ${skill}`);
        if (isParaphrase) {
            const targetIdx = paraIdx >= 0 ? paraIdx : 0;
            const alreadyHasUnderline =
                paraIdx >= 0
                    ? /__[^_]{12,}__/.test(out[targetIdx])
                    : out.some((p) => /__[^_]{12,}__/.test(p));

            if (!alreadyHasUnderline) {
                let applied = false;

                // Try explicit targetPhrase first
                if (q?.targetPhrase && String(q.targetPhrase).trim().length >= 15) {
                    for (const idx of searchOrder) {
                        const res = wrapSentenceUnderline(out[idx], q.targetPhrase);
                        if (res.changed) {
                            out[idx] = res.updated;
                            applied = true;
                            break;
                        }
                    }
                }

                // Fallback 1: check quoted English sentence in explanationVi
                if (!applied && q?.explanationVi) {
                    const quotes = [...String(q.explanationVi).matchAll(/["“]([^"”]{20,260})["”]/g)].map((m) => m[1]);
                    for (const candidate of quotes) {
                        for (const idx of searchOrder) {
                            const res = wrapSentenceUnderline(out[idx], candidate);
                            if (res.changed) {
                                out[idx] = res.updated;
                                applied = true;
                                break;
                            }
                        }
                        if (applied) break;
                    }
                }

                // Fallback 2: best token-overlap sentence against the correct paraphrase answer
                if (!applied) {
                    const correctLetter = sanitizeOptionLetter(q?.correctOption, "A");
                    const answerText = q?.[`option${correctLetter}`] || "";
                    const answerTokens = tokenizeContentWords(answerText);

                    let bestIdx = -1;
                    let bestSentence = "";
                    let bestScore = 0;

                    const candidateParaIndices = paraIdx >= 0 ? [paraIdx] : searchOrder;
                    for (const idx of candidateParaIndices) {
                        const sentences = splitParagraphIntoSentences(out[idx]);
                        for (const sent of sentences) {
                            const cleanSent = sent.replace(/^(\[(?:I|II|III|IV)\]\s*)+/, "").trim();
                            if (cleanSent.length < 25) continue;
                            const sentTokens = tokenizeContentWords(cleanSent);
                            if (sentTokens.size === 0 || answerTokens.size === 0) continue;
                            let common = 0;
                            for (const t of answerTokens) {
                                if (sentTokens.has(t)) common++;
                            }
                            const score = common / Math.min(answerTokens.size, sentTokens.size);
                            if (score > bestScore) {
                                bestScore = score;
                                bestIdx = idx;
                                bestSentence = cleanSent;
                            }
                        }
                    }

                    if (bestIdx >= 0 && bestSentence && bestScore >= 0.12) {
                        const res = wrapSentenceUnderline(out[bestIdx], bestSentence);
                        if (res.changed) out[bestIdx] = res.updated;
                    } else if (paraIdx >= 0) {
                        // Last resort: underline the longest substantive sentence in the specified paragraph
                        const sentences = splitParagraphIntoSentences(out[paraIdx]);
                        if (sentences.length > 0) {
                            const longest = sentences
                                .map((s) => s.replace(/^(\[(?:I|II|III|IV)\]\s*)+/, "").trim())
                                .sort((a, b) => b.length - a.length)[0];
                            const res = wrapSentenceUnderline(out[paraIdx], longest);
                            if (res.changed) out[paraIdx] = res.updated;
                        }
                    }
                }
            }
            continue;
        }

        // 2. Vocabulary (CLOSEST / OPPOSITE) & Pronoun reference bold guard
        const isTargetWordQuestion = /closest|opposite|best\s+replaced\s+by|refers?\s+to|pronoun\s+reference/i.test(
            `${prompt} ${skill}`
        );
        if (isTargetWordQuestion) {
            const phrase = extractTargetWordFromQuestion(q);
            if (phrase) {
                for (const idx of searchOrder) {
                    const alreadyRe = new RegExp(`\\*\\*${escapeRegExp(phrase)}\\*\\*`, "i");
                    if (alreadyRe.test(out[idx])) break;
                    const res = wrapFirstOccurrenceBold(out[idx], phrase);
                    if (res.changed) {
                        out[idx] = res.updated;
                        break;
                    }
                }
            }
        }
    }

    return out;
}

function parseArrangementSequence(seqStr, expectedLen) {
    const letters = String(seqStr || "")
        .toLowerCase()
        .match(/[a-e]/g);
    if (!letters || letters.length !== expectedLen) return null;
    const expectedSet = new Set(Array.from({ length: expectedLen }, (_, i) => String.fromCharCode(97 + i)));
    const unique = new Set(letters);
    if (unique.size !== expectedLen) return null;
    for (const l of unique) {
        if (!expectedSet.has(l)) return null;
    }
    return letters;
}

function isTrivialPermutation(perm) {
    const n = perm.length;
    let fixedPoints = 0;
    for (let i = 0; i < n; i++) {
        if (perm[i] === i) fixedPoints++;
    }
    if (fixedPoints === n) return true; // exact identity a-b-c / a-b-c-d-e
    if (n >= 5 && fixedPoints >= 3) return true; // avoid almost-sorted sequences like a-b-c-e-d
    return false;
}

function generateArrangementDistractors(correctArr, labels) {
    const n = correctArr.length;
    const correctStr = correctArr.join("-");
    const identityStr = labels.join("-");
    const distractors = new Set();

    const swapPair = (arr, i, j) => {
        const copy = [...arr];
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
        return copy;
    };

    // Candidate 1: keep same opening sentence, swap two interior/ending items (classic BGDĐT distractor)
    if (n >= 3) {
        const c1 = swapPair(correctArr, n - 2, n - 1).join("-");
        if (c1 !== correctStr && c1 !== identityStr) distractors.add(c1);
    }
    if (n >= 5) {
        const c2 = swapPair(correctArr, 1, 2).join("-");
        if (c2 !== correctStr && c2 !== identityStr) distractors.add(c2);
    }

    // Candidate 2: plausible alternative first sentence
    const cAltStart = swapPair(correctArr, 0, 1).join("-");
    if (cAltStart !== correctStr && cAltStart !== identityStr) distractors.add(cAltStart);

    // Fill remaining up to 3 unique valid distractors via CSPRNG
    let guard = 0;
    while (distractors.size < 3 && guard < 80) {
        guard++;
        const cand = csprngSample(labels, n).join("-");
        if (cand !== correctStr && (n < 4 || cand !== identityStr)) {
            distractors.add(cand);
        }
    }

    // Deterministic fallback for small n=3 (6 total permutations)
    if (distractors.size < 3) {
        const allPerms = [];
        const permute = (arr, prefix = []) => {
            if (arr.length === 0) {
                allPerms.push(prefix.join("-"));
                return;
            }
            for (let i = 0; i < arr.length; i++) {
                permute([...arr.slice(0, i), ...arr.slice(i + 1)], [...prefix, arr[i]]);
            }
        };
        permute(labels);
        for (const p of allPerms) {
            if (distractors.size >= 3) break;
            if (p !== correctStr) distractors.add(p);
        }
    }

    return Array.from(distractors).slice(0, 3);
}

/**
 * Programmatically shuffles Part 3 (Questions 13–17) items using 128-bit CSPRNG Fisher-Yates
 * so the displayed items a–c / a–e are NEVER pre-ordered as a-b-c or a-b-c-d-e,
 * recomputes the exact matching correctOption & 3 unique distractors,
 * and guarantees official BGDĐT letter salutation & signOff for Question 15.
 */
export function shuffleArrangementQuestion(rawQ, fallbackNumber = 13, fallbackSubtype = "paragraph_1", fallbackSkill = "Sắp xếp") {
    const qNum = Number(rawQ?.number || fallbackNumber);
    const subtype = String(rawQ?.subtype || fallbackSubtype).trim();
    const skillTag = String(rawQ?.skillTag || fallbackSkill).trim();

    const rawItems = Array.isArray(rawQ?.items)
        ? rawQ.items
              .filter((it) => it && String(it.text || "").trim())
              .map((it, idx) => ({
                  label: String(it.label || String.fromCharCode(97 + idx)).trim().toLowerCase().charAt(0),
                  text: String(it.text || "").trim()
              }))
        : [];

    const n = rawItems.length;
    const isLetter = subtype === "letter" || qNum === 15;
    const salutation = String(rawQ?.salutation || "").trim() || (isLetter ? "Dear Alex," : "");
    const signOff = String(rawQ?.signOff || "").trim() || (isLetter ? "Best regards,\nMinh" : "");

    if (n < 3) {
        return {
            number: qNum,
            subtype,
            skillTag,
            salutation,
            signOff,
            items: rawItems,
            optionA: String(rawQ?.optionA || "c-a-b").trim(),
            optionB: String(rawQ?.optionB || "b-a-c").trim(),
            optionC: String(rawQ?.optionC || "b-c-a").trim(),
            optionD: String(rawQ?.optionD || "a-c-b").trim(),
            correctOption: sanitizeOptionLetter(rawQ?.correctOption, "A"),
            explanationVi: String(rawQ?.explanationVi || "Sắp xếp theo mạch liên kết ngữ nghĩa.").trim()
        };
    }

    const labels = Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i));
    const itemByLabel = new Map();
    rawItems.forEach((it, idx) => {
        itemByLabel.set(it.label || labels[idx], it.text);
    });

    // Step 1: Resolve true chronological sequence of texts from AI's declared correct answer
    const declaredLetter = sanitizeOptionLetter(rawQ?.correctOption, "A");
    const declaredSeqStr = rawQ?.[`option${declaredLetter}`] || "";
    const parsedSeq = parseArrangementSequence(declaredSeqStr, n);

    const logicalTexts = parsedSeq
        ? parsedSeq.map((lbl, idx) => itemByLabel.get(lbl) ?? rawItems[idx].text)
        : rawItems.map((it) => it.text);

    // Step 2: CSPRNG Fisher-Yates shuffle guaranteeing non-identity display order
    let perm = Array.from({ length: n }, (_, i) => i);
    for (let attempt = 0; attempt < 60; attempt++) {
        const candidate = Array.from({ length: n }, (_, i) => i);
        for (let i = candidate.length - 1; i > 0; i--) {
            const j = csprngInt(0, i);
            const tmp = candidate[i];
            candidate[i] = candidate[j];
            candidate[j] = tmp;
        }
        if (!isTrivialPermutation(candidate)) {
            perm = candidate;
            break;
        }
    }
    // Safety fallback if loop ever hit trivial permutation
    if (isTrivialPermutation(perm)) {
        perm = Array.from({ length: n }, (_, i) => (i + 1) % n);
    }

    // Step 3: Build new displayed items labeled a, b, c (, d, e)
    const shuffledItems = perm.map((logicalIdx, displayIdx) => ({
        label: labels[displayIdx],
        text: logicalTexts[logicalIdx]
    }));

    // Step 4: Compute exact new correct sequence string (e.g. "c-a-b" or "d-a-e-b-c")
    const correctSeqArr = Array.from({ length: n }, (_, logicalStep) => {
        const displayIdx = perm.indexOf(logicalStep);
        return labels[displayIdx];
    });
    const correctSeqStr = correctSeqArr.join("-");

    // Step 5: Generate 3 distinct plausible distractors & shuffle all 4 options into A/B/C/D
    const distractors = generateArrangementDistractors(correctSeqArr, labels);
    const allOptions = csprngSample([correctSeqStr, ...distractors], 4);
    const correctIdx = allOptions.indexOf(correctSeqStr);
    const optionLetters = ["A", "B", "C", "D"];
    const newCorrectOption = optionLetters[correctIdx >= 0 ? correctIdx : 0];

    // Step 6: Sync Vietnamese explanation prefix with the exact recomputed order
    const rawExplain = String(rawQ?.explanationVi || "Sắp xếp theo mạch liên kết ngữ nghĩa và từ nối.")
        .replace(/^Thứ tự đúng:\s*[a-e](?:\s*[-–→]\s*[a-e]){2,4}\.?\s*/i, "")
        .trim();
    const syncedExplain = `Thứ tự đúng: ${correctSeqStr}. ${rawExplain}`;

    return {
        number: qNum,
        subtype,
        skillTag,
        salutation,
        signOff,
        items: shuffledItems,
        optionA: allOptions[0] || correctSeqStr,
        optionB: allOptions[1] || distractors[0] || "",
        optionC: allOptions[2] || distractors[1] || "",
        optionD: allOptions[3] || distractors[2] || "",
        correctOption: newCorrectOption,
        explanationVi: syncedExplain
    };
}

function normalizeQuestionList(list, expectedStart, expectedCount, fallbackSkill) {
    if (!Array.isArray(list) || list.length < expectedCount) {
        throw new Error(
            `Số câu hỏi trả về không đủ (nhận ${Array.isArray(list) ? list.length : 0}/${expectedCount} cho Câu ${expectedStart}–${expectedStart + expectedCount - 1}).`
        );
    }
    return list.slice(0, expectedCount).map((q, idx) => {
        const num = expectedStart + idx;
        return {
            number: num,
            skillTag: String(q.skillTag || fallbackSkill || "Reading & Use of English").trim(),
            prompt: cleanClozeQuestionPrompt(q.prompt, num),
            targetPhrase: q.targetPhrase ? String(q.targetPhrase).trim() : "",
            targetParagraph: Number.isInteger(Number(q.targetParagraph)) ? Number(q.targetParagraph) : 0,
            optionA: String(q.optionA || "").trim(),
            optionB: String(q.optionB || "").trim(),
            optionC: String(q.optionC || "").trim(),
            optionD: String(q.optionD || "").trim(),
            correctOption: sanitizeOptionLetter(q.correctOption, "A"),
            explanationVi: String(q.explanationVi || "Xem giải thích ngữ cảnh trong bài.").trim()
        };
    });
}

function normalizeArrangementList(list) {
    if (!Array.isArray(list) || list.length < 5) {
        throw new Error(`Phần 3 (Sắp xếp) chỉ trả về ${Array.isArray(list) ? list.length : 0}/5 câu.`);
    }
    const defaultSubtypes = ["dialogue_short", "dialogue_long", "letter", "paragraph_1", "paragraph_2"];
    const defaultSkills = [
        "Sắp xếp hội thoại ngắn (3 lượt)",
        "Sắp xếp hội thoại mở rộng (5 lượt)",
        "Sắp xếp thư / email (5 phần)",
        "Sắp xếp đoạn văn 1 (5 câu)",
        "Sắp xếp đoạn văn 2 (5 câu)"
    ];
    return list.slice(0, 5).map((q, idx) =>
        shuffleArrangementQuestion(q, 13 + idx, defaultSubtypes[idx], defaultSkills[idx])
    );
}

function normalizeVocabList(list, sectionLabel) {
    if (!Array.isArray(list)) return [];
    return list
        .filter((v) => v && v.term && v.meaningVi)
        .slice(0, 10)
        .map((v) => ({
            term: String(v.term).trim(),
            pos: String(v.pos || "phr.").trim(),
            cefr: String(v.cefr || "B2").trim().toUpperCase(),
            meaningVi: String(v.meaningVi).trim(),
            example: String(v.example || "").trim(),
            section: sectionLabel
        }));
}

function formatSourceSeedBlock(src, label) {
    return `[${label}]
- Source Name: ${src.sourceName}
- Original URL: ${src.sourceUrl || "N/A"}
- Original Title: ${src.title}
- Authentic Excerpt: ${src.excerpt}`;
}

export async function compilePass1AdAndLeaflet(aiClient, adSeed, leafletSeed, diffCfg, avoidPreviews) {
    const prompt = `LƯỢT 1/4 — Biên soạn PHẦN 1 (Câu 1–6: Đọc điền Quảng cáo / Thông báo) và PHẦN 2 (Câu 7–12: Đọc điền Tờ rơi / Hướng dẫn) chuẩn đề THPTQG Tiếng Anh 2026 (QĐ 764/QĐ-BGDĐT).

Mức độ yêu cầu: ${diffCfg.label} (${diffCfg.cefr}) — ${diffCfg.guidance}
Nội dung lịch sử cần tránh trùng: ${avoidPreviews.slice(0, 6).join(" | ") || "Không có"}.

=== YÊU CẦU PHẦN 1 (Câu 1–6: Advertisement / Announcement Cloze) ===
- Dựa cảm hứng chủ đề từ nguồn thực tế sau để viết 1 đoạn quảng cáo/thông báo (~120–150 từ, có tiêu đề hấp dẫn) chứa ĐÚNG 6 chỗ trống (1) ______, (2) ______, (3) ______, (4) ______, (5) ______, (6) ______:
${formatSourceSeedBlock(adSeed, "Cảm hứng Phần 1")}
- Ma trận ĐÚNG 6 điểm ngữ pháp/từ vựng cho Câu 1–6:
  + Câu 1: Từ loại (Word formation: danh/động/tính/trạng từ)
  + Câu 2: Trật tự cụm danh từ (Word order / Noun phrase)
  + Câu 3: Rút gọn mệnh đề quan hệ (V-ing / V3-ed / to-V)
  + Câu 4: Giới từ (Preposition đi với tính từ/động từ/danh từ)
  + Câu 5: Collocation / Cụm từ cố định tự nhiên
  + Câu 6: Dạng động từ (to-V / V-ing / bare infinitive)
- Trường \`prompt\` cho các câu 1–12 để chuỗi rỗng "" (hoặc ngắn gọn "Question X.") — chỉ cần điền chuẩn \`skillTag\`, \`optionA..D\`, \`correctOption\`, \`explanationVi\`.

=== YÊU CẦU PHẦN 2 (Câu 7–12: Leaflet / Flyer Cloze) ===
- Dựa cảm hứng chủ đề từ nguồn thực tế sau để viết 1 tờ rơi/hướng dẫn thực tế (~140–170 từ, có tiêu đề và các mục ngắn rõ ràng) chứa ĐÚNG 6 chỗ trống (7) ______, (8) ______, (9) ______, (10) ______, (11) ______, (12) ______:
${formatSourceSeedBlock(leafletSeed, "Cảm hứng Phần 2")}
- Ma trận ĐÚNG 6 điểm kiểm tra cho Câu 7–12:
  + Câu 7: Lượng từ / Từ hạn định (Quantifiers / Determiners: another, other, others, the other, amount of, number of, much, many...)
  + Câu 8: Cụm động từ (Phrasal verbs)
  + Câu 9: Từ nối / Liên từ / Giới từ nối (Linking words: In spite of, Instead of, Due to, Regardless of, In view of...)
  + Câu 10: Từ vựng theo ngữ cảnh 1 (Contextual vocabulary)
  + Câu 11: Từ vựng theo ngữ cảnh 2 / Collocation
  + Câu 12: Từ vựng theo ngữ cảnh 3 hoặc Phrasal verb theo ngữ cảnh

=== TỪ VỰNG ĐÁNG CHÚ Ý ===
Trích xuất 6–8 từ vựng / collocation / phrasal verb tiêu biểu xuất hiện trong Phần 1 & Phần 2 vào mảng vocabulary.`;

    const res = await aiClient.generate({
        systemInstruction: SYSTEM_INSTRUCTION_ENGLISH_2026,
        prompt,
        responseSchema: PASS1_SCHEMA
    });

    const parsed = parseRobustJson(res.text);
    const p1 = parsed.part1 || {};
    const p2 = parsed.part2 || {};

    return {
        modelUsed: `${res.provider}/${res.model}`,
        part1: {
            instruction:
                p1.instruction ||
                "Read the following announcement and mark the letter A, B, C, or D on your answer sheet to indicate the option that best fits each of the numbered blanks from 1 to 6.",
            title: String(p1.title || "Community Announcement").trim(),
            subtitle: String(p1.subtitle || "").trim(),
            passage: String(p1.passage || "").trim(),
            source: {
                sourceId: adSeed.sourceId,
                sourceName: adSeed.sourceName,
                sourceUrl: adSeed.sourceUrl || "",
                originalTitle: adSeed.title,
                category: adSeed.category
            },
            questions: normalizeQuestionList(p1.questions, 1, 6, "Advertisement Cloze")
        },
        part2: {
            instruction:
                p2.instruction ||
                "Read the following leaflet and mark the letter A, B, C, or D on your answer sheet to indicate the option that best fits each of the numbered blanks from 7 to 12.",
            title: String(p2.title || "Practical Guide & Leaflet").trim(),
            subtitle: String(p2.subtitle || "").trim(),
            passage: String(p2.passage || "").trim(),
            source: {
                sourceId: leafletSeed.sourceId,
                sourceName: leafletSeed.sourceName,
                sourceUrl: leafletSeed.sourceUrl || "",
                originalTitle: leafletSeed.title,
                category: leafletSeed.category
            },
            questions: normalizeQuestionList(p2.questions, 7, 6, "Leaflet Cloze")
        },
        vocabulary: normalizeVocabList(parsed.vocabulary, "Câu 1–12")
    };
}

export async function compilePass2ArrangementAndCloze(aiClient, clozeSeed, diffCfg, avoidPreviews) {
    const prompt = `LƯỢT 2/4 — Biên soạn PHẦN 3 (Câu 13–17: Sắp xếp tạo hội thoại, thư và đoạn văn) và PHẦN 4 (Câu 18–22: Đọc điền khuyết câu / mệnh đề vào đoạn văn) chuẩn QĐ 764/QĐ-BGDĐT.

Mức độ yêu cầu: ${diffCfg.label} (${diffCfg.cefr}) — ${diffCfg.guidance}
Nội dung lịch sử cần tránh trùng: ${avoidPreviews.slice(0, 6).join(" | ") || "Không có"}.

=== YÊU CẦU PHẦN 3 (Câu 13–17: 5 câu Sắp xếp) ===
- Câu 13 (subtype="dialogue_short"): Hội thoại ngắn gồm ĐÚNG 3 lượt lời a, b, c (mỗi lượt ghi rõ tên nhân vật, VD: "Nam: ...", "Lan: ...").
- Câu 14 (subtype="dialogue_long"): Hội thoại mở rộng gồm ĐÚNG 5 lượt lời a, b, c, d, e (giao tiếp tự nhiên về học tập, lối sống xanh, hướng nghiệp hoặc công nghệ).
- Câu 15 (subtype="letter"): Lá thư/email chuẩn mẫu BGDĐT — BẮT BUỘC điền đầy đủ \`salutation\` (VD: "Dear Alex,") và \`signOff\` (VD: "Best regards,\nMinh") đặt ngoài 5 câu thân thư a, b, c, d, e (KHÔNG gộp "Dear..." hay "Best regards" vào trong 5 câu a–e).
- Câu 16 (subtype="paragraph_1"): Đoạn văn mạch lạc gồm ĐÚNG 5 câu a, b, c, d, e (về giáo dục, môi trường hoặc kỹ năng sống).
- Câu 17 (subtype="paragraph_2"): Đoạn văn nghị luận/phân tích gồm ĐÚNG 5 câu a, b, c, d, e (chủ đề khác hoàn toàn Câu 16).
- QUAN TRỌNG: Hệ thống sẽ tự động xáo trộn vị trí hiển thị a–e bằng CSPRNG sau khi bạn trả về. Do đó, hãy bảo đảm chuỗi đáp án đúng (\`option\` ứng với \`correctOption\`) tương ứng chính xác 100% với thứ tự logic hoàn hảo của các câu trong \`items\`. Trong \`explanationVi\`, giải thích ngắn gọn mạch liên kết (câu mở đầu → phát triển → kết luận) mà không phụ thuộc cứng vào chữ cái trước khi xáo trộn.

=== YÊU CẦU PHẦN 4 (Câu 18–22: Sentence / Clause Insertion Cloze) ===
- BẮT BUỘC chuyển thể sát nội dung khoa học/thực tế từ BÀI VIẾT THẬT sau thành 1 bài đọc liền mạch (~210–260 từ) có ĐÚNG 5 chỗ trống (18) ______, (19) ______, (20) ______, (21) ______, (22) ______:
${formatSourceSeedBlock(clozeSeed, "Bài viết thật #1 cho Câu 18–22")}
- 5 câu 18–22 kiểm tra ĐỦ 4 mảng chuẩn QĐ 764:
  + Mệnh đề quan hệ (defining / non-defining relative clause: ", which ...", "whose ...")
  + Cấu trúc câu / Động từ chính chia thì hòa hợp chủ ngữ (Main verb / Independent clause)
  + Mệnh đề phân từ (Present/Past/Perfect participle clause đồng chủ ngữ với mệnh đề chính)
  + Mạch liên kết câu / Câu hoàn chỉnh triển khai ý hoặc tương phản
- Trường \`prompt\` cho câu 18–22 để chuỗi rỗng "". 4 phương án A, B, C, D là các mệnh đề/câu đầy đủ có độ dài tương đồng.

=== TỪ VỰNG ĐÁNG CHÚ Ý ===
Trích xuất 6–8 từ vựng / cấu trúc / collocation tiêu biểu của Phần 3 & Phần 4 vào mảng vocabulary.`;

    const res = await aiClient.generate({
        systemInstruction: SYSTEM_INSTRUCTION_ENGLISH_2026,
        prompt,
        responseSchema: PASS2_SCHEMA
    });

    const parsed = parseRobustJson(res.text);
    const p3 = parsed.part3 || {};
    const p4 = parsed.part4 || {};

    return {
        modelUsed: `${res.provider}/${res.model}`,
        part3: {
            instruction:
                p3.instruction ||
                "Mark the letter A, B, C, or D on your answer sheet to indicate the best arrangement of utterances or sentences to make a meaningful exchange or text in each of the following questions from 13 to 17.",
            questions: normalizeArrangementList(p3.questions)
        },
        part4: {
            instruction:
                p4.instruction ||
                "Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the option that best fits each of the numbered blanks from 18 to 22.",
            title: String(p4.title || clozeSeed.title || "Reading Cloze Passage").trim(),
            passage: String(p4.passage || "").trim(),
            source: {
                sourceId: clozeSeed.sourceId,
                sourceName: clozeSeed.sourceName,
                sourceUrl: clozeSeed.sourceUrl || "",
                originalTitle: clozeSeed.title,
                category: clozeSeed.category
            },
            questions: normalizeQuestionList(p4.questions, 18, 5, "Sentence / Clause Cloze")
        },
        vocabulary: normalizeVocabList(parsed.vocabulary, "Câu 13–22")
    };
}

export async function compilePass3ShortReading(aiClient, shortSeed, diffCfg, avoidPreviews) {
    const prompt = `LƯỢT 3/4 — Biên soạn PHẦN 5 (Câu 23–30: Đọc hiểu đoạn ngắn ~250–300 từ · 8 câu hỏi) chuẩn QĐ 764/QĐ-BGDĐT.

Mức độ yêu cầu: ${diffCfg.label} (${diffCfg.cefr}) — ${diffCfg.guidance}
Nội dung lịch sử cần tránh trùng: ${avoidPreviews.slice(0, 6).join(" | ") || "Không có"}.

=== NGUỒN BÀI VIẾT THẬT #2 (BẮT BUỘC BÁM SÁT THÔNG TIN THỰC TẾ) ===
${formatSourceSeedBlock(shortSeed, "Bài viết thật #2 cho Câu 23–30")}

=== YÊU CẦU BÀI ĐỌC (paragraphs) ===
- Viết mảng \`paragraphs\` gồm ĐÚNG 4 đoạn văn tiếng Anh tự nhiên, mạch lạc, tổng độ dài khoảng **250–300 từ** bám sát nội dung bài viết thật ở trên.
- BẮT BUỘC đánh dấu rõ ngay trong văn bản các đoạn văn:
  + Bọc bằng **...** đúng 1 từ/cụm cho Câu 24 (OPPOSITE), đúng 1 đại từ cho Câu 25 (refer to), và đúng 1 từ/cụm cho Câu 26 (CLOSEST).
  + Bọc bằng __...__ đúng 1 câu hoàn chỉnh dùng cho Câu 27 (Paraphrase).
- Đồng thời, ở Câu 24, 25, 26, 27 PHẢI điền chính xác \`targetPhrase\` (nguyên văn từ/đại từ/câu đó trong đoạn văn) và \`targetParagraph\` (số đoạn 1–4) để hệ thống kiểm chứng tự động.

=== MA TRẬN BẮT BUỘC ĐÚNG 8 CÂU (Câu 23–30) ===
- Câu 23 (NOT mentioned): "Which of the following is NOT mentioned as ...?"
- Câu 24 (OPPOSITE in meaning): "The word **X** in paragraph ... is OPPOSITE in meaning to ______."
- Câu 25 (Pronoun reference): "The word **they/it/their/this...** in paragraph ... refers to ______."
- Câu 26 (CLOSEST in meaning): "The word **Y** in paragraph ... could be best replaced by ______."
- Câu 27 (Paraphrase): "Which of the following best paraphrases the underlined sentence in paragraph ...?"
- Câu 28 (TRUE information): "Which of the following is TRUE according to the passage?"
- Câu 29 (Paragraph location 1): "In which paragraph does the writer mention ...?" (4 phương án: Paragraph 1 / Paragraph 2 / Paragraph 3 / Paragraph 4)
- Câu 30 (Paragraph location 2): "In which paragraph does the writer explore/discuss ...?" (4 phương án: Paragraph 1 / Paragraph 2 / Paragraph 3 / Paragraph 4)

=== TỪ VỰNG ĐÁNG CHÚ Ý ===
Trích xuất 6–8 từ vựng / collocation học thuật đắt giá từ bài đọc vào mảng vocabulary.`;

    const res = await aiClient.generate({
        systemInstruction: SYSTEM_INSTRUCTION_ENGLISH_2026,
        prompt,
        responseSchema: PASS3_SCHEMA
    });

    const parsed = parseRobustJson(res.text);
    const p5 = parsed.part5 || {};
    const rawParagraphs = Array.isArray(p5.paragraphs)
        ? p5.paragraphs.map((p) => String(p || "").trim()).filter(Boolean)
        : [];
    if (rawParagraphs.length < 2) {
        throw new Error("Phần 5 (Đọc hiểu ngắn) không trả về đủ đoạn văn.");
    }

    const questions = normalizeQuestionList(p5.questions, 23, 8, "Short Reading");
    const paragraphs = ensureReadingPassageHighlights(rawParagraphs, questions);

    return {
        modelUsed: `${res.provider}/${res.model}`,
        part5: {
            instruction:
                p5.instruction ||
                "Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the best answer to each of the following questions from 23 to 30.",
            title: String(p5.title || shortSeed.title || "Reading Passage 1").trim(),
            paragraphs,
            source: {
                sourceId: shortSeed.sourceId,
                sourceName: shortSeed.sourceName,
                sourceUrl: shortSeed.sourceUrl || "",
                originalTitle: shortSeed.title,
                category: shortSeed.category
            },
            questions
        },
        vocabulary: normalizeVocabList(parsed.vocabulary, "Câu 23–30")
    };
}

export async function compilePass4LongReading(aiClient, longSeed, diffCfg, avoidPreviews) {
    const prompt = `LƯỢT 4/4 — Biên soạn PHẦN 6 (Câu 31–40: Đọc hiểu đoạn dài ~350–450 từ · 10 câu hỏi) chuẩn QĐ 764/QĐ-BGDĐT.

Mức độ yêu cầu: ${diffCfg.label} (${diffCfg.cefr}) — ${diffCfg.guidance}
Nội dung lịch sử cần tránh trùng: ${avoidPreviews.slice(0, 6).join(" | ") || "Không có"}.

=== NGUỒN BÀI VIẾT THẬT #3 (BẮT BUỘC BÁM SÁT THÔNG TIN THỰC TẾ) ===
${formatSourceSeedBlock(longSeed, "Bài viết thật #3 cho Câu 31–40")}

=== YÊU CẦU BÀI ĐỌC (paragraphs) ===
- Viết mảng \`paragraphs\` gồm ĐÚNG 4 đoạn văn tiếng Anh học thuật chiều sâu, tổng độ dài khoảng **350–450 từ** bám sát nội dung bài viết thật ở trên.
- BẮT BUỘC chèn chính xác ngay trong văn bản các đoạn văn:
  + Đúng 4 vị trí **[I]**, **[II]**, **[III]**, **[IV]** (đặt rõ ràng tại 4 ranh giới câu tự nhiên trong Đoạn 1 hoặc Đoạn 2 — chỉ rõ số đoạn trong Câu 31) phục vụ Câu 31 (Chèn câu).
  + Bọc bằng **...** đúng 1 từ/cụm cho Câu 32 (CLOSEST), đúng 1 đại từ cho Câu 33 (refer to), và đúng 1 từ/cụm cho Câu 36 (OPPOSITE).
  + Bọc bằng __...__ đúng 1 câu hoàn chỉnh giàu ý nghĩa cho Câu 38 (Paraphrase).
- Đồng thời, ở Câu 32, 33, 36, 38 PHẢI điền chính xác \`targetPhrase\` (nguyên văn từ/đại từ/câu đó trong đoạn văn) và \`targetParagraph\` (số đoạn 1–4) để hệ thống tự kiểm chứng.

=== MA TRẬN BẮT BUỘC ĐÚNG 10 CÂU (Câu 31–40) ===
- Câu 31 (Sentence insertion): "Where in paragraph ... does the following sentence best fit? \"...\"" (4 phương án: [I], [II], [III], [IV])
- Câu 32 (CLOSEST in meaning): "The phrase/word **X** in paragraph ... could be best replaced by ______."
- Câu 33 (Pronoun reference): "The word **they/it/its/these...** in paragraph ... refers to ______."
- Câu 34 (NOT mentioned / NOT true): "According to paragraph ..., which of the following is NOT ...?"
- Câu 35 (Paragraph summary): "Which of the following best summarises paragraph ...?"
- Câu 36 (OPPOSITE in meaning): "The word **Y** in paragraph ... is OPPOSITE in meaning to ______."
- Câu 37 (TRUE information): "Which of the following is TRUE according to the passage?"
- Câu 38 (Paraphrase): "Which of the following best paraphrases the underlined sentence in paragraph ...?"
- Câu 39 (Inference): "Which of the following can be inferred from the passage?"
- Câu 40 (Main idea / Passage summary): "Which of the following best summarises the passage?"

=== TỪ VỰNG ĐÁNG CHÚ Ý ===
Trích xuất 6–8 từ vựng / collocation / academic expression tiêu biểu nhất của bài đọc dài vào mảng vocabulary.`;

    const res = await aiClient.generate({
        systemInstruction: SYSTEM_INSTRUCTION_ENGLISH_2026,
        prompt,
        responseSchema: PASS4_SCHEMA
    });

    const parsed = parseRobustJson(res.text);
    const p6 = parsed.part6 || {};
    const rawParagraphs = Array.isArray(p6.paragraphs)
        ? p6.paragraphs.map((p) => String(p || "").trim()).filter(Boolean)
        : [];
    if (rawParagraphs.length < 2) {
        throw new Error("Phần 6 (Đọc hiểu dài) không trả về đủ đoạn văn.");
    }

    const questions = normalizeQuestionList(p6.questions, 31, 10, "Long Reading");
    const paragraphs = ensureReadingPassageHighlights(rawParagraphs, questions);

    return {
        modelUsed: `${res.provider}/${res.model}`,
        part6: {
            instruction:
                p6.instruction ||
                "Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the best answer to each of the following questions from 31 to 40.",
            title: String(p6.title || longSeed.title || "Reading Passage 2").trim(),
            paragraphs,
            source: {
                sourceId: longSeed.sourceId,
                sourceName: longSeed.sourceName,
                sourceUrl: longSeed.sourceUrl || "",
                originalTitle: longSeed.title,
                category: longSeed.category
            },
            questions
        },
        vocabulary: normalizeVocabList(parsed.vocabulary, "Câu 31–40")
    };
}

async function runPassWithAutoRetry(passLabel, fn, onLog) {
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (err?.code === "MISSING_API_KEY" || err?.status === 401 || err?.status === 403) {
                throw err;
            }
            if (attempt === 0) {
                onLog(`[Tự phục hồi ${passLabel}] Phản hồi chưa chuẩn (${err.message}) → Tự biên soạn lại lượt này...`, "warn");
            }
        }
    }
    throw lastErr;
}

function dedupeVocabulary(list) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
        const key = String(item?.term || "").toLowerCase().trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

/**
 * Grades interactive user answers on the official 10-point THPTQG scale (0.25 pt/question).
 */
export function gradeInteractiveExam(exam, userAnswers = {}) {
    const sections = [
        { id: "part1", qs: exam?.part1?.questions || [] },
        { id: "part2", qs: exam?.part2?.questions || [] },
        { id: "part3", qs: exam?.part3?.questions || [] },
        { id: "part4", qs: exam?.part4?.questions || [] },
        { id: "part5", qs: exam?.part5?.questions || [] },
        { id: "part6", qs: exam?.part6?.questions || [] }
    ];

    let totalQuestions = 0;
    let answeredCount = 0;
    let correctCount = 0;
    const perQuestion = {};
    const sectionBreakdown = [];

    for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        const meta = EXAM_SECTIONS_META[i];
        let secCorrect = 0;
        let secAnswered = 0;

        for (const q of sec.qs) {
            totalQuestions++;
            const qNum = Number(q.number);
            const chosen = userAnswers[qNum] ? String(userAnswers[qNum]).toUpperCase() : "";
            const correct = sanitizeOptionLetter(q.correctOption, "A");
            const isCorrect = Boolean(chosen && chosen === correct);
            if (chosen) {
                answeredCount++;
                secAnswered++;
            }
            if (isCorrect) {
                correctCount++;
                secCorrect++;
            }
            perQuestion[qNum] = { chosen, correct, isCorrect };
        }

        sectionBreakdown.push({
            id: sec.id,
            shortTitle: meta?.shortTitle || sec.id,
            range: meta?.range || "",
            correct: secCorrect,
            answered: secAnswered,
            total: sec.qs.length,
            points: Number((secCorrect * 0.25).toFixed(2)),
            maxPoints: Number((sec.qs.length * 0.25).toFixed(2))
        });
    }

    return {
        totalQuestions,
        answeredCount,
        correctCount,
        wrongCount: Math.max(0, totalQuestions - correctCount),
        score: Number((correctCount * 0.25).toFixed(2)),
        maxScore: Number((totalQuestions * 0.25).toFixed(2)),
        sectionBreakdown,
        perQuestion
    };
}

/**
 * Full 4-Pass Sequential Pipeline with 128-bit CSPRNG, 3-layer Anti-Duplication,
 * Legacy Format Blocker, Mandatory Arrangement Shuffle, Reading Highlight Guard, and IndexedDB/Cloud Persistence.
 */
export async function runFullEnglishExamPipeline({
    aiClient,
    harvester,
    storage,
    focusMode = "all_mixed",
    difficultyKey = "standard",
    onProgress = () => {},
    onEntropy = () => {},
    onLog = () => {}
}) {
    const startedAt = Date.now();
    const vault = storage.vault;
    const dupsBefore = vault.sessionDuplicatesBlocked || 0;
    const legacyBefore = vault.sessionLegacyRejected || 0;

    const entropyHex = csprngHex(16);
    onEntropy(entropyHex);

    const diffCfg = DIFFICULTY_CONFIG[difficultyKey] || DIFFICULTY_CONFIG.standard;
    const focusCfg = SOURCE_FOCUS_CONFIG[focusMode] || SOURCE_FOCUS_CONFIG.all_mixed;
    const avoidPreviews = (vault.shingleEntries || [])
        .slice(-24)
        .map((s) => s.preview)
        .filter(Boolean);

    const aiInfo = aiClient.getConnectionModeLabel();
    onLog(
        `=== BẮT ĐẦU TẠO ĐỀ TIẾNG ANH 40 CÂU (${diffCfg.label} | ${focusCfg.label} | AI: ${aiInfo.label} | Kho: ${storage.activeVaultKey}) ===`,
        "info"
    );

    // STEP 0: Harvest authentic English articles via /api/harvest + CSPRNG
    onProgress(
        8,
        "Bước 0/4: Đang kéo bài báo & tài liệu Tiếng Anh thật qua /api/harvest...",
        "Wikipedia · OpenAlex · Europe PMC · The Guardian · ScienceDaily · The Conversation · NPR"
    );
    const harvested = await harvester.harvestAllExamSources(focusMode);
    const spares = Array.isArray(harvested.spares) ? [...harvested.spares] : [];

    // SEQUENTIAL PASS 1/4: Q1–12 (Ad/Announcement + Leaflet/Flyer)
    onProgress(
        18,
        "Lượt 1/4 (Tuần tự): Biên soạn Phần 1 (Câu 1–6 Quảng cáo) & Phần 2 (Câu 7–12 Tờ rơi)...",
        `Mức độ ${diffCfg.label} · Tránh timeout Vercel bằng biên soạn tuần tự 4 lượt`
    );
    const pass1 = await runPassWithAutoRetry(
        "Lượt 1/4 (Câu 1–12)",
        () => compilePass1AdAndLeaflet(aiClient, harvested.adThemeSource, harvested.leafletThemeSource, diffCfg, avoidPreviews),
        onLog
    );
    onLog(`[Lượt 1/4] Hoàn tất Câu 1–12 bằng ${pass1.modelUsed}.`, "success");

    // SEQUENTIAL PASS 2/4: Q13–22 (Arrangement 13–17 + Sentence/Clause Cloze 18–22)
    onProgress(
        40,
        "Lượt 2/4 (Tuần tự): Biên soạn Phần 3 (Câu 13–17 Sắp xếp + xáo trộn CSPRNG) & Phần 4 (Câu 18–22)...",
        `Nguồn bài điền khuyết 18–22: ${harvested.clozePassageSource.sourceName}`
    );
    let pass2 = await runPassWithAutoRetry(
        "Lượt 2/4 (Câu 13–22)",
        () => compilePass2ArrangementAndCloze(aiClient, harvested.clozePassageSource, diffCfg, avoidPreviews),
        onLog
    );
    onLog(`[Lượt 2/4] Hoàn tất Câu 13–22 (đã xáo trộn CSPRNG bắt buộc 5 câu Phần 3) bằng ${pass2.modelUsed}.`, "success");

    // SEQUENTIAL PASS 3/4: Q23–30 (Short Reading ~250–300 words)
    onProgress(
        62,
        "Lượt 3/4 (Tuần tự): Biên soạn Phần 5 (Câu 23–30 Đọc hiểu đoạn ngắn ~250–300 từ)...",
        `Nguồn bài đọc ngắn: ${harvested.shortReadingSource.sourceName}`
    );
    let pass3 = await runPassWithAutoRetry(
        "Lượt 3/4 (Câu 23–30)",
        () => compilePass3ShortReading(aiClient, harvested.shortReadingSource, diffCfg, avoidPreviews),
        onLog
    );
    onLog(`[Lượt 3/4] Hoàn tất Câu 23–30 (đã kiểm định in đậm từ khóa & gạch chân Paraphrase) bằng ${pass3.modelUsed}.`, "success");

    // SEQUENTIAL PASS 4/4: Q31–40 (Long Reading ~350–450 words + [I]-[IV])
    onProgress(
        82,
        "Lượt 4/4 (Tuần tự): Biên soạn Phần 6 (Câu 31–40 Đọc hiểu đoạn dài ~350–450 từ)...",
        `Nguồn bài đọc dài: ${harvested.longReadingSource.sourceName}`
    );
    let pass4 = await runPassWithAutoRetry(
        "Lượt 4/4 (Câu 31–40)",
        () => compilePass4LongReading(aiClient, harvested.longReadingSource, diffCfg, avoidPreviews),
        onLog
    );
    onLog(`[Lượt 4/4] Hoàn tất Câu 31–40 (đã kiểm định [I]–[IV], từ khóa & gạch chân Paraphrase) bằng ${pass4.modelUsed}.`, "success");

    // FINAL VERIFICATION: 3-Layer Dedup (Source ID + SHA-256 + 3-Gram Jaccard) + GDPT 2018 Guard
    onProgress(
        94,
        "Kiểm định chống trùng lặp 3 lớp (Source ID · SHA-256 · 3-Gram Jaccard) & Lưu IndexedDB...",
        "Đảm bảo 0% câu Phát âm / Trọng âm / Tìm lỗi sai cũ và khóa dấu vân tay vào Kho"
    );

    const batchHashes = new Set();
    const batchShingles = [];
    const lockHashes = [];
    const lockNormTexts = [];

    const verifySectionUnit = async (label, textBody, regenerateFn) => {
        let check = await evaluateContentIntegrity(textBody, vault, batchHashes, batchShingles);
        if (!check.ok && typeof regenerateFn === "function" && spares.length > 0) {
            onLog(`[Kiểm định ${label}] ${check.reason} → Đang tự động bốc nguồn dự phòng biên soạn lại...`, "warn");
            try {
                const newText = await regenerateFn(spares.shift());
                const retryCheck = await evaluateContentIntegrity(newText, vault, batchHashes, batchShingles);
                if (retryCheck.ok) check = retryCheck;
            } catch {
                // keep existing content if retry fails
            }
        }
        const finalHash = check.hash || (await sha256Hex(textBody));
        const finalNorm = check.normText || normalizeTextForHash(textBody).slice(0, 480);
        const finalShingles = check.shingles || extractShinglesFromNormalized(finalNorm, 3);
        batchHashes.add(finalHash);
        batchShingles.push(finalShingles);
        lockHashes.push(finalHash);
        lockNormTexts.push(finalNorm);
    };

    await verifySectionUnit("Phần 1 (Quảng cáo 1–6)", `${pass1.part1.title} ${pass1.part1.passage}`);
    await verifySectionUnit("Phần 2 (Tờ rơi 7–12)", `${pass1.part2.title} ${pass1.part2.passage}`);
    await verifySectionUnit(
        "Phần 3 (Sắp xếp 13–17)",
        pass2.part3.questions.map((q) => (q.items || []).map((i) => i.text).join(" ")).join(" ")
    );
    await verifySectionUnit(
        "Phần 4 (Điền khuyết 18–22)",
        `${pass2.part4.title} ${pass2.part4.passage} ${pass2.part4.questions.map((q) => q.prompt).join(" ")}`,
        async (spareSrc) => {
            const regen = await compilePass2ArrangementAndCloze(aiClient, spareSrc, diffCfg, avoidPreviews);
            pass2 = { ...pass2, part4: regen.part4 };
            return `${pass2.part4.title} ${pass2.part4.passage}`;
        }
    );
    await verifySectionUnit(
        "Phần 5 (Đọc ngắn 23–30)",
        `${pass3.part5.title} ${pass3.part5.paragraphs.join(" ")} ${pass3.part5.questions.map((q) => q.prompt).join(" ")}`,
        async (spareSrc) => {
            pass3 = await compilePass3ShortReading(aiClient, spareSrc, diffCfg, avoidPreviews);
            return `${pass3.part5.title} ${pass3.part5.paragraphs.join(" ")}`;
        }
    );
    await verifySectionUnit(
        "Phần 6 (Đọc dài 31–40)",
        `${pass4.part6.title} ${pass4.part6.paragraphs.join(" ")} ${pass4.part6.questions.map((q) => q.prompt).join(" ")}`,
        async (spareSrc) => {
            pass4 = await compilePass4LongReading(aiClient, spareSrc, diffCfg, avoidPreviews);
            return `${pass4.part6.title} ${pass4.part6.paragraphs.join(" ")}`;
        }
    );

    const sourcesUsed = [
        { section: "Phần 1 (Câu 1–6)", ...pass1.part1.source },
        { section: "Phần 2 (Câu 7–12)", ...pass1.part2.source },
        { section: "Phần 4 (Câu 18–22)", ...pass2.part4.source },
        { section: "Phần 5 (Câu 23–30)", ...pass3.part5.source },
        { section: "Phần 6 (Câu 31–40)", ...pass4.part6.source }
    ];

    const allVocabulary = dedupeVocabulary([
        ...pass1.vocabulary,
        ...pass2.vocabulary,
        ...pass3.vocabulary,
        ...pass4.vocabulary
    ]);

    const allQuestions = [
        ...pass1.part1.questions,
        ...pass1.part2.questions,
        ...pass2.part3.questions,
        ...pass2.part4.questions,
        ...pass3.part5.questions,
        ...pass4.part6.questions
    ];

    const examId = `eng_${Date.now()}_${csprngHex(3)}`;
    const examCode = String(csprngInt(401, 999));
    const createdAt = Date.now();
    const elapsedSec = ((createdAt - startedAt) / 1000).toFixed(1);

    const batchDupsBlocked = Math.max(0, (vault.sessionDuplicatesBlocked || 0) - dupsBefore);
    const batchLegacyRejected = Math.max(0, (vault.sessionLegacyRejected || 0) - legacyBefore);
    vault.sessionDuplicatesBlocked = dupsBefore;
    vault.sessionLegacyRejected = legacyBefore;

    const rssCount = sourcesUsed.filter((s) => s.category === "rss" || isNewsRssSourceId(s.sourceId)).length;
    const academicCount = Math.max(0, sourcesUsed.length - rssCount);

    const examDoc = {
        vaultKey: storage.activeVaultKey,
        examId,
        examCode,
        createdAt,
        aiModelUsed: pass4.modelUsed || pass1.modelUsed,
        difficulty: difficultyKey,
        difficultyLabel: diffCfg.label,
        cefr: diffCfg.cefr,
        focusMode,
        focusLabel: focusCfg.label,
        durationMinutes: 50,
        totalQuestions: allQuestions.length,
        rssSourceCount: rssCount,
        academicSourceCount: academicCount,
        sourcesUsed,
        part1: pass1.part1,
        part2: pass1.part2,
        part3: pass2.part3,
        part4: pass2.part4,
        part5: pass3.part5,
        part6: pass4.part6,
        vocabulary: allVocabulary,
        answerKey: allQuestions.map((q) => ({ number: q.number, answer: q.correctOption })),
        harvestSummary: {
            entropyHex: entropyHex.slice(0, 16),
            duplicatesBlocked: batchDupsBlocked,
            legacyRejected: batchLegacyRejected,
            elapsedSec: Number(elapsedSec)
        }
    };

    const fpDoc = {
        vaultKey: storage.activeVaultKey,
        examId,
        createdAt,
        sourceIds: sourcesUsed.map((s) => s.sourceId).filter(Boolean),
        hashes: lockHashes,
        normalizedTexts: lockNormTexts,
        duplicatesBlocked: batchDupsBlocked,
        legacyRejected: batchLegacyRejected
    };

    await storage.saveExamAndFingerprints(examDoc, fpDoc);

    onProgress(
        100,
        `Hoàn tất 100% trong ${elapsedSec}s! Đề 40 câu đã được lưu vĩnh viễn vào Kho.`,
        `Mã đề ${examCode} · 40 câu / 50 phút · ${diffCfg.label} · ${examDoc.aiModelUsed}`
    );
    onLog(`=== HOÀN TẤT MÃ ĐỀ ${examCode} (40 câu · ${allVocabulary.length} từ vựng/collocations · ${elapsedSec}s) ===`, "success");

    return examDoc;
}
