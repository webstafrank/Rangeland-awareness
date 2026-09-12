# services/auth

Carries a display name and a session kind (`guest` or `member`) through the UI.

Contract: `contracts/auth.ts`, version 1.

## This is not authentication

Read this before wiring anything to it.

| What it does | What it does not do |
| --- | --- |
| Stores a name, an optional email, and a kind in one cookie | Verify any credential |
| Reads that cookie back on the server | Sign or encrypt the cookie |
| Distinguishes a guest from a member for display | Authorise anything on that distinction |
| Discards any submitted password | Store, hash, or transmit a password |

The cookie is `httpOnly`, `sameSite=lax`, and `secure` in production, so it is
not readable from JavaScript and does not ride along on cross-site requests.
That is the extent of it. The payload is base64url JSON with no signature, so
a user can decode and rewrite their own cookie. That is acceptable **only**
because nothing in the app is authorised on its contents: every analysis route
is open to guests by design, which is what the user story asks for.

`decode()` returns `null` for anything it cannot validate against
`SessionSchema` and never throws, because a mangled cookie must not break a
page render. The test suite covers seven malformed shapes, including a forged
`kind`.

## To make it real, replace

1. `session.ts` entirely, with a signed or encrypted session (`iron-session`,
   `jose`, or a server-side session store keyed by an opaque id).
2. `actions.ts`, with real credential verification. Note that
   `signInAction` currently performs **no** credential check at all.
3. Add authorisation checks at the point of use. Today there are none, so
   adding a session store without adding checks would give a false sense of
   having secured something.

Password handling is the one thing deliberately left absent rather than
stubbed: the sign-up form renders a password field so the screen is honest
about what a real sign-up asks for, but the value is never read.
`__tests__/auth.test.ts` asserts a submitted password reaches neither the
validated data nor the encoded session, so a later edit cannot start
persisting it unnoticed.

## Layout

| File | Role |
| --- | --- |
| `session.ts` | Cookie read/write and the codec. Async, because `cookies()` is async in Next 16. |
| `validate.ts` | Pure validation. Separate from `actions.ts` so it is unit-testable and importable from a client component. |
| `actions.ts` | `"use server"` actions. Not re-exported from `index.ts`, so the server boundary stays visible at each import site. |
| `index.ts` | Public surface. |

## Tests

```
npx vitest run services/auth
```

22 gate tests: codec round-trips, seven malformed-cookie shapes, a forged
session kind, field-keyed validation errors, multi-field error collection, and
the two password-exclusion properties.
