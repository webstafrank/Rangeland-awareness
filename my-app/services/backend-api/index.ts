/**
 * The app's side of `contracts/backend-api.md`.
 *
 * Import from here, never from a file inside. The split into four modules is
 * for the test lanes and for readability, not a surface anyone else should know
 * about: `types` is the contract, `client` is the transport, `watch` is the
 * polling state machine, `config` is where the service lives.
 */
export * from "./types";
export * from "./client";
export * from "./watch";
export {
  DEFAULT_BACKEND_URL,
  backendBaseUrl,
  normaliseBaseUrl,
  publicBackendBaseUrl,
  resolveBaseUrl,
  tileTemplate,
} from "./config";
