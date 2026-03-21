/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_APPLE_SERVICES_ID: string
  readonly VITE_APPLE_REDIRECT_URI: string
  readonly VITE_PHOTO_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
