import { cleanClozeQuestionPrompt, ensureReadingPassageHighlights } from "./exam-pipeline.js";

/**
 * Plain-Text Serializers for Mobile-Safe Split Copy Buttons
 * (Copy Câu 1–17, Copy Câu 18–30, Copy Câu 31–40, Copy Đáp án & Giải thích)
 * and Clean UTF-8 .txt Exam Export.
 */

export function formatPassageForPlainText(text) {
    const blanks = [];
    let s = String(text || "").replace(/\((\d{1,2})\)\s*_{2,}/g, (_, n) => {
        const idx = blanks.length;
        blanks.push(`(${n}) ______`);
        return `\uE000CLOZE${idx}\uE001`;
    });
    s = s
        .replace(/<u>([\s\S]*?)<\/u>/gi, "«$1»")
        .replace(/(^|[^_])__(?!_|\s)([^_]+?)__(?!_)/g, "$1«$2»")
        .replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi, "**$1**")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return s.replace(/\uE000CLOZE(\d+)\uE001/g, (_, idx) => blanks[Number(idx)] || "");
}

export function getAllExamQuestions(exam) {
    if (!exam) return [];
    return [
        ...(exam.part1?.questions || []),
        ...(exam.part2?.questions || []),
        ...(exam.part3?.questions || []),
        ...(exam.part4?.questions || []),
        ...(exam.part5?.questions || []),
        ...(exam.part6?.questions || [])
    ].sort((a, b) => Number(a.number) - Number(b.number));
}

function formatMcqQuestionTxt(q) {
    const cleanStem = cleanClozeQuestionPrompt(q.prompt, q.number);
    const header = cleanStem ? `Question ${q.number}. ${formatPassageForPlainText(cleanStem)}` : `Question ${q.number}.`;
    const opts = [q.optionA || "", q.optionB || "", q.optionC || "", q.optionD || ""];
    const maxLen = Math.max(...opts.map((o) => o.length));

    if (maxLen <= 20) {
        return `${header}\nA. ${opts[0]}    B. ${opts[1]}    C. ${opts[2]}    D. ${opts[3]}`;
    }
    return [
        header,
        `A. ${opts[0]}`,
        `B. ${opts[1]}`,
        `C. ${opts[2]}`,
        `D. ${opts[3]}`
    ].join("\n");
}

function formatArrangementQuestionTxt(q) {
    const lines = [`Question ${q.number}.`];
    if (q.salutation) lines.push(q.salutation);
    for (const it of q.items || []) {
        lines.push(`${it.label}. ${it.text}`);
    }
    if (q.signOff) lines.push(q.signOff);
    lines.push(`A. ${q.optionA || ""}   B. ${q.optionB || ""}   C. ${q.optionC || ""}   D. ${q.optionD || ""}`);
    return lines.join("\n");
}

function formatSourceLine(src) {
    if (!src || !src.sourceName) return "";
    return src.sourceUrl
        ? `[Nguồn ngữ liệu: ${src.sourceName} — ${src.sourceUrl}]`
        : `[Nguồn ngữ liệu: ${src.sourceName}]`;
}

export function buildSectionText(exam, sectionId) {
    if (!exam || !exam[sectionId]) return "";
    const sec = exam[sectionId];

    if (sectionId === "part1") {
        const lines = [
            sec.instruction || "",
            "",
            (sec.title || "").toUpperCase(),
            sec.subtitle ? sec.subtitle : "",
            formatPassageForPlainText(sec.passage),
            "",
            (sec.questions || []).map(formatMcqQuestionTxt).join("\n\n")
        ].filter((v, idx) => idx === 1 || idx === 5 || v !== "");
        return lines.join("\n").trim();
    }

    if (sectionId === "part2") {
        const lines = [
            sec.instruction || "",
            "",
            (sec.title || "").toUpperCase(),
            sec.subtitle ? sec.subtitle : "",
            formatPassageForPlainText(sec.passage),
            "",
            (sec.questions || []).map(formatMcqQuestionTxt).join("\n\n")
        ].filter((v, idx) => idx === 1 || idx === 5 || v !== "");
        return lines.join("\n").trim();
    }

    if (sectionId === "part3") {
        const lines = [
            sec.instruction || "",
            "",
            (sec.questions || []).map(formatArrangementQuestionTxt).join("\n\n")
        ];
        return lines.join("\n").trim();
    }

    if (sectionId === "part4") {
        const srcLine = formatSourceLine(sec.source);
        const lines = [
            sec.instruction || "",
            srcLine,
            "",
            (sec.title || "").toUpperCase(),
            formatPassageForPlainText(sec.passage),
            "",
            (sec.questions || []).map(formatMcqQuestionTxt).join("\n\n")
        ].filter(Boolean);
        return lines.join("\n").trim();
    }

    if (sectionId === "part5" || sectionId === "part6") {
        const srcLine = formatSourceLine(sec.source);
        const safeParas = ensureReadingPassageHighlights(sec.paragraphs || [], sec.questions || []);
        const body = safeParas.map(formatPassageForPlainText).join("\n\n");
        const lines = [
            sec.instruction || "",
            srcLine,
            "",
            (sec.title || "").toUpperCase(),
            body,
            "",
            (sec.questions || []).map(formatMcqQuestionTxt).join("\n\n")
        ].filter(Boolean);
        return lines.join("\n").trim();
    }

    return "";
}

/** Mobile-Safe Copy Slice 1: Câu 1–17 */
export function buildSlice1To17Text(exam) {
    if (!exam) return "";
    return [
        `KỲ THI TỐT NGHIỆP THPT NĂM 2026 — MÔN TIẾNG ANH (QĐ 764/QĐ-BGDĐT) — MÃ ĐỀ ${exam.examCode || "401"}`,
        `Mức độ: ${exam.difficultyLabel || "Chuẩn BGD (B1–B2)"} | Thời gian: 50 phút | CÂU 1–17`,
        "----------------------------------------------------------------------",
        "",
        buildSectionText(exam, "part1"),
        "",
        buildSectionText(exam, "part2"),
        "",
        buildSectionText(exam, "part3")
    ].join("\n").trim();
}

/** Mobile-Safe Copy Slice 2: Câu 18–30 */
export function buildSlice18To30Text(exam) {
    if (!exam) return "";
    return [
        `ĐỀ THI THỬ THPTQG 2026 MÔN TIẾNG ANH — MÃ ĐỀ ${exam.examCode || "401"} | CÂU 18–30`,
        "----------------------------------------------------------------------",
        "",
        buildSectionText(exam, "part4"),
        "",
        buildSectionText(exam, "part5")
    ].join("\n").trim();
}

/** Mobile-Safe Copy Slice 3: Câu 31–40 */
export function buildSlice31To40Text(exam) {
    if (!exam) return "";
    return [
        `ĐỀ THI THỬ THPTQG 2026 MÔN TIẾNG ANH — MÃ ĐỀ ${exam.examCode || "401"} | CÂU 31–40`,
        "----------------------------------------------------------------------",
        "",
        buildSectionText(exam, "part6")
    ].join("\n").trim();
}

/** Mobile-Safe Copy Slice 4: Đáp án, Giải thích Tiếng Việt & Từ vựng/Collocations */
export function buildAnswersAndExplanationsText(exam) {
    if (!exam) return "";
    const allQs = getAllExamQuestions(exam);

    const keyRows = [];
    for (let i = 0; i < allQs.length; i += 10) {
        const chunk = allQs
            .slice(i, i + 10)
            .map((q) => `${String(q.number).padStart(2, "0")}.${q.correctOption}`)
            .join(" | ");
        keyRows.push(chunk);
    }

    const explanations = allQs.map(
        (q) => `Câu ${q.number} (${q.correctOption}) [${q.skillTag || "Ngữ pháp/Đọc hiểu"}]: ${q.explanationVi || ""}`
    );

    const vocabLines = (exam.vocabulary || []).map(
        (v, idx) =>
            `${idx + 1}. ${v.term} (${v.pos}, ${v.cefr}) [${v.section || "Đề thi"}]: ${v.meaningVi}${v.example ? ` — VD: "${v.example}"` : ""}`
    );

    return [
        `BẢNG ĐÁP ÁN & GIẢI THÍCH CHI TIẾT — MÃ ĐỀ ${exam.examCode || "401"}`,
        `Mức độ: ${exam.difficultyLabel || "Chuẩn BGD (B1–B2)"} | 40 câu (0,25 điểm/câu = 10,0 điểm)`,
        "======================================================================",
        "",
        "I. BẢNG ĐÁP ÁN NHANH (40 CÂU)",
        ...keyRows,
        "",
        "II. GIẢI THÍCH CHI TIẾT BẰNG TIẾNG VIỆT",
        ...explanations,
        "",
        "III. DANH SÁCH TỪ VỰNG & COLLOCATIONS ĐÁNG CHÚ Ý",
        ...(vocabLines.length > 0 ? vocabLines : ["(Không có mục từ vựng bổ sung)"])
    ].join("\n").trim();
}

/** Complete Clean UTF-8 .txt Exam Document */
export function buildFullTxtExamDocument(exam) {
    if (!exam) return "";
    const sourcesBlock = (exam.sourcesUsed || [])
        .map((s) => `- ${s.section}: ${s.sourceName}${s.sourceUrl ? ` (${s.sourceUrl})` : ""}`)
        .join("\n");

    return [
        "======================================================================",
        "  KỲ THI TỐT NGHIỆP THPT NĂM 2026 — ĐỀ THI THỬ MÔN: TIẾNG ANH",
        "  Cấu trúc GDPT 2018 (QĐ 764/QĐ-BGDĐT) · 40 câu trắc nghiệm · 50 phút",
        `  MÃ ĐỀ THI: ${exam.examCode || "401"} | Mức độ: ${exam.difficultyLabel || "Chuẩn BGD (B1–B2)"}`,
        "======================================================================",
        "",
        buildSectionText(exam, "part1"),
        "",
        buildSectionText(exam, "part2"),
        "",
        buildSectionText(exam, "part3"),
        "",
        buildSectionText(exam, "part4"),
        "",
        buildSectionText(exam, "part5"),
        "",
        buildSectionText(exam, "part6"),
        "",
        "======================================================================",
        "",
        buildAnswersAndExplanationsText(exam),
        "",
        "----------------------------------------------------------------------",
        "NGUỒN NGỮ LIỆU TIẾNG ANH THỰC TẾ ĐÃ SỬ DỤNG:",
        sourcesBlock || "- Tổng hợp nguồn tiếng Anh mở"
    ].join("\n").trim();
}
