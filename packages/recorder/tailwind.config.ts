import type { Config } from "tailwindcss";

const config = {
  content: ["./src/components/**/*.{ts,js}", "./src/**/*.wc.{ts,js}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;

export default config;
