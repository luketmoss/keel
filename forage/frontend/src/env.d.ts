/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_FORAGE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
