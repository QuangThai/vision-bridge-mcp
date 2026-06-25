# Provider Benchmark

So sánh accuracy giữa các provider trên bộ golden fixtures (19 fixtures × 2 modes = 38 tests).

> **Run:** 2026-06-25 · **Threshold:** 30% text match · **Models:** gpt-4o-mini / gemini-2.0-flash

## Tổng quan

| Provider | Pass | Fail | Pass rate | Text match rate |
|----------|:----:|:----:|:---------:|:---------------:|
| `openai-compatible` | 26 | 12 | **68%** | **93.8%** |
| `openai-responses` | 26 | 12 | **68%** | **93.8%** |
| `gemini` ⚠️ | 0 | 38 | 0% | N/A (quota) |

> ⚠️ Gemini free tier quota đã hết (0 requests còn lại) — chưa thể benchmark.

## openai-compatible vs openai-responses (gpt-4o-mini)

Kết quả **giống hệt nhau** — vì cùng model gpt-4o-mini qua endpoint khác nhau.

### ✅ Pass (26/38)

| Fixture | analyze | ocr |
|---------|:-------:|:---:|
| web-simple | ✅ | ✅ |
| diagram-agent-arch | ✅ | ✅ |
| diagram-company-arch | ✅ | ✅ |
| chart-revenue | ✅ | ✅ |
| error-dialog | ✅ | ✅ |
| form-ui | ✅ | ✅ |
| dashboard | ✅ | ✅ |
| dark-mode-ui | ✅ | ✅ |
| gradient | ✅ | ❌ |
| code-lines | ✅ | ❌ |
| blurry | ✅ | ❌ |
| tiny-icon | ✅ | ❌ |
| wide | ✅ | ❌ |
| **vietnamese-text** 🆕 | ✅ | ✅ |
| **cjk-text** 🆕 | ❌ | ✅ |
| **ui-components** 🆕 | ✅ | ✅ |

### ❌ Fail (12) — mostly edge-case fixtures

| Fixture | Lý do |
|---------|-------|
| solid-color | Không có text để detect |
| dark (near-black) | Ảnh quá tối |
| table-grid | Pixel pattern, không phải real table |
| gradient, dark, blurry, code-lines, tiny-icon, wide (OCR) | Programmatic images không có real text |

### Vietnamese/CJK results

| Fixture | analyze | ocr | Ghi chú |
|---------|:-------:|:---:|---------|
| vietnamese-text | ✅ | ✅ | Đọc chính xác phở, bánh mì, nông dân, xuất khẩu gạo |
| cjk-text | ❌ | ✅ | OCR đọc được tiếng Nhật/Trung/Hàn; analyze không detect observations |
| ui-components | ✅ | ✅ | Nhận diện buttons, cards, form inputs |

## Kết luận

1. **openai-compatible** và **openai-responses** có accuracy tương đương — cùng model
2. **Vietnamese text** được OCR chính xác (phở, bánh mì, Cộng hòa Xã hội Chủ nghĩa...)
3. **CJK text** — OCR hoạt động, analyze cần cải thiện với multi-language images
4. **Edge cases** (solid-color, dark, blurry) expected fail — không có text thật

## Chi phí

| Provider | Calls | Tokens | Chi phí |
|----------|:-----:|:------:|:-------:|
| gpt-4o-mini (all time) | 253 | 7.68M | ~$1.20 |
