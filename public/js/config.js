/**
 * Application Configuration, Free AI Providers, Open English Real Sources,
 * CEFR Difficulty Levels, and QĐ 764/QĐ-BGDĐT (GDPT 2018) 40-Question Exam Blueprint.
 */

export const APP_BUILD_VERSION = "v2.2";
export const DEFAULT_VAULT_KEY = "THPTQG-ANH-2026";

export const STORAGE_KEYS = {
    AI_SETTINGS: "thptqg_anh2026_ai_settings_v1",
    FIREBASE_CONFIG: "thptqg_anh2026_firebase_config_v1",
    THEME: "thptqg_anh2026_theme_v1"
};

/**
 * Curated Free-Tier AI Providers (No Credit Card Required).
 */
export const AI_PROVIDERS = {
    gemini: {
        id: "gemini",
        name: "Google Gemini (AI Studio)",
        badge: "Khuyên dùng · Miễn phí",
        shortLabel: "Gemini Free",
        keyUrl: "https://aistudio.google.com/apikey",
        keyUrlLabel: "Lấy API Key miễn phí tại Google AI Studio",
        keyPlaceholder: "AIzaSy...",
        supportsGoogleSearch: true,
        supportsThinkingLevel: true,
        defaultModel: "gemini-3.5-flash-lite",
        fallbackModels: [
            "gemini-3.5-flash-lite",
            "gemini-3.8-flash",
            "gemini-3.6-flash",
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemini-4-hydrogen",
            "gemini-3-flash-preview"
        ],
        models: [
            {
                id: "gemini-3.5-flash-lite",
                label: "Gemini 3.5 Flash-Lite (Khuyên dùng · Nhanh · 15 RPM / 500 lượt/ngày)",
                hint: "Tốc độ phản hồi rất nhanh (~8–15s/lượt), không lo timeout Vercel, hạn mức miễn phí cao (~100+ đề/ngày)."
            },
            {
                id: "gemini-3.8-flash",
                label: "Gemini 3.8 Flash (Văn phong Tiếng Anh học thuật cao · Miễn phí)",
                hint: "Viết bài đọc B2–C1 tự nhiên, distractor tinh tế và giải thích Tiếng Việt chuẩn xác."
            },
            {
                id: "gemini-3.6-flash",
                label: "Gemini 3.6 Flash (Ổn định · Miễn phí)",
                hint: "Cân bằng giữa tốc độ biên soạn và chất lượng học thuật."
            },
            {
                id: "gemini-4-hydrogen",
                label: "Gemini 4 Hydrogen (Thế hệ 4 mới nhất · Miễn phí)",
                hint: "Suy luận ngôn ngữ rất sâu (phù hợp mức 9.5–10 C1–C2; tự chuyển dự phòng ngay nếu quá tải)."
            },
            {
                id: "gemini-3-flash-preview",
                label: "Gemini 3 Flash Preview (Dự phòng · Miễn phí)",
                hint: "Model dự phòng ổn định khi các model chính tạm giới hạn."
            }
        ]
    },
    groq: {
        id: "groq",
        name: "GroqCloud (Siêu tốc LPU)",
        badge: "Siêu nhanh · 1.000 lượt/ngày",
        shortLabel: "Groq Free",
        keyUrl: "https://console.groq.com/keys",
        keyUrlLabel: "Lấy API Key miễn phí tại Groq Console",
        keyPlaceholder: "gsk_...",
        supportsGoogleSearch: false,
        supportsThinkingLevel: false,
        defaultModel: "openai/gpt-oss-120b",
        fallbackModels: [
            "openai/gpt-oss-120b",
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-20b"
        ],
        models: [
            {
                id: "openai/gpt-oss-120b",
                label: "OpenAI GPT-OSS 120B (Mạnh nhất · 30 RPM / 1K RPD)",
                hint: "Tốc độ ~500 token/s, biên soạn bài đọc Tiếng Anh học thuật và giải thích Tiếng Việt rất mượt."
            },
            {
                id: "qwen/qwen3.8-27b",
                label: "Qwen 3.8 27B (Song ngữ Anh–Việt tốt · Miễn phí)",
                hint: "Giải thích ngữ pháp & từ vựng bằng Tiếng Việt rõ ràng, 30 RPM / 1K RPD."
            },
            {
                id: "openai/gpt-oss-20b",
                label: "OpenAI GPT-OSS 20B (Cực nhanh ~1000 tok/s · Miễn phí)",
                hint: "Phản hồi gần như tức thì, phù hợp tạo đề nhanh trên gói miễn phí."
            }
        ]
    },
    openrouter: {
        id: "openrouter",
        name: "OpenRouter (Free Router)",
        badge: "Đa model $0 · Không cần thẻ",
        shortLabel: "OpenRouter Free",
        keyUrl: "https://openrouter.ai/keys",
        keyUrlLabel: "Lấy API Key miễn phí tại OpenRouter",
        keyPlaceholder: "sk-or-v1-...",
        supportsGoogleSearch: false,
        supportsThinkingLevel: false,
        defaultModel: "openrouter/free",
        fallbackModels: ["openrouter/free"],
        models: [
            {
                id: "openrouter/free",
                label: "openrouter/free (Tự động chọn model $0 đang rảnh)",
                hint: "Router chính thức của OpenRouter — luôn tự định tuyến tới model miễn phí đang hoạt động tốt nhất."
            }
        ]
    },
    custom: {
        id: "custom",
        name: "Custom OpenAI-Compatible",
        badge: "Cerebras / Mistral / Ollama",
        shortLabel: "Custom AI",
        keyUrl: "",
        keyUrlLabel: "Dùng với mọi API chuẩn /v1/chat/completions",
        keyPlaceholder: "API Key (để trống nếu dùng Ollama local)",
        supportsGoogleSearch: false,
        supportsThinkingLevel: false,
        defaultModel: "",
        fallbackModels: [],
        models: []
    }
};

/**
 * 4 Public Reputable English RSS / Atom News & Science Feeds
 * (Fetched via /api/harvest server-side proxy to eliminate browser CORS errors)
 */
export const RSS_FEED_SOURCES = [
    {
        id: "guardian-science",
        providerKey: "guardian",
        sourceName: "The Guardian · Science",
        category: "rss",
        domain: "science_env",
        url: "https://www.theguardian.com/science/rss"
    },
    {
        id: "guardian-environment",
        providerKey: "guardian",
        sourceName: "The Guardian · Environment",
        category: "rss",
        domain: "science_env",
        url: "https://www.theguardian.com/environment/rss"
    },
    {
        id: "guardian-technology",
        providerKey: "guardian",
        sourceName: "The Guardian · Technology",
        category: "rss",
        domain: "science_env",
        url: "https://www.theguardian.com/technology/rss"
    },
    {
        id: "guardian-education",
        providerKey: "guardian",
        sourceName: "The Guardian · Education",
        category: "rss",
        domain: "society_edu",
        url: "https://www.theguardian.com/education/rss"
    },
    {
        id: "guardian-lifeandstyle",
        providerKey: "guardian",
        sourceName: "The Guardian · Life & Style",
        category: "rss",
        domain: "society_edu",
        url: "https://www.theguardian.com/lifeandstyle/rss"
    },
    {
        id: "sciencedaily-top",
        providerKey: "sciencedaily",
        sourceName: "ScienceDaily · Top Science",
        category: "rss",
        domain: "science_env",
        url: "https://www.sciencedaily.com/rss/top/science.xml"
    },
    {
        id: "sciencedaily-earth",
        providerKey: "sciencedaily",
        sourceName: "ScienceDaily · Earth & Climate",
        category: "rss",
        domain: "science_env",
        url: "https://www.sciencedaily.com/rss/earth_climate.xml"
    },
    {
        id: "sciencedaily-mind",
        providerKey: "sciencedaily",
        sourceName: "ScienceDaily · Mind & Brain",
        category: "rss",
        domain: "society_edu",
        url: "https://www.sciencedaily.com/rss/mind_brain.xml"
    },
    {
        id: "sciencedaily-health",
        providerKey: "sciencedaily",
        sourceName: "ScienceDaily · Health & Medicine",
        category: "rss",
        domain: "science_env",
        url: "https://www.sciencedaily.com/rss/health_medicine.xml"
    },
    {
        id: "conversation-global",
        providerKey: "conversation",
        sourceName: "The Conversation · Global",
        category: "rss",
        domain: "society_edu",
        url: "https://theconversation.com/global/articles.atom"
    },
    {
        id: "conversation-us",
        providerKey: "conversation",
        sourceName: "The Conversation · US",
        category: "rss",
        domain: "society_edu",
        url: "https://theconversation.com/us/articles.atom"
    },
    {
        id: "npr-science",
        providerKey: "npr",
        sourceName: "NPR · Science",
        category: "rss",
        domain: "science_env",
        url: "https://feeds.npr.org/1007/rss.xml"
    },
    {
        id: "npr-environment",
        providerKey: "npr",
        sourceName: "NPR · Climate & Environment",
        category: "rss",
        domain: "science_env",
        url: "https://feeds.npr.org/1025/rss.xml"
    },
    {
        id: "npr-technology",
        providerKey: "npr",
        sourceName: "NPR · Technology",
        category: "rss",
        domain: "science_env",
        url: "https://feeds.npr.org/1019/rss.xml"
    },
    {
        id: "npr-education",
        providerKey: "npr",
        sourceName: "NPR · Education",
        category: "rss",
        domain: "society_edu",
        url: "https://feeds.npr.org/1013/rss.xml"
    },
    {
        id: "npr-health",
        providerKey: "npr",
        sourceName: "NPR · Health",
        category: "rss",
        domain: "society_edu",
        url: "https://feeds.npr.org/1128/rss.xml"
    }
];

export const WIKIPEDIA_TOPICS = [
    { query: "Sustainable urban planning green cities", domain: "science_env" },
    { query: "Renewable energy transition solar wind", domain: "science_env" },
    { query: "Coral reef conservation marine biodiversity", domain: "science_env" },
    { query: "Artificial intelligence in education learning", domain: "society_edu" },
    { query: "Circular economy zero waste recycling", domain: "science_env" },
    { query: "Cultural heritage preservation UNESCO", domain: "society_edu" },
    { query: "Lifelong learning digital literacy", domain: "society_edu" },
    { query: "Ecotourism sustainable travel communities", domain: "society_edu" },
    { query: "Urban agriculture vertical farming", domain: "science_env" },
    { query: "Sleep hygiene adolescent mental health", domain: "society_edu" },
    { query: "Future of work remote collaboration automation", domain: "society_edu" },
    { query: "Biodiversity loss reforestation climate adaptation", domain: "science_env" },
    { query: "Public transport smart cities mobility", domain: "science_env" },
    { query: "Multilingualism cognitive benefits language", domain: "society_edu" }
];

export const OPENALEX_TOPICS = [
    { query: "urban green spaces mental health wellbeing", domain: "society_edu" },
    { query: "renewable energy transition sustainability", domain: "science_env" },
    { query: "artificial intelligence higher education learning", domain: "society_edu" },
    { query: "climate change coastal adaptation biodiversity", domain: "science_env" },
    { query: "microplastics marine ecosystems food web", domain: "science_env" },
    { query: "digital literacy social media adolescents", domain: "society_edu" },
    { query: "sustainable agriculture vertical farming water", domain: "science_env" },
    { query: "sleep quality cognitive performance students", domain: "society_edu" },
    { query: "cultural heritage sustainable tourism", domain: "society_edu" },
    { query: "circular economy plastic waste recycling", domain: "science_env" }
];

export const EUROPE_PMC_TOPICS = [
    { query: "adolescent sleep duration cognitive performance", domain: "society_edu" },
    { query: "urban green space mental wellbeing stress", domain: "society_edu" },
    { query: "climate change public health heatwaves", domain: "science_env" },
    { query: "mediterranean diet brain health nutrition", domain: "society_edu" },
    { query: "air pollution respiratory health renewable energy", domain: "science_env" },
    { query: "digital screen time youth physical activity", domain: "society_edu" },
    { query: "biodiversity ecosystem services human health", domain: "science_env" }
];

export const SOURCE_FOCUS_CONFIG = {
    all_mixed: {
        label: "🌐 Tổng hợp 7 nguồn (Báo chí RSS + Khoa học + Wiki)",
        rssWeight: 0.55,
        domainFilter: "all"
    },
    news_rss: {
        label: "📰 Ưu tiên Báo chí RSS (Guardian, NPR, Conversation, ScienceDaily)",
        rssWeight: 0.8,
        domainFilter: "all"
    },
    academic: {
        label: "🔬 Ưu tiên Học thuật (OpenAlex, Europe PMC, Wikipedia)",
        rssWeight: 0.25,
        domainFilter: "all"
    },
    science_env: {
        label: "🌿 Chủ đề Khoa học, Công nghệ & Môi trường",
        rssWeight: 0.55,
        domainFilter: "science_env"
    },
    society_edu: {
        label: "🎓 Chủ đề Xã hội, Giáo dục, Văn hóa & Sức khỏe",
        rssWeight: 0.55,
        domainFilter: "society_edu"
    }
};

export const DIFFICULTY_CONFIG = {
    standard: {
        label: "Chuẩn BGD (B1–B2)",
        cefr: "B1–B2",
        guidance:
            "Bám sát chuẩn Đề minh họa QĐ 764/QĐ-BGDĐT (GDPT 2018): mức độ B1–B2, cân đối 40% Nhận biết, 30% Thông hiểu, 20% Vận dụng, 10% Vận dụng cao. Từ vựng học thuật vừa phải, phương án nhiễu hợp lý, văn phong tiếng Anh tự nhiên."
    },
    high: {
        label: "Phân hóa cao 8.5–9+ (B2–C1)",
        cefr: "B2–C1",
        guidance:
            "Mức độ phân hóa cao 8.5–9+ (khung B2–C1): tăng cường collocations học thuật, phrasal verbs tinh tế, cấu trúc rút gọn/phân từ phức hợp, phương án nhiễu sát nghĩa (close distractors) trong đọc hiểu, paraphrase tinh vi và câu suy luận (inference) đòi hỏi tổng hợp nhiều câu."
    },
    extreme: {
        label: "Vận dụng cao 9.5–10 (B2–C2 nâng cao)",
        cefr: "B2–C2",
        guidance:
            "Mức độ thử thách mục tiêu 9.5–10 điểm (khung B2–C2 nâng cao): sử dụng ngữ liệu học thuật chiều sâu chuẩn báo chí quốc tế (The Guardian / Nature-style), từ vựng đa nghĩa C1–C2, thành ngữ/cụm cố định nâng cao, câu chèn [I]–[IV] và câu suy luận đòi hỏi tư duy phản biện sắc bén nhưng đáp án vẫn duy nhất, chặt chẽ, không gây tranh cãi."
    }
};

export const EXAM_SECTIONS_META = [
    {
        id: "part1",
        title: "Phần 1 · Đọc điền Quảng cáo / Thông báo",
        shortTitle: "Quảng cáo / Thông báo",
        range: "Câu 1–6",
        start: 1,
        end: 6,
        count: 6,
        points: 1.5,
        accent: "sky"
    },
    {
        id: "part2",
        title: "Phần 2 · Đọc điền Tờ rơi / Hướng dẫn",
        shortTitle: "Tờ rơi / Hướng dẫn",
        range: "Câu 7–12",
        start: 7,
        end: 12,
        count: 6,
        points: 1.5,
        accent: "teal"
    },
    {
        id: "part3",
        title: "Phần 3 · Sắp xếp Hội thoại, Thư & Đoạn văn",
        shortTitle: "Sắp xếp câu / đoạn",
        range: "Câu 13–17",
        start: 13,
        end: 17,
        count: 5,
        points: 1.25,
        accent: "amber"
    },
    {
        id: "part4",
        title: "Phần 4 · Đọc điền khuyết Câu / Mệnh đề",
        shortTitle: "Điền khuyết câu/mệnh đề",
        range: "Câu 18–22",
        start: 18,
        end: 22,
        count: 5,
        points: 1.25,
        accent: "emerald"
    },
    {
        id: "part5",
        title: "Phần 5 · Đọc hiểu đoạn ngắn (~250–300 từ)",
        shortTitle: "Đọc hiểu đoạn ngắn",
        range: "Câu 23–30",
        start: 23,
        end: 30,
        count: 8,
        points: 2.0,
        accent: "blue"
    },
    {
        id: "part6",
        title: "Phần 6 · Đọc hiểu đoạn dài (~350–450 từ)",
        shortTitle: "Đọc hiểu đoạn dài",
        range: "Câu 31–40",
        start: 31,
        end: 40,
        count: 10,
        points: 2.5,
        accent: "rose"
    }
];

export const SYSTEM_INSTRUCTION_ENGLISH_2026 = `Bạn là chuyên gia hàng đầu biên soạn Đề thi Tốt nghiệp THPT Môn Tiếng Anh năm 2026 theo Chương trình GDPT 2018 (Quyết định 764/QĐ-BGDĐT).

QUY TẮC BẮT BUỘC TUYỆT ĐỐI:
1. KHÔNG BAO GIỜ ra các dạng câu hỏi cũ đã bị loại bỏ khỏi cấu trúc 2025–2026: TUYỆT ĐỐI KHÔNG có câu phát âm (pronunciation), KHÔNG có câu trọng âm (word stress), KHÔNG có câu tìm lỗi sai gạch chân (error identification), KHÔNG dùng ký hiệu LaTeX hay KaTeX.
2. Mọi bài đọc, câu hỏi và 4 phương án A, B, C, D PHẢI viết bằng tiếng Anh tự nhiên, chuẩn mực (British/International Academic English), kiểm tra chặt chẽ để MỖI câu chỉ có DUY NHẤT 1 đáp án đúng hoàn toàn không gây tranh cãi.
3. Phân bổ đều vị trí đáp án đúng (A, B, C, D), tránh lặp cùng một chữ cái quá 3 câu liên tiếp.
4. Quy ước đánh dấu định dạng sạch trong văn bản bài đọc:
   - Chỗ trống đánh số ghi chính xác: (1) ______, (2) ______, ..., (22) ______
   - Từ/cụm từ/đại từ được hỏi đồng nghĩa, trái nghĩa hoặc quy chiếu trong bài đọc PHẢI bọc trong dấu sao đôi: **từ_đó** (ví dụ: **resilient**, **they**, **outstrip**).
   - Câu được hỏi Paraphrase trong bài đọc PHẢI bọc trong dấu gạch dưới đôi: __Toàn bộ câu cần paraphrase.__ (không lồng ** bên trong __).
   - 4 vị trí chèn câu trong bài Đọc hiểu đoạn dài PHẢI đánh dấu rõ trong đúng 1 đoạn văn (hoặc rải hợp lý trong 1 đoạn có tính liên kết cao) bằng đúng ký hiệu: [I], [II], [III], [IV].
5. Giải thích chi tiết (explanationVi) viết bằng TIẾNG VIỆT rõ ràng, sư phạm:
   - Nêu rõ kiến thức kiểm tra (từ loại, rút gọn mệnh đề quan hệ, collocation, phrasal verb, quy chiếu, suy luận...).
   - Chỉ rõ lý do phương án đúng (trích dẫn ngắn bằng chứng trong đoạn mấy nếu là bài đọc) và phân tích ngắn gọn vì sao các phương án nhiễu sai.
6. Danh sách từ vựng / collocation đáng chú ý (vocabulary): chọn các từ, cụm động từ, collocations đắt giá xuất hiện ngay trong bài (kèm từ loại, trình độ B1/B2/C1/C2, nghĩa tiếng Việt chính xác và cụm ví dụ ngắn).
7. Chỉ trả về ĐÚNG 1 đối tượng JSON hợp lệ khớp hoàn toàn JSON Schema yêu cầu.`;
