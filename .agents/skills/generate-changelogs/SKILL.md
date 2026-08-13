---
name: generate-changelogs
description: Instructions for formatting changelogs for WhatsApp (Russian) and Google Play (English) when asked to create a changelog.
---

# Generate Changelogs

Whenever the user asks you to "create a changelog", "write a changelog", or similar, you MUST generate the changelogs in the following two formats and output them inside markdown code blocks:

## 1. WhatsApp Detailed Changelog (Russian)
- **Language**: Russian
- **Platform**: WhatsApp
- **Formatting**: Use WhatsApp specific markdown (`*bold*`, `_italic_`). Do NOT use standard markdown headers (like `#` or `##`).
- **Tone**: Friendly, engaging, using appropriate emojis.
- **Content**: Detailed explanation of what was fixed, why it matters, and how it improves the user experience. Group into bullet points.

## 2. Google Play Short Changelog (English)
- **Language**: English
- **Platform**: Google Play Store
- **Formatting**: Plain text with simple bullet points (e.g., `- `). Keep it concise.
- **Tone**: Professional, direct, action-oriented.
- **Content**: Short summary of bug fixes, new features, and performance improvements.
