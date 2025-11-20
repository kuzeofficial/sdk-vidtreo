/**
 * PostCSS Configuration
 * @see https://github.com/postcss/postcss-load-config
 */
type PostCSSConfig = {
  plugins?: Record<string, Record<string, unknown> | boolean>;
};
declare const config: PostCSSConfig;
export default config;
