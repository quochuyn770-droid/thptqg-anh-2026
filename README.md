# THPTQG 2026 Tiếng Anh — Real-Source Harvester & Exam Studio

Website độc lập chuyên **Kéo Ngữ Liệu Tiếng Anh Thực Tế & Biên Soạn Đề Thi THPTQG Môn Tiếng Anh 2026** theo đúng cấu trúc **Chương trình GDPT 2018 (QĐ 764/QĐ-BGDĐT)**: **40 câu trắc nghiệm · 50 phút · 10,0 điểm (0,25 điểm/câu)** — loại bỏ hoàn toàn các dạng câu hỏi cũ (phát âm, trọng âm, tìm lỗi sai gạch chân).

Dự án chạy **0 phụ thuộc npm ngoài** (Node.js ≥ 20 ESM), triển khai trực tiếp lên **Vercel**, **Netlify** hoặc chạy cục bộ.

---

## Tính năng nổi bật

1. **Bám sát 100% ma trận 6 phần / 40 câu theo QĐ 764/QĐ-BGDĐT:**
   - **Phần 1 (Câu 1–6):** Đọc điền Quảng cáo / Thông báo (từ loại, trật tự cụm danh từ, rút gọn mệnh đề quan hệ, giới từ, collocation, dạng động từ).
   - **Phần 2 (Câu 7–12):** Đọc điền Tờ rơi / Hướng dẫn (lượng từ, phrasal verbs, từ nối/liên từ, từ vựng theo ngữ cảnh).
   - **Phần 3 (Câu 13–17):** Sắp xếp tạo hội thoại (2 câu), thư/email (1 câu) và đoạn văn (2 câu).
   - **Phần 4 (Câu 18–22):** Đọc điền khuyết câu / mệnh đề vào đoạn văn từ bài viết thật.
   - **Phần 5 (Câu 23–30):** Đọc hiểu đoạn ngắn (~250–300 từ) — NOT mentioned, trái nghĩa, quy chiếu đại từ, đồng nghĩa, paraphrase câu, thông tin TRUE, 2 câu định vị đoạn.
   - **Phần 6 (Câu 31–40):** Đọc hiểu đoạn dài (~350–450 từ) — chèn câu `[I]`, `[II]`, `[III]`, `[IV]`, đồng/trái nghĩa, quy chiếu, NOT mentioned, tóm tắt đoạn, TRUE, paraphrase, suy luận (`inferred`), ý chính toàn bài.
2. **Kéo ngữ liệu Tiếng Anh thật qua proxy `/api/harvest` (không cần API Key trả phí, không lỗi CORS):**
   - **Khoa học & Học thuật:** Wikipedia REST/Action API, OpenAlex Works API, Europe PMC REST API.
   - **Báo chí & Khoa học đại chúng (RSS/Atom):** The Guardian, ScienceDaily, The Conversation, NPR.
   - Sử dụng **128-bit CSPRNG** chọn ngẫu nhiên bài chưa từng dùng, hiển thị rõ **tên nguồn và đường dẫn bài viết gốc**.
3. **Biên soạn AI 4 lượt tuần tự kèm thanh tiến trình trực tiếp:**
   - Hỗ trợ 3 mức độ: **Chuẩn BGD (B1–B2)**, **Phân hóa cao 8.5–9+ (B2–C1)** và **Vận dụng cao 9.5–10 (B2–C2 nâng cao)**.
   - Chia thành 4 lượt gọi AI tuần tự (`1–12`, `13–22`, `23–30`, `31–40`) để tránh timeout trên Vercel Serverless Functions (`maxDuration: 60s`).
   - Hỗ trợ cả **Server Proxy (`/api/ai`)** bảo mật API Key trên máy chủ và **BYOK trên trình duyệt** (Google Gemini, GroqCloud, OpenRouter, Custom OpenAI-Compatible).
4. **Chống trùng lặp 3 lớp + Lưu lịch sử bền vững bằng IndexedDB:**
   - Khóa chống trùng 3 lớp: **Source ID + SHA-256 + 3-Gram Jaccard (> 65%)** cùng bộ lọc loại trừ dạng đề cũ (Phát âm / Trọng âm / Tìm lỗi sai).
   - Lưu lịch sử vĩnh viễn trong **IndexedDB** kèm **Xuất / Nhập `.json`** và tùy chọn đồng bộ **Firebase Cloud**.
5. **Chế độ Làm bài tương tác 50 phút, Copy di động & Bản in A4 sạch:**
   - **Làm bài trực tiếp trên web:** đồng hồ đếm ngược `50:00`, phiếu tô trắc nghiệm 1–40, chấm điểm tự động thang 10 (`0,25đ/câu`) và phân tích độ chính xác theo 6 phần.
   - **Xem toàn văn đề + Đáp án:** giải thích chi tiết bằng **Tiếng Việt** cho đủ 40 câu và **Danh sách Từ vựng & Collocations đáng chú ý**.
   - **Nút Copy chia nhỏ an toàn trên điện thoại** (biểu tượng 2 tờ giấy chồng + bộ đếm ký tự): `Copy Câu 1–17`, `Copy Câu 18–30`, `Copy Câu 31–40`, `Copy Đáp án & Giải thích`, tải tệp `.txt` và bản in A4 sạch.

---

## Triển khai nhanh

### 1. Deploy lên Vercel (Khuyên dùng)
1. Import kho GitHub này vào [vercel.com](https://vercel.com) → bấm **Deploy** (`vercel.json` đã cấu hình sẵn `outputDirectory: "public"` và thời hạn cho `/api/ai`, `/api/harvest`).
2. *(Tùy chọn để ẩn API Key phía server)*: Thêm biến môi trường trong **Project Settings → Environment Variables**:
   - `GEMINI_API_KEY` (lấy miễn phí tại [aistudio.google.com/apikey](https://aistudio.google.com/apikey))
   - Hoặc `GROQ_API_KEY`, `OPENROUTER_API_KEY`
3. Redeploy để kích hoạt Server Proxy.

### 2. Deploy lên Netlify
- Import kho vào [app.netlify.com](https://app.netlify.com) (`netlify.toml` đã cấu hình sẵn `publish = "public"` và chuyển hướng `/api/* → /.netlify/functions/:splat`).

### 3. Chạy trên máy cá nhân (Node.js ≥ 20, không cần `npm install`)
```bash
cp .env.example .env    # (Tùy chọn) điền GEMINI_API_KEY hoặc GROQ_API_KEY
npm start               # Mở http://localhost:3000
```

---

## Kiểm thử tự động

```bash
npm test
```