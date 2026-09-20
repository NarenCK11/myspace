/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin. Leave empty to call the same origin (dev proxy or Vercel rewrite). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
