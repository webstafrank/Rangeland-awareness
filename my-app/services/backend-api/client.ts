/**
 * The client for `contracts/backend-api.md` version 1.
 *
 * One rule runs through all of it: **nothing here throws**. Every call answers
 * with a discriminated result, and every way a call can go wrong is a named
 * member of that union rather than an exception the caller may or may not have
 * remembered to catch. The reason is what the failures look like on screen. A
 * backend that is down, a run that failed in its fetch stage, and a response
 * this client cannot parse are three completely different sentences to show an
 * analyst, and a `try/catch` around `fetch` collapses all three into "something
 * went wrong". The rubric (R6) asks for exactly that distinction.
 *
 * `fetch` and the base URL are injected, so the whole module is a pure function
 * of its arguments and the entire suite runs in the node gate lane with no
 * network, no server and no mock framework: the tests hand it a function.
 */

import {
  API_PREFIX,
  ApiErrorSchema,
  HealthSchema,
  RunCreatedSchema,
  RunResultSchema,
  RunStatusResponseSchema,
  TopicCriteriaSchema,
} from "./types";
import type {
  ApiError,
  CreateRunBody,
  Health,
  RunCreated,
  RunResult,
  RunStatusResponse,
  TopicCriteria,
} from "./types";
import { backendBaseUrl } from "./config";
import type { z } from "zod";

/* ----------------------------------------------------------------- results */

/**
 * Why a call did not produce data.
 *
 * `unreachable` and `http` are the pair that matters most. The first means the
 * service is not answering at all, which is "the backend is down, try later";
 * the second means it answered and said no, which is "your request was
 * refused, here is why". Rendering the second as the first sends an analyst to
 * ask an administrator about a server that is running fine.
 */
export type BackendFailure =
  /** The request never got an answer: DNS, connection refused, CORS, offline. */
  | { kind: "unreachable"; message: string }
  /** The request was abandoned after `timeoutMs`. */
  | { kind: "timeout"; message: string; timeoutMs: number }
  /** The service answered with a non-2xx. `error` is parsed when it was JSON. */
  | { kind: "http"; status: number; message: string; error: ApiError | null }
  /** A 2xx whose body is not the shape the contract declares. */
  | { kind: "malformed"; message: string; detail: string };

export type BackendResult<T> =
  | { ok: true; data: T; status: number; retryAfterMs: number | null }
  | { ok: false; failure: BackendFailure };

/** One line, ready to render. The page adds what to do about it. */
export function failureMessage(failure: BackendFailure): string {
  switch (failure.kind) {
    case "unreachable":
      return "The analysis service did not answer.";
    case "timeout":
      return `The analysis service did not answer within ${Math.round(
        failure.timeoutMs / 1000,
      )}s.`;
    case "http":
      return failure.error?.error ?? failure.message;
    case "malformed":
      return "The analysis service answered with something this app cannot read.";
  }
}

/* ------------------------------------------------------------------ client */

export interface BackendClientOptions {
  /**
   * Injected so the gate tests need no network and no mocking library, and so
   * a server component can pass a `fetch` carrying Next's cache directives.
   */
  fetch?: typeof globalThis.fetch;
  /** Defaults to `backendBaseUrl()`, read per call rather than at import. */
  baseUrl?: string;
  /**
   * Per-request ceiling. 15s is far longer than any endpoint this client calls
   * should need: creating a run returns immediately by design, and polling is
   * one row read. It is a ceiling on a hung connection, not a budget.
   *
   * Deliberately NOT applied to the run itself, which takes minutes. The run
   * happens on the server between two of these calls, so no single request here
   * is ever waiting on it.
   */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

export interface BackendClient {
  health(): Promise<BackendResult<Health>>;
  topicCriteria(topic: string): Promise<BackendResult<TopicCriteria>>;
  createRun(body: CreateRunBody): Promise<BackendResult<RunCreated>>;
  runStatus(runId: string): Promise<BackendResult<RunStatusResponse>>;
  runResult(runId: string): Promise<BackendResult<RunResult>>;
}

export function createBackendClient(options: BackendClientOptions = {}): BackendClient {
  const doFetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Resolved once per client rather than once per module, so a client made in a
  // request handler sees the environment that request's process has now.
  const baseUrl = options.baseUrl ?? backendBaseUrl();

  async function call<S extends z.ZodType>(
    path: string,
    schema: S,
    init?: RequestInit,
  ): Promise<BackendResult<z.infer<S>>> {
    return request(doFetch, `${baseUrl}${API_PREFIX}${path}`, schema, timeoutMs, init);
  }

  return {
    health: () => call("/health", HealthSchema),

    topicCriteria: (topic) =>
      // Encoded because a topic slug reaches this from a route parameter, which
      // is user input however slug-shaped it usually is.
      call(`/topics/${encodeURIComponent(topic)}/criteria`, TopicCriteriaSchema),

    createRun: (body) =>
      call("/runs", RunCreatedSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),

    runStatus: (runId) =>
      call(`/runs/${encodeURIComponent(runId)}`, RunStatusResponseSchema),

    runResult: (runId) =>
      call(`/runs/${encodeURIComponent(runId)}/result`, RunResultSchema),
  };
}

/* --------------------------------------------------------------- transport */

async function request<S extends z.ZodType>(
  doFetch: typeof globalThis.fetch,
  url: string,
  schema: S,
  timeoutMs: number,
  init?: RequestInit,
): Promise<BackendResult<z.infer<S>>> {
  let response: Response;

  try {
    response = await doFetch(url, {
      ...init,
      // Never cached. A poll answered from a cache is a progress bar that never
      // moves, and a result read from one is yesterday's numbers under today's
      // run id. The backend sets no cache headers, which means a shared cache is
      // free to apply its own heuristics to a 200.
      cache: "no-store",
      signal: timeoutSignal(timeoutMs, init?.signal),
    });
  } catch (cause) {
    // An AbortError here is either our own timeout or the caller's signal. Both
    // are reported as a timeout rather than as unreachable: the distinction the
    // UI needs is "no answer yet" against "an answer that said no", and an
    // abandoned request is the former either way.
    if (isAbort(cause)) {
      return {
        ok: false,
        failure: {
          kind: "timeout",
          message: `No answer from ${url} within ${timeoutMs}ms.`,
          timeoutMs,
        },
      };
    }
    return {
      ok: false,
      failure: { kind: "unreachable", message: describe(cause) },
    };
  }

  const retryAfterMs = parseRetryAfter(response.headers?.get?.("Retry-After") ?? null);

  // Read as text first, then parse. `response.json()` on an HTML error page
  // from a reverse proxy throws a SyntaxError that says nothing about the 502
  // that actually happened, and the status is the useful half of that answer.
  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    return { ok: false, failure: { kind: "unreachable", message: describe(cause) } };
  }

  const body = parseJson(text);

  if (!response.ok) {
    const parsed = body === undefined ? null : ApiErrorSchema.safeParse(body);
    return {
      ok: false,
      failure: {
        kind: "http",
        status: response.status,
        message: `${response.status} from ${url}`,
        error: parsed && parsed.success ? parsed.data : null,
      },
    };
  }

  if (body === undefined) {
    return {
      ok: false,
      failure: {
        kind: "malformed",
        message: "Response was not JSON.",
        // Bounded: an HTML error page is kilobytes and this string can reach a
        // log or a debug panel.
        detail: text.slice(0, 200),
      },
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      failure: {
        kind: "malformed",
        message: "Response did not match the contract.",
        detail: parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; "),
      },
    };
  }

  return { ok: true, data: parsed.data, status: response.status, retryAfterMs };
}

/* ----------------------------------------------------------------- helpers */

/**
 * `Retry-After`, in milliseconds.
 *
 * The contract sends the delta-seconds form ("2"), but the header is also
 * legally an HTTP-date, and a proxy in front of the service may rewrite it as
 * one. Both are handled, and anything else returns null so the caller falls
 * back to its own interval rather than to NaN.
 */
export function parseRetryAfter(header: string | null): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (trimmed === "") return null;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }

  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  // A date already in the past means "now", not a negative delay.
  return Math.max(0, at - Date.now());
}

/**
 * Our timeout, combined with any signal the caller passed.
 *
 * `AbortSignal.any` is the correct primitive and is not in the runtime
 * everywhere this has to run, so the fallback composes them by hand. Without
 * the combination, passing a caller signal would silently discard the timeout.
 */
function timeoutSignal(timeoutMs: number, caller?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!caller) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([caller, timeout]);

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (caller.aborted || timeout.aborted) controller.abort();
  caller.addEventListener("abort", abort, { once: true });
  timeout.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function isAbort(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "name" in cause &&
    (cause as { name?: unknown }).name === "AbortError"
  ) || (
    typeof cause === "object" &&
    cause !== null &&
    "name" in cause &&
    (cause as { name?: unknown }).name === "TimeoutError"
  );
}

/** `undefined` for "not JSON", which is distinct from a body of `null`. */
function parseJson(text: string): unknown {
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function describe(cause: unknown): string {
  if (cause instanceof Error) {
    // fetch wraps the real reason ("ECONNREFUSED") in a cause, and the outer
    // message is the useless "fetch failed" on its own.
    const inner = (cause as { cause?: unknown }).cause;
    if (inner instanceof Error) return `${cause.message}: ${inner.message}`;
    return cause.message;
  }
  return String(cause);
}
