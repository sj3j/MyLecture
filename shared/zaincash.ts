/**
 * ZainCash Merchant Payment Gateway — API v2 client.
 *
 * Spec: docs.zaincash.iq, "ZainCash Merchant Payment Gateway - Integration
 * Guide", Payment Gateway v2, doc version 1.0 (updated 22 Jan 2026).
 *
 * Lives in shared/ so server.ts (dev) and api/index.ts (production) run the
 * same implementation instead of drifting — see CLAUDE.md.
 *
 * v2 differs from v1 in every meaningful way: OAuth2 client-credentials instead
 * of a body-signed JWT, a gateway-supplied redirectUrl instead of one we build,
 * and JWT callbacks verified with a dedicated API key rather than the client
 * secret.
 */
import jwt from "jsonwebtoken";

/** Values appearing in `status` (inquiry) and `currentStatus`/`previousStatus` (callbacks). */
export type ZainCashStatus =
  | "SUCCESS"
  | "FAILED"
  | "PENDING"
  | "OTP_SENT"
  | "CUSTOMER_AUTHENTICATION_REQUIRED"
  | "EXPIRED"
  | "REFUNDED";

/** Terminal states — safe to stop polling once one is reached. */
export const TERMINAL_STATUSES: ZainCashStatus[] = ["SUCCESS", "FAILED", "EXPIRED", "REFUNDED"];

export interface ZainCashConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  /** HS256 secret for verifying redirect + webhook JWTs. NOT clientSecret. */
  apiKey: string;
  /** ZainCash-issued service identifier. Not free text. */
  serviceType: string;
}

/** Decoded redirect / webhook JWT. */
export interface ZainCashEvent {
  eventType: string;
  eventId: string;
  timestamp: string;
  data: {
    transactionId: string;
    merchantReferenceId: string;
    customerMsisdn?: string;
    orderId: string;
    operationId?: number;
    serviceType?: string;
    language?: string;
    errorMessage?: string | null;
    previousStatus?: ZainCashStatus;
    currentStatus: ZainCashStatus;
    amount?: { currency: string; value: number; feeValue?: number };
  };
}

/**
 * Normalised init result. The gateway nests the identifiers under
 * `transactionDetails` and returns `redirectUrl` at the top level; this is
 * flattened so callers do not have to know that.
 */
export interface ZainCashInitResult {
  transactionId: string;
  externalReferenceId?: string;
  orderId?: string;
  redirectUrl: string;
  expiryTime?: string;
  createdAt?: string;
  amount?: { currency: string; value: number };
}

export interface ZainCashInquiryResult {
  status: ZainCashStatus;
  transactionDetails?: {
    transactionId: string;
    operationId?: number | null;
    externalReferenceId?: string;
    orderId?: string;
    amount?: { currency: string; value: number; feeValue?: number };
  };
  /** Sibling of transactionDetails in the response, not nested inside it. */
  customer?: { phone?: string };
  timeStamps?: Record<string, string | null>;
}

/** Thrown for any non-2xx gateway response, carrying enough to debug with support. */
export class ZainCashError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ZainCashError";
  }
}

/**
 * Written into ZAINCASH_JWT_SECRET while we wait on ZainCash for the API Secret
 * Key. Collapsed to "" so it can never be handed to jwt.verify as a literal
 * key — a token would then have to be signed with the string
 * "PENDING_FROM_SUPPORT" to pass.
 *
 * It no longer blocks /init: verifyGatewayToken falls back to the client
 * secret, so callbacks are verifiable either way. The go-live gate is
 * ZAINCASH_ENV, which stays "uat" until a sandbox payment proves which secret
 * actually signs.
 */
export const JWT_SECRET_PLACEHOLDER = "PENDING_FROM_SUPPORT";

/**
 * Resolve config from the environment. Throws if anything required is missing,
 * so a misconfigured deploy fails loudly at the first payment rather than
 * silently posting to the wrong host — the v1 failure mode.
 *
 * The HS256 callback secret is accepted under two names. The spec is not
 * self-consistent about it — the integration guide calls it the "API Secret
 * Key", ZainCash's own Node sample calls it ZAINCASH_SECRET — so there is no
 * canonical name to match. ZAINCASH_JWT_SECRET is ours and wins;
 * ZAINCASH_API_KEY stays honoured so a deploy that already has it set does not
 * break, and so pasting the secret under either name works.
 */
export type ZainCashEnv = "uat" | "production";

/**
 * Resolve ZAINCASH_ENV. Deliberately has NO default.
 *
 * It used to fall back to "uat", and that is exactly how a production deploy
 * ended up sending production credentials to the sandbox host: the variable was
 * simply never set, and nothing said so. The mismatch then surfaces as a bare
 * 401 from the gateway, three layers below anything that names a cause.
 */
function resolveEnv(): ZainCashEnv {
  const raw = (process.env.ZAINCASH_ENV || "").trim().toLowerCase();
  if (raw === "uat" || raw === "production") return raw;
  throw new Error(
    raw
      ? `ZAINCASH_ENV is "${process.env.ZAINCASH_ENV}"; expected "uat" or "production"`
      : 'ZAINCASH_ENV is not set; expected "uat" or "production"',
  );
}

/**
 * Reject a base URL that disagrees with the environment.
 *
 * ZainCash credentials are bound to their host — verified against the live
 * gateway: our production pair answers 401 at the UAT host, and the published
 * sandbox pair answers 401 at production. So a mismatched pair can never work,
 * and saying so here costs far less than debugging an opaque gateway 401.
 *
 * Only the UAT hostname is checked, never production's. The docs say the
 * production host is "provided during onboarding" and may differ per merchant,
 * so hardcoding ours would reject a legitimate future one.
 */
function assertHostMatchesEnv(env: ZainCashEnv, baseUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    throw new Error(`ZainCash base URL is not a valid URL: ${baseUrl}`);
  }

  const isUatHost = hostname.includes("-uat");
  if (env === "uat" && !isUatHost) {
    throw new Error(
      `ZAINCASH_ENV=uat but the base URL is ${hostname}, which is not a UAT host. ` +
        "Credentials are host-bound, so this pair can only ever return 401.",
    );
  }
  if (env === "production" && isUatHost) {
    throw new Error(
      `ZAINCASH_ENV=production but the base URL is ${hostname}, a UAT host. ` +
        "Credentials are host-bound, so this pair can only ever return 401.",
    );
  }
}

export function loadZainCashConfig(): ZainCashConfig {
  const env = resolveEnv();
  const baseUrl = (
    env === "production"
      ? process.env.ZAINCASH_BASE_URL_PRODUCTION
      : process.env.ZAINCASH_BASE_URL_UAT
  )?.replace(/\/+$/, "");

  // Credentials are per environment. The docs say so explicitly, and the
  // published UAT sandbox pair must never be reachable from a production
  // deploy. The unsuffixed name stays honoured as a fallback.
  //
  // Which name won is recorded, because "clientId is present" was never the
  // useful fact — "clientId came from the unsuffixed slot while the host is
  // UAT" is.
  const pickedFrom: Record<string, string> = {};
  const pick = (name: string): string => {
    const suffixed = `${name}_${env.toUpperCase()}`;
    if (process.env[suffixed]) {
      pickedFrom[name] = suffixed;
      return process.env[suffixed]!;
    }
    if (process.env[name]) {
      pickedFrom[name] = `${name} (unsuffixed)`;
      return process.env[name]!;
    }
    return "";
  };

  // The HS256 callback secret, under any of the names it goes by.
  const rawApiKey = pick("ZAINCASH_JWT_SECRET") || pick("ZAINCASH_API_KEY");

  const cfg: ZainCashConfig = {
    baseUrl: baseUrl || "",
    clientId: pick("ZAINCASH_CLIENT_ID"),
    clientSecret: pick("ZAINCASH_CLIENT_SECRET"),
    scopes: process.env.ZAINCASH_SCOPES || "payment:read payment:write",
    // The placeholder is never handed out as a literal key.
    apiKey: rawApiKey === JWT_SECRET_PLACEHOLDER ? "" : rawApiKey,
    serviceType: process.env.ZAINCASH_SERVICE_TYPE || "",
  };

  // apiKey is deliberately NOT required. verifyGatewayToken falls back to the
  // client secret, which is always present, so "nothing to verify with" is not
  // a reachable state. Which secret ZainCash actually signs with is still
  // unconfirmed — see verifyGatewayToken.
  const missing = (["baseUrl", "clientId", "clientSecret", "serviceType"] as const)
    .filter((k) => !cfg[k]);
  if (missing.length) {
    throw new Error(
      `ZainCash not configured (env=${env}, host=${cfg.baseUrl || "unset"}, ` +
        `clientId from ${pickedFrom.ZAINCASH_CLIENT_ID || "nowhere"}); ` +
        `missing: ${missing.join(", ")}`,
    );
  }

  assertHostMatchesEnv(env, cfg.baseUrl);
  return cfg;
}

// ─── Public origin ──────────────────────────────────────────────────────────

/** Value APP_URL ships with before anyone sets it. Never a valid origin. */
const APP_URL_PLACEHOLDER = "MY_APP_URL";

/**
 * The origin ZainCash returns the customer to, and the origin our webhook URL
 * is registered under.
 *
 * Derived rather than stored per-URL because dotenv does not expand ${APP_URL},
 * so separate successUrl/failureUrl variables would only drift. Throws rather
 * than falling back: an unset APP_URL used to produce
 * "MY_APP_URL/api/zaincash/success", which the gateway accepts at init and
 * which then strands every paying customer on a dead redirect.
 */
export function resolveAppOrigin(): string {
  const raw = (process.env.APP_URL || "").trim().replace(/\/+$/, "");

  if (!raw || raw === APP_URL_PLACEHOLDER) {
    throw new Error(
      "APP_URL is not set (still the MY_APP_URL placeholder). ZainCash redirect " +
        "URLs cannot be built without a real public origin.",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`APP_URL is not a valid URL: ${raw}`);
  }

  // Plain http is allowed only for local development. The spec requires HTTPS
  // for every redirect and notification URL.
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) {
    throw new Error(`APP_URL must be https:// (got ${url.protocol}//${url.host})`);
  }

  return raw;
}

/** Where the gateway sends the customer back on success. */
export const successUrlFor = (origin = resolveAppOrigin()) => `${origin}/api/zaincash/success`;
/** Where the gateway sends the customer back on failure or cancel. */
export const failureUrlFor = (origin = resolveAppOrigin()) => `${origin}/api/zaincash/failure`;
/**
 * The URL ZainCash's business team registers. Must differ from the two above,
 * which the spec requires and which this naturally satisfies.
 */
export const webhookUrlFor = (origin = resolveAppOrigin()) => `${origin}/api/zaincash/webhook`;

// ─── Tenant tagging ─────────────────────────────────────────────────────────

/**
 * Prefix stamped onto every orderId this app sends to the gateway.
 *
 * One merchant account can serve more than one app, but ZainCash registers a
 * single webhook URL for it. Tagging orderId lets whichever app receives the
 * webhook tell whose payment it is and forward the ones that are not its own.
 * externalReferenceId cannot carry this — the spec types it as a UUID — but
 * orderId is explicitly "your internal order identifier", free-form.
 */
export const TENANT_PREFIX = "ml_";

/** Stamp our tenant prefix onto a local id before sending it to the gateway. */
export function tagOrderId(localId: string): string {
  return `${TENANT_PREFIX}${localId}`;
}

/**
 * Split a gateway orderId back into tenant + local id.
 *
 * An untagged id is returned unchanged with `tenant: null` so payments created
 * before tagging existed still settle.
 */
export function parseOrderId(orderId: string): { tenant: string | null; id: string } {
  const match = /^([a-z]{2}_)(.+)$/.exec(orderId || "");
  return match ? { tenant: match[1], id: match[2] } : { tenant: null, id: orderId };
}

// ─── Transport ──────────────────────────────────────────────────────────────

/**
 * Read a gateway response body, distinguishing "the gateway is down" from "the
 * gateway said no".
 *
 * When ZainCash is unavailable it answers with an HTML error page rather than
 * JSON. Parsing that as JSON yields an empty object and a misleading generic
 * failure, which sent us hunting for credential bugs during a v1 outage. The
 * HTML is detected and surfaced as such instead.
 */
async function readGatewayBody(res: any): Promise<{ data: any; html: string | null }> {
  if (typeof res?.text !== "function") {
    // Test doubles and shims that implement only json().
    const data = await res?.json?.().catch(() => undefined);
    return { data: data ?? {}, html: null };
  }

  const text: string = await res.text().catch(() => "");
  if (/^s*(<!doctype html|<html)/i.test(text)) {
    return { data: {}, html: text.slice(0, 200) };
  }
  try {
    return { data: text ? JSON.parse(text) : {}, html: null };
  } catch {
    return { data: {}, html: null };
  }
}

// ─── OAuth2 ─────────────────────────────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

/** Discard the cached token. Exported for tests and for 401 recovery. */
export function resetTokenCache(): void {
  tokenCache = null;
}

/**
 * POST {base}/oauth2/token — client_credentials grant, form-urlencoded.
 * Cached until 60s before expiry.
 */
export async function getAccessToken(cfg: ZainCashConfig, forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: cfg.scopes,
  });

  const res = await fetch(`${cfg.baseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const { data, html } = await readGatewayBody(res);
  if (html) {
    throw new ZainCashError(
      `ZainCash is unavailable (HTML error page, HTTP ${res.status})`,
      res.status,
      html,
    );
  }
  if (!res.ok || !data?.access_token) {
    throw new ZainCashError("ZainCash token request failed", res.status, data);
  }

  // expires_in is seconds; fall back to 5 minutes if the gateway omits it.
  const ttlMs = (Number(data.expires_in) || 300) * 1000;
  tokenCache = { token: data.access_token, expiresAt: Date.now() + ttlMs - 60_000 };
  return data.access_token;
}

/** Authenticated request that retries once with a fresh token on a 401. */
async function authedFetch(
  cfg: ZainCashConfig,
  path: string,
  init: { method: string; body?: string },
): Promise<any> {
  const call = async (token: string) =>
    fetch(`${cfg.baseUrl}${path}`, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      ...(init.body ? { body: init.body } : {}),
    });

  let res = await call(await getAccessToken(cfg));
  if (res.status === 401) {
    res = await call(await getAccessToken(cfg, true));
  }

  const { data, html } = await readGatewayBody(res);
  if (html) {
    throw new ZainCashError(
      `ZainCash is unavailable (HTML error page, HTTP ${res.status})`,
      res.status,
      html,
    );
  }
  if (!res.ok) {
    throw new ZainCashError(`ZainCash ${init.method} ${path} failed`, res.status, data);
  }
  return data;
}

// ─── Transactions ───────────────────────────────────────────────────────────

export interface InitTransactionInput {
  /** Unique per payment attempt. Idempotency + reconciliation key. */
  externalReferenceId: string;
  /** Our own identifier — the Firestore subscription document id. */
  orderId: string;
  amount: number;
  /** Must match the caller's app locale. */
  language: "en" | "ar" | "ku";
  successUrl: string;
  failureUrl: string;
  /**
   * Omit on a customer's first payment: the gateway then prompts for the wallet
   * number, which we capture from the success callback for reuse.
   */
  customerPhone?: string;
}

/** POST /api/v2/payment-gateway/transaction/init — scope: payment:write */
export async function initTransaction(
  cfg: ZainCashConfig,
  input: InitTransactionInput,
): Promise<ZainCashInitResult> {
  const body: Record<string, unknown> = {
    language: input.language,
    externalReferenceId: input.externalReferenceId,
    orderId: input.orderId,
    serviceType: cfg.serviceType,
    amount: { value: String(input.amount), currency: "IQD" },
    redirectUrls: {
      successUrl: input.successUrl,
      failureUrl: input.failureUrl,
    },
  };
  if (input.customerPhone) {
    body.customer = { phone: input.customerPhone };
  }

  const data = await authedFetch(cfg, "/api/v2/payment-gateway/transaction/init", {
    method: "POST",
    body: JSON.stringify(body),
  });

  // The id lives under transactionDetails; tolerate a top-level one too in case
  // the gateway ever flattens it.
  const transactionId = data?.transactionDetails?.transactionId ?? data?.transactionId;
  if (!data?.redirectUrl || !transactionId) {
    throw new ZainCashError("ZainCash init returned no redirectUrl/transactionId", 502, data);
  }

  return {
    transactionId,
    externalReferenceId:
      data.transactionDetails?.externalReferenceId ?? data.externalReferenceId,
    orderId: data.transactionDetails?.orderId ?? data.orderId,
    redirectUrl: data.redirectUrl,
    expiryTime: data.expiryTime,
    createdAt: data.createdAt,
    amount: data.transactionDetails?.amount ?? data.amount,
  };
}

/** GET /api/v2/payment-gateway/transaction/inquiry/{id} — scope: payment:read */
export async function inquireTransaction(
  cfg: ZainCashConfig,
  transactionId: string,
): Promise<ZainCashInquiryResult> {
  return (await authedFetch(
    cfg,
    `/api/v2/payment-gateway/transaction/inquiry/${encodeURIComponent(transactionId)}`,
    { method: "GET" },
  )) as ZainCashInquiryResult;
}

/** POST /api/v2/payment-gateway/transaction/reverse — scope: reverse:write */
export async function reverseTransaction(
  cfg: ZainCashConfig,
  transactionId: string,
  reason: string,
): Promise<any> {
  return authedFetch(cfg, "/api/v2/payment-gateway/transaction/reverse", {
    method: "POST",
    body: JSON.stringify({ transactionId, reason }),
  });
}

// ─── Callback verification ──────────────────────────────────────────────────

/**
 * Verify a redirect or webhook JWT.
 *
 * The algorithm is pinned to HS256 on every attempt, as the spec requires:
 * leaving it open would let a forged token select "none" and bypass
 * verification entirely.
 *
 * WHICH secret ZainCash signs with is not settled. The integration guide and
 * the FAQ both say the API Secret Key; their business team says the issued
 * credentials are "standard for all our merchants"; and the code this was
 * ported from verified with the OAuth2 client secret. So both are tried and
 * the winner is logged — the first real callback answers the question, after
 * which the loser should be deleted and the winner pinned.
 *
 * Accepting either is not a weakening. Both are our own secrets, neither is
 * derivable by an attacker, and a token signed with anything else still fails.
 */
export function verifyGatewayToken(cfg: ZainCashConfig, token: string): ZainCashEvent {
  const candidates = [
    { label: "apiKey", secret: cfg.apiKey },
    { label: "clientSecret", secret: cfg.clientSecret },
  ].filter((c) => !!c.secret);

  let lastError: unknown;
  for (const { label, secret } of candidates) {
    try {
      const event = jwt.verify(token, secret, {
        algorithms: ["HS256"],
      }) as unknown as ZainCashEvent;
      if (label !== "apiKey") {
        console.warn(
          `[ZainCash] callback verified with the ${label}, not the API key. ` +
            "Pin that secret and drop the fallback.",
        );
      }
      return event;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error("ZainCash callback token could not be verified");
}
