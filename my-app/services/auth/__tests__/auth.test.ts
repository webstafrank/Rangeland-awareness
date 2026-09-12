import { describe, expect, it } from "vitest";
import { COOKIE_NAME, SessionSchema } from "@/contracts/auth";
import { codec, makeSession } from "../session";
import { validateSignIn, validateSignUp } from "../validate";

describe("session codec", () => {
  it("round-trips a member session", () => {
    const session = makeSession("member", "Amina Yusuf", "amina@ksa.go.ke", new Date("2026-03-01T08:00:00Z"));
    expect(codec.decode(codec.encode(session))).toEqual(session);
  });

  it("round-trips a guest session with no email", () => {
    const session = makeSession("guest", "Guest", undefined, new Date("2026-03-01T08:00:00Z"));
    expect(session.email).toBeUndefined();
    expect(codec.decode(codec.encode(session))).toEqual(session);
  });

  /**
   * A page render must never throw because of a cookie. Each of these is a
   * shape a real browser can present: cleared, truncated by a proxy, or set
   * by hand.
   */
  it.each([
    ["undefined", undefined],
    ["empty string", ""],
    ["not base64", "!!!!"],
    ["base64 of not-json", Buffer.from("hello", "utf8").toString("base64url")],
    ["base64 of wrong shape", Buffer.from(JSON.stringify({ kind: "admin" }), "utf8").toString("base64url")],
    ["base64 of null", Buffer.from("null", "utf8").toString("base64url")],
    ["base64 of an array", Buffer.from("[]", "utf8").toString("base64url")],
  ])("returns null rather than throwing for %s", (_label, raw) => {
    expect(codec.decode(raw as string | undefined)).toBeNull();
  });

  it("rejects a kind outside the contract", () => {
    const forged = Buffer.from(
      JSON.stringify({ kind: "superuser", name: "x", startedAt: new Date().toISOString() }),
      "utf8",
    ).toString("base64url");
    expect(codec.decode(forged)).toBeNull();
  });

  it("produces a session that satisfies the contract schema", () => {
    expect(SessionSchema.safeParse(makeSession("guest", "Guest")).success).toBe(true);
  });

  it("names the cookie as the contract declares", () => {
    expect(COOKIE_NAME).toBe("rw_session");
  });
});

describe("sign-up validation", () => {
  const valid = { name: "Amina Yusuf", email: "amina@ksa.go.ke", organisation: "Kenya Space Agency" };

  it("accepts a complete form", () => {
    expect(validateSignUp(valid).ok).toBe(true);
  });

  it("accepts a form with no organisation", () => {
    expect(validateSignUp({ name: valid.name, email: valid.email }).ok).toBe(true);
  });

  it("reports a field-keyed error for a short name", () => {
    const result = validateSignUp({ ...valid, name: "A" });
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.name).toEqual(["Enter your full name"]);
  });

  it("reports a field-keyed error for a bad email", () => {
    const result = validateSignUp({ ...valid, email: "not-an-email" });
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.email).toEqual(["Enter a valid email address"]);
  });

  /** The form shows every problem at once, not just the first. */
  it("collects errors from every bad field together", () => {
    const result = validateSignUp({ name: "", email: "nope" });
    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(["email", "name"]);
  });

  it("trims surrounding whitespace from the name", () => {
    const result = validateSignUp({ ...valid, name: "  Amina Yusuf  " });
    expect(result.data?.name).toBe("Amina Yusuf");
  });

  /**
   * The security property that matters in this stub: a password submitted by
   * the form is never carried into the validated data, so it cannot reach the
   * session cookie. If someone adds `password` to the schema, this fails.
   */
  it("drops a submitted password rather than carrying it through", () => {
    const result = validateSignUp({ ...valid, password: "hunter2" });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain("hunter2");
    expect(result.data).not.toHaveProperty("password");
  });

  it("never lets a password reach an encoded session", () => {
    const session = makeSession("member", valid.name, valid.email);
    expect(Buffer.from(codec.encode(session), "base64url").toString("utf8")).not.toContain("hunter2");
  });
});

describe("sign-in validation", () => {
  it("accepts a valid email", () => {
    expect(validateSignIn({ email: "amina@ksa.go.ke" }).ok).toBe(true);
  });

  it("rejects an invalid email with a field-keyed message", () => {
    const result = validateSignIn({ email: "amina@" });
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.email).toEqual(["Enter a valid email address"]);
  });
});
