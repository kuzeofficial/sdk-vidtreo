/**
 * PostCSS Configuration
 * @see https://github.com/postcss/postcss-load-config
 */
type PostCSSConfig = {
  plugins?: Record<string, Record<string, unknown> | boolean>;
};

const config: PostCSSConfig = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
