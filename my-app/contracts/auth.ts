/**
 * Contract: session identity.
 *
 * The user story has three entry paths: sign up, view analysis, or continue as
 * a guest. All three must lead somewhere real, so a guest is a first-class
 * session and not a null case: nothing in the analysis flow is gated on being
 * a member.
 *
 * THIS IS NOT AUTHENTICATION. There is no credential store, no password
 * verification, and no server-side session table. It is a signed-cookie stub
 * whose only job is to carry a display name and a session kind through the UI
 * so the flow can be built and reviewed. See services/auth/README.md for the
 * exact list of what has to be replaced before this goes near real users.
 *
 * Contract version: 1.
 */
import { z } from "zod";

export const AUTH_CONTRACT_VERSION = 1;

export const SESSION_KINDS = ["guest", "member"] as const;
export const SessionKindSchema = z.enum(SESSION_KINDS);
export type SessionKind = z.infer<typeof SessionKindSchema>;

export const SessionSchema = z.object({
  kind: SessionKindSchema,
  /** Display name. For a guest this is the literal string "Guest". */
  name: z.string().min(1).max(80),
  /** Present for members only. Never used as a lookup key: there is no store. */
  email: z.string().max(160).optional(),
  /** ISO timestamp the session began. */
  startedAt: z.string(),
});

export type Session = z.infer<typeof SessionSchema>;

export const SignUpInputSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  email: z.email("Enter a valid email address").max(160),
  organisation: z.string().trim().max(120).optional(),
});

export type SignUpInput = z.infer<typeof SignUpInputSchema>;

export const SignInInputSchema = z.object({
  email: z.email("Enter a valid email address").max(160),
});

export type SignInInput = z.infer<typeof SignInInputSchema>;

/** Field-keyed errors, shaped to render beside the offending input. */
export interface FormState {
  readonly ok: boolean;
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
}

export const COOKIE_NAME = "rw_session";
