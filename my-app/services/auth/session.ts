import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  SessionSchema,
  type Session,
  type SessionKind,
} from "@/contracts/auth";

/**
 * Session read/write over a single cookie.
 *
 * `cookies()` is async in Next 16 (synchronous access to request APIs was
 * removed, not just deprecated), so every function here is async even where
 * the body looks synchronous.
 *
 * The cookie is NOT signed or encrypted. A user can edit it and change their
 * own display name, which is harmless here because nothing is authorised on
 * it. The moment anything IS authorised on it, this file must be replaced.
 * See README.md.
 */

const MAX_AGE_SECONDS = 60 * 60 * 12;

function encode(session: Session): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

/**
 * Returns null for anything it cannot trust: absent, malformed, wrong shape.
 * Never throws, because a bad cookie must not break a page render; the user
 * just reads as signed out.
 */
export function decode(raw: string | undefined): Session | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = SessionSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function makeSession(kind: SessionKind, name: string, email?: string, now = new Date()): Session {
  return {
    kind,
    name,
    ...(email ? { email } : {}),
    startedAt: now.toISOString(),
  };
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return decode(jar.get(COOKIE_NAME)?.value);
}

export async function setSession(session: Session): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, encode(session), {
    httpOnly: true,
    sameSite: "lax",
    // Secure in production only, so the flow still works over http in dev.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/** Exported for tests, which exercise the codec without a request context. */
export const codec = { encode, decode };
