/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./app.js"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  safelist: [
    // ── Animations (added/removed dynamically in JS) ─────────────────────────
    "animate-slide-right", "animate-slide-left", "animate-fade-in",
    "animate-pop-in", "animate-ring-fill", "animate-streak-pulse", "animate-timer-urgent",
    "option-delay-0", "option-delay-1", "option-delay-2", "option-delay-3",

    // ── Toggle knob ───────────────────────────────────────────────────────────
    "translate-x-1", "translate-x-6",

    // ── Option button correct/wrong states (built in JS) ─────────────────────
    "border-green-400", "dark:border-green-600",
    "bg-green-50",      "dark:bg-green-900/25",
    "text-green-800",   "dark:text-green-200",
    "border-red-300",   "dark:border-red-700",
    "bg-red-50",        "dark:bg-red-900/25",
    "text-red-700",     "dark:text-red-300",
    "line-through",

    // ── Letter badge states inside option buttons ─────────────────────────────
    "bg-green-500", "bg-red-500", "bg-gray-400",

    // ── Score ring colors (set via .setAttribute) ────────────────────────────
    // (these are inline, no Tailwind classes needed for the ring colour)

    // ── Score bars ────────────────────────────────────────────────────────────
    "bg-blue-500", "bg-yellow-400", "bg-red-400",

    // ── Timer ring stroke colours (set via setAttribute in JS) ───────────────
    "stroke-blue-500", "stroke-yellow-400", "stroke-red-500",
    "stroke-gray-100", "dark:stroke-gray-700", "dark:stroke-gray-800",
    "animate-timer-urgent",

    // ── Copy button feedback ──────────────────────────────────────────────────
    "bg-green-50",      "dark:bg-green-900/20",
    "border-green-300", "dark:border-green-700",

    // ── Review panel cards ────────────────────────────────────────────────────
    "bg-green-50/70",       "dark:bg-green-900/15",
    "border-green-200",     "dark:border-green-800/60",
    "bg-red-50/70",         "dark:bg-red-900/15",
    "border-red-200",       "dark:border-red-900/60",
    "bg-green-100",         "dark:bg-green-900/30",
    "text-green-800",       "dark:text-green-200",
    "bg-red-100",           "dark:bg-red-900/30",
    "text-red-700",         "dark:text-red-300",

    // ── Streak badge ──────────────────────────────────────────────────────────
    "text-orange-600", "dark:text-orange-400",
    "bg-orange-50",    "dark:bg-orange-900/30",

    // ── Type-breakdown bars ───────────────────────────────────────────────────
    "bg-purple-500",

    // ── Dark mode structural (built in JS class strings) ─────────────────────
    "dark:bg-gray-950", "dark:bg-gray-900/90", "dark:bg-gray-800",
    "dark:bg-gray-800/60", "dark:bg-gray-800/50", "dark:bg-gray-700",
    "dark:bg-gray-700/80", "dark:bg-gray-600",
    "dark:bg-blue-950", "dark:bg-blue-900/20", "dark:bg-blue-900/40",
    "dark:bg-purple-900/40", "dark:bg-indigo-900/20",
    "dark:text-white", "dark:text-gray-100", "dark:text-gray-200",
    "dark:text-gray-400", "dark:text-gray-500", "dark:text-gray-600",
    "dark:text-blue-400", "dark:text-blue-300",
    "dark:text-indigo-200", "dark:text-indigo-400",
    "dark:text-purple-300",
    "dark:text-yellow-300", "dark:text-yellow-400",
    "dark:border-gray-700", "dark:border-gray-700/80",
    "dark:border-blue-500/70", "dark:border-indigo-800/60",
    "dark:from-gray-950", "dark:via-gray-900", "dark:to-blue-950",
    "dark:hover:bg-gray-700", "dark:hover:bg-blue-900/20", "dark:hover:bg-blue-900/50",
    "dark:hover:border-blue-500/70", "dark:hover:text-blue-300",
    "dark:hover:border-blue-400",
    "dark:focus:ring-offset-gray-900",
    "dark:ring-white/10",
    "dark:stroke-gray-700", "dark:stroke-gray-800",

    // ── 3D Flashcard flip & bookmarking classes ──────────────────────────────
    "perspective-1000", "transform-style-3d", "backface-hidden", "rotate-y-180", "card-flip-transition",
    "text-amber-500", "text-amber-400", "fill-amber-400", "text-yellow-500", "fill-yellow-400",
    "bg-amber-50", "dark:bg-amber-900/30", "bg-amber-100", "dark:bg-amber-900/50",
    "border-amber-300", "dark:border-amber-600",
    "bg-emerald-600", "hover:bg-emerald-700", "bg-rose-600", "hover:bg-rose-700",
    "bg-emerald-50", "dark:bg-emerald-900/20", "border-emerald-200", "dark:border-emerald-800",
    "bg-rose-50", "dark:bg-rose-900/20", "border-rose-200", "dark:border-rose-800",

    // ── Audio, Spaced Repetition & Print classes ────────────────────────────
    "page-break-before", "text-teal-600", "dark:text-teal-400", "bg-teal-50", "dark:bg-teal-900/30",
    "border-teal-200", "dark:border-teal-800",
    "bg-indigo-50", "dark:bg-indigo-900/30", "text-indigo-700", "dark:text-indigo-300",
    "border-indigo-200", "dark:border-indigo-800",
  ],
  plugins: [],
};
