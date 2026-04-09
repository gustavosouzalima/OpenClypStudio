/**
 * Simple single-user session management using Web Crypto API.
 * Compatible with Next.js Edge Runtime (middleware) and Node.js runtime (API routes).
 *
 * Required env vars:
 *   SESSION_SECRET  — random string used to sign session tokens
 *   ADMIN_PASSWORD  — the single password that grants access
 */

export const SESSION_COOKIE = "__session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function b64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create a signed session token valid for SESSION_DURATION_MS. */
export async function createSessionToken(): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is not set");

  const payload = b64urlEncode(
    new TextEncoder().encode(
      JSON.stringify({ exp: Date.now() + SESSION_DURATION_MS }),
    ).buffer as ArrayBuffer,
  );

  const key = await hmacKey(secret, "sign");
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return `${payload}.${b64urlEncode(sigBuf)}`;
}

/** Verify a session token. Returns true if valid and not expired. */
export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const secret = process.env.SESSION_SECRET;
    if (!secret) return false;

    const lastDot = token.lastIndexOf(".");
    if (lastDot === -1) return false;

    const payload = token.slice(0, lastDot);
    const signature = token.slice(lastDot + 1);

    const key = await hmacKey(secret, "verify");
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return false;

    const data = JSON.parse(
      new TextDecoder().decode(b64urlDecode(payload)),
    ) as { exp: number };
    return Date.now() < data.exp;
  } catch {
    return false;
  }
}

/**
 * Constant-time password comparison.
 * Compares `input` against the ADMIN_PASSWORD env var.
 */
export function verifyPassword(input: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!adminPassword) return false;

  // Always iterate over the longer length to resist timing attacks
  const maxLen = Math.max(input.length, adminPassword.length);
  let diff = input.length ^ adminPassword.length; // non-zero if lengths differ
  for (let i = 0; i < maxLen; i++) {
    diff |=
      (input.charCodeAt(i % input.length) || 0) ^
      (adminPassword.charCodeAt(i % adminPassword.length) || 0);
  }
  // Also reject if lengths differ
  diff |= input.length ^ adminPassword.length;
  return diff === 0;
}

export const SESSION_MAX_AGE_SECONDS = SESSION_DURATION_MS / 1000;
