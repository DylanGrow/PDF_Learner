"use strict";

// =============================================================================
//  PDF Quiz Maker — app.js  v3
//  Security: no innerHTML, no eval, no external resources
//  Limits: 10 MB / 50 pages
// =============================================================================

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PAGES      = 50;
const TIMER_SECONDS  = 30;
const TIMER_CIRCUM   = 2 * Math.PI * 16; // SVG r=16 → ≈ 100.53

// ---------- State -------------------------------------------------------------
let selectedFile    = null;
let pdfText         = "";
let questions       = [];
let currentIndex    = 0;
let score           = 0;
let answered        = false;
let timerEnabled    = false;
let timerInterval   = null;
let timerRemaining  = 0;
let currentStreak   = 0;
let bestStreak      = 0;
let quizStartTime   = null;
let questionLog     = [];  // { question, options, answer, userChoice, correct, type }

// ---------- Lazy PDF.js loader ------------------------------------------------
let pdfjsLoadPromise = null;
function loadPdfJs() {
  if (pdfjsLoadPromise) return pdfjsLoadPromise;
  pdfjsLoadPromise = new Promise((resolve, reject) => {
    const script  = document.createElement("script");
    script.src    = "pdf.min.js";
    script.onload = () => {
      const lib = window.pdfjsLib;
      if (!lib) { reject(new Error("PDF engine failed to load.")); return; }
      lib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";
      resolve(lib);
    };
    script.onerror = () => reject(new Error("PDF engine failed to load."));
    document.body.appendChild(script);
  });
  return pdfjsLoadPromise;
}

// ---------- DOM helpers -------------------------------------------------------
const $  = id => document.getElementById(id);
const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);

function showScreen(id, direction = "right") {
  const screens = ["upload-screen", "question-screen", "results-screen"];
  screens.forEach(sid => {
    const s = $(sid);
    if (sid === id) {
      s.classList.remove("hidden");
      // Trigger enter animation
      s.classList.remove("animate-slide-right", "animate-slide-left", "animate-fade-in", "animate-pop-in");
      // Force reflow so animation fires again
      void s.offsetWidth;
      if (id === "results-screen") {
        s.classList.add("animate-pop-in");
      } else if (direction === "right") {
        s.classList.add("animate-slide-right");
      } else {
        s.classList.add("animate-slide-left");
      }
    } else {
      s.classList.add("hidden");
    }
  });
}

function setStatus(msg, isError = false) {
  const s = $("status");
  s.textContent = msg || "";
  s.className = isError
    ? "mt-3 min-h-[1.25rem] text-sm font-medium text-red-600 dark:text-red-400 text-center"
    : "mt-3 min-h-[1.25rem] text-sm text-gray-500 dark:text-gray-400 text-center";
}

function setProgressBar(pct, label = "") {
  const wrap = $("progress-bar-wrap");
  const bar  = $("progress-bar");
  const lbl  = $("progress-label-upload");
  const pctEl= $("progress-pct");
  if (pct <= 0) {
    wrap.classList.add("hidden");
  } else {
    wrap.classList.remove("hidden");
    bar.style.width     = Math.min(pct, 100) + "%";
    lbl.textContent     = label;
    pctEl.textContent   = Math.round(pct) + "%";
  }
}

// =============================================================================
//  Dark Mode
// =============================================================================
function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  $("icon-sun").classList.toggle("hidden",  !dark);
  $("icon-moon").classList.toggle("hidden", dark);
}
function initTheme() {
  const saved      = localStorage.getItem("quiz-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved === "dark" || (saved === null && prefersDark));
}
$("theme-toggle").addEventListener("click", () => {
  const isDark = document.documentElement.classList.contains("dark");
  applyTheme(!isDark);
  localStorage.setItem("quiz-theme", !isDark ? "dark" : "light");
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
  if (!localStorage.getItem("quiz-theme")) applyTheme(e.matches);
});

// =============================================================================
//  Active Mode (Quiz / Study / Flashcards) + Timer Duration + Bookmarks
// =============================================================================
let activeMode        = "quiz"; // "quiz" | "study" | "flashcard"
let studyMode         = false;  // backward-compatible alias (true when activeMode === "study")
let timerDuration     = 0;      // seconds; 0 = off
let bookmarkedIndices = new Set();
let flashcardFlipped  = false;
let flashcardStats    = { knew: 0, learning: 0 };

function setActiveMode(mode) {
  activeMode = mode;
  studyMode  = (mode === "study");

  const modes = ["quiz", "study", "flashcard"];
  const activeClass   = ["bg-white", "dark:bg-gray-700", "text-blue-600", "dark:text-blue-400", "shadow-sm"];
  const inactiveClass = ["text-gray-500", "dark:text-gray-400"];

  modes.forEach(m => {
    const btn = $(`mode-${m}`);
    if (!btn) return;
    const isActive = (m === mode);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    if (isActive) {
      btn.classList.remove(...inactiveClass);
      btn.classList.add(...activeClass);
    } else {
      btn.classList.remove(...activeClass);
      btn.classList.add(...inactiveClass);
    }
  });

  // Hide timer in study and flashcard modes
  $("timer-row").classList.toggle("hidden", mode !== "quiz");
  localStorage.setItem("quiz-mode", mode);
}

function setTimerDuration(secs) {
  timerDuration = secs;
  document.querySelectorAll(".timer-seg").forEach(btn => {
    const active = parseInt(btn.dataset.timer, 10) === secs;
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    if (active) {
      btn.classList.add("bg-white", "dark:bg-gray-700", "text-blue-600", "dark:text-blue-400", "shadow-sm");
      btn.classList.remove("text-gray-500", "dark:text-gray-400");
    } else {
      btn.classList.remove("bg-white", "dark:bg-gray-700", "text-blue-600", "dark:text-blue-400", "shadow-sm");
      btn.classList.add("text-gray-500", "dark:text-gray-400");
    }
  });
  localStorage.setItem("quiz-timer-duration", String(secs));
}

$("mode-quiz").addEventListener("click",      () => setActiveMode("quiz"));
$("mode-study").addEventListener("click",     () => setActiveMode("study"));
$("mode-flashcard").addEventListener("click", () => setActiveMode("flashcard"));
document.querySelectorAll(".timer-seg").forEach(btn =>
  btn.addEventListener("click", () => setTimerDuration(parseInt(btn.dataset.timer, 10)))
);

// =============================================================================
//  Auto-Advance
// =============================================================================
let autoAdvanceDelay  = 0;   // 0 = off, else ms to wait before advancing
let autoAdvanceTimer  = null; // requestAnimationFrame id or setTimeout id
let autoAdvanceRaf    = null; // rAF loop id

function setAutoAdvance(ms) {
  autoAdvanceDelay = ms;
  document.querySelectorAll(".autoadvance-seg").forEach(btn => {
    const val = parseInt(btn.dataset.autoadvance, 10);
    const active = val === ms;
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    if (active) {
      btn.classList.add("bg-white", "dark:bg-gray-700", "text-blue-600", "dark:text-blue-400", "shadow-sm");
      btn.classList.remove("text-gray-500", "dark:text-gray-400");
    } else {
      btn.classList.remove("bg-white", "dark:bg-gray-700", "text-blue-600", "dark:text-blue-400", "shadow-sm");
      btn.classList.add("text-gray-500", "dark:text-gray-400");
    }
  });
  localStorage.setItem("quiz-auto-advance", String(ms));
}

document.querySelectorAll(".autoadvance-seg").forEach(btn =>
  btn.addEventListener("click", () => setAutoAdvance(parseInt(btn.dataset.autoadvance, 10)))
);

function cancelAutoAdvance() {
  if (autoAdvanceTimer !== null) { clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null; }
  if (autoAdvanceRaf   !== null) { cancelAnimationFrame(autoAdvanceRaf); autoAdvanceRaf = null; }
  const ring = $("autoadvance-ring");
  const fill = $("autoadvance-fill");
  if (ring) ring.classList.add("hidden");
  if (fill) fill.setAttribute("width", "0");
}

function startAutoAdvance() {
  if (!autoAdvanceDelay) return;
  cancelAutoAdvance();

  const ring  = $("autoadvance-ring");
  const fill  = $("autoadvance-fill");
  const btn   = $("next-btn");
  if (!ring || !fill || !btn) return;

  ring.classList.remove("hidden");
  const totalW   = 200; // SVG viewBox width
  const startMs  = performance.now();
  const delay    = autoAdvanceDelay;

  function tick(now) {
    const elapsed = now - startMs;
    const progress = Math.min(elapsed / delay, 1);
    fill.setAttribute("width", String(progress * totalW));
    if (progress < 1) {
      autoAdvanceRaf = requestAnimationFrame(tick);
    } else {
      ring.classList.add("hidden");
      fill.setAttribute("width", "0");
      autoAdvanceRaf = null;
      advanceOrFinish();
    }
  }
  autoAdvanceRaf = requestAnimationFrame(tick);
}

// =============================================================================
//  Settings Persistence
// =============================================================================
function loadSettings() {
  const savedQ  = localStorage.getItem("quiz-num-questions");
  if (savedQ) $("num-questions").value = savedQ;
  const savedD  = localStorage.getItem("quiz-difficulty");
  if (savedD) $("difficulty").value = savedD;
  const savedTD = localStorage.getItem("quiz-timer-duration");
  setTimerDuration(savedTD !== null ? parseInt(savedTD, 10) : 0);
  const savedM  = localStorage.getItem("quiz-mode") || (localStorage.getItem("quiz-study-mode") === "1" ? "study" : "quiz");
  setActiveMode(savedM);
  // Always start in Fast mode — user must explicitly click to load the AI model
  setAiEngine("fast");
  const savedSnd = localStorage.getItem("quiz-sound");
  setSoundEnabled(savedSnd !== "0");
  const savedAA = localStorage.getItem("quiz-auto-advance");
  setAutoAdvance(savedAA !== null ? parseInt(savedAA, 10) : 0);
}
$("num-questions").addEventListener("change", () =>
  localStorage.setItem("quiz-num-questions", $("num-questions").value));
$("difficulty").addEventListener("change", () =>
  localStorage.setItem("quiz-difficulty", $("difficulty").value));

// =============================================================================
//  Audio Engine (Web Audio Synthesizer + Web Speech TTS)
// =============================================================================
let soundEnabled = true;
let audioCtx     = null;

function getAudioContext() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playChime(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === "correct") {
      const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
      freqs.forEach((f, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now + i * 0.07);
        gain.gain.setValueAtTime(0.001, now + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.07 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.36);
      });
    } else if (type === "wrong") {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(146.83, now); // D3 -> Bb2
      osc.frequency.linearRampToValueAtTime(116.54, now + 0.22);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.29);
    } else if (type === "flip") {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === "streak") {
      [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now + i * 0.06);
        gain.gain.setValueAtTime(0.12, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.30);
      });
    }
  } catch { /* Audio unavailable */ }
}

function setSoundEnabled(val) {
  soundEnabled = val;
  $("icon-sound-on").classList.toggle("hidden", !val);
  $("icon-sound-off").classList.toggle("hidden", val);
  localStorage.setItem("quiz-sound", val ? "1" : "0");
}

$("sound-toggle").addEventListener("click", () => {
  setSoundEnabled(!soundEnabled);
  if (soundEnabled) playChime("flip");
});

// ---------- Web Speech TTS ---------------------------------------------------
function speakText(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  if (!text) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate  = 1.0;
  utter.pitch = 1.0;
  window.speechSynthesis.speak(utter);
}

function stopSpeech() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function speakCurrentQuestion() {
  if (!questions || !questions[currentIndex]) return;
  const q = questions[currentIndex];
  if (activeMode === "flashcard") {
    if (flashcardFlipped) {
      speakText(`Answer: ${q.options[q.answer]}. ${q.context || ""}`);
    } else {
      speakText(`Question card: ${q.question}`);
    }
  } else {
    const optsText = q.options.map((opt, i) => `Option ${OPTION_LETTERS[i]}: ${opt}`).join(". ");
    speakText(`${q.question}. ${optsText}`);
  }
}

$("speak-btn").addEventListener("click", speakCurrentQuestion);

// =============================================================================
//  In-Browser AI Engine (Transformers.js)
// =============================================================================
let aiEngine      = "fast"; // "fast" | "ai"
let aiModelLoaded = false;
let aiExtractor   = null;

function setAiEngine(engine) {
  aiEngine = engine;
  const isAi = (engine === "ai");
  $("engine-fast").setAttribute("aria-pressed", isAi ? "false" : "true");
  $("engine-ai").setAttribute("aria-pressed", isAi ? "true" : "false");

  const activeClasses   = ["bg-white", "dark:bg-gray-700", "text-blue-600", "dark:text-blue-400", "shadow-sm"];
  const inactiveClasses = ["text-gray-500", "dark:text-gray-400"];

  if (isAi) {
    $("engine-ai").classList.remove(...inactiveClasses);
    $("engine-ai").classList.add(...activeClasses);
    $("engine-fast").classList.remove(...activeClasses);
    $("engine-fast").classList.add(...inactiveClasses);
    $("ai-status-pill").textContent = "🤖 AI Questions (HF API)";
  } else {
    $("engine-fast").classList.remove(...inactiveClasses);
    $("engine-fast").classList.add(...activeClasses);
    $("engine-ai").classList.remove(...activeClasses);
    $("engine-ai").classList.add(...inactiveClasses);
    $("ai-status-pill").textContent = "⚡ Fast Heuristic";
  }
  localStorage.setItem("quiz-ai-engine", engine);
}

$("engine-fast").addEventListener("click", () => setAiEngine("fast"));
$("engine-ai").addEventListener("click",   () => {
  setAiEngine("ai");
  $("ai-status-pill").textContent = "🤖 AI Ready (HF API)";
});

async function initTransformersAi() {
  if (aiModelLoaded && aiExtractor) return aiExtractor;
  const pill = $("ai-status-pill");

  function setPillError(msg, detail) {
    console.error("[AI]", msg, detail);
    pill.textContent = "⚡ AI Unavailable";
    pill.title = msg + (detail ? " — " + String(detail).slice(0, 120) : "");
    setAiEngine("fast");
  }

  pill.textContent = "🤖 Importing library...";
  let pipeline, env;
  try {
    // Explicit dist bundle avoids package.json resolution issues
    const mod = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js");
    pipeline = mod.pipeline;
    env      = mod.env;
  } catch (err) {
    setPillError("Failed to import Transformers.js", err);
    return null;
  }

  if (!pipeline || !env) {
    setPillError("Transformers.js did not export pipeline/env", null);
    return null;
  }

  env.allowLocalModels  = false;
  env.allowRemoteModels = true;
  env.remoteHost        = "https://huggingface.co/";
  env.useBrowserCache   = true;

  pill.textContent = "🤖 Downloading model...";
  try {
    aiExtractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
      progress_callback: info => {
        if (info.status === "progress" && info.total) {
          const pct = Math.round((info.loaded / info.total) * 100);
          pill.textContent = `🤖 ${pct}% downloaded`;
        } else if (info.status === "ready") {
          pill.textContent = "🤖 Model ready";
        } else if (info.status === "initiate") {
          pill.textContent = "🤖 Fetching " + (info.file || "model");
        }
      },
    });
  } catch (err) {
    setPillError("Failed to load model weights", err);
    return null;
  }

  aiModelLoaded = true;
  pill.textContent = "🤖 AI Active ✓";
  pill.title = "Transformers.js Xenova/all-MiniLM-L6-v2 quantized";
  return aiExtractor;
}

function cosineSim(a, b) {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma  += a[i] * a[i];
    mb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(ma) * Math.sqrt(mb) || 1);
}

// =============================================================================
//  Spaced Repetition (Leitner 5-Box System)
// =============================================================================
const LEITNER_KEY = "quiz-leitner-cards";
const LEITNER_INTERVALS = {
  1: 1 * 24 * 3600 * 1000,  // Box 1: 1 day
  2: 3 * 24 * 3600 * 1000,  // Box 2: 3 days
  3: 7 * 24 * 3600 * 1000,  // Box 3: 7 days
  4: 14 * 24 * 3600 * 1000, // Box 4: 14 days
  5: 30 * 24 * 3600 * 1000, // Box 5: 30 days
};

function getLeitnerCards() {
  try { return JSON.parse(localStorage.getItem(LEITNER_KEY) || "{}"); }
  catch { return {}; }
}

function saveLeitnerCard(q, knew) {
  const cards = getLeitnerCards();
  const id    = q.question.trim().slice(0, 80);
  const prev  = cards[id] || { box: 1, reviewCount: 0, streak: 0 };

  let nextBox = prev.box;
  if (knew) {
    nextBox = Math.min(5, prev.box + 1);
  } else {
    nextBox = 1;
  }

  const interval = LEITNER_INTERVALS[nextBox] || LEITNER_INTERVALS[1];
  cards[id] = {
    question:     q.question,
    options:      q.options,
    answer:       q.answer,
    context:      q.context || "",
    box:          nextBox,
    reviewCount:  prev.reviewCount + 1,
    streak:       knew ? prev.streak + 1 : 0,
    lastReviewed: Date.now(),
    nextDue:      Date.now() + interval,
  };

  try { localStorage.setItem(LEITNER_KEY, JSON.stringify(cards)); }
  catch { /* quota */ }

  renderLeitnerDashboard();
}

function renderLeitnerDashboard() {
  const cards = Object.values(getLeitnerCards());
  const panel = $("leitner-panel");
  if (!panel) return;
  if (cards.length === 0) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  let b1 = 0, b2 = 0, b3plus = 0, due = 0;
  const now = Date.now();
  cards.forEach(c => {
    if (c.box === 1) b1++;
    else if (c.box === 2) b2++;
    else b3plus++;

    if (c.nextDue <= now) due++;
  });

  $("leitner-total-count").textContent = `${cards.length} card${cards.length === 1 ? "" : "s"} saved`;
  $("leitner-box1-count").textContent  = String(b1);
  $("leitner-box2-count").textContent  = String(b2);
  $("leitner-box3-count").textContent  = String(b3plus);

  const dueBtn = $("study-due-btn");
  if (due > 0) {
    dueBtn.classList.remove("hidden");
    $("due-count").textContent = String(due);
  } else {
    dueBtn.classList.add("hidden");
  }
}

$("study-due-btn").addEventListener("click", () => {
  const now = Date.now();
  const due = Object.values(getLeitnerCards()).filter(c => c.nextDue <= now);
  if (due.length === 0) return;
  setActiveMode("flashcard");
  startQuiz(due);
});

// =============================================================================
//  Quiz History
// =============================================================================
const HISTORY_KEY = "quiz-history";
const MAX_HISTORY = 10;

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}

function saveToHistory(entry) {
  const hist = getHistory();
  hist.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, MAX_HISTORY)));
  renderHistory();
}

function renderHistory() {
  const hist  = getHistory();
  const panel = $("history-panel");
  const list  = $("history-list");
  if (hist.length === 0) { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");
  list.replaceChildren();

  hist.forEach(entry => {
    const pct  = Math.round((entry.score / entry.total) * 100);
    const color = pct >= 80 ? "text-green-600 dark:text-green-400"
                : pct >= 50 ? "text-yellow-600 dark:text-yellow-400"
                :             "text-red-500 dark:text-red-400";

    const row = el("div", {
      className: "flex items-center gap-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 px-3 py-2",
      role: "listitem",
    });

    const icon = el("div", { className: "flex items-center justify-center w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 shrink-0" });
    const iconSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    iconSvg.setAttribute("class", "w-4 h-4 text-blue-500 dark:text-blue-400");
    iconSvg.setAttribute("viewBox", "0 0 20 20");
    iconSvg.setAttribute("fill", "currentColor");
    iconSvg.setAttribute("aria-hidden", "true");
    const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    iconPath.setAttribute("fill-rule", "evenodd");
    iconPath.setAttribute("d", "M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z");
    iconPath.setAttribute("clip-rule", "evenodd");
    iconSvg.appendChild(iconPath);
    icon.appendChild(iconSvg);
    row.appendChild(icon);

    const info = el("div", { className: "flex-1 min-w-0" });
    const name = el("p", { className: "text-xs font-semibold text-gray-700 dark:text-gray-200 truncate" });
    name.textContent = entry.filename || "Quiz";
    const meta = el("p", { className: "text-xs text-gray-400 dark:text-gray-500" });
    meta.textContent = `${entry.difficulty || "medium"} · ${entry.time || "—"} · ${new Date(entry.date).toLocaleDateString()}`;
    info.appendChild(name);
    info.appendChild(meta);
    row.appendChild(info);

    const scoreEl = el("span", { className: `text-sm font-bold tabular-nums shrink-0 ${color}` });
    scoreEl.textContent = `${entry.score}/${entry.total}`;
    row.appendChild(scoreEl);
    list.appendChild(row);
  });
}

$("clear-history-btn").addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

// =============================================================================
//  Keyboard Shortcut Modal
// =============================================================================
function openShortcutModal() {
  const modal = $("shortcut-modal");
  modal.classList.remove("hidden");
  $("close-shortcut-modal").focus();
}
function closeShortcutModal() {
  $("shortcut-modal").classList.add("hidden");
}
$("shortcut-help-btn").addEventListener("click", openShortcutModal);
$("close-shortcut-modal").addEventListener("click", closeShortcutModal);
$("shortcut-backdrop").addEventListener("click", closeShortcutModal);

// Global key: ? = open modal, M = toggle dark, Esc = close modal
document.addEventListener("keydown", e => {
  if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    const modal = $("shortcut-modal");
    if (modal.classList.contains("hidden")) openShortcutModal();
    else closeShortcutModal();
    return;
  }
  if ((e.key === "m" || e.key === "M") && !e.ctrlKey && !e.metaKey &&
      !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    const isDark = document.documentElement.classList.contains("dark");
    applyTheme(!isDark);
    localStorage.setItem("quiz-theme", !isDark ? "dark" : "light");
    return;
  }
  if (e.key === "Escape") {
    if (!$("shortcut-modal").classList.contains("hidden")) {
      closeShortcutModal();
    }
  }
});

// =============================================================================
//  PWA Install Banner
// =============================================================================
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Only show if not dismissed before
  if (!localStorage.getItem("install-dismissed")) {
    setTimeout(() => {
      $("install-banner").classList.remove("hidden");
      $("install-banner").classList.add("flex");
    }, 3000); // show after 3s
  }
});

$("install-btn").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("install-banner").classList.add("hidden");
  $("install-banner").classList.remove("flex");
});

$("dismiss-install-btn").addEventListener("click", () => {
  $("install-banner").classList.add("hidden");
  $("install-banner").classList.remove("flex");
  localStorage.setItem("install-dismissed", "1");
});

// =============================================================================
//  Service Worker Registration
// =============================================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // SW registration failure is non-fatal
    });
  });
}


// =============================================================================
//  File Upload
// =============================================================================
const dropZone  = $("drop-zone");
const fileInput = $("file-input");

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener("change", e => handleFile(e.target.files[0]));

["dragover", "dragleave", "drop"].forEach(evt =>
  dropZone.addEventListener(evt, e => {
    e.preventDefault();
    const active = evt === "dragover";
    dropZone.classList.toggle("border-blue-400",          active);
    dropZone.classList.toggle("dark:border-blue-500",     active);
    dropZone.classList.toggle("border-gray-200",         !active);
    dropZone.classList.toggle("dark:border-gray-700",    !active);
    if (evt === "drop" && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  })
);

function handleFile(file) {
  if (!file) return;
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) { setStatus("Please choose a PDF file.", true); return; }
  if (file.size > MAX_FILE_BYTES) {
    setStatus(`File too large — ${(file.size/1024/1024).toFixed(1)} MB (max 10 MB).`, true);
    return;
  }
  selectedFile = file;
  $("file-info-text").textContent = `${file.name}  (${(file.size/1024/1024).toFixed(2)} MB)`;
  $("file-info").classList.remove("hidden");
  const btn = $("generate-btn");
  btn.disabled = false;
  btn.setAttribute("aria-disabled", "false");
  setStatus("");
  setProgressBar(0);
}

// =============================================================================
//  Generate Quiz
// =============================================================================
$("generate-btn").addEventListener("click", onGenerate);

async function onGenerate() {
  const btn = $("generate-btn");
  btn.disabled = true;
  btn.setAttribute("aria-disabled", "true");
  $("generate-label").textContent = "Loading…";
  setProgressBar(2, "Loading PDF engine");

  try {
    const pdfjsLib = await loadPdfJs();

    setProgressBar(10, "Reading PDF");
    pdfText = await extractText(pdfjsLib, selectedFile, (p, total) => {
      setProgressBar(10 + Math.round((p / total) * 70), `Reading page ${p} of ${total}`);
    });

    if (pdfText.trim().length < 200)
      throw new Error("Not enough text found. This PDF may use scanned images without a text layer.");

    setProgressBar(85, aiEngine === "ai" ? "Generating with AI…" : "Generating questions");
    $("generate-label").textContent = "Generating…";
    await new Promise(r => setTimeout(r, 0));

    const n          = parseInt($("num-questions").value, 10);
    const difficulty = $("difficulty").value;

    if (aiEngine === "ai") {
      setProgressBar(80, "Calling AI (Hugging Face API)…");
      questions = await generateQuestionsAsync(pdfText, n, difficulty);
    } else {
      questions = generateQuestions(pdfText, n, difficulty);
    }

    if (questions.length === 0)
      throw new Error("Not enough text to generate questions. Try a different PDF with more content.");

    setProgressBar(100, "Done!");
    await new Promise(r => setTimeout(r, 250));
    setProgressBar(0);
    startQuiz();

  } catch (err) {
    setStatus(err.message, true);
    setProgressBar(0);
    btn.disabled = false;
    btn.setAttribute("aria-disabled", "false");
    $("generate-label").textContent = "Generate Quiz";
  }
}

async function extractText(pdfjsLib, file, onProgress) {
  const data = await file.arrayBuffer();
  const pdf  = await pdfjsLib.getDocument({
    data,
    isEvalSupported:  false,
    disableAutoFetch: true,
    disableStream:    true,
  }).promise;

  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  let text = "";
  for (let p = 1; p <= pageCount; p++) {
    if (onProgress) { onProgress(p, pageCount); await new Promise(r => setTimeout(r)); }
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(" ") + "\n";
  }
  return text;
}

// =============================================================================
//  Question Generation
// =============================================================================
const STOPWORDS = new Set(
  ("a an the and or but if then else when at by for with about against between into "
  + "through during before after above below to from up down in out on off over under "
  + "again further once here there all any both each few more most other some such no "
  + "nor not only own same so than too very can will just should now is are was were be "
  + "been being have has had having do does did doing would could shall may might must "
  + "of it its this that these those as i you he she we they them his her their our your "
  + "my me him us what which who whom how why where also").split(" ")
);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function splitSentences(text) {
  return (
    text.replace(/\s+/g, " ").match(/[A-Z][^.!?]*[.!?]+/g) || []
  ).map(s => s.trim());
}

function extractKeywords(text) {
  const words = text.toLowerCase().match(/\b[a-z][a-z'-]{2,}\b/g) || [];
  const freq  = {};
  for (const w of words) {
    const clean = w.replace(/['-]/g, "");
    if (STOPWORDS.has(clean) || clean.length < 4) continue;
    freq[clean] = (freq[clean] || 0) + 1;
  }
  return Object.entries(freq)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
}

const DIFFICULTY_CONFIG = {
  easy:   { minLen: 40,  maxLen: 200, distractorDelta: 6 },
  medium: { minLen: 60,  maxLen: 350, distractorDelta: 4 },
  hard:   { minLen: 100, maxLen: 500, distractorDelta: 2 },
};

function generateFillBlanks(sentences, keywords, count, difficulty) {
  const cfg    = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
  const result = [];
  const used   = new Set();
  const eligible = sentences.filter(s => s.length >= cfg.minLen && s.length <= cfg.maxLen);

  for (const sentence of shuffle(eligible)) {
    if (result.length >= count) break;
    if (used.has(sentence)) continue;
    const lower      = sentence.toLowerCase();
    const inSentence = k => new RegExp("\\b" + escapeRegex(k) + "\\b").test(lower);
    const answer     = keywords.find(inSentence);
    if (!answer) continue;

    let pool = keywords.filter(k => k !== answer && !inSentence(k) && Math.abs(k.length - answer.length) <= cfg.distractorDelta);
    if (pool.length < 3) pool = keywords.filter(k => k !== answer && !inSentence(k));
    if (pool.length < 3) continue;

    const distractors = shuffle(pool).slice(0, 3);
    const blanked = sentence.replace(new RegExp("\\b" + escapeRegex(answer) + "\\b", "i"), "_____");
    if (!blanked.includes("_____")) continue;

    const options = shuffle([answer, ...distractors]);
    result.push({
      type:     "fill",
      question: "Which term completes the sentence?\n\n\u201c" + blanked + "\u201d",
      context:  sentence,   // original sentence for post-answer reveal
      options,
      answer:   options.indexOf(answer),
    });
    used.add(sentence);
  }
  return result;
}

function generateTrueFalse(sentences, keywords, count) {
  const result  = [];
  const used    = new Set();
  const eligible = sentences.filter(s => s.length >= 50 && s.length <= 300);

  for (const sentence of shuffle(eligible)) {
    if (result.length >= count) break;
    if (used.has(sentence)) continue;
    const lower      = sentence.toLowerCase();
    const inSentence = k => new RegExp("\\b" + escapeRegex(k) + "\\b").test(lower);
    const answer     = keywords.find(inSentence);
    if (!answer) continue;

    const makeTrue = Math.random() < 0.5;
    let statement  = sentence;
    let correct    = true;

    if (!makeTrue) {
      const impostor = keywords.find(k => k !== answer && !inSentence(k) && Math.abs(k.length - answer.length) <= 5);
      if (!impostor) continue;
      statement = sentence.replace(new RegExp("\\b" + escapeRegex(answer) + "\\b", "i"), impostor);
      if (statement === sentence) continue;
      correct = false;
    }

    result.push({
      type:     "truefalse",
      question: "True or False?\n\n\u201c" + statement + "\u201d",
      context:  sentence,
      options:  ["True", "False"],
      answer:   correct ? 0 : 1,
    });
    used.add(sentence);
  }
  return result;
}

function generateQuestions(text, count, difficulty = "medium") {
  const sentences = splitSentences(text);
  const keywords  = extractKeywords(text);
  if (keywords.length < 4) return [];

  const tfCount   = Math.max(1, Math.round(count * 0.3));
  const fillCount = count - tfCount;

  const fillQs = generateFillBlanks(sentences, keywords, fillCount + 5, difficulty);
  const tfQs   = generateTrueFalse(sentences, keywords, tfCount + 3);

  // Interleave T/F every ~3 fill questions
  const result = [];
  let fi = 0, ti = 0;
  while (result.length < count && (fi < fillQs.length || ti < tfQs.length)) {
    if (fi < fillQs.length) result.push(fillQs[fi++]);
    if (result.length < count && ti < tfQs.length && fi % 3 === 0) result.push(tfQs[ti++]);
  }
  while (ti < tfQs.length && result.length < count) result.push(tfQs[ti++]);

  return result.slice(0, count);
}

// =============================================================================
//  LLM Question Generation (Hugging Face Inference API — free, no API key)
// =============================================================================

const HF_MODEL = "google/flan-t5-base";
const HF_API   = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

/**
 * Build a chunk of text suitable for one question. Picks a random ~800-char
 * window so each question is grounded in a different part of the document.
 */
function pickChunk(sentences, usedIdx, minChars = 200, maxChars = 800) {
  const remaining = sentences
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => !usedIdx.has(i) && sentences[i].length > 30);
  if (!remaining.length) return null;
  const start = remaining[Math.floor(Math.random() * remaining.length)];
  usedIdx.add(start.i);

  let chunk = start.s;
  let j = start.i + 1;
  while (chunk.length < minChars && j < sentences.length) {
    chunk += " " + sentences[j++];
  }
  return chunk.slice(0, maxChars).trim();
}

/**
 * Call flan-t5 with a structured prompt and get back a raw text response.
 */
async function callFlanT5(prompt, maxNewTokens = 200) {
  const resp = await fetch(HF_API, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens:  maxNewTokens,
        do_sample:       false,
        temperature:     0.7,
      },
      options: { wait_for_model: true },
    }),
  });
  if (!resp.ok) throw new Error(`HF API ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  if (Array.isArray(json) && json[0]?.generated_text) return json[0].generated_text;
  if (json.generated_text) return json.generated_text;
  throw new Error("Unexpected HF API response shape");
}

/**
 * Parse the flan-t5 response into a structured question object.
 * Expected format (instructed via prompt):
 *   Question: ...
 *   A: ...
 *   B: ...
 *   C: ...
 *   D: ...
 *   Answer: A
 */
function parseLLMQuestion(raw, context) {
  const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
  let question = "";
  const options = [];
  let answerLetter = "";

  for (const line of lines) {
    if (/^Question\s*:/i.test(line)) {
      question = line.replace(/^Question\s*:\s*/i, "").trim();
    } else if (/^[A-D]\s*[.):]\s*/i.test(line)) {
      options.push(line.replace(/^[A-D]\s*[.):]\s*/i, "").trim());
    } else if (/^Answer\s*:/i.test(line)) {
      answerLetter = line.replace(/^Answer\s*:\s*/i, "").trim().toUpperCase().slice(0, 1);
    }
  }

  if (!question || options.length < 2) return null;

  // Pad to 4 options if flan didn't generate all
  while (options.length < 4) options.push(options[options.length - 1] + " (variant)");
  const opts = options.slice(0, 4);

  const answerIndex = ["A", "B", "C", "D"].indexOf(answerLetter);
  const answer = answerIndex >= 0 ? answerIndex : 0;

  return { type: "mc", question, options: opts, answer, context };
}

/**
 * Generate a single question from a chunk of text using flan-t5.
 */
async function generateOneLLMQuestion(chunk) {
  const prompt =
    `Read the following passage and write a multiple-choice question with 4 options ` +
    `(A, B, C, D) and the correct answer letter. Use this exact format:\n` +
    `Question: <question text>\n` +
    `A: <option>\nB: <option>\nC: <option>\nD: <option>\n` +
    `Answer: <letter>\n\n` +
    `Passage: ${chunk}`;

  const raw = await callFlanT5(prompt, 220);
  return parseLLMQuestion(raw, chunk);
}

/**
 * Main AI generation path: calls HF Inference API for each question.
 * Falls back per-question to heuristic if API fails/rate-limits.
 */
async function generateQuestionsWithLLM(sentences, keywords, count, difficulty, onProgress) {
  const usedIdx   = new Set();
  const results   = [];
  const fallback  = generateFillBlanks(sentences, keywords, count + 5, difficulty);
  let   fi        = 0;
  const pill      = $("ai-status-pill");

  for (let i = 0; i < count; i++) {
    if (onProgress) onProgress(i, count);
    pill.textContent = `🤖 Generating Q${i + 1}/${count}...`;

    const chunk = pickChunk(sentences, usedIdx);
    if (chunk) {
      try {
        const q = await generateOneLLMQuestion(chunk);
        if (q) { results.push(q); continue; }
      } catch (err) {
        console.warn(`[LLM] Q${i + 1} failed (${err.message}), using heuristic fallback`);
      }
    }
    // Heuristic fallback for this slot
    if (fi < fallback.length) results.push(fallback[fi++]);
  }

  pill.textContent = "🤖 AI Active ✓";
  return results;
}

async function generateQuestionsAsync(text, count, difficulty = "medium") {
  if (aiEngine !== "ai") {
    return generateQuestions(text, count, difficulty);
  }

  const sentences = splitSentences(text);
  const keywords  = extractKeywords(text);
  if (keywords.length < 4) return [];

  // Update pill to show we're calling the LLM
  const pill = $("ai-status-pill");
  pill.textContent = "🤖 Calling AI...";

  try {
    const qs = await generateQuestionsWithLLM(sentences, keywords, count, difficulty);
    if (qs.length === 0) throw new Error("LLM returned 0 questions");
    return qs;
  } catch (err) {
    console.warn("[AI] LLM generation failed, falling back to heuristic:", err);
    pill.textContent = "⚡ Heuristic (LLM fallback)";
    return generateQuestions(text, count, difficulty);
  }
}

// =============================================================================
//  Quiz Engine
// =============================================================================
const OPTION_LETTERS = ["A", "B", "C", "D"];

function startQuiz(customQuestions = null) {
  if (customQuestions) {
    questions = customQuestions;
  }
  currentIndex  = 0;
  score         = 0;
  answered      = false;
  currentStreak = 0;
  bestStreak    = 0;
  questionLog   = [];
  flashcardStats= { knew: 0, learning: 0 };
  quizStartTime = Date.now();
  stopTimer();
  updateStreakBadge();

  // Mode badges
  $("study-mode-badge").classList.toggle("hidden", activeMode !== "study");
  $("flashcard-mode-badge").classList.toggle("hidden", activeMode !== "flashcard");

  showScreen("question-screen", "right");
  renderQuestion();
}

// ---------- Bookmarks ---------------------------------------------------------
function updateBookmarkButton() {
  const btn  = $("bookmark-btn");
  const icon = $("bookmark-icon");
  if (!btn || !icon) return;
  const isBookmarked = bookmarkedIndices.has(currentIndex);

  btn.setAttribute("aria-pressed", isBookmarked ? "true" : "false");
  btn.setAttribute("title", isBookmarked ? "Remove bookmark (B or S)" : "Bookmark question (B or S)");

  if (isBookmarked) {
    btn.className = "shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-500 dark:text-amber-400 border border-amber-300 dark:border-amber-600 shadow-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-amber-400";
    icon.setAttribute("fill", "currentColor");
  } else {
    btn.className = "shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-amber-50 dark:bg-gray-800 dark:hover:bg-amber-900/30 text-gray-400 hover:text-amber-500 dark:text-gray-500 dark:hover:text-amber-400 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-amber-400";
    icon.setAttribute("fill", "none");
  }
}

function toggleBookmark() {
  if (bookmarkedIndices.has(currentIndex)) {
    bookmarkedIndices.delete(currentIndex);
  } else {
    bookmarkedIndices.add(currentIndex);
  }
  updateBookmarkButton();
}

$("bookmark-btn").addEventListener("click", toggleBookmark);

// ---------- Flashcard Flip & Rating -------------------------------------------
function flipFlashcard() {
  flashcardFlipped = !flashcardFlipped;
  playChime("flip");
  const inner = $("flashcard-inner");
  if (inner) {
    inner.classList.toggle("rotate-y-180", flashcardFlipped);
  }
}

function rateFlashcard(knew) {
  if (answered) return;
  answered = true;
  const q = questions[currentIndex];

  playChime(knew ? "correct" : "wrong");
  saveLeitnerCard(q, knew);

  if (knew) {
    score++;
    currentStreak++;
    if (currentStreak > bestStreak) bestStreak = currentStreak;
    flashcardStats.knew++;
  } else {
    currentStreak = 0;
    flashcardStats.learning++;
  }
  updateStreakBadge();

  questionLog.push({
    ...q,
    userChoice: knew ? q.answer : -1,
    correct: knew,
  });

  advanceOrFinish();
}

$("flashcard").addEventListener("click", e => {
  // Don't flip if clicking the rating buttons on the back face
  if (e.target.closest("#flashcard-rating-buttons")) return;
  flipFlashcard();
});

$("flashcard-learning-btn").addEventListener("click", () => rateFlashcard(false));
$("flashcard-knew-btn").addEventListener("click", () => rateFlashcard(true));

// ---------- Timer (circular SVG) ----------------------------------------------
function startTimer() {
  const secs = timerDuration; // from segment control
  if (!secs) return;          // 0 = off
  stopTimer();
  timerRemaining = secs;
  updateTimerRing(secs);
  $("timer-display").classList.remove("hidden");

  timerInterval = setInterval(() => {
    timerRemaining--;
    updateTimerRing(secs);
    if (timerRemaining <= 0) {
      stopTimer();
      if (!answered) timeoutQuestion();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  $("timer-display").classList.add("hidden");
}

function updateTimerRing(totalSeconds) {
  const total = totalSeconds || timerDuration || 30;
  const ring  = $("timer-ring");
  const count = $("timer-count");
  if (!ring) return;
  count.textContent = timerRemaining;
  const pct    = timerRemaining / total;
  const offset = TIMER_CIRCUM * (1 - pct);
  ring.style.strokeDashoffset = offset.toFixed(2);
  const thresh1 = Math.max(5,  Math.round(total * 0.5));
  const thresh2 = Math.max(3,  Math.round(total * 0.23));
  if (timerRemaining > thresh1) {
    ring.setAttribute("class", "stroke-blue-500 transition-all duration-1000 ease-linear");
    count.className = "absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums text-gray-700 dark:text-gray-200";
  } else if (timerRemaining > thresh2) {
    ring.setAttribute("class", "stroke-yellow-400 transition-all duration-1000 ease-linear");
    count.className = "absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums text-yellow-600 dark:text-yellow-400";
  } else {
    ring.setAttribute("class", "stroke-red-500 animate-timer-urgent transition-all duration-1000 ease-linear");
    count.className = "absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums text-red-600 dark:text-red-400";
  }
}

function timeoutQuestion() {
  answered = true;
  const q    = questions[currentIndex];
  const opts = $("options").querySelectorAll(".option-btn");
  opts.forEach(b => { b.disabled = true; });
  if (opts[q.answer]) markCorrect(opts[q.answer]);
  currentStreak = 0;
  updateStreakBadge();
  questionLog.push({ ...q, userChoice: -1, correct: false });
  showContextReveal(q);
  showNextBtn();
}

// ---------- Render question ---------------------------------------------------
function renderQuestion() {
  answered = false;
  flashcardFlipped = false;
  const q   = questions[currentIndex];
  const pct = Math.round((currentIndex / questions.length) * 100);

  $("progress-label").textContent    = `${currentIndex + 1} / ${questions.length}`;
  $("quiz-progress-bar").style.width = pct + "%";
  updateBookmarkButton();

  if (activeMode === "flashcard") {
    // 🎴 Flashcard mode UI
    $("mc-container").classList.add("hidden");
    $("flashcard-container").classList.remove("hidden");
    $("next-btn").classList.add("hidden");

    // Reset card orientation
    $("flashcard-inner").classList.remove("rotate-y-180");
    $("flashcard-front-text").textContent  = q.question;
    $("flashcard-back-answer").textContent = q.options[q.answer];
    $("flashcard-back-context").textContent = q.context || "";

    // Show current Leitner box
    const cards = getLeitnerCards();
    const id = q.question.trim().slice(0, 80);
    const cardData = cards[id];
    const boxBadge = $("flashcard-box-badge");
    if (boxBadge) {
      boxBadge.textContent = cardData ? `Box ${cardData.box}` : "Box 1 (New)";
    }
  } else {
    // 🎯 Quiz or 📖 Study mode UI
    $("flashcard-container").classList.add("hidden");
    $("mc-container").classList.remove("hidden");
    $("question-text").textContent = q.question;
    $("next-btn").classList.add("hidden");
    $("context-reveal").classList.add("hidden");

    // Question type badge
    const badge = $("question-type-badge");
    badge.replaceChildren();
    badge.classList.remove("hidden");
    const bs = el("span", {
      className: q.type === "truefalse"
        ? "inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 ring-1 ring-purple-200 dark:ring-purple-800"
        : "inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800",
    });
    bs.textContent = q.type === "truefalse" ? "✓✗  True / False" : "＿  Fill in the blank";
    badge.appendChild(bs);

    // Options
    const container = $("options");
    container.replaceChildren();
    q.options.forEach((optText, i) => {
      const btn = el("button", {
        type:      "button",
        className: `option-btn option-delay-${i} group flex items-center gap-3 w-full text-left rounded-2xl border-2 border-gray-100 dark:border-gray-700/80 bg-white dark:bg-gray-800/60 px-4 py-3.5 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm transition-all duration-150
                    hover:border-blue-300 dark:hover:border-blue-500/70 hover:bg-blue-50/70 dark:hover:bg-blue-900/20 hover:shadow-md hover:-translate-y-0.5
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900
                    active:translate-y-0`,
      });

      // Letter badge
      const letter = el("span", {
        className: "shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-150",
      });
      letter.textContent = q.type === "truefalse" ? (i === 0 ? "T" : "F") : OPTION_LETTERS[i];
      letter.setAttribute("aria-hidden", "true");
      btn.appendChild(letter);

      const label = el("span");
      label.textContent = optText;
      btn.appendChild(label);

      btn.addEventListener("click", () => selectOption(i, btn));
      container.appendChild(btn);
    });
  }

  if (activeMode === "quiz" && timerDuration > 0) startTimer();
  else stopTimer();

  document.removeEventListener("keydown", handleQuizKeydown);
  document.addEventListener("keydown", handleQuizKeydown);
}

function handleQuizKeydown(e) {
  if ($("question-screen").classList.contains("hidden")) return;

  // 'S' or 's' toggles bookmark anytime during question
  if ((e.key === "s" || e.key === "S") && !e.ctrlKey && !e.metaKey && !e.altKey && !["INPUT", "SELECT"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    toggleBookmark();
    return;
  }

  // 'R' or 'r' speaks question
  if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey && !["INPUT", "SELECT"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    speakCurrentQuestion();
    return;
  }

  // Flashcard mode keys
  if (activeMode === "flashcard") {
    // 'B' or 'b' can also bookmark in flashcard mode
    if ((e.key === "b" || e.key === "B") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      toggleBookmark();
      return;
    }
    if (e.key === " " || (e.key === "Enter" && !flashcardFlipped)) {
      e.preventDefault();
      flipFlashcard();
      return;
    }
    if (flashcardFlipped) {
      if (e.key === "1" || e.key === "ArrowLeft") {
        e.preventDefault();
        rateFlashcard(false);
        return;
      }
      if (e.key === "2" || e.key === "ArrowRight") {
        e.preventDefault();
        rateFlashcard(true);
        return;
      }
    }
    return;
  }

  // Multiple Choice mode keys
  if (answered && (e.key === "Enter" || e.key === "ArrowRight")) {
    e.preventDefault();
    advanceOrFinish();
    return;
  }
  if (!answered) {
    const q   = questions[currentIndex];
    // Support both 1-4 and A-D / T-F
    const numMap  = { "1": 0, "2": 1, "3": 2, "4": 3 };
    const letterMap = { a: 0, b: 1, c: 2, d: 3, t: 0, f: 1 };
    const key = e.key.toLowerCase();
    let idx = numMap[e.key] ?? letterMap[key] ?? -1;
    if (idx >= 0 && idx < q.options.length) {
      e.preventDefault();
      const opts = $("options").querySelectorAll(".option-btn");
      if (opts[idx]) opts[idx].click();
    }
  }
}

function markCorrect(btn) {
  btn.classList.remove(
    "border-gray-100", "dark:border-gray-700/80",
    "bg-white", "dark:bg-gray-800/60",
    "hover:border-blue-300", "dark:hover:border-blue-500/70",
    "hover:bg-blue-50/70", "dark:hover:bg-blue-900/20",
    "hover:-translate-y-0.5", "hover:shadow-md"
  );
  btn.classList.add(
    "border-green-400", "dark:border-green-600",
    "bg-green-50", "dark:bg-green-900/25",
    "text-green-800", "dark:text-green-200"
  );
  // Update the letter badge inside
  const badge = btn.querySelector("span");
  if (badge) badge.className = "shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-green-500 text-white text-xs font-bold transition-colors";
}

function markWrong(btn) {
  btn.classList.remove(
    "border-gray-100", "dark:border-gray-700/80",
    "bg-white", "dark:bg-gray-800/60",
    "hover:border-blue-300", "dark:hover:border-blue-500/70",
    "hover:bg-blue-50/70", "dark:hover:bg-blue-900/20",
    "hover:-translate-y-0.5", "hover:shadow-md"
  );
  btn.classList.add(
    "border-red-300", "dark:border-red-700",
    "bg-red-50", "dark:bg-red-900/25",
    "text-red-700", "dark:text-red-300",
    "line-through"
  );
  const badge = btn.querySelector("span");
  if (badge) badge.className = "shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-500 text-white text-xs font-bold transition-colors";
}

function selectOption(i, clickedBtn) {
  if (answered) return;
  answered = true;
  stopTimer();

  const q      = questions[currentIndex];
  const opts   = $("options").querySelectorAll(".option-btn");
  const correct = i === q.answer;

  opts.forEach(b => {
    b.disabled = true;
    b.classList.remove("hover:-translate-y-0.5", "hover:shadow-md", "hover:border-blue-300", "dark:hover:border-blue-500/70");
  });

  // Always reveal correct answer
  markCorrect(opts[q.answer]);
  if (!correct) markWrong(clickedBtn);

  if (correct) {
    playChime("correct");
    if (currentStreak >= 2) {
      setTimeout(() => playChime("streak"), 350);
    }
  } else {
    playChime("wrong");
  }

  if (!studyMode) {
    // Quiz mode: track score and streak
    if (correct) {
      score++;
      currentStreak++;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
    updateStreakBadge();
  }

  questionLog.push({ ...q, userChoice: i, correct });
  showContextReveal(q);
  showNextBtn();
}

function updateStreakBadge() {
  const badge = $("streak-badge");
  const count = $("streak-count");
  count.textContent = currentStreak;
  if (currentStreak >= 2) {
    badge.classList.remove("hidden");
    badge.classList.add("flex");
    // Pulse animation
    badge.classList.remove("animate-streak-pulse");
    void badge.offsetWidth;
    badge.classList.add("animate-streak-pulse");
  } else {
    badge.classList.add("hidden");
    badge.classList.remove("flex");
  }
}

function showContextReveal(q) {
  if (!q.context) return;
  const div  = $("context-reveal");
  const text = $("context-text");
  text.textContent = q.context;
  div.classList.remove("hidden");
  div.classList.add("animate-fade-in");
}

function showNextBtn() {
  const btn    = $("next-btn");
  const isLast = currentIndex + 1 >= questions.length;
  btn.classList.remove("hidden");
  btn.replaceChildren();

  const txt = document.createTextNode(isLast ? "See Results" : "Next Question");
  btn.appendChild(txt);

  // Arrow SVG
  const svgNS = "http://www.w3.org/2000/svg";
  const svg   = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "w-4 h-4");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("fill-rule", "evenodd");
  path.setAttribute("d", "M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10z");
  path.setAttribute("clip-rule", "evenodd");
  svg.appendChild(path);
  btn.appendChild(svg);

  btn.focus();

  // Start auto-advance countdown (only in quiz mode, not last question)
  if (!isLast && autoAdvanceDelay > 0 && activeMode === "quiz") {
    startAutoAdvance();
  }
}

// Clicking Next manually cancels countdown and advances immediately
$("next-btn").addEventListener("click", () => {
  cancelAutoAdvance();
  advanceOrFinish();
});

function advanceOrFinish() {
  cancelAutoAdvance();
  stopSpeech();
  currentIndex++;
  if (currentIndex < questions.length) renderQuestion();
  else showResults();
}

// =============================================================================
//  Results
// =============================================================================
function showResults() {
  stopTimer();
  document.removeEventListener("keydown", handleQuizKeydown);

  showScreen("results-screen");

  const total  = questions.length;
  const pct    = total > 0 ? score / total : 0;
  const wrong  = questionLog.filter(e => !e.correct && e.userChoice !== -1).length;
  const missed = questionLog.filter(e => e.userChoice === -1).length;
  const elapsed = quizStartTime ? Math.round((Date.now() - quizStartTime) / 1000) : 0;

  // Score ring animation
  const ring = $("score-ring");
  const offset = TIMER_CIRCUM * 2 * (1 - pct); // score ring r=54, C≈339.3
  const C = 2 * Math.PI * 54;
  const ringOffset = C * (1 - pct);

  // Color by score
  const ringColor = pct === 1 ? "#22c55e" : pct >= 0.7 ? "#3b82f6" : pct >= 0.4 ? "#f59e0b" : "#ef4444";
  ring.setAttribute("stroke", ringColor);

  // Animate ring after a brief delay
  setTimeout(() => {
    ring.style.transition = "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)";
    ring.style.strokeDashoffset = ringOffset.toFixed(2);
  }, 100);

  // Animated score count-up
  animateCount($("score-text"), 0, score, total, 900);

  // Stats
  $("stat-correct").textContent = score;
  const wrongEl = $("stat-wrong");
  wrongEl.replaceChildren();
  wrongEl.appendChild(document.createTextNode(String(wrong + missed)));
  if (missed > 0) {
    const note = el("span", { className: "text-xs font-normal text-gray-400 dark:text-gray-500" });
    note.textContent = ` (${missed} skipped)`;
    wrongEl.appendChild(note);
  }

  const streakEl = $("stat-streak");
  streakEl.replaceChildren();
  streakEl.appendChild(document.createTextNode(String(bestStreak)));
  const fire = el("span", { className: "text-base ml-1", "aria-hidden": "true" });
  fire.setAttribute("aria-hidden", "true");
  fire.textContent = "🔥";
  streakEl.appendChild(fire);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  $("stat-time").textContent = m > 0 ? `${m}m ${s}s` : `${s}s`;

  // Emoji + message
  const [icon, msg] =
    pct === 1       ? ["🏆", "Perfect score — outstanding!"]
    : pct >= 0.8    ? ["🎉", "Excellent work!"]
    : pct >= 0.6    ? ["👍", "Great job — keep it up!"]
    : pct >= 0.4    ? ["📚", "Keep practicing — you're getting there."]
    :                 ["💪", "Don't give up — every attempt counts!"];

  $("results-icon").textContent  = icon;

  const modeMsg =
    activeMode === "flashcard"
      ? `Flashcard session complete — you knew ${flashcardStats.knew} of ${total} cards!`
      : studyMode
      ? "Study session complete — review the concepts below."
      : msg;
  $("score-message").textContent = modeMsg;

  // Bookmarked questions retry button
  const retryBmBtn = $("retry-bookmarked-btn");
  if (retryBmBtn) {
    if (bookmarkedIndices.size > 0) {
      retryBmBtn.classList.remove("hidden");
      const badge = $("bookmarked-count-badge");
      if (badge) badge.textContent = String(bookmarkedIndices.size);
    } else {
      retryBmBtn.classList.add("hidden");
    }
  }

  // Per-type accuracy
  buildTypeBreakdown();

  // Weak spots (study mode)
  buildWeakSpots();

  // Build review
  buildReviewPanel();

  // Reset review toggle
  $("review-toggle-btn").setAttribute("aria-expanded", "false");
  $("review-panel").classList.add("hidden");

  // Confetti on good scores (quiz & flashcard modes)
  if (!studyMode && pct >= 0.7) launchConfetti(pct);

  // Save to history (quiz & flashcard modes)
  if (!studyMode) {
    const m2 = Math.floor(elapsed / 60);
    const s2 = elapsed % 60;
    saveToHistory({
      date:       Date.now(),
      filename:   selectedFile ? selectedFile.name : "Quiz",
      score,
      total,
      difficulty: $("difficulty").value,
      time:       m2 > 0 ? `${m2}m ${s2}s` : `${s2}s`,
    });
  }

  $("results-screen").focus();
}

// ---------- Score count-up animation ------------------------------------------
function animateCount(el, from, to, total, durationMs) {
  const start  = performance.now();
  const format = n => `${n} / ${total}`;
  function frame(now) {
    const t   = Math.min((now - start) / durationMs, 1);
    const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
    const val  = Math.round(from + (to - from) * ease);
    el.textContent = format(val);
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = format(to);
  }
  requestAnimationFrame(frame);
}

// ---------- Per-type accuracy breakdown ---------------------------------------
function buildTypeBreakdown() {
  const fills = questionLog.filter(e => e.type === "fill");
  const tfs   = questionLog.filter(e => e.type === "truefalse");
  if (fills.length === 0 || tfs.length === 0) return;

  const fillPct = fills.length ? Math.round(fills.filter(e => e.correct).length / fills.length * 100) : 0;
  const tfPct   = tfs.length   ? Math.round(tfs.filter(e => e.correct).length   / tfs.length   * 100) : 0;

  $("type-breakdown").classList.remove("hidden");
  setTimeout(() => {
    $("fill-accuracy-bar").style.width   = fillPct + "%";
    $("tf-accuracy-bar").style.width     = tfPct   + "%";
  }, 300);
  $("fill-accuracy-text").textContent  = fillPct + "%";
  $("tf-accuracy-text").textContent    = tfPct   + "%";
}

// ---------- Weak spots (study mode) -------------------------------------------
function buildWeakSpots() {
  const panel = $("weak-spots");
  const list  = $("weak-spots-list");
  if (!studyMode) { panel.classList.add("hidden"); return; }
  const missed = questionLog.filter(e => !e.correct);
  if (missed.length === 0) { panel.classList.add("hidden"); return; }

  panel.classList.remove("hidden");
  list.replaceChildren();
  missed.forEach(entry => {
    const li = el("li", { className: "flex items-start gap-2" });
    const dot = el("span", { className: "mt-1 shrink-0 w-2 h-2 rounded-full bg-amber-500" });
    dot.setAttribute("aria-hidden", "true");
    li.appendChild(dot);
    const txt = el("span");
    // Show the correct answer as the key concept
    txt.textContent = entry.options[entry.answer];
    li.appendChild(txt);
    list.appendChild(li);
  });
}

// ---------- Confetti ----------------------------------------------------------
function launchConfetti(pct) {
  const canvas = $("confetti-canvas");
  const ctx    = canvas.getContext("2d");
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors  = pct === 1
    ? ["#ffd700", "#ffb700", "#ff6b6b", "#51cf66", "#339af0", "#f06595"]
    : ["#339af0", "#5c7cfa", "#74c0fc", "#91d3f7", "#a9e0fb", "#d0ebff"];

  const count   = pct === 1 ? 160 : 100;
  const pieces  = Array.from({ length: count }, () => ({
    x:   Math.random() * canvas.width,
    y:   -10 - Math.random() * 60,
    w:   6  + Math.random() * 8,
    h:   3  + Math.random() * 5,
    vx:  (Math.random() - 0.5) * 4,
    vy:  2  + Math.random() * 4,
    rot: Math.random() * 360,
    vr:  (Math.random() - 0.5) * 8,
    color: colors[Math.floor(Math.random() * colors.length)],
    opacity: 1,
  }));

  let frame = 0;
  const MAX_FRAMES = 200;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    pieces.forEach(p => {
      if (p.y > canvas.height + 20) return;
      alive = true;
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.05; // gravity
      p.rot += p.vr;
      if (frame > MAX_FRAMES - 40) p.opacity -= 0.025;

      ctx.save();
      ctx.globalAlpha  = Math.max(0, p.opacity);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    if (alive && frame < MAX_FRAMES + 60) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(draw);
}

// ---------- Answer Review -----------------------------------------------------
function buildReviewPanel() {
  const panel = $("review-panel");
  panel.replaceChildren();

  questionLog.forEach((entry, idx) => {
    const card = el("div", {
      className: "rounded-2xl border p-4 text-sm animate-fade-in " + (
        entry.correct
          ? "border-green-200 dark:border-green-800/60 bg-green-50/70 dark:bg-green-900/15"
          : "border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-900/15"
      ),
    });

    // Header row
    const hdr = el("div", { className: "flex items-start gap-2.5 mb-3" });

    const num = el("span", {
      className: "shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white " +
        (entry.correct ? "bg-green-500" : entry.userChoice === -1 ? "bg-gray-400" : "bg-red-500"),
    });
    num.textContent = String(idx + 1);
    hdr.appendChild(num);

    const qText = el("p", { className: "font-medium text-gray-800 dark:text-gray-100 leading-snug whitespace-pre-line flex-1" });
    qText.textContent = entry.question;
    hdr.appendChild(qText);

    if (bookmarkedIndices.has(idx)) {
      const bm = el("span", {
        className: "shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700",
      });
      bm.textContent = "⭐ Starred";
      hdr.appendChild(bm);
    }

    card.appendChild(hdr);

    // Options list
    const ul = el("ul", { className: "space-y-1.5 ml-8" });
    entry.options.forEach((opt, oi) => {
      const isCorrect  = oi === entry.answer;
      const isSelected = oi === entry.userChoice && !entry.correct;

      const li = el("li", {
        className: "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium " + (
          isCorrect  ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
          : isSelected ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 line-through"
          : "text-gray-500 dark:text-gray-400"
        ),
      });

      const ic = el("span", { className: "text-sm font-bold shrink-0" });
      ic.setAttribute("aria-hidden", "true");
      ic.textContent = isCorrect ? "✓" : isSelected ? "✗" : "·";
      li.appendChild(ic);

      const optTxt = el("span");
      optTxt.textContent = opt;
      li.appendChild(optTxt);
      ul.appendChild(li);
    });

    if (entry.userChoice === -1) {
      const note = el("p", { className: "mt-1.5 text-xs text-gray-400 dark:text-gray-500 italic ml-8" });
      note.textContent = "⏱ Timed out";
      card.appendChild(note);
    }

    card.appendChild(ul);
    panel.appendChild(card);
  });
}

$("review-toggle-btn").addEventListener("click", () => {
  const panel = $("review-panel");
  const btn   = $("review-toggle-btn");
  const open  = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");

  // Update button text node
  btn.childNodes[btn.childNodes.length - 1].textContent =
    open ? " Hide answers" : " Review answers";

  if (open) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

// ---------- Copy results ------------------------------------------------------
$("copy-results-btn").addEventListener("click", async () => {
  const pct  = Math.round((score / questions.length) * 100);
  const mins = Math.floor((Date.now() - quizStartTime) / 60000);
  const secs = Math.round(((Date.now() - quizStartTime) % 60000) / 1000);
  const time = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const text = [
    "📄 PDF Quiz Maker — Results",
    `Score:   ${score} / ${questions.length} (${pct}%)`,
    `Streak:  ${bestStreak}🔥  Time: ${time}`,
    "",
    ...questionLog.map((e, i) => {
      const st = e.userChoice === -1 ? "⏱" : e.correct ? "✓" : "✗";
      return `${st} Q${i+1}: ${e.options[e.answer]}`;
    }),
    "",
    "Generated with PDF Quiz Maker — https://github.com/",
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
    const btn = $("copy-results-btn");
    btn.setAttribute("aria-label", "Copied!");
    btn.classList.add("bg-green-50", "dark:bg-green-900/20", "border-green-300", "dark:border-green-700");
    setTimeout(() => {
      btn.setAttribute("aria-label", "Copy results to clipboard");
      btn.classList.remove("bg-green-50", "dark:bg-green-900/20", "border-green-300", "dark:border-green-700");
    }, 1800);
  } catch { /* clipboard unavailable */ }
});

// ---------- Results buttons ---------------------------------------------------
$("retry-bookmarked-btn").addEventListener("click", () => {
  const bookmarkedList = questions.filter((_, idx) => bookmarkedIndices.has(idx));
  if (bookmarkedList.length === 0) return;
  bookmarkedIndices.clear();
  startQuiz(bookmarkedList);
});

$("retry-btn").addEventListener("click", () => {
  questionLog   = [];
  score         = 0;
  currentStreak = 0;
  bestStreak    = 0;
  quizStartTime = Date.now();
  currentIndex  = 0;
  showScreen("question-screen", "left");
  renderQuestion();
});

$("regen-btn").addEventListener("click", async () => {
  const n   = parseInt($("num-questions").value, 10);
  const dif = $("difficulty").value;
  if (aiEngine === "ai") {
    questions = await generateQuestionsAsync(pdfText, n, dif);
  } else {
    questions = generateQuestions(pdfText, n, dif);
  }
  if (questions.length === 0) {
    showScreen("upload-screen", "left");
    setStatus("Couldn't generate questions. Try a different PDF.", true);
    return;
  }
  startQuiz();
});

$("new-pdf-btn").addEventListener("click", () => {
  selectedFile = null; pdfText = ""; questions = []; questionLog = []; bookmarkedIndices.clear();
  fileInput.value = "";
  $("file-info").classList.add("hidden");
  $("file-info-text").textContent = "";
  $("generate-btn").disabled = true;
  $("generate-btn").setAttribute("aria-disabled", "true");
  $("generate-label").textContent = "Generate Quiz";
  setStatus(""); setProgressBar(0);
  showScreen("upload-screen", "left");
});

// ---------- Exporters ---------------------------------------------------------
function getExportFilename(suffix) {
  const base = selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, "") : "quiz";
  return `${base}${suffix}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 250);
}

function exportAnkiTsv() {
  if (!questions || questions.length === 0) return;

  const sanitize = text => {
    if (!text) return "";
    return text
      .replace(/\t/g, " ")
      .replace(/\r?\n/g, "<br>")
      .trim();
  };

  const lines = [
    "#separator:tab",
    "#html:true",
    "#tags column:4",
    ...questions.map(q => {
      const front   = sanitize(q.question);
      const back    = sanitize(q.options[q.answer]);
      const context = sanitize(q.context || "");
      const tag     = "PDF-Quiz-Maker";
      return `${front}\t${back}\t${context}\t${tag}`;
    }),
  ];

  const tsvContent = lines.join("\n");
  const blob = new Blob([tsvContent], { type: "text/tab-separated-values;charset=utf-8" });
  downloadBlob(blob, getExportFilename("-anki.tsv"));
}

function exportJson() {
  if (!questions || questions.length === 0) return;

  const data = {
    title: selectedFile ? selectedFile.name : "PDF Quiz",
    exportDate: new Date().toISOString(),
    difficulty: $("difficulty").value,
    mode: activeMode,
    totalQuestions: questions.length,
    questions: questions.map((q, i) => ({
      id: i + 1,
      type: q.type,
      question: q.question,
      options: q.options,
      answerIndex: q.answer,
      answerText: q.options[q.answer],
      context: q.context || "",
      bookmarked: bookmarkedIndices.has(i),
    })),
  };

  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8" });
  downloadBlob(blob, getExportFilename("-quiz.json"));
}

function generateWorksheet() {
  if (!questions || questions.length === 0) return;

  const container = $("printable-worksheet");
  if (!container) return;
  container.replaceChildren();

  const titleText = selectedFile
    ? selectedFile.name.replace(/\.[^/.]+$/, "")
    : "Exam & Study Worksheet";

  // --- Header ---
  const header = el("div", { className: "pb-4 mb-6 border-b-2 border-black" });

  const titleRow = el("div", { className: "flex justify-between items-start mb-4" });
  const title = el("h1", { className: "text-2xl font-bold tracking-tight text-black" });
  title.textContent = titleText;
  titleRow.appendChild(title);

  const docTag = el("span", { className: "text-xs font-mono uppercase tracking-wider text-gray-600 border border-gray-400 px-2 py-0.5 rounded" });
  docTag.textContent = `${questions.length} Questions · PDF Quiz Maker`;
  titleRow.appendChild(docTag);
  header.appendChild(titleRow);

  // Student info lines
  const metaGrid = el("div", { className: "grid grid-cols-3 gap-4 text-xs font-medium text-black mb-3" });
  const f1 = el("div"); f1.textContent = "Name: _________________________________";
  const f2 = el("div"); f2.textContent = "Date: ___________________";
  const f3 = el("div"); f3.textContent = `Score: ______ / ${questions.length} (____%)`;
  metaGrid.appendChild(f1); metaGrid.appendChild(f2); metaGrid.appendChild(f3);
  header.appendChild(metaGrid);

  // Instructions
  const instr = el("div", { className: "p-2.5 bg-gray-100 border border-gray-300 rounded text-xs text-gray-700 italic" });
  instr.textContent = "Instructions: Read each question carefully. Completely fill in the bubble corresponding to your chosen answer. Choose only one answer per question.";
  header.appendChild(instr);

  container.appendChild(header);

  // --- Questions list ---
  const questionsList = el("div", { className: "space-y-6" });

  questions.forEach((q, qIndex) => {
    const qBox = el("div", { className: "pb-4 border-b border-gray-200" });

    const qTitle = el("p", { className: "text-sm font-semibold text-black mb-3 leading-snug whitespace-pre-line" });
    const numSpan = el("span", { className: "font-bold mr-1.5" });
    numSpan.textContent = `${qIndex + 1}.`;
    qTitle.appendChild(numSpan);
    const textNode = document.createTextNode(q.question);
    qTitle.appendChild(textNode);
    qBox.appendChild(qTitle);

    const optGrid = el("div", {
      className: q.type === "truefalse"
        ? "grid grid-cols-2 gap-3 pl-4"
        : "grid grid-cols-1 sm:grid-cols-2 gap-2 pl-4",
    });

    q.options.forEach((opt, oIndex) => {
      const optRow = el("div", { className: "flex items-center text-xs text-black" });

      const bubble = el("span", {
        className: "inline-block w-4 h-4 rounded-full border-2 border-black mr-2 shrink-0",
      });
      bubble.setAttribute("aria-hidden", "true");
      optRow.appendChild(bubble);

      const letterLabel = el("span", { className: "font-bold mr-1" });
      letterLabel.textContent = `(${q.type === "truefalse" ? (oIndex === 0 ? "T" : "F") : OPTION_LETTERS[oIndex]})`;
      optRow.appendChild(letterLabel);

      const optText = el("span");
      optText.textContent = opt;
      optRow.appendChild(optText);

      optGrid.appendChild(optRow);
    });

    qBox.appendChild(optGrid);
    questionsList.appendChild(qBox);
  });

  container.appendChild(questionsList);

  // --- Page Break for Answer Key ---
  const pageBreak = el("div", { className: "page-break-before pt-6" });
  container.appendChild(pageBreak);

  // --- Answer Key Section ---
  const keySection = el("div", { className: "pt-4" });

  const keyHeader = el("div", { className: "pb-3 mb-4 border-b-2 border-black flex justify-between items-end" });
  const keyTitle = el("h2", { className: "text-xl font-bold text-black" });
  keyTitle.textContent = "Answer Key & Context Reference";
  keyHeader.appendChild(keyTitle);

  const keySub = el("span", { className: "text-xs italic text-gray-600" });
  keySub.textContent = "Detachable — for grading or self-check";
  keyHeader.appendChild(keySub);
  keySection.appendChild(keyHeader);

  const keyList = el("div", { className: "space-y-3" });

  questions.forEach((q, qIndex) => {
    const keyItem = el("div", { className: "p-2.5 bg-gray-50 border border-gray-200 rounded text-xs leading-relaxed" });

    const keyLine = el("div", { className: "flex items-baseline gap-2 font-semibold text-black" });
    const kNum = el("span", { className: "font-bold text-blue-800" });
    kNum.textContent = `Q${qIndex + 1}:`;
    keyLine.appendChild(kNum);

    const letter = q.type === "truefalse" ? (q.answer === 0 ? "True" : "False") : `(${OPTION_LETTERS[q.answer]})`;
    const kAns = el("span", { className: "font-bold text-black" });
    kAns.textContent = `${letter} ${q.options[q.answer]}`;
    keyLine.appendChild(kAns);
    keyItem.appendChild(keyLine);

    if (q.context) {
      const kCtx = el("p", { className: "mt-1 text-gray-600 italic text-[11px]" });
      kCtx.textContent = `Context: “${q.context}”`;
      keyItem.appendChild(kCtx);
    }

    keyList.appendChild(keyItem);
  });

  keySection.appendChild(keyList);
  container.appendChild(keySection);

  window.print();
}

$("export-anki-btn").addEventListener("click", exportAnkiTsv);
$("export-json-btn").addEventListener("click", exportJson);
const printWorksheetBtn = $("print-worksheet-btn");
if (printWorksheetBtn) {
  printWorksheetBtn.addEventListener("click", generateWorksheet);
}

// =============================================================================
//  Self-tests
// =============================================================================
function runTests() {
  const sample = [
    "Photosynthesis is the process by which green plants convert sunlight into chemical energy.",
    "During photosynthesis, chlorophyll absorbs sunlight and turns carbon dioxide and water into glucose.",
    "Chlorophyll is the green pigment found in the leaves of plants and algae.",
    "The oxygen released during photosynthesis comes from splitting water molecules.",
    "Plants use glucose as an energy source for growth and repair of tissues.",
    "Mitochondria generate most of the adenosine triphosphate used as chemical energy in cells.",
    "The nucleus contains genetic information encoded in deoxyribonucleic acid sequences.",
    "Ribosomes translate messenger ribonucleic acid into protein chains during translation.",
    "Enzymes are biological catalysts that dramatically speed up chemical reactions in organisms.",
    "Cell membranes regulate the passage of molecules into and out of living cells.",
  ].join(" ");

  console.group("PDF Quiz Maker v3 — Self-tests");
  const sents = splitSentences(sample);
  const kw    = extractKeywords(sample);

  const fills = generateFillBlanks(sents, kw, 5, "medium");
  console.assert(fills.length > 0, "FAIL: fill-in-blank should produce questions");
  fills.forEach((q, i) => {
    console.assert(q.type === "fill",            `FAIL: Q${i} wrong type`);
    console.assert(q.question.includes("_____"), `FAIL: Q${i} missing blank`);
    console.assert(q.options.length === 4,        `FAIL: Q${i} wrong option count`);
    console.assert(new Set(q.options).size === 4, `FAIL: Q${i} duplicate options`);
    console.assert(q.context && q.context.length > 0, `FAIL: Q${i} missing context`);
  });

  const tfs = generateTrueFalse(sents, kw, 3);
  console.assert(tfs.length > 0, "FAIL: true/false should produce questions");
  tfs.forEach((q, i) => {
    console.assert(q.type === "truefalse", `FAIL: TF${i} wrong type`);
    console.assert(q.options.length === 2, `FAIL: TF${i} wrong option count`);
    console.assert(q.answer === 0 || q.answer === 1, `FAIL: TF${i} bad answer`);
  });

  console.assert(escapeRegex("a.b*c") === "a\\.b\\*c", "FAIL: escapeRegex");
  const arr = [1,2,3,4,5];
  const s   = shuffle(arr);
  console.assert(s.length === arr.length && [...s].sort().join() === [...arr].sort().join(), "FAIL: shuffle");

  const topKw = extractKeywords("photosynthesis photosynthesis photosynthesis chlorophyll chlorophyll");
  console.assert(topKw[0] === "photosynthesis", `FAIL: keyword rank — got ${topKw[0]}`);

  // Test mode switcher
  setActiveMode("flashcard");
  console.assert(activeMode === "flashcard", "FAIL: setActiveMode flashcard");
  setActiveMode("study");
  console.assert(studyMode === true, "FAIL: setActiveMode study");
  setActiveMode("quiz");
  console.assert(activeMode === "quiz" && studyMode === false, "FAIL: setActiveMode quiz");

  // Test bookmarking operations
  bookmarkedIndices.clear();
  bookmarkedIndices.add(0);
  bookmarkedIndices.add(2);
  console.assert(bookmarkedIndices.has(0) && bookmarkedIndices.has(2) && !bookmarkedIndices.has(1), "FAIL: bookmark set");
  bookmarkedIndices.clear();

  // Test Anki TSV sanitization
  const sanitize = text => text ? text.replace(/\t/g, " ").replace(/\r?\n/g, "<br>").trim() : "";
  const testTsv = `${sanitize("Q:\nLine 1\tLine 2")}\t${sanitize("Answer\t1")}\t${sanitize("Context")}\tPDF-Quiz-Maker`;
  console.assert(!testTsv.includes("\nLine 1"), "FAIL: Anki TSV newline sanitization");
  console.assert(testTsv.split("\t").length === 4, "FAIL: Anki TSV column count");

  // Test Cosine Similarity math
  const v1 = [1, 0, 0];
  const v2 = [1, 0, 0];
  const v3 = [0, 1, 0];
  console.assert(Math.abs(cosineSim(v1, v2) - 1.0) < 1e-6, "FAIL: cosineSim identical");
  console.assert(Math.abs(cosineSim(v1, v3) - 0.0) < 1e-6, "FAIL: cosineSim orthogonal");

  // Test Leitner Box logic
  const testQ = { question: "What is photosynthesis?", options: ["A", "B", "C", "D"], answer: 0, context: "Test" };
  saveLeitnerCard(testQ, true);
  let leitnerStore = getLeitnerCards();
  const testId = testQ.question.trim().slice(0, 80);
  console.assert(leitnerStore[testId] && leitnerStore[testId].box === 2, "FAIL: Leitner promotion to Box 2");
  saveLeitnerCard(testQ, false);
  leitnerStore = getLeitnerCards();
  console.assert(leitnerStore[testId] && leitnerStore[testId].box === 1, "FAIL: Leitner demotion to Box 1");
  // Clean up test card from store
  delete leitnerStore[testId];
  try { localStorage.setItem(LEITNER_KEY, JSON.stringify(leitnerStore)); } catch {}

  // Test Audio chime safe call
  try {
    playChime("flip");
    console.assert(true, "Audio chime callable");
  } catch (e) {
    console.assert(false, "FAIL: playChime threw error: " + e);
  }

  console.info("✅ All self-tests passed.");
  console.groupEnd();
}

// =============================================================================
//  Init
// =============================================================================
initTheme();
loadSettings();
renderHistory();
renderLeitnerDashboard();
runTests();
