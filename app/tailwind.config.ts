import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        serif: ['"Instrument Serif"', "ui-serif", "Georgia"],
        display: ['"Instrument Serif"', "Georgia", "serif"],
      },
      colors: {
        ink: {
          DEFAULT: "#1d1b16",
          soft:    "#3c382f",
          muted:   "#6b6558",
          faint:   "#a39d8f",
        },
        cream: {
          50:  "#fdfbf5",
          100: "#faf6eb",
          200: "#f2ecda",
          300: "#e8dfc4",
        },
        teal: {
          50:  "#eef6f4",
          100: "#d6e8e3",
          500: "#2f6b5f",
          600: "#255449",
          700: "#1b3e36",
        },
        sage: {
          50:  "#eef4ea",
          100: "#d7e5cd",
          500: "#6b9f58",
          600: "#547e45",
        },
        amber: {
          50:  "#fcf3e1",
          100: "#f6e4b8",
          500: "#c9942b",
          600: "#a57918",
        },
        rose: {
          50:  "#fbe9e4",
          100: "#f5cdc2",
          500: "#bc4a38",
          600: "#963623",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(29,27,22,0.04), 0 2px 8px -4px rgba(29,27,22,0.06)",
        lift: "0 12px 32px -12px rgba(29,27,22,0.18)",
      },
      transitionTimingFunction: {
        'out-strong':    'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out-strong': 'cubic-bezier(0.77, 0, 0.175, 1)',
        'drawer':        'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      transitionDuration: {
        '120': '120ms',
        '160': '160ms',
        '200': '200ms',
        '250': '250ms',
        '320': '320ms',
      },
    },
  },
  plugins: [],
} satisfies Config;
