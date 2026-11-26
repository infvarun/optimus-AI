/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Harness base URL when not using the dev proxy, e.g. http://127.0.0.1:8787 */
  readonly VITE_HARNESS_URL?: string
  /** Bearer token if the harness sets HARNESS_API_TOKEN (dev only: it ends up in the bundle). */
  readonly VITE_HARNESS_TOKEN?: string
}
