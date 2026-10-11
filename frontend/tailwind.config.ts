import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // Every top-level .ts/.tsx file (storefront.tsx, dashboardCharts.tsx, ...) so a new
    // file can never again be silently skipped by the JIT scanner.
    "./*.{js,ts,jsx,tsx}",
    "./components.tsx",
    // BUGFIX: ui.tsx (Header, Footer, ProductCard, CategoryCard, badges,
    // price tags, etc.) was missing from this list. Tailwind's JIT scanner
    // only generates CSS for classes it finds in files listed here, so
    // every utility class used ONLY inside ui.tsx (e.g. the discount
    // badge's `absolute bottom-2 left-2`) was silently dropped from the
    // final stylesheet. That's why the "X% OFF" badge rendered with no
    // positioning and sat on top of the product name instead of pinned to
    // the corner of the image.
    "./ui.tsx",
    "./hero.tsx",
    "./karnataka.tsx",
    "./delivery.tsx",
    "./referral.tsx",
  ],
  theme: {
    extend: {
      fontFamily: {
        kannada: ["var(--font-kannada)", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
      colors: {
        brand: {
          // KARNATAKA RED scale (the red of the state flag, deepened for
          // contrast on cream). Every existing brand-* class re-themes.
          50: "#FDF4EE",
          100: "#FBE5D8",
          200: "#F6C6AE",
          300: "#EE9C78",
          400: "#E26C45",
          500: "#D44325",
          600: "#BF2A1E",
          700: "#9C1F1A",
          800: "#7A1816",
          900: "#3E1A12",
          orange: "#BF2A1E",
          maroon: "#7A1816",
        },
        // Karnataka yellow / temple gold: accents only.
        gold: {
          50: "#FFFAE6",
          100: "#FFF1B8",
          200: "#FFE380",
          300: "#FFD43D",
          400: "#F5B90A",
          500: "#D99A00",
          600: "#8A5C00",
        },
        // Deep sandalwood / coffee neutrals for text and the admin sidebar.
        coffee: {
          700: "#4A2E1F",
          800: "#33201A",
          900: "#22140F",
          950: "#170D0A",
        },
        ivory: "#FFFBF3",
        sandal: "#FDF6EC",
      },
      boxShadow: {
        card: "0 1px 2px rgba(74,46,31,0.06), 0 6px 18px rgba(74,46,31,0.07)",
        cardHover: "0 10px 28px rgba(122,24,22,0.18)",
        lift: "0 18px 40px -12px rgba(34,20,15,0.35)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
export default config;
