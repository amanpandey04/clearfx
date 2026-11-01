import daisyui from "daisyui";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["SFMono-Regular", "Cascadia Code", "Consolas", "monospace"],
      },
      boxShadow: {
        soft: "0 24px 70px rgba(0, 0, 0, 0.28)",
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        clearfx: {
          "primary": "#b8f36b",
          "primary-content": "#17220a",
          "secondary": "#8dd9ee",
          "secondary-content": "#09212a",
          "accent": "#c7a8ff",
          "accent-content": "#21153a",
          "neutral": "#1b2639",
          "neutral-content": "#e8effa",
          "base-100": "#0b1020",
          "base-200": "#111a2c",
          "base-300": "#202c40",
          "base-content": "#edf3fc",
          "info": "#73c8ed",
          "success": "#9cda83",
          "warning": "#f5c66d",
          "error": "#ff8585",
          "--rounded-box": "1.1rem",
          "--rounded-btn": "0.8rem",
          "--rounded-badge": "9999px",
        },
      },
    ],
  },
};
