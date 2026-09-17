# 📄 PDF Quiz Maker & Flashcard Suite

> Turn any text-based PDF into multiple-choice quizzes and interactive 3D flashcards instantly — **100% in your browser**. No server, no uploads, no accounts, and works completely offline.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Security: Strict CSP](https://img.shields.io/badge/Security-Strict%20CSP-green.svg)](#-cyber-security--privacy)
[![PWA: Offline Ready](https://img.shields.io/badge/PWA-Offline%20Ready-purple.svg)](#-offline-pwa)
[![Deployment: GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-blue.svg)](#-deployment)

---

## ✨ Features

### 1. 🎯 Three Flexible Learning Modes
- **Quiz Mode**: Standard multiple-choice challenge with animated scoring, streak tracking (`🔥`), and optional circular countdown timer (`15s / 30s / 60s`).
- **Study Mode**: Low-pressure practice with instant answer reveal and a **"📌 Concepts to Review"** breakdown at the end.
- **Flashcard Mode**: Interactive **3D card-flip** interface (`Space` to flip, `1` for Still Learning, `2` for Knew It) for spaced repetition and self-testing.

### 2. 🤖 Free In-Browser AI (Transformers.js)
- **Zero Server / Zero Cost**: Runs lightweight quantized sentence transformer embeddings (`Xenova/all-MiniLM-L6-v2`) 100% in your browser using WebGPU/WASM.
- **Semantic Distractor Enhancement**: Calculates cosine similarity across document keywords to generate realistic, challenging distractors from the same conceptual domain.
- **Instant Fallback**: Defaults to high-speed heuristic rules (0 MB download) with opt-in AI mode and offline fallback.

### 3. 🔊 Audio Study Mode & Web Audio Synthesizer
- **Synthesized Audio Chimes**: Custom harmonic chords generated directly via the Web Audio API:
  - 🎶 C-Major arpeggio on correct answers
  - 🔔 Sub-bass drop on wrong answers
  - 🃏 Crisp tactile click on card flips
  - 🎺 Rising fanfare on streaks (3+ in a row)
- **Text-to-Speech (TTS)**: Native browser speech synthesis reads questions, options, and flashcard answers aloud with the click of a button or pressing <kbd>R</kbd>.

### 4. 🖨️ Printable Exam & Worksheet Generator
- Generates clean, printer-ready paper worksheets formatted for standard letter/A4 printing.
- Includes candidate header (`Name`, `Date`, `Score`), numbered questions with bubble circles `(A) (B) (C) (D)`.
- Features a **detachable Answer Key & Source Context reference** section on the final page separated by an automated print page break.

### 5. 🧠 Spaced Repetition (Leitner 5-Box System)
- Automatically schedules cards across 5 Leitner boxes based on your mastery:
  - **Box 1**: 1 day interval (cards needing practice)
  - **Box 2**: 3 days interval
  - **Box 3**: 7 days interval
  - **Box 4**: 14 days interval
  - **Box 5**: 30 days interval (mastered)
- Includes a live dashboard on the home screen showing your card inventory and a **"Study Due Cards"** session launcher.

### 6. ⭐ Question Bookmarking & Exporters
- Flag tricky questions anytime during a session with the **Star button** or by pressing <kbd>B</kbd> / <kbd>S</kbd>.
- **Export to Anki (`.tsv`)**: Direct import into Anki with clean tags and formatted context.
- **Export to JSON**: Structured data for backups, integrations, and LMS systems.

### 7. 📴 Offline PWA (Progressive Web App)
- Ships with `sw.js` (Service Worker v6) pre-caching all scripts, styles, and PDF engines.
- Add to Home Screen on iOS, Android, macOS, or Windows for a standalone app experience without internet access.

### 8. 🛡️ Government-Grade Cyber Security & Privacy
- **Zero Server Uploads**: The PDF file and extracted text exist only in transient browser memory.
- **Strict Content Security Policy (CSP)**:
  ```http
  default-src 'none';
  script-src 'self' https://cdn.jsdelivr.net;
  style-src 'self';
  worker-src 'self' blob:;
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self' https://huggingface.co https://*.huggingface.co https://cdn.jsdelivr.net;
  object-src 'none';
  base-uri 'none';
  form-action 'none';
  frame-ancestors 'none';
  upgrade-insecure-requests
  ```
- **Zero `eval()`**: PDF.js configured with `isEvalSupported: false`.
- **Zero `innerHTML`**: All DOM nodes constructed via safe `createElement` and `textContent`.
- **No Tracking**: Zero user tracking, telemetry, or analytics cookies.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Mode |
|---|---|---|
| <kbd>A</kbd> <kbd>B</kbd> <kbd>C</kbd> <kbd>D</kbd> or <kbd>1</kbd>–<kbd>4</kbd> | Select answer option | Quiz / Study |
| <kbd>T</kbd> / <kbd>F</kbd> | True / False selection | Quiz / Study |
| <kbd>Space</kbd> | Flip 3D flashcard (Front ⟷ Back) | Flashcards |
| <kbd>1</kbd> or <kbd>←</kbd> | Rate "Still Learning" | Flashcards |
| <kbd>2</kbd> or <kbd>→</kbd> | Rate "Knew It" | Flashcards |
| <kbd>S</kbd> or <kbd>B</kbd> | Toggle bookmark (Star) | All |
| <kbd>R</kbd> | Read aloud question & options (TTS) | All |
| <kbd>Enter</kbd> | Advance to next question | Quiz / Study |
| <kbd>M</kbd> | Toggle Dark / Light theme | All |
| <kbd>?</kbd> | Open Keyboard Shortcuts cheatsheet | All |
| <kbd>Esc</kbd> | Close modal dialogs | All |

---

## 🚀 GitHub Pages Deployment

This repository is pre-configured for automated GitHub Pages hosting.

### Option A: Automated GitHub Actions (Recommended)
1. Push this repository to your GitHub account:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/pdf-quiz-maker.git
   git push -u origin main
   ```
2. On GitHub, navigate to **Settings** → **Pages**.
3. Under **Build and deployment** → **Source**, select **GitHub Actions**.
4. The included workflow (`.github/workflows/deploy.yml`) will automatically publish your site on every push!

### Option B: Direct Branch Deployment
1. On GitHub, go to **Settings** → **Pages**.
2. Under **Source**, select **Deploy from a branch**.
3. Select branch **`main`** and folder **`/ (root)`**, then click **Save**.

---

## 🛠️ Local Development & Building CSS

This project is completely static, with Tailwind CSS pre-compiled into `tailwind.css`.

### Running Locally
You can serve the directory with any static file server:
```bash
# Using Node serve
npx serve . --listen 8181

# Or using Python 3
python -m http.server 8181
```
Then visit `http://localhost:8181`.

### Rebuilding Tailwind CSS
If you edit `tailwind.src.css` or add classes:
```bash
npx tailwindcss -i tailwind.src.css -o tailwind.css --minify
```

---

## 📄 Limits & Specifications
- **Maximum PDF Size**: 10 MB
- **Maximum PDF Pages**: 50 pages
- **Text Layer Required**: Works with digital text PDFs. (Scanned PDFs without an OCR text layer will display a clear advisory).
- **Browser Compatibility**: Chrome, Edge, Firefox, Safari, iOS Safari, Android Chrome.

---

## 📜 License
Distributed under the MIT License. Built with ❤️ and powered by Mozilla's [PDF.js](https://github.com/mozilla/pdf.js).
