import { AI_PROVIDERS, DEFAULT_VAULT_KEY, EXAM_SECTIONS_META, STORAGE_KEYS } from "./config.js";
import { UnifiedAiClient } from "./ai-client.js";
import { VaultStorageManager, parseFirebaseConfigInput } from "./storage.js";
import { EnglishSourceHarvester } from "./harvester.js";
import {
    runFullEnglishExamPipeline,
    gradeInteractiveExam,
    computeAdaptiveOptionLayout,
    cleanClozeQuestionPrompt,
    ensureReadingPassageHighlights
} from "./exam-pipeline.js";
import {
    getAllExamQuestions,
    buildSectionText,
    buildSlice1To17Text,
    buildSlice18To30Text,
    buildSlice31To40Text,
    buildAnswersAndExplanationsText,
    buildFullTxtExamDocument
} from "./export-utils.js";

// =========================================================================
// 1. DOM REFERENCES & UI STATE
// =========================================================================

const $ = (id) => document.getElementById(id);

const dom = {
    // Header
    btnOpenAiTop: $("btnOpenAiTop"),
    topAiDot: $("topAiDot"),
    topAiLabel: $("topAiLabel"),
    btnOpenVaultTop: $("btnOpenVaultTop"),
    topStorageDot: $("topStorageDot"),
    topVaultLabel: $("topVaultLabel"),
    btnJumpHistory: $("btnJumpHistory"),
    topSavedCountBadge: $("topSavedCountBadge"),
    btnToggleTheme: $("btnToggleTheme"),
    iconSun: $("iconSun"),
    iconMoon: $("iconMoon"),

    // Status Strip
    stripDot: $("stripDot"),
    stripText: $("stripText"),
    btnSyncCloud: $("btnSyncCloud"),
    btnOpenVaultBar: $("btnOpenVaultBar"),
    btnQuickExportJson: $("btnQuickExportJson"),
    quickImportFileInput: $("quickImportFileInput"),
    cloudErrorBanner: $("cloudErrorBanner"),
    cloudErrorText: $("cloudErrorText"),
    btnDismissCloudError: $("btnDismissCloudError"),

    // Onboarding Callout
    aiSetupBanner: $("aiSetupBanner"),
    btnSetupAiNow: $("btnSetupAiNow"),

    // Hero Controls
    sourceFocusSelect: $("sourceFocusSelect"),
    difficultySelect: $("difficultySelect"),
    heroAiSummary: $("heroAiSummary"),
    btnChangeAiHero: $("btnChangeAiHero"),
    btnGenerateExam: $("btnGenerateExam"),
    btnGenerateLabel: $("btnGenerateLabel"),
    iconGenerateIdle: $("iconGenerateIdle"),
    iconGenerateSpin: $("iconGenerateSpin"),

    progressContainer: $("progressContainer"),
    progressMessage: $("progressMessage"),
    progressPercent: $("progressPercent"),
    progressBarFill: $("progressBarFill"),
    progressBatchDetail: $("progressBatchDetail"),
    progressEntropyBadge: $("progressEntropyBadge"),

    btnToggleLog: $("btnToggleLog"),
    logPanel: $("logPanel"),
    logChevron: $("logChevron"),
    logCountBadge: $("logCountBadge"),

    // Stats
    statLockedHashes: $("statLockedHashes"),
    statRssSources: $("statRssSources"),
    statAcademicSources: $("statAcademicSources"),
    statBlockedDups: $("statBlockedDups"),
    statSavedExams: $("statSavedExams"),

    // History
    historySection: $("historySection"),
    btnToggleHistoryBody: $("btnToggleHistoryBody"),
    btnCollapseHistory: $("btnCollapseHistory"),
    historyChevron: $("historyChevron"),
    historyPanelBody: $("historyPanelBody"),
    historyPanelBadge: $("historyPanelBadge"),
    historyVaultKeyInline: $("historyVaultKeyInline"),
    historyListContainer: $("historyListContainer"),
    btnClearVaultFromHistory: $("btnClearVaultFromHistory"),

    // Welcome & Exam Workspace
    emptyStateSection: $("emptyStateSection"),
    examWorkspace: $("examWorkspace"),
    examCodeBadge: $("examCodeBadge"),
    examDiffBadge: $("examDiffBadge"),
    examMetaSub: $("examMetaSub"),
    btnDownloadTxt: $("btnDownloadTxt"),
    btnPrintExamOnly: $("btnPrintExamOnly"),
    btnPrintFull: $("btnPrintFull"),
    btnModeView: $("btnModeView"),
    btnModePractice: $("btnModePractice"),
    chkShowTechMeta: $("chkShowTechMeta"),
    toggleInlineAnswerWrap: $("toggleInlineAnswerWrap"),
    chkShowInlineAnswers: $("chkShowInlineAnswers"),

    // Split Copy Buttons
    btnCopySlice1To17: $("btnCopySlice1To17"),
    btnCopySlice18To30: $("btnCopySlice18To30"),
    btnCopySlice31To40: $("btnCopySlice31To40"),
    btnCopySliceAnswers: $("btnCopySliceAnswers"),
    btnCopyAnswersBottom: $("btnCopyAnswersBottom"),
    charSlice1To17: $("charSlice1To17"),
    charSlice18To30: $("charSlice18To30"),
    charSlice31To40: $("charSlice31To40"),
    charSliceAnswers: $("charSliceAnswers"),

    // Practice Interactive Controls
    practiceControlBar: $("practiceControlBar"),
    practiceTimerDisplay: $("practiceTimerDisplay"),
    btnToggleTimer: $("btnToggleTimer"),
    practiceAnsweredBadge: $("practiceAnsweredBadge"),
    btnToggleAnswerSheet: $("btnToggleAnswerSheet"),
    btnResetPractice: $("btnResetPractice"),
    btnSubmitPractice: $("btnSubmitPractice"),
    practiceAnswerSheetDrawer: $("practiceAnswerSheetDrawer"),
    practiceAnswerSheetGrid: $("practiceAnswerSheetGrid"),
    practiceResultBanner: $("practiceResultBanner"),

    // Exam Paper Sheet & Render Targets
    examPaperSheet: $("examPaperSheet"),
    examOfficialHeader: $("examOfficialHeader"),
    examSectionsContainer: $("examSectionsContainer"),
    answersAndVocabSection: $("answersAndVocabSection"),
    btnToggleSolutions: $("btnToggleSolutions"),
    answersContainer: $("answersContainer"),
    examSourcesCollapsible: $("examSourcesCollapsible"),
    examSourcesCountBadge: $("examSourcesCountBadge"),
    examSourcesStrip: $("examSourcesStrip"),

    // AI Modal
    aiSettingsModal: $("aiSettingsModal"),
    serverProxyBadge: $("serverProxyBadge"),
    serverProxyDesc: $("serverProxyDesc"),
    providerCardGrid: $("providerCardGrid"),
    presetModelGroup: $("presetModelGroup"),
    aiModelSelect: $("aiModelSelect"),
    aiCustomModelInput: $("aiCustomModelInput"),
    aiModelHint: $("aiModelHint"),
    customBaseUrlGroup: $("customBaseUrlGroup"),
    aiCustomBaseUrlInput: $("aiCustomBaseUrlInput"),
    aiKeyHelpLink: $("aiKeyHelpLink"),
    aiApiKeyInput: $("aiApiKeyInput"),
    btnToggleKeyVisibility: $("btnToggleKeyVisibility"),
    geminiThinkingGroup: $("geminiThinkingGroup"),
    aiThinkingLevelSelect: $("aiThinkingLevelSelect"),
    chkAutoFallback: $("chkAutoFallback"),
    aiTestResultBox: $("aiTestResultBox"),
    btnTestAiConnection: $("btnTestAiConnection"),
    btnSaveAiSettings: $("btnSaveAiSettings"),

    // Vault Modal
    vaultModal: $("vaultModal"),
    modalStorageStatusBadge: $("modalStorageStatusBadge"),
    vaultKeyInput: $("vaultKeyInput"),
    btnApplyVaultKey: $("btnApplyVaultKey"),
    btnResetDefaultKey: $("btnResetDefaultKey"),
    btnCopyVaultKey: $("btnCopyVaultKey"),
    idbStatusLabel: $("idbStatusLabel"),
    modalFirebaseState: $("modalFirebaseState"),
    firebaseConfigInput: $("firebaseConfigInput"),
    btnConnectFirebase: $("btnConnectFirebase"),
    btnDisconnectFirebase: $("btnDisconnectFirebase"),
    btnModalExportJson: $("btnModalExportJson"),
    modalImportFileInput: $("modalImportFileInput"),
    btnOpenConfirmClearVault: $("btnOpenConfirmClearVault"),

    // Confirm Modal
    confirmModal: $("confirmModal"),
    confirmModalTitle: $("confirmModalTitle"),
    confirmModalBody: $("confirmModalBody"),
    btnConfirmCancel: $("btnConfirmCancel"),
    btnConfirmProceed: $("btnConfirmProceed"),

    toastContainer: $("toastContainer")
};

const STACKED_SHEETS_SVG = `<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

const EXAM_DURATION_SEC = 50 * 60;

const uiState = {
    workspaceMode: "view", // "view" | "practice"
    showTechMeta: false, // Default OFF for clean BGDĐT exam sheet & PDF print
    showInlineAnswers: false,
    showSolutions: true,
    historyExpanded: true,
    isGenerating: false,
    currentExam: null,
    logs: [],
    pendingConfirmAction: null,
    modalDraftProvider: "gemini",
    // Interactive Practice State
    practice: {
        answers: {},
        submitted: false,
        gradeResult: null,
        remainingSec: EXAM_DURATION_SEC,
        timerRunning: false,
        timerHandle: null,
        sheetOpen: false
    }
};

// =========================================================================
// 2. UTILITIES (ESCAPE, FORMATTING, TOAST, LOG, CLIPBOARD, MODALS, THEME)
// =========================================================================

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDateTime(ts) {
    try {
        return new Date(ts).toLocaleString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
    } catch {
        return "";
    }
}

function formatCharCount(str) {
    return `${String(str || "").length.toLocaleString("vi-VN")} ký tự`;
}

function formatTimerMMSS(totalSec) {
    const safe = Math.max(0, Math.floor(totalSec));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Safely renders official English exam typography & highlights:
 * - (1) ______ .. (22) ______ -> seamless inline bold cloze blanks (protected first so underscores never collide)
 * - __sentence__ / <u>sentence</u> -> underlined paraphrase sentence (<u class="paraphrase-underline">)
 * - **word** / <b>word</b> / <strong>word</strong> -> bold highlighted target word/pronoun
 * - [I], [II], [III], [IV] -> clean inline bold insertion markers
 */
function formatEnglishRichHtml(raw) {
    const clozeTokens = [];
    const withProtectedBlanks = String(raw || "").replace(/\((\d{1,2})\)\s*_{2,}/g, (_, num) => {
        const idx = clozeTokens.length;
        clozeTokens.push(num);
        return `\uE000CLOZE${idx}\uE001`;
    });

    let html = escapeHtml(withProtectedBlanks);
    html = html.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/gi, '<u class="paraphrase-underline">$1</u>');
    html = html.replace(/&lt;(?:b|strong)&gt;([\s\S]*?)&lt;\/(?:b|strong)&gt;/gi, '<strong class="target-word">$1</strong>');
    html = html.replace(/(^|[^_])__(?!_|\s)([^_]+?)__(?!_)/g, '$1<u class="paraphrase-underline">$2</u>');
    html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong class="target-word">$1</strong>');
    html = html.replace(/\[(I|II|III|IV)\]/g, '<strong class="insert-marker">[$1]</strong>');
    html = html.replace(/\uE000CLOZE(\d+)\uE001/g, (_, idx) => {
        const num = clozeTokens[Number(idx)] || "";
        return `<span class="cloze-blank">(${num})&nbsp;______</span>`;
    });
    html = html.replace(/\n/g, "<br>");
    return html;
}

function showToast(message, type = "info") {
    const colors = {
        success: "bg-emerald-700 text-white border-emerald-600",
        warn: "bg-amber-600 text-white border-amber-500",
        error: "bg-rose-700 text-white border-rose-600",
        info: "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-700 dark:border-slate-300"
    };
    const el = document.createElement("div");
    el.className = `toast-enter pointer-events-auto px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg border ${colors[type] || colors.info}`;
    el.textContent = message;
    dom.toastContainer.appendChild(el);
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transition = "opacity 0.2s ease";
        setTimeout(() => el.remove(), 220);
    }, 3600);
}

function addLog(message, level = "info") {
    const now = new Date().toLocaleTimeString("vi-VN", { hour12: false });
    const levelClass = {
        info: "text-slate-300",
        success: "text-emerald-400",
        warn: "text-amber-300",
        error: "text-rose-400"
    }[level] || "text-slate-300";

    uiState.logs.push({ time: now, message, levelClass });
    if (uiState.logs.length > 260) uiState.logs.shift();

    dom.logCountBadge.textContent = `${uiState.logs.length} dòng`;
    if (uiState.logs.length === 1) dom.logPanel.innerHTML = "";

    const line = document.createElement("div");
    line.className = "flex gap-2";
    line.innerHTML = `<span class="text-slate-500 shrink-0">[${now}]</span><span class="${levelClass} break-words">${escapeHtml(message)}</span>`;
    dom.logPanel.appendChild(line);
    dom.logPanel.scrollTop = dom.logPanel.scrollHeight;
}

function setProgress(percent, message, batchDetail = "") {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    dom.progressContainer.classList.remove("hidden");
    dom.progressPercent.textContent = `${clamped}%`;
    dom.progressBarFill.style.width = `${clamped}%`;
    if (message) dom.progressMessage.textContent = message;
    if (batchDetail) dom.progressBatchDetail.textContent = batchDetail;
}

function showCloudError(msg) {
    dom.cloudErrorText.textContent = `⚠️ ${msg}`;
    dom.cloudErrorBanner.classList.remove("hidden");
    addLog(`[Cloud] ${msg}`, "error");
}

function clearCloudError() {
    dom.cloudErrorBanner.classList.add("hidden");
}

async function copyTextToClipboard(text, label = "Nội dung") {
    const content = String(text || "");
    if (!content) {
        showToast("Không có nội dung để sao chép.", "warn");
        return false;
    }

    let copied = false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        try {
            await navigator.clipboard.writeText(content);
            copied = true;
        } catch {
            copied = false;
        }
    }

    if (!copied) {
        try {
            const ta = document.createElement("textarea");
            ta.value = content;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.top = "-9999px";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, content.length);
            copied = document.execCommand("copy");
            document.body.removeChild(ta);
        } catch {
            copied = false;
        }
    }

    if (copied) {
        showToast(`Đã sao chép ${label} (${formatCharCount(content)})`, "success");
    } else {
        showToast("Trình duyệt chặn tự động copy. Hãy dùng nút Tải tệp .txt.", "error");
    }
    return copied;
}

function syncThemeIcons() {
    const isDark = document.documentElement.classList.contains("dark");
    dom.iconSun.classList.toggle("hidden", !isDark);
    dom.iconMoon.classList.toggle("hidden", isDark);
}

function openModal(id) {
    const el = $(id);
    if (!el) return;
    el.classList.remove("hidden");
    el.classList.add("flex");
}

function closeModal(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add("hidden");
    el.classList.remove("flex");
}

function openConfirmDialog(title, body, proceedLabel, onProceed) {
    dom.confirmModalTitle.textContent = title;
    dom.confirmModalBody.textContent = body;
    dom.btnConfirmProceed.textContent = proceedLabel || "Xác nhận";
    uiState.pendingConfirmAction = onProceed;
    openModal("confirmModal");
}

// =========================================================================
// 3. CORE SERVICES
// =========================================================================

const aiClient = new UnifiedAiClient({ onLog: addLog });

const storage = new VaultStorageManager({
    onChange: () => updateStorageAndHistoryUI(),
    onLog: addLog,
    onToast: showToast,
    onCloudError: showCloudError
});

const harvester = new EnglishSourceHarvester({
    vault: storage.vault,
    aiClient,
    onLog: addLog,
    onStatsChanged: () => updateStorageAndHistoryUI()
});

// =========================================================================
// 4. AI SETTINGS MODAL
// =========================================================================

function updateAiStatusBadges() {
    const info = aiClient.getConnectionModeLabel();
    const checkingServer = !info.ready && !aiClient.serverHealth.checked;
    dom.topAiDot.className = `w-2 h-2 rounded-full shrink-0 ${info.ready ? "bg-emerald-500" : "bg-amber-500"}`;
    dom.topAiLabel.textContent = info.ready ? info.label : checkingServer ? "Đang kết nối..." : "Cài đặt AI";
    dom.heroAiSummary.textContent = info.ready
        ? `${info.label} (${info.detail})`
        : checkingServer
          ? "Đang kiểm tra Server..."
          : "Chưa có API Key";
    dom.aiSetupBanner.classList.toggle("hidden", info.ready || checkingServer);
}

function renderServerProxyInfoInModal() {
    const h = aiClient.serverHealth;
    if (!h.proxyAvailable) {
        dom.serverProxyBadge.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300";
        dom.serverProxyBadge.textContent = "Chế độ Static (Trình duyệt)";
        dom.serverProxyDesc.textContent =
            "Website đang chạy dạng tĩnh không có /api/ai. Trình duyệt sẽ gọi trực tiếp API của Google Gemini / Groq / OpenRouter bằng Key miễn phí bạn nhập bên dưới.";
        return;
    }

    const activeNames = Object.entries(h.configuredProviders || {})
        .filter(([, ok]) => ok)
        .map(([k]) => AI_PROVIDERS[k]?.shortLabel || k);

    if (activeNames.length > 0) {
        dom.serverProxyBadge.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300";
        dom.serverProxyBadge.textContent = `Proxy sẵn sàng (${activeNames.join(", ")})`;
        dom.serverProxyDesc.textContent =
            `Máy chủ đã đặt sẵn API Key bảo mật cho: ${activeNames.join(", ")}. Bạn có thể tạo đề ngay mà không cần tự nhập Key.`;
    } else {
        dom.serverProxyBadge.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300";
        dom.serverProxyBadge.textContent = "Proxy online · Chưa đặt ENV Key";
        dom.serverProxyDesc.textContent =
            "Endpoint /api/ai và /api/harvest đang hoạt động. Hãy nhập API Key miễn phí bên dưới (hoặc cấu hình GEMINI_API_KEY trong Vercel/Netlify Environment Variables).";
    }
}

function renderAiProviderCards(selectedProvider) {
    dom.providerCardGrid.innerHTML = Object.values(AI_PROVIDERS)
        .map((p) => {
            const isActive = p.id === selectedProvider;
            const hasKey = Boolean(aiClient.getBrowserKey(p.id)) || aiClient.hasServerKeyFor(p.id);
            const activeCls = isActive
                ? "border-sky-600 bg-sky-50/80 dark:bg-sky-950/40 ring-1 ring-sky-600"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800";
            return `
                <button type="button" data-select-provider="${p.id}" class="text-left p-3 rounded-xl border transition cursor-pointer ${activeCls}">
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-xs font-extrabold text-slate-900 dark:text-white">${escapeHtml(p.name)}</span>
                        ${hasKey ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">Sẵn sàng</span>' : ""}
                    </div>
                    <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">${escapeHtml(p.badge)}</p>
                </button>
            `;
        })
        .join("");
}

function syncAiModalFieldsForProvider(providerId) {
    uiState.modalDraftProvider = providerId;
    const cfg = AI_PROVIDERS[providerId] || AI_PROVIDERS.gemini;
    renderAiProviderCards(providerId);

    const savedModel = aiClient.settings.models?.[providerId] || cfg.defaultModel;
    const isCustom = providerId === "custom";

    dom.presetModelGroup.classList.toggle("hidden", isCustom);
    dom.customBaseUrlGroup.classList.toggle("hidden", !isCustom);
    dom.geminiThinkingGroup.classList.toggle("hidden", providerId !== "gemini");

    if (!isCustom) {
        dom.aiModelSelect.innerHTML = cfg.models
            .map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.label)}</option>`)
            .join("");

        const matched = cfg.models.find((m) => m.id === savedModel);
        if (matched) {
            dom.aiModelSelect.value = matched.id;
            dom.aiCustomModelInput.value = "";
            dom.aiModelHint.textContent = matched.hint;
        } else {
            dom.aiModelSelect.value = cfg.models[0]?.id || "";
            dom.aiCustomModelInput.value = savedModel;
            dom.aiModelHint.textContent = `Đang dùng Model ID tùy chỉnh: ${savedModel}`;
        }
    } else {
        dom.aiCustomModelInput.value = savedModel || "";
        dom.aiCustomBaseUrlInput.value = aiClient.settings.customBaseUrl || "";
        dom.aiModelHint.textContent = "Nhập Base URL chuẩn OpenAI (VD: https://api.cerebras.ai/v1) và tên model.";
    }

    dom.aiApiKeyInput.value = aiClient.settings.keys?.[providerId] || "";
    dom.aiApiKeyInput.placeholder = aiClient.hasServerKeyFor(providerId)
        ? "Đã có Key trên Server Proxy (có thể để trống)"
        : cfg.keyPlaceholder;
    dom.aiApiKeyInput.type = "password";
    dom.btnToggleKeyVisibility.textContent = "Hiện";

    if (cfg.keyUrl) {
        dom.aiKeyHelpLink.href = cfg.keyUrl;
        dom.aiKeyHelpLink.textContent = `↗ ${cfg.keyUrlLabel}`;
        dom.aiKeyHelpLink.classList.remove("hidden");
    } else {
        dom.aiKeyHelpLink.classList.add("hidden");
    }

    dom.aiThinkingLevelSelect.value = aiClient.settings.thinkingLevel || "LOW";
    dom.chkAutoFallback.checked = aiClient.settings.autoFallback !== false;
    dom.aiTestResultBox.classList.add("hidden");
}

function collectAiSettingsFromModal() {
    const provider = uiState.modalDraftProvider;
    const customModel = dom.aiCustomModelInput.value.trim();
    const chosenModel =
        provider === "custom"
            ? customModel
            : customModel || dom.aiModelSelect.value || AI_PROVIDERS[provider]?.defaultModel || "";

    return {
        provider,
        models: { [provider]: chosenModel },
        keys: { [provider]: dom.aiApiKeyInput.value.trim() },
        customBaseUrl: provider === "custom" ? dom.aiCustomBaseUrlInput.value.trim() : aiClient.settings.customBaseUrl,
        thinkingLevel: dom.aiThinkingLevelSelect.value || "LOW",
        autoFallback: dom.chkAutoFallback.checked
    };
}

function openAiSettingsModal() {
    renderServerProxyInfoInModal();
    syncAiModalFieldsForProvider(aiClient.getActiveProvider());
    openModal("aiSettingsModal");
}

// =========================================================================
// 5. STORAGE STATS & PERSISTENT HISTORY UI
// =========================================================================

function updateStorageAndHistoryUI() {
    const v = storage.vault;
    const examCount = v.exams.size;
    const lockedCount = Math.max(v.hashes.size, v.sourceIds.size);
    const rssCount = v.rssSourceIds.size;
    const acadCount = v.academicSourceIds.size;
    const blockedTotal =
        v.totalDuplicatesBlocked +
        v.sessionDuplicatesBlocked +
        v.totalLegacyRejected +
        v.sessionLegacyRejected;
    const key = storage.activeVaultKey;

    dom.topVaultLabel.textContent = key;
    dom.historyVaultKeyInline.textContent = key;
    dom.vaultKeyInput.value = key;
    dom.topSavedCountBadge.textContent = String(examCount);
    dom.historyPanelBadge.textContent = `${examCount} đề`;

    dom.statLockedHashes.textContent = lockedCount.toLocaleString("vi-VN");
    dom.statRssSources.textContent = rssCount.toLocaleString("vi-VN");
    dom.statAcademicSources.textContent = acadCount.toLocaleString("vi-VN");
    dom.statBlockedDups.textContent = blockedTotal.toLocaleString("vi-VN");
    dom.statSavedExams.textContent = examCount.toLocaleString("vi-VN");

    dom.idbStatusLabel.textContent = storage.idbReady
        ? `IndexedDB trình duyệt: Hoạt động ổn định (${examCount} đề trong Kho này)`
        : `IndexedDB: ${storage.idbError || "Không khả dụng"}`;

    const status = storage.storageStatus;
    if (status === "cloud_connected") {
        dom.stripDot.className = "w-2 h-2 rounded-full bg-emerald-500 shrink-0";
        dom.topStorageDot.className = "w-2 h-2 rounded-full bg-emerald-500 shrink-0";
        dom.stripText.innerHTML = `Firebase Cloud Đã Kết Nối · Kho: <strong class="font-mono text-slate-900 dark:text-white">${escapeHtml(key)}</strong> · Đã lưu <strong>${examCount} đề</strong>`;
        dom.modalStorageStatusBadge.textContent = `Cloud + IndexedDB (${examCount} đề)`;
        dom.modalFirebaseState.textContent = `Đã kết nối (${storage.firebaseConfig?.projectId || "Firebase"})`;
        dom.btnSyncCloud.classList.remove("hidden");
        dom.btnDisconnectFirebase.classList.remove("hidden");
    } else if (status === "cloud_error") {
        dom.stripDot.className = "w-2 h-2 rounded-full bg-rose-500 shrink-0";
        dom.topStorageDot.className = "w-2 h-2 rounded-full bg-rose-500 shrink-0";
        dom.stripText.innerHTML = `Gián đoạn Cloud (đã lưu cục bộ) · Kho: <strong class="font-mono text-slate-900 dark:text-white">${escapeHtml(key)}</strong> · <strong>${examCount} đề</strong>`;
        dom.modalStorageStatusBadge.textContent = `IndexedDB (${examCount} đề)`;
        dom.modalFirebaseState.textContent = "Lỗi kết nối";
        dom.btnSyncCloud.classList.remove("hidden");
        dom.btnDisconnectFirebase.classList.remove("hidden");
    } else {
        dom.stripDot.className = "w-2 h-2 rounded-full bg-emerald-500 shrink-0";
        dom.topStorageDot.className = "w-2 h-2 rounded-full bg-emerald-500 shrink-0";
        dom.stripText.innerHTML = `Lưu cục bộ vĩnh viễn (IndexedDB) · Kho: <strong class="font-mono text-slate-900 dark:text-white">${escapeHtml(key)}</strong> · Đã lưu <strong>${examCount} đề</strong>`;
        dom.modalStorageStatusBadge.textContent = `IndexedDB (${examCount} đề)`;
        dom.modalFirebaseState.textContent = "Chưa bật (Tùy chọn)";
        dom.btnSyncCloud.classList.add("hidden");
        dom.btnDisconnectFirebase.classList.add("hidden");
    }

    renderPersistentHistoryList();
}

function renderPersistentHistoryList() {
    const sorted = Array.from(storage.vault.exams.values()).sort(
        (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
    );

    if (sorted.length === 0) {
        dom.historyListContainer.innerHTML = `
            <div class="col-span-full text-center text-xs text-slate-500 dark:text-slate-400 py-5">
                Chưa có đề nào trong Kho <strong class="font-mono">${escapeHtml(storage.activeVaultKey)}</strong>.
                Nhấn <strong>"Kéo Nguồn &amp; Tạo Đề 40 Câu"</strong> ở trên hoặc <strong>⬆ Nhập .json</strong> để khôi phục kho đề.
            </div>
        `;
        return;
    }

    dom.historyListContainer.innerHTML = sorted
        .map((ex) => {
            const isActive = uiState.currentExam && uiState.currentExam.examId === ex.examId;
            const attemptBadge = ex.lastAttempt
                ? `<span class="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono text-[11px] font-bold">Điểm gần nhất: ${ex.lastAttempt.score.toFixed(2)}/10</span>`
                : "";
            const borderCls = isActive
                ? "border-sky-600 bg-sky-50/50 dark:bg-sky-950/30"
                : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700";

            return `
                <div class="rounded-xl border p-3 flex items-center justify-between gap-2.5 transition ${borderCls}">
                    <button type="button" data-open-exam="${escapeHtml(ex.examId)}" class="flex-1 text-left min-w-0 cursor-pointer space-y-1">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="px-2 py-0.5 rounded bg-slate-900 dark:bg-sky-600 text-white font-mono text-[11px] font-extrabold">MÃ ĐỀ ${escapeHtml(ex.examCode || "401")}</span>
                            <span class="text-xs font-bold text-slate-800 dark:text-slate-100">${escapeHtml(ex.difficultyLabel || "Chuẩn BGD (B1–B2)")}</span>
                            ${attemptBadge}
                        </div>
                        <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>${formatDateTime(ex.createdAt)}</span>
                            <span class="font-mono">40 câu · RSS: ${ex.rssSourceCount ?? 0} · Học thuật: ${ex.academicSourceCount ?? 0}</span>
                            ${ex.aiModelUsed ? `<span class="font-mono truncate max-w-[160px]">${escapeHtml(ex.aiModelUsed)}</span>` : ""}
                        </div>
                    </button>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <button type="button" data-open-exam="${escapeHtml(ex.examId)}" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                            isActive
                                ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                : "bg-sky-700 hover:bg-sky-800 text-white"
                        }">
                            ${isActive ? "Đang mở" : "Mở đề"}
                        </button>
                        <button type="button" data-delete-exam="${escapeHtml(ex.examId)}" class="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-center cursor-pointer" title="Xóa đề này" aria-label="Xóa Mã đề ${escapeHtml(ex.examCode || "")}">
                            ✕
                        </button>
                    </div>
                </div>
            `;
        })
        .join("");
}

// =========================================================================
// 6. INTERACTIVE PRACTICE TIMER & GRADING LOGIC
// =========================================================================

function stopPracticeTimer() {
    if (uiState.practice.timerHandle) {
        clearInterval(uiState.practice.timerHandle);
        uiState.practice.timerHandle = null;
    }
    uiState.practice.timerRunning = false;
    dom.btnToggleTimer.textContent = "Tiếp tục";
}

function startPracticeTimer() {
    if (uiState.practice.timerRunning || uiState.practice.submitted) return;
    uiState.practice.timerRunning = true;
    dom.btnToggleTimer.textContent = "Tạm dừng";
    uiState.practice.timerHandle = setInterval(() => {
        if (uiState.practice.remainingSec > 0) {
            uiState.practice.remainingSec -= 1;
            dom.practiceTimerDisplay.textContent = formatTimerMMSS(uiState.practice.remainingSec);
            if (uiState.practice.remainingSec === 300) {
                showToast("Còn 5 phút làm bài! Hãy rà soát phiếu tô trắc nghiệm.", "warn");
            }
        } else {
            stopPracticeTimer();
            showToast("Đã hết 50 phút! Hệ thống tự động nộp bài và chấm điểm.", "warn");
            submitInteractivePractice();
        }
    }, 1000);
}

function resetPracticeState(startTimerImmediately = false) {
    stopPracticeTimer();
    uiState.practice.answers = {};
    uiState.practice.submitted = false;
    uiState.practice.gradeResult = null;
    uiState.practice.remainingSec = EXAM_DURATION_SEC;
    dom.practiceTimerDisplay.textContent = formatTimerMMSS(EXAM_DURATION_SEC);
    dom.btnSubmitPractice.classList.remove("hidden");
    dom.btnResetPractice.classList.add("hidden");
    dom.practiceResultBanner.classList.add("hidden");
    if (startTimerImmediately && uiState.workspaceMode === "practice") {
        startPracticeTimer();
    }
}

function updatePracticeAnswerSheet() {
    if (!uiState.currentExam) return;
    const allQs = getAllExamQuestions(uiState.currentExam);
    const answered = Object.keys(uiState.practice.answers).length;
    dom.practiceAnsweredBadge.textContent = `Đã làm: ${answered}/${allQs.length}`;

    dom.practiceAnswerSheetGrid.innerHTML = allQs
        .map((q) => {
            const qNum = q.number;
            const chosen = uiState.practice.answers[qNum] || "";
            let cls =
                "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700";

            if (uiState.practice.submitted && uiState.practice.gradeResult) {
                const info = uiState.practice.gradeResult.perQuestion[qNum];
                if (info?.isCorrect) {
                    cls = "bg-emerald-600 text-white border-emerald-600";
                } else {
                    cls = "bg-rose-600 text-white border-rose-600";
                }
            } else if (chosen) {
                cls = "bg-sky-700 text-white border-sky-700";
            }

            return `
                <button type="button" data-jump-question="${qNum}" class="h-8 rounded-lg border font-mono text-[11px] font-bold flex items-center justify-center transition hover:opacity-90 cursor-pointer ${cls}" title="Đi tới Câu ${qNum}">
                    ${qNum}${chosen ? `·${chosen}` : ""}
                </button>
            `;
        })
        .join("");
}

function renderPracticeResultBanner(gradeResult) {
    if (!gradeResult) {
        dom.practiceResultBanner.classList.add("hidden");
        return;
    }

    const timeSpentSec = Math.max(0, EXAM_DURATION_SEC - uiState.practice.remainingSec);
    const scoreStr = gradeResult.score.toFixed(2).replace(".", ",");
    const accuracyPct = gradeResult.totalQuestions > 0 ? Math.round((gradeResult.correctCount / gradeResult.totalQuestions) * 100) : 0;

    dom.practiceResultBanner.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="space-y-1">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                    KẾT QUẢ CHẤM ĐIỂM TỰ ĐỘNG · THANG ĐIỂM 10
                </span>
                <div class="flex items-baseline gap-3">
                    <span class="text-3xl sm:text-4xl font-extrabold font-mono text-emerald-700 dark:text-emerald-400">${scoreStr} / 10</span>
                    <span class="text-sm font-bold text-slate-700 dark:text-slate-200">
                        Đúng ${gradeResult.correctCount}/${gradeResult.totalQuestions} câu (${accuracyPct}%)
                    </span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                    Thời gian làm bài: <strong class="font-mono">${formatTimerMMSS(timeSpentSec)}</strong> · Mỗi câu đúng được 0,25 điểm · Giải thích Tiếng Việt đã tự mở ngay dưới từng câu hỏi.
                </p>
            </div>

            <div class="flex flex-wrap gap-2">
                <button type="button" id="btnScrollToAnswersKey" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 cursor-pointer">
                    Xem Bảng Đáp án &amp; Từ vựng
                </button>
            </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            ${gradeResult.sectionBreakdown
                .map((sec) => {
                    const pct = sec.total > 0 ? Math.round((sec.correct / sec.total) * 100) : 0;
                    const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
                    return `
                        <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1">
                            <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">${escapeHtml(sec.range)} · ${escapeHtml(sec.shortTitle)}</p>
                            <p class="text-sm font-extrabold font-mono text-slate-900 dark:text-white">${sec.correct}/${sec.total} <span class="text-[11px] font-normal text-slate-500">(${sec.points.toFixed(2).replace(".", ",")}đ)</span></p>
                            <div class="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                <div class="h-full rounded-full ${barColor}" style="width:${pct}%"></div>
                            </div>
                        </div>
                    `;
                })
                .join("")}
        </div>
    `;
    dom.practiceResultBanner.classList.remove("hidden");

    const jumpBtn = $("btnScrollToAnswersKey");
    if (jumpBtn) {
        jumpBtn.addEventListener("click", () => {
            dom.answersAndVocabSection.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }
}

async function submitInteractivePractice() {
    if (!uiState.currentExam) return;
    stopPracticeTimer();
    const gradeResult = gradeInteractiveExam(uiState.currentExam, uiState.practice.answers);
    uiState.practice.submitted = true;
    uiState.practice.gradeResult = gradeResult;
    dom.btnSubmitPractice.classList.add("hidden");
    dom.btnResetPractice.classList.remove("hidden");

    await storage.saveInteractiveAttempt(uiState.currentExam.examId, {
        score: gradeResult.score,
        correctCount: gradeResult.correctCount,
        totalQuestions: gradeResult.totalQuestions,
        submittedAt: Date.now()
    });

    renderExamWorkspace(uiState.currentExam, { preservePracticeState: true });
    renderPracticeResultBanner(gradeResult);
    dom.practiceResultBanner.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(`Đã chấm xong! Điểm của bạn: ${gradeResult.score.toFixed(2).replace(".", ",")}/10 (${gradeResult.correctCount}/${gradeResult.totalQuestions} câu đúng).`, "success");
}

// =========================================================================
// 7. EXAM WORKSPACE RENDERER (6 SECTIONS + ANSWERS + VOCABULARY)
// =========================================================================

function updateWorkspaceModeUI() {
    const isPractice = uiState.workspaceMode === "practice";
    const activeCls = "bg-white dark:bg-slate-900 text-sky-800 dark:text-sky-300 shadow-sm";
    const idleCls = "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white";

    dom.btnModeView.className = `flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${!isPractice ? activeCls : idleCls}`;
    dom.btnModePractice.className = `flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${isPractice ? activeCls : idleCls}`;

    dom.toggleInlineAnswerWrap.classList.toggle("hidden", isPractice);
    dom.practiceControlBar.classList.toggle("hidden", !isPractice);

    // Hide full Answer Key while student is actively taking the test before submission
    const hideAnswersKey = isPractice && !uiState.practice.submitted;
    dom.answersAndVocabSection.classList.toggle("hidden", hideAnswersKey);
}

const DEFAULT_SECTION_INSTRUCTIONS = {
    part1: "Read the following advertisement and mark the letter A, B, C, or D on your answer sheet to indicate the option that best fits each of the numbered blanks from 1 to 6.",
    part2: "Read the following leaflet and mark the letter A, B, C, or D on your answer sheet to indicate the option that best fits each of the numbered blanks from 7 to 12.",
    part3: "Mark the letter A, B, C, or D on your answer sheet to indicate the best arrangement of utterances or sentences to make a meaningful exchange or text in each of the following questions from 13 to 17.",
    part4: "Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the option that best fits each of the numbered blanks from 18 to 22.",
    part5: "Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the best answer to each of the following questions from 23 to 30.",
    part6: "Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the best answer to each of the following questions from 31 to 40."
};

function renderOfficialExamHeaderHtml(exam) {
    const code = escapeHtml(exam.examCode || "401");
    return `
        <div class="exam-paper-header">
            <div class="exam-header-left">
                <div class="exam-header-kicker">KỲ THI TỐT NGHIỆP THPT NĂM 2026</div>
                <div class="exam-header-subject">ĐỀ THI THỬ MÔN: TIẾNG ANH (GDPT 2018)</div>
                <div class="exam-header-rule" aria-hidden="true"></div>
            </div>
            <div class="exam-header-right">
                <div class="exam-header-duration">Thời gian làm bài: 50 phút, không kể thời gian phát đề</div>
                <div class="exam-code-box">Mã đề thi: ${code}</div>
            </div>
        </div>
    `;
}

function renderSourceBadgeInline(source) {
    if (!source || !source.sourceName) return "";
    const isRss = source.category === "rss";
    const badgeCls = isRss
        ? "bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800"
        : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
    const icon = isRss ? "📰" : "🔬";
    const label = escapeHtml(source.sourceName);

    if (source.sourceUrl) {
        return `
            <a href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="tech-meta-only items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border hover:underline ${badgeCls}" title="Mở bài viết gốc: ${escapeHtml(source.originalTitle || source.sourceName)}">
                <span>${icon} Nguồn: ${label}</span>
                <span aria-hidden="true">↗</span>
            </a>
        `;
    }
    return `<span class="tech-meta-only items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${badgeCls}">${icon} ${label}</span>`;
}

function renderQuestionCardHtml(q, isArrangement = false) {
    const qNum = Number(q.number);
    const isPractice = uiState.workspaceMode === "practice";
    const submitted = uiState.practice.submitted;
    const chosen = uiState.practice.answers[qNum] || "";
    const correct = String(q.correctOption || "A").toUpperCase();
    const showExplain = (!isPractice && uiState.showInlineAnswers) || (isPractice && submitted);

    const options = [
        { letter: "A", text: q.optionA || "" },
        { letter: "B", text: q.optionB || "" },
        { letter: "C", text: q.optionC || "" },
        { letter: "D", text: q.optionD || "" }
    ];

    const layoutClass = computeAdaptiveOptionLayout(options);
    const cleanStem = isArrangement ? "" : cleanClozeQuestionPrompt(q.prompt, qNum);

    const skillBadgeHtml = q.skillTag
        ? `<span class="tech-meta-only question-skill-pill">${escapeHtml(q.skillTag)}</span>`
        : "";

    const practiceFeedbackHtml =
        isPractice && submitted
            ? chosen === correct
                ? '<span class="no-print ml-2 font-sans text-xs font-extrabold text-emerald-700 dark:text-emerald-400">✓ Chính xác (+0,25đ)</span>'
                : `<span class="no-print ml-2 font-sans text-xs font-extrabold text-rose-700 dark:text-rose-400">✕ ${chosen ? `Bạn chọn ${chosen}` : "Chưa chọn"} · Đúng: ${correct}</span>`
            : "";

    const headerLineHtml = `
        <div class="question-header-line">
            <span class="question-number-label">Question ${qNum}.</span>${cleanStem ? ` <span class="question-stem-text">${formatEnglishRichHtml(cleanStem)}</span>` : ""}${skillBadgeHtml}${practiceFeedbackHtml}
        </div>
    `;

    const arrangementBodyHtml = isArrangement
        ? `
            <div class="arrangement-items">
                ${q.salutation ? `<p class="arrangement-salutation">${escapeHtml(q.salutation)}</p>` : ""}
                ${(q.items || [])
                    .map(
                        (it) => `
                    <div class="arrangement-item-row">
                        <span class="arrangement-item-label">${escapeHtml(it.label)}.</span>
                        <span>${formatEnglishRichHtml(it.text)}</span>
                    </div>`
                    )
                    .join("")}
                ${q.signOff ? `<p class="arrangement-signoff">${escapeHtml(q.signOff)}</p>` : ""}
            </div>
          `
        : "";

    const optionItemsHtml = options
        .map((opt) => {
            let stateCls = "";
            if (isPractice) {
                if (submitted) {
                    if (opt.letter === correct) {
                        stateCls = "is-correct";
                    } else if (opt.letter === chosen && chosen !== correct) {
                        stateCls = "is-wrong";
                    }
                } else if (opt.letter === chosen) {
                    stateCls = "is-selected";
                }
            } else if (uiState.showInlineAnswers && opt.letter === correct) {
                stateCls = "is-inline-correct";
            }

            if (isPractice) {
                return `
                    <button type="button" data-choose-answer="${qNum}:${opt.letter}" ${submitted ? "disabled" : ""} class="exam-option-item is-interactive ${stateCls}">
                        <span class="opt-letter">${opt.letter}.</span>
                        <span class="opt-text">${formatEnglishRichHtml(opt.text)}</span>
                    </button>
                `;
            }

            return `
                <div class="exam-option-item ${stateCls}">
                    <span class="opt-letter">${opt.letter}.</span>
                    <span class="opt-text">${formatEnglishRichHtml(opt.text)}</span>
                </div>
            `;
        })
        .join("");

    const explanationHtml = showExplain
        ? `
            <div class="inline-explanation-box">
                <span class="inline-flex items-center px-2 py-0.5 rounded bg-emerald-600 text-white font-mono text-[11px] font-bold mr-1.5">Đáp án ${correct}</span>
                ${escapeHtml(q.explanationVi || "")}
            </div>
          `
        : "";

    return `
        <article id="q-card-${qNum}" class="exam-question-block">
            ${headerLineHtml}
            ${arrangementBodyHtml}
            <div class="exam-options-grid ${layoutClass}">
                ${optionItemsHtml}
            </div>
            ${explanationHtml}
        </article>
    `;
}

function renderSectionBlockHtml(exam, meta) {
    const sec = exam[meta.id];
    if (!sec) return "";

    const sectionTxt = buildSectionText(exam, meta.id);
    const instructionText = sec.instruction || DEFAULT_SECTION_INSTRUCTIONS[meta.id] || "";

    let passageHtml = "";
    if (meta.id === "part1" || meta.id === "part2") {
        const sourceBadge = renderSourceBadgeInline(sec.source);
        passageHtml = `
            <div class="cloze-boxed-passage">
                ${sourceBadge ? `<div class="passage-meta-row tech-meta-block justify-end">${sourceBadge}</div>` : ""}
                ${sec.title ? `<h4 class="passage-title">${escapeHtml(sec.title.toUpperCase())}</h4>` : ""}
                ${sec.subtitle ? `<p class="passage-subtitle">${escapeHtml(sec.subtitle)}</p>` : ""}
                <div class="cloze-passage-body">
                    ${formatEnglishRichHtml(sec.passage || "")}
                </div>
            </div>
        `;
    } else if (meta.id === "part4") {
        const sourceBadge = renderSourceBadgeInline(sec.source);
        passageHtml = `
            <div class="exam-reading-passage">
                ${sourceBadge ? `<div class="passage-meta-row tech-meta-block justify-end">${sourceBadge}</div>` : ""}
                ${sec.title ? `<h4 class="passage-title">${escapeHtml(sec.title)}</h4>` : ""}
                <div class="cloze-passage-body">
                    ${formatEnglishRichHtml(sec.passage || "")}
                </div>
            </div>
        `;
    } else if (meta.id === "part5" || meta.id === "part6") {
        // Ensure bold keywords & underlined paraphrase sentences on both fresh and older IndexedDB exams
        const safeParagraphs = ensureReadingPassageHighlights(sec.paragraphs || [], sec.questions || []);
        const wordCount = safeParagraphs.join(" ").trim().split(/\s+/).filter(Boolean).length;
        const sourceBadge = renderSourceBadgeInline(sec.source);

        passageHtml = `
            <div class="exam-reading-passage">
                <div class="passage-meta-row tech-meta-block">
                    <span class="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        ${safeParagraphs.length} đoạn văn · ~${wordCount} từ${meta.id === "part6" ? " · Chèn câu [I]–[IV]" : ""}
                    </span>
                    ${sourceBadge}
                </div>
                ${sec.title ? `<h4 class="passage-title">${escapeHtml(sec.title)}</h4>` : ""}
                <div>
                    ${safeParagraphs
                        .map(
                            (p, pIdx) => `
                        <p class="reading-paragraph"><span class="tech-meta-only mr-1.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 align-middle">P${pIdx + 1}</span>${formatEnglishRichHtml(p)}</p>`
                        )
                        .join("")}
                </div>
            </div>
        `;
    }

    const isArrangement = meta.id === "part3";
    const questionsHtml = (sec.questions || []).map((q) => renderQuestionCardHtml(q, isArrangement)).join("");

    return `
        <section class="exam-section-block" data-exam-section="${meta.id}">
            <div class="tech-meta-block items-center gap-2 mb-1 font-sans">
                <span class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold">${escapeHtml(meta.title)}</span>
                <span class="font-mono text-[11px] text-slate-500 dark:text-slate-400">${meta.range} · ${meta.points.toFixed(2).replace(".", ",")} điểm</span>
            </div>
            <div class="exam-instruction-row">
                <p class="exam-instruction">${escapeHtml(instructionText)}</p>
                <button type="button" data-copy-section="${meta.id}" class="no-print section-copy-btn" title="Sao chép ${escapeHtml(meta.range)} (${formatCharCount(sectionTxt)})">
                    ${STACKED_SHEETS_SVG}
                    <span>Copy ${meta.range}</span>
                </button>
            </div>
            ${passageHtml}
            <div class="exam-questions-list">
                ${questionsHtml}
            </div>
        </section>
    `;
}

function renderAnswersAndVocabHtml(exam) {
    const allQs = getAllExamQuestions(exam);
    const vocabList = Array.isArray(exam.vocabulary) ? exam.vocabulary : [];

    const keyCells = allQs
        .map(
            (q) => `
            <div class="answer-key-cell rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-2 text-center">
                <div class="text-[10px] font-mono text-slate-500 dark:text-slate-400">C${String(q.number).padStart(2, "0")}</div>
                <div class="text-sm font-extrabold font-mono text-sky-700 dark:text-sky-400">${escapeHtml(q.correctOption)}</div>
            </div>`
        )
        .join("");

    const explanationSections = EXAM_SECTIONS_META.map((meta) => {
        const qs = exam[meta.id]?.questions || [];
        return `
            <div class="space-y-2">
                <h5 class="text-xs font-extrabold uppercase tracking-wider text-sky-800 dark:text-sky-300 border-b border-slate-200 dark:border-slate-800 pb-1">
                    ${escapeHtml(meta.title)} (${meta.range})
                </h5>
                <div class="space-y-2">
                    ${qs
                        .map(
                            (q) => `
                        <div class="print-explain-item rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 p-3 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                            <span class="font-mono font-extrabold text-emerald-700 dark:text-emerald-400 mr-1">Câu ${q.number} (${escapeHtml(q.correctOption)})</span>
                            <span class="inline-block px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 text-[10px] font-semibold mr-1.5">${escapeHtml(q.skillTag || "")}</span>
                            <span>${escapeHtml(q.explanationVi || "")}</span>
                        </div>`
                        )
                        .join("")}
                </div>
            </div>
        `;
    }).join("");

    const vocabRows =
        vocabList.length > 0
            ? `
            <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table class="w-full text-left border-collapse text-xs">
                    <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                        <tr>
                            <th class="px-3 py-2.5 font-extrabold">Từ vựng / Collocation</th>
                            <th class="px-3 py-2.5 font-extrabold">Loại / CEFR</th>
                            <th class="px-3 py-2.5 font-extrabold">Nghĩa Tiếng Việt</th>
                            <th class="px-3 py-2.5 font-extrabold hidden md:table-cell">Ngữ cảnh / Ví dụ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                        ${vocabList
                            .map(
                                (v) => `
                            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td class="px-3 py-2.5 font-bold text-slate-900 dark:text-white">
                                    ${escapeHtml(v.term)}
                                    <span class="block text-[10px] font-normal text-slate-500">${escapeHtml(v.section || "")}</span>
                                </td>
                                <td class="px-3 py-2.5 whitespace-nowrap">
                                    <span class="font-mono text-[11px] text-slate-600 dark:text-slate-300">${escapeHtml(v.pos || "")}</span>
                                    <span class="ml-1 px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 font-mono text-[10px] font-bold">${escapeHtml(v.cefr || "B2")}</span>
                                </td>
                                <td class="px-3 py-2.5 text-slate-700 dark:text-slate-200">${escapeHtml(v.meaningVi || "")}</td>
                                <td class="px-3 py-2.5 text-slate-600 dark:text-slate-400 italic hidden md:table-cell">${escapeHtml(v.example || "")}</td>
                            </tr>`
                            )
                            .join("")}
                    </tbody>
                </table>
            </div>`
            : `<p class="text-xs text-slate-500 dark:text-slate-400 italic">Không có danh sách từ vựng bổ sung cho đề này.</p>`;

    return `
        <div class="space-y-3">
            <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                I. Bảng Đáp án nhanh (40 câu · 0,25 điểm/câu)
            </h4>
            <div class="answer-key-grid grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                ${keyCells}
            </div>
        </div>

        <div id="detailedSolutionsBlock" class="${uiState.showSolutions ? "" : "hidden"} space-y-5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                II. Giải thích chi tiết bằng Tiếng Việt (Câu 1–40)
            </h4>
            ${explanationSections}
        </div>

        <div class="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div class="flex items-center justify-between gap-2">
                <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    III. Danh sách Từ vựng &amp; Collocations đáng chú ý (${vocabList.length} mục)
                </h4>
            </div>
            ${vocabRows}
        </div>
    `;
}

function renderExamWorkspace(exam, { preservePracticeState = false } = {}) {
    if (!exam) return;
    const isNewExam = !uiState.currentExam || uiState.currentExam.examId !== exam.examId;
    uiState.currentExam = exam;

    if (isNewExam && !preservePracticeState) {
        resetPracticeState(false);
    }

    dom.emptyStateSection.classList.add("hidden");
    dom.examWorkspace.classList.remove("hidden");
    dom.examWorkspace.classList.toggle("show-tech-meta", uiState.showTechMeta);
    dom.chkShowTechMeta.checked = uiState.showTechMeta;

    dom.examCodeBadge.textContent = `MÃ ĐỀ: ${exam.examCode || "401"}`;
    dom.examDiffBadge.textContent = exam.difficultyLabel || "Chuẩn BGD (B1–B2)";
    dom.examMetaSub.textContent = `Tạo lúc ${formatDateTime(exam.createdAt)} · ${exam.totalQuestions || 40} câu · AI: ${exam.aiModelUsed || "AI"} · Kho "${storage.activeVaultKey}"`;

    // Update character counts on the 4 mobile-safe split copy buttons
    dom.charSlice1To17.textContent = formatCharCount(buildSlice1To17Text(exam));
    dom.charSlice18To30.textContent = formatCharCount(buildSlice18To30Text(exam));
    dom.charSlice31To40.textContent = formatCharCount(buildSlice31To40Text(exam));
    dom.charSliceAnswers.textContent = formatCharCount(buildAnswersAndExplanationsText(exam));

    // Official 2-column BGDĐT exam header & 6 clean exam sections inside #examPaperSheet
    dom.examOfficialHeader.innerHTML = renderOfficialExamHeaderHtml(exam);
    dom.examSectionsContainer.innerHTML =
        EXAM_SECTIONS_META.map((meta) => renderSectionBlockHtml(exam, meta)).join("") +
        `<div class="exam-end-divider">----------- HẾT -----------</div>`;

    dom.answersContainer.innerHTML = renderAnswersAndVocabHtml(exam);

    // Collapsible authentic sources attribution at bottom of page (hidden on print)
    const sources = Array.isArray(exam.sourcesUsed) ? exam.sourcesUsed : [];
    dom.examSourcesCountBadge.textContent = `${sources.length} bài nguồn`;
    dom.examSourcesStrip.innerHTML =
        sources.length > 0
            ? `
            <div class="flex flex-wrap gap-2">
                ${sources
                    .map((s) => {
                        const label = `${s.section}: ${s.sourceName}`;
                        if (s.sourceUrl) {
                            return `<a href="${escapeHtml(s.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition" title="${escapeHtml(s.originalTitle || label)}">${escapeHtml(label)} ↗</a>`;
                        }
                        return `<span class="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${escapeHtml(label)}</span>`;
                    })
                    .join("")}
            </div>`
            : `<p class="text-xs text-slate-500 dark:text-slate-400">Không có dữ liệu bài nguồn đính kèm cho đề này.</p>`;

    updateWorkspaceModeUI();
    updatePracticeAnswerSheet();
    renderPersistentHistoryList();
}

// =========================================================================
// 8. GENERATION, EXPORT / IMPORT & PRINT HANDLERS
// =========================================================================

let serverHealthBootPromise = null;

async function handleGenerateExam() {
    if (uiState.isGenerating) return;

    if (!aiClient.serverHealth.checked && serverHealthBootPromise) {
        await serverHealthBootPromise;
    }

    if (!aiClient.isReadyForActiveProvider()) {
        showToast("Vui lòng nhập API Key miễn phí (Gemini / Groq / OpenRouter) trong Cài đặt AI trước khi tạo đề.", "warn");
        openAiSettingsModal();
        return;
    }

    uiState.isGenerating = true;
    dom.btnGenerateExam.disabled = true;
    dom.iconGenerateIdle.classList.add("hidden");
    dom.iconGenerateSpin.classList.remove("hidden");
    const startedMs = Date.now();
    dom.btnGenerateLabel.textContent = "Đang kéo Nguồn & Biên soạn... (0s)";
    const elapsedTimer = setInterval(() => {
        const secs = Math.floor((Date.now() - startedMs) / 1000);
        dom.btnGenerateLabel.textContent = `Đang kéo Nguồn & Biên soạn... (${secs}s)`;
    }, 1000);

    try {
        const examDoc = await runFullEnglishExamPipeline({
            aiClient,
            harvester,
            storage,
            focusMode: dom.sourceFocusSelect.value || "all_mixed",
            difficultyKey: dom.difficultySelect.value || "standard",
            onProgress: setProgress,
            onEntropy: (hex) => {
                dom.progressEntropyBadge.textContent = `CSPRNG-128: ${hex.slice(0, 12)}...`;
            },
            onLog: addLog
        });

        uiState.workspaceMode = "view";
        renderExamWorkspace(examDoc);
        dom.examWorkspace.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
        addLog(`[LỖI TẠO ĐỀ] ${err.message}`, "error");
        dom.progressMessage.textContent = `Lỗi: ${err.message}`;
        showToast(`Lỗi khi biên soạn đề: ${err.message}`, "error");
        if (err.code === "MISSING_API_KEY" || err.status === 401 || err.status === 403) {
            openAiSettingsModal();
        }
    } finally {
        clearInterval(elapsedTimer);
        uiState.isGenerating = false;
        dom.btnGenerateExam.disabled = false;
        dom.iconGenerateIdle.classList.remove("hidden");
        dom.iconGenerateSpin.classList.add("hidden");
        dom.btnGenerateLabel.textContent = "Kéo Nguồn & Tạo Đề 40 Câu";
        updateAiStatusBadges();
    }
}

function handleExportJson() {
    const payload = storage.buildExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-tienganh2026-${storage.activeVaultKey}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Đã xuất sao lưu Kho ${storage.activeVaultKey} (${payload.exams.length} đề).`, "success");
}

async function handleImportJsonFile(file) {
    if (!file) return;
    try {
        const text = await file.text();
        const { importedExams, importedFps } = await storage.importFromJsonText(text);
        showToast(`Đã nhập ${importedExams} đề và ${importedFps} gói chống trùng lặp vào Kho "${storage.activeVaultKey}"!`, "success");
    } catch (err) {
        showToast(`Lỗi nhập tệp .json: ${err.message}`, "error");
    }
}

function handlePrintClean(examOnly = false) {
    if (!uiState.currentExam) return;
    document.body.classList.toggle("print-exam-only", examOnly);
    const prevShowSolutions = uiState.showSolutions;
    if (!examOnly && !uiState.showSolutions) {
        uiState.showSolutions = true;
        const block = $("detailedSolutionsBlock");
        if (block) block.classList.remove("hidden");
    }

    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        document.body.classList.remove("print-exam-only");
        if (!examOnly && !prevShowSolutions) {
            uiState.showSolutions = false;
            const block = $("detailedSolutionsBlock");
            if (block) block.classList.add("hidden");
        }
    };

    window.addEventListener("afterprint", cleanup, { once: true });
    setTimeout(() => {
        window.print();
        // Desktop browsers block during window.print(); schedule gentle post-print fallback
        setTimeout(() => {
            if (!document.hidden) cleanup();
        }, 600);
    }, 100);
}

// =========================================================================
// 9. EVENT WIRING & BOOT
// =========================================================================

function bindEvents() {
    // Theme toggle
    dom.btnToggleTheme.addEventListener("click", () => {
        const isDark = document.documentElement.classList.toggle("dark");
        try {
            localStorage.setItem(STORAGE_KEYS.THEME, isDark ? "dark" : "light");
        } catch {
            // ignore
        }
        syncThemeIcons();
    });

    // AI Modal
    dom.btnOpenAiTop.addEventListener("click", openAiSettingsModal);
    dom.btnSetupAiNow.addEventListener("click", openAiSettingsModal);
    dom.btnChangeAiHero.addEventListener("click", openAiSettingsModal);

    dom.providerCardGrid.addEventListener("click", (e) => {
        const card = e.target.closest("[data-select-provider]");
        if (!card) return;
        syncAiModalFieldsForProvider(card.dataset.selectProvider);
    });

    dom.aiModelSelect.addEventListener("change", () => {
        const cfg = AI_PROVIDERS[uiState.modalDraftProvider];
        const m = cfg?.models.find((item) => item.id === dom.aiModelSelect.value);
        if (m) dom.aiModelHint.textContent = m.hint;
        dom.aiCustomModelInput.value = "";
    });

    dom.btnToggleKeyVisibility.addEventListener("click", () => {
        const isPassword = dom.aiApiKeyInput.type === "password";
        dom.aiApiKeyInput.type = isPassword ? "text" : "password";
        dom.btnToggleKeyVisibility.textContent = isPassword ? "Ẩn" : "Hiện";
    });

    dom.btnSaveAiSettings.addEventListener("click", () => {
        const patch = collectAiSettingsFromModal();
        aiClient.updateSettings(patch);
        updateAiStatusBadges();
        closeModal("aiSettingsModal");
        showToast(`Đã lưu cấu hình AI: ${aiClient.getConnectionModeLabel().label}`, "success");
    });

    dom.btnTestAiConnection.addEventListener("click", async () => {
        const patch = collectAiSettingsFromModal();
        aiClient.updateSettings(patch);
        updateAiStatusBadges();

        dom.btnTestAiConnection.disabled = true;
        dom.btnTestAiConnection.textContent = "Đang kiểm tra...";
        dom.aiTestResultBox.classList.add("hidden");

        try {
            const res = await aiClient.testConnection();
            dom.aiTestResultBox.className = "rounded-xl p-3 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800";
            dom.aiTestResultBox.textContent = `✅ Kết nối thành công với ${res.provider}/${res.model} (${res.elapsedSec}s)! Sẵn sàng tạo đề Tiếng Anh 40 câu.`;
            dom.aiTestResultBox.classList.remove("hidden");
        } catch (err) {
            dom.aiTestResultBox.className = "rounded-xl p-3 text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800";
            dom.aiTestResultBox.textContent = `❌ Kiểm tra thất bại: ${err.message}`;
            dom.aiTestResultBox.classList.remove("hidden");
        } finally {
            dom.btnTestAiConnection.disabled = false;
            dom.btnTestAiConnection.textContent = "⚡ Kiểm tra kết nối";
        }
    });

    // Vault Modal
    const openVaultModal = () => {
        dom.vaultKeyInput.value = storage.activeVaultKey;
        if (storage.firebaseConfig) {
            dom.firebaseConfigInput.value = JSON.stringify(storage.firebaseConfig, null, 2);
        }
        openModal("vaultModal");
    };
    dom.btnOpenVaultTop.addEventListener("click", openVaultModal);
    dom.btnOpenVaultBar.addEventListener("click", openVaultModal);
    dom.btnSyncCloud.addEventListener("click", () => storage.syncWithCloud(true, false));
    dom.btnDismissCloudError.addEventListener("click", clearCloudError);

    dom.btnApplyVaultKey.addEventListener("click", async () => {
        await storage.switchActiveVaultKey(dom.vaultKeyInput.value);
        uiState.currentExam = null;
        stopPracticeTimer();
        dom.examWorkspace.classList.add("hidden");
        dom.emptyStateSection.classList.remove("hidden");
        closeModal("vaultModal");
    });

    dom.btnResetDefaultKey.addEventListener("click", async () => {
        await storage.switchActiveVaultKey(DEFAULT_VAULT_KEY);
        uiState.currentExam = null;
        stopPracticeTimer();
        dom.examWorkspace.classList.add("hidden");
        dom.emptyStateSection.classList.remove("hidden");
        closeModal("vaultModal");
    });

    dom.btnCopyVaultKey.addEventListener("click", () => copyTextToClipboard(storage.activeVaultKey, "Mã Kho"));

    dom.btnConnectFirebase.addEventListener("click", async () => {
        const parsed = parseFirebaseConfigInput(dom.firebaseConfigInput.value);
        if (!parsed.ok) {
            showToast(parsed.error, "error");
            return;
        }
        dom.btnConnectFirebase.disabled = true;
        dom.btnConnectFirebase.textContent = "Đang kết nối...";
        const ok = await storage.connectFirebase(parsed.config, "thptqg-anh-2026-studio", true);
        dom.btnConnectFirebase.disabled = false;
        dom.btnConnectFirebase.textContent = "Kết nối Firebase";
        if (ok) {
            clearCloudError();
            showToast(`Đã kết nối Firebase Cloud (${parsed.config.projectId}) thành công!`, "success");
        }
    });

    dom.btnDisconnectFirebase.addEventListener("click", () => {
        clearCloudError();
        storage.disconnectFirebase();
        dom.firebaseConfigInput.value = "";
    });

    // Export / Import JSON
    dom.btnQuickExportJson.addEventListener("click", handleExportJson);
    dom.btnModalExportJson.addEventListener("click", handleExportJson);
    dom.quickImportFileInput.addEventListener("change", (e) => {
        handleImportJsonFile(e.target.files?.[0]);
        e.target.value = "";
    });
    dom.modalImportFileInput.addEventListener("change", (e) => {
        handleImportJsonFile(e.target.files?.[0]);
        e.target.value = "";
    });

    // Clear Vault confirmation
    const askClearVault = () => {
        openConfirmDialog(
            `Dọn sạch Kho "${storage.activeVaultKey}"?`,
            `Toàn bộ ${storage.vault.exams.size} đề thi Tiếng Anh và ${storage.vault.hashes.size} dấu vân tay chống trùng lặp sẽ bị xóa khỏi Kho "${storage.activeVaultKey}".`,
            "Xóa sạch Kho",
            async () => {
                await storage.clearEntireActiveVault();
                uiState.currentExam = null;
                stopPracticeTimer();
                dom.examWorkspace.classList.add("hidden");
                dom.emptyStateSection.classList.remove("hidden");
                closeModal("vaultModal");
            }
        );
    };
    dom.btnClearVaultFromHistory.addEventListener("click", askClearVault);
    dom.btnOpenConfirmClearVault.addEventListener("click", askClearVault);

    // Confirm Modal
    dom.btnConfirmCancel.addEventListener("click", () => {
        uiState.pendingConfirmAction = null;
        closeModal("confirmModal");
    });
    dom.btnConfirmProceed.addEventListener("click", async () => {
        const fn = uiState.pendingConfirmAction;
        uiState.pendingConfirmAction = null;
        closeModal("confirmModal");
        if (typeof fn === "function") await fn();
    });

    // Generic Modal Close
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
        btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
    });
    [dom.aiSettingsModal, dom.vaultModal, dom.confirmModal].forEach((modal) => {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeModal("aiSettingsModal");
            closeModal("vaultModal");
            closeModal("confirmModal");
        }
    });

    // Generate & Log Accordion
    dom.btnGenerateExam.addEventListener("click", handleGenerateExam);
    dom.btnToggleLog.addEventListener("click", () => {
        const isHidden = dom.logPanel.classList.toggle("hidden");
        dom.btnToggleLog.setAttribute("aria-expanded", String(!isHidden));
        dom.logChevron.style.transform = isHidden ? "rotate(0deg)" : "rotate(180deg)";
    });

    // History Jump, Collapse, Open & Delete
    dom.btnJumpHistory.addEventListener("click", () => {
        uiState.historyExpanded = true;
        dom.historyPanelBody.classList.remove("hidden");
        dom.historyChevron.classList.add("rotate-180");
        dom.historySection.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const toggleHistory = () => {
        uiState.historyExpanded = !uiState.historyExpanded;
        dom.historyPanelBody.classList.toggle("hidden", !uiState.historyExpanded);
        dom.historyChevron.classList.toggle("rotate-180", uiState.historyExpanded);
    };
    dom.btnToggleHistoryBody.addEventListener("click", toggleHistory);
    dom.btnCollapseHistory.addEventListener("click", toggleHistory);

    dom.historyListContainer.addEventListener("click", (e) => {
        const delBtn = e.target.closest("[data-delete-exam]");
        if (delBtn) {
            const eid = delBtn.dataset.deleteExam;
            const ex = storage.vault.exams.get(eid);
            if (!ex) return;
            openConfirmDialog(
                `Xóa Mã đề ${ex.examCode}?`,
                `Mã đề ${ex.examCode} (tạo lúc ${formatDateTime(ex.createdAt)}) và dấu vân tay chống trùng lặp tương ứng sẽ bị xóa.`,
                "Xóa đề này",
                async () => {
                    await storage.deleteSingleExam(eid);
                    if (uiState.currentExam && uiState.currentExam.examId === eid) {
                        uiState.currentExam = null;
                        stopPracticeTimer();
                        dom.examWorkspace.classList.add("hidden");
                        dom.emptyStateSection.classList.remove("hidden");
                    }
                }
            );
            return;
        }

        const openBtn = e.target.closest("[data-open-exam]");
        if (openBtn) {
            const ex = storage.vault.exams.get(openBtn.dataset.openExam);
            if (ex) {
                uiState.workspaceMode = "view";
                renderExamWorkspace(ex);
                dom.examWorkspace.scrollIntoView({ behavior: "smooth", block: "start" });
                showToast(`Đã mở lại Mã đề ${ex.examCode} (40 câu).`, "info");
            }
        }
    });

    // Workspace Mode Switcher (View Full vs Interactive Practice)
    document.querySelectorAll("[data-workspace-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const targetMode = btn.dataset.workspaceMode;
            if (!uiState.currentExam || targetMode === uiState.workspaceMode) return;
            uiState.workspaceMode = targetMode;
            if (targetMode === "practice") {
                if (!uiState.practice.submitted) startPracticeTimer();
            } else {
                stopPracticeTimer();
            }
            renderExamWorkspace(uiState.currentExam, { preservePracticeState: true });
            if (targetMode === "practice" && uiState.practice.submitted && uiState.practice.gradeResult) {
                renderPracticeResultBanner(uiState.practice.gradeResult);
            }
        });
    });

    dom.chkShowTechMeta.addEventListener("change", () => {
        uiState.showTechMeta = dom.chkShowTechMeta.checked;
        dom.examWorkspace.classList.toggle("show-tech-meta", uiState.showTechMeta);
    });

    dom.chkShowInlineAnswers.addEventListener("change", () => {
        uiState.showInlineAnswers = dom.chkShowInlineAnswers.checked;
        if (uiState.currentExam) {
            renderExamWorkspace(uiState.currentExam, { preservePracticeState: true });
        }
    });

    dom.btnToggleSolutions.addEventListener("click", () => {
        uiState.showSolutions = !uiState.showSolutions;
        const block = $("detailedSolutionsBlock");
        if (block) block.classList.toggle("hidden", !uiState.showSolutions);
    });

    // Interactive Practice Events
    dom.btnToggleTimer.addEventListener("click", () => {
        if (uiState.practice.timerRunning) stopPracticeTimer();
        else startPracticeTimer();
    });

    dom.btnToggleAnswerSheet.addEventListener("click", () => {
        uiState.practice.sheetOpen = !uiState.practice.sheetOpen;
        dom.practiceAnswerSheetDrawer.classList.toggle("hidden", !uiState.practice.sheetOpen);
    });

    dom.practiceAnswerSheetGrid.addEventListener("click", (e) => {
        const jumpBtn = e.target.closest("[data-jump-question]");
        if (!jumpBtn) return;
        const el = $(`q-card-${jumpBtn.dataset.jumpQuestion}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    dom.btnSubmitPractice.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        const answered = Object.keys(uiState.practice.answers).length;
        const total = getAllExamQuestions(uiState.currentExam).length;
        if (answered < total) {
            openConfirmDialog(
                "Nộp bài khi chưa tô đủ 40 câu?",
                `Bạn mới chọn ${answered}/${total} câu. Những câu bỏ trống sẽ tính 0 điểm. Bạn có chắc muốn nộp bài và chấm điểm ngay?`,
                "Nộp bài ngay",
                submitInteractivePractice
            );
        } else {
            submitInteractivePractice();
        }
    });

    dom.btnResetPractice.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        resetPracticeState(true);
        renderExamWorkspace(uiState.currentExam, { preservePracticeState: true });
        showToast("Đã đặt lại bài làm & đồng hồ 50:00. Chúc bạn làm bài tốt!", "info");
    });

    // Delegate option clicks & per-section copy clicks inside #examSectionsContainer
    dom.examSectionsContainer.addEventListener("click", (e) => {
        const copySecBtn = e.target.closest("[data-copy-section]");
        if (copySecBtn && uiState.currentExam) {
            const secId = copySecBtn.dataset.copySection;
            const meta = EXAM_SECTIONS_META.find((m) => m.id === secId);
            copyTextToClipboard(buildSectionText(uiState.currentExam, secId), meta ? `${meta.shortTitle} (${meta.range})` : secId);
            return;
        }

        const optBtn = e.target.closest("[data-choose-answer]");
        if (optBtn && uiState.workspaceMode === "practice" && !uiState.practice.submitted) {
            const [qNumStr, letter] = optBtn.dataset.chooseAnswer.split(":");
            const qNum = parseInt(qNumStr, 10);
            if (!Number.isFinite(qNum)) return;
            uiState.practice.answers[qNum] = letter;

            // Lightweight local visual update without losing scroll position
            const card = $(`q-card-${qNum}`);
            if (card) {
                card.querySelectorAll("[data-choose-answer]").forEach((btn) => {
                    const [, btnLetter] = btn.dataset.chooseAnswer.split(":");
                    btn.classList.toggle("is-selected", btnLetter === letter);
                });
            }
            updatePracticeAnswerSheet();
        }
    });

    // 4 Mobile-Safe Split Copy Buttons
    dom.btnCopySlice1To17.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        copyTextToClipboard(buildSlice1To17Text(uiState.currentExam), "Câu 1–17 (Quảng cáo, Tờ rơi & Sắp xếp)");
    });
    dom.btnCopySlice18To30.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        copyTextToClipboard(buildSlice18To30Text(uiState.currentExam), "Câu 18–30 (Điền khuyết & Đọc ngắn)");
    });
    dom.btnCopySlice31To40.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        copyTextToClipboard(buildSlice31To40Text(uiState.currentExam), "Câu 31–40 (Đọc hiểu đoạn dài)");
    });
    dom.btnCopySliceAnswers.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        copyTextToClipboard(buildAnswersAndExplanationsText(uiState.currentExam), "Đáp án, Giải thích Tiếng Việt & Từ vựng");
    });
    dom.btnCopyAnswersBottom.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        copyTextToClipboard(buildAnswersAndExplanationsText(uiState.currentExam), "Đáp án, Giải thích Tiếng Việt & Từ vựng");
    });

    // Download .txt & Clean Print
    dom.btnDownloadTxt.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        const txt = buildFullTxtExamDocument(uiState.currentExam);
        const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `De-Thi-Tieng-Anh-THPTQG-2026-MaDe-${uiState.currentExam.examCode || "401"}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Đã tải xuống tệp .txt cho Mã đề ${uiState.currentExam.examCode}.`, "success");
    });

    dom.btnPrintExamOnly.addEventListener("click", () => handlePrintClean(true));
    dom.btnPrintFull.addEventListener("click", () => handlePrintClean(false));
}

async function bootApp() {
    syncThemeIcons();
    bindEvents();
    updateAiStatusBadges();

    serverHealthBootPromise = aiClient.detectServerHealth().then(() => {
        updateAiStatusBadges();
        const modeInfo = aiClient.getConnectionModeLabel();
        addLog(
            `[Boot] Sẵn sàng · AI: ${modeInfo.label} (${modeInfo.detail}) · Proxy /api/harvest: ${aiClient.serverHealth.proxyAvailable ? "Bật" : "Static"}`,
            "info"
        );
    });

    await storage.boot();
    updateStorageAndHistoryUI();
}

bootApp();
