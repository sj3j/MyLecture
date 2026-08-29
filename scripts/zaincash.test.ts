/**
 * Pins the ZainCash Payment Gateway v2 wire format.
 *
 * Run with:  npm run test:zaincash
 *
 * No emulator, no network - fetch is stubbed. The point is to catch a
 * regression in the exact thing that broke v1: a base URL missing its endpoint
 * path, a redirect URL pointing at the wrong host, or a payment URL built by
 * hand instead of taken from the gateway.
 */
import jwt from 'jsonwebtoken';
import {
  loadZainCashConfig,
  getAccessToken,
  initTransaction,
  inquireTransaction,
  verifyGatewayToken,
  resetTokenCache,
  resolveAppOrigin,
  tagOrderId,
  parseOrderId,
  JWT_SECRET_PLACEHOLDER,
  ZainCashConfig,
  ZainCashError,
} from '../shared/zaincash';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { console.log(`  PASS  ${name}`); passed++; }
  else { console.log(`  FAIL  ${name}${detail ? ' -> ' + detail : ''}`); failed++; }
};

// ---- fetch stub ----------------------------------------------------------

interface Call { url: string; method: string; headers: Record<string, string>; body?: string }
let calls: Call[] = [];
let responder: (c: Call) => { status: number; body: any } = () => ({ status: 200, body: {} });

(global as any).fetch = async (url: string, init: any = {}) => {
  const call: Call = {
    url: String(url),
    method: init.method || 'GET',
    headers: init.headers || {},
    body: init.body,
  };
  calls.push(call);
  const { status, body } = responder(call);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    // A string body stands in for the HTML error page the gateway serves
    // when it is down; anything else is normal JSON.
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as any;
};

const reset = () => { calls = []; resetTokenCache(); };

const withEnv = (vars: Record<string, string>, fn: () => void) => {
  const saved = { ...process.env };
  Object.assign(process.env, vars);
  try { fn(); } finally { process.env = saved; }
};

const BASE_ENV = {
  ZAINCASH_BASE_URL_UAT: 'https://pg-api-uat.zaincash.iq',
  ZAINCASH_BASE_URL_PRODUCTION: 'https://pg-api.zaincash.iq',
  ZAINCASH_CLIENT_ID: 'cid',
  ZAINCASH_CLIENT_SECRET: 'csecret',
  ZAINCASH_API_KEY: 'apikey-hs256',
  ZAINCASH_SERVICE_TYPE: 'Delivery',
  ZAINCASH_SCOPES: 'payment:read payment:write reverse:write',
};

const cfg: ZainCashConfig = {
  baseUrl: 'https://pg-api-uat.zaincash.iq',
  clientId: 'cid',
  clientSecret: 'csecret',
  scopes: 'payment:read payment:write',
  apiKey: 'apikey-hs256',
  serviceType: 'Delivery',
};

const TOKEN_OK = { access_token: 'tok-1', expires_in: 3600 };

// ---- config --------------------------------------------------------------

console.log('Config:');

withEnv({ ...BASE_ENV, ZAINCASH_ENV: 'uat' }, () => {
  check('uat selects the UAT host', loadZainCashConfig().baseUrl === 'https://pg-api-uat.zaincash.iq');
});

withEnv({ ...BASE_ENV, ZAINCASH_ENV: 'production' }, () => {
  check('production selects the production host', loadZainCashConfig().baseUrl === 'https://pg-api.zaincash.iq');
});

withEnv({ ...BASE_ENV, ZAINCASH_ENV: 'uat', ZAINCASH_BASE_URL_UAT: 'https://pg-api-uat.zaincash.iq/' }, () => {
  check('a trailing slash on the base URL is stripped',
    loadZainCashConfig().baseUrl === 'https://pg-api-uat.zaincash.iq');
});

withEnv({ ...BASE_ENV, ZAINCASH_ENV: 'uat', ZAINCASH_SERVICE_TYPE: '' }, () => {
  let threw = '';
  try { loadZainCashConfig(); } catch (e: any) { threw = e.message; }
  check('missing serviceType fails loudly rather than silently', threw.includes('serviceType'), threw);
});

withEnv({ ...BASE_ENV, ZAINCASH_ENV: 'uat', ZAINCASH_API_KEY: '' }, () => {
  let threw = '';
  try { loadZainCashConfig(); } catch (e: any) { threw = e.message; }
  check('missing apiKey fails loudly', threw.includes('apiKey'), threw);
});

// The HS256 secret is accepted under two names because the spec is not
// self-consistent about what it is called.
withEnv({ ...BASE_ENV, ZAINCASH_ENV: 'uat', ZAINCASH_JWT_SECRET: 'from-jwt-secret' }, () => {
  check('ZAINCASH_JWT_SECRET wins over ZAINCASH_API_KEY',
    loadZainCashConfig().apiKey === 'from-jwt-secret', loadZainCashConfig().apiKey);
});

withEnv({ ...BASE_ENV, ZAINCASH_ENV: 'uat' }, () => {
  check('ZAINCASH_API_KEY alone still resolves',
    loadZainCashConfig().apiKey === 'apikey-hs256');
});

// The placeholder must fail closed. If it counted as a value, /init would
// take real money for payments whose callbacks can never verify.
withEnv(
  { ...BASE_ENV, ZAINCASH_ENV: 'uat', ZAINCASH_JWT_SECRET: JWT_SECRET_PLACEHOLDER, ZAINCASH_API_KEY: '' },
  () => {
    let threw = '';
    try { loadZainCashConfig(); } catch (e: any) { threw = e.message; }
    check('the PENDING_FROM_SUPPORT placeholder is rejected like a missing key',
      threw.includes('apiKey'), threw);
    check('and the error says why', threw.includes('placeholder'), threw);
  },
);

// ---- app origin ----------------------------------------------------------

console.log('\nAPP_URL:');

const originThrows = (appUrl: string): string => {
  let threw = '';
  withEnv({ APP_URL: appUrl }, () => {
    try { resolveAppOrigin(); } catch (e: any) { threw = e.message; }
  });
  return threw;
};

// The regression this exists for: an unset APP_URL used to build
// "MY_APP_URL/api/zaincash/success", which the gateway accepts at init and
// which then strands every paying customer on a dead redirect.
check('the MY_APP_URL placeholder is rejected', originThrows('MY_APP_URL').includes('APP_URL'));
check('an unset APP_URL is rejected', originThrows('').includes('APP_URL'));
check('a non-URL is rejected', originThrows('not a url').length > 0);
check('plain http on a public host is rejected',
  originThrows('http://app.example.com').includes('https'), originThrows('http://app.example.com'));

withEnv({ APP_URL: 'http://localhost:3000' }, () => {
  check('http://localhost stays legal for npm run dev', resolveAppOrigin() === 'http://localhost:3000');
});

withEnv({ APP_URL: 'https://app.example.com/' }, () => {
  check('a trailing slash is trimmed', resolveAppOrigin() === 'https://app.example.com');
});

// ---- tenant tagging ------------------------------------------------------

console.log('\nOrder id tagging:');

// One merchant account can serve two apps but ZainCash registers a single
// webhook URL, so orderId is what tells them apart.
check('tagOrderId stamps the tenant prefix', tagOrderId('abc123') === 'ml_abc123');
check('parseOrderId round-trips', parseOrderId(tagOrderId('abc123')).id === 'abc123');
check('parseOrderId reports the tenant', parseOrderId('ml_abc123').tenant === 'ml_');
check('another tenant is recognised, not swallowed', parseOrderId('vm_xyz').tenant === 'vm_');
// Payments created before tagging existed must still settle.
check('an untagged legacy id passes through unchanged', parseOrderId('abc123').id === 'abc123');
check('an untagged legacy id has no tenant', parseOrderId('abc123').tenant === null);

// ---- oauth2 --------------------------------------------------------------

console.log('\nOAuth2 token:');

(async () => {
  reset();
  responder = () => ({ status: 200, body: TOKEN_OK });
  await getAccessToken(cfg);
  const c = calls[0];

  check('token endpoint is {base}/oauth2/token', c.url === 'https://pg-api-uat.zaincash.iq/oauth2/token', c.url);
  check('token request is a POST', c.method === 'POST');
  check('token request is form-urlencoded',
    c.headers['Content-Type'] === 'application/x-www-form-urlencoded', JSON.stringify(c.headers));

  const form = new URLSearchParams(c.body || '');
  check('grant_type is client_credentials', form.get('grant_type') === 'client_credentials');
  check('client_id is sent', form.get('client_id') === 'cid');
  check('client_secret is sent', form.get('client_secret') === 'csecret');
  check('scope is space-separated', form.get('scope') === 'payment:read payment:write');

  // caching
  await getAccessToken(cfg);
  check('a valid token is cached, not re-fetched', calls.length === 1, `${calls.length} calls`);

  await getAccessToken(cfg, true);
  check('forceRefresh bypasses the cache', calls.length === 2, `${calls.length} calls`);

  // ---- init ------------------------------------------------------------

  console.log('\ntransaction/init:');
  reset();
  // Exactly the shape from the spec's sample response: the identifiers are
  // nested under transactionDetails, redirectUrl sits at the top level.
  responder = (c) => c.url.endsWith('/oauth2/token')
    ? { status: 200, body: TOKEN_OK }
    : { status: 200, body: {
        status: 'SUCCESS',
        transactionDetails: {
          transactionId: 'tx-1',
          externalReferenceId: 'ext-1',
          orderId: 'sub-1',
          amount: { currency: 'IQD', value: 3000 },
        },
        redirectUrl: 'https://pg-api-uat.zaincash.iq/transaction/pay?id=x&token=t',
        expiryTime: '2026-01-01T00:15:00.000+00:00',
        createdAt: '2026-01-01T00:00:00.000+00:00',
      } };

  const initResult = await initTransaction(cfg, {
    externalReferenceId: 'ext-1',
    orderId: 'sub-1',
    amount: 3000,
    language: 'ar',
    successUrl: 'https://app.example.com/api/zaincash/success',
    failureUrl: 'https://app.example.com/api/zaincash/failure',
  });

  const initCall = calls[calls.length - 1];
  check('init endpoint is {base}/api/v2/payment-gateway/transaction/init',
    initCall.url === 'https://pg-api-uat.zaincash.iq/api/v2/payment-gateway/transaction/init', initCall.url);
  check('init carries the bearer token',
    initCall.headers['Authorization'] === 'Bearer tok-1', JSON.stringify(initCall.headers));

  const body = JSON.parse(initCall.body || '{}');
  check('serviceType comes from config, not free text', body.serviceType === 'Delivery', body.serviceType);
  check('amount.value is a string', typeof body.amount.value === 'string', typeof body.amount.value);
  check('amount.currency is IQD', body.amount.currency === 'IQD');
  check('externalReferenceId is forwarded', body.externalReferenceId === 'ext-1');
  check('orderId is forwarded', body.orderId === 'sub-1');
  check('successUrl points at our app, not the gateway',
    body.redirectUrls.successUrl === 'https://app.example.com/api/zaincash/success', body.redirectUrls.successUrl);
  check('failureUrl is set', body.redirectUrls.failureUrl === 'https://app.example.com/api/zaincash/failure');
  check('customer is omitted on a first payment', body.customer === undefined, JSON.stringify(body.customer));
  check('the gateway redirectUrl is returned verbatim',
    initResult.redirectUrl === 'https://pg-api-uat.zaincash.iq/transaction/pay?id=x&token=t', initResult.redirectUrl);
  // Regression: transactionId is nested under transactionDetails. Reading it
  // from the top level made every payment throw.
  check('transactionId is read from transactionDetails', initResult.transactionId === 'tx-1', String(initResult.transactionId));
  check('externalReferenceId is read from transactionDetails', initResult.externalReferenceId === 'ext-1');
  check('orderId is read from transactionDetails', initResult.orderId === 'sub-1');
  check('expiryTime is surfaced', initResult.expiryTime === '2026-01-01T00:15:00.000+00:00');

  reset();
  responder = (c) => c.url.endsWith('/oauth2/token')
    ? { status: 200, body: TOKEN_OK }
    : { status: 200, body: { transactionDetails: { transactionId: 'tx-2' }, redirectUrl: 'https://x' } };
  await initTransaction(cfg, {
    externalReferenceId: 'ext-2', orderId: 'sub-2', amount: 1000, language: 'en',
    successUrl: 'https://a/s', failureUrl: 'https://a/f', customerPhone: '9647801234567',
  });
  const body2 = JSON.parse(calls[calls.length - 1].body || '{}');
  check('customer.phone is sent on a repeat payment', body2.customer?.phone === '9647801234567');
  check('language is forwarded', body2.language === 'en');

  // ---- inquiry ---------------------------------------------------------

  console.log('\ntransaction/inquiry:');
  reset();
  responder = (c) => c.url.endsWith('/oauth2/token')
    ? { status: 200, body: TOKEN_OK }
    : { status: 200, body: {
        status: 'SUCCESS',
        transactionDetails: { transactionId: 'tx-1', amount: { currency: 'IQD', value: 500, feeValue: 0 } },
        customer: { phone: '9647801234567' },
        timeStamps: { completedAt: null },
      } };

  const inq = await inquireTransaction(cfg, 'tx-1');
  const inqCall = calls[calls.length - 1];
  check('inquiry endpoint includes the transaction id',
    inqCall.url === 'https://pg-api-uat.zaincash.iq/api/v2/payment-gateway/transaction/inquiry/tx-1', inqCall.url);
  check('inquiry is a GET', inqCall.method === 'GET');
  check('inquiry status is parsed', inq.status === 'SUCCESS');
  check('inquiry amount is under transactionDetails', inq.transactionDetails?.amount?.value === 500);
  // Regression: customer is a sibling of transactionDetails, not nested in it.
  check('inquiry customer.phone is a top-level sibling', inq.customer?.phone === '9647801234567', JSON.stringify(inq.customer));

  // ---- 401 recovery ----------------------------------------------------

  console.log('\nToken expiry recovery:');
  reset();
  let issued = 0;
  responder = (c) => {
    if (c.url.endsWith('/oauth2/token')) { issued++; return { status: 200, body: { access_token: `tok-${issued}`, expires_in: 3600 } }; }
    return c.headers['Authorization'] === 'Bearer tok-2'
      ? { status: 200, body: { status: 'SUCCESS' } }
      : { status: 401, body: { error: 'expired' } };
  };
  const recovered = await inquireTransaction(cfg, 'tx-9');
  check('a 401 triggers one retry with a fresh token', recovered.status === 'SUCCESS');
  check('exactly two tokens were issued', issued === 2, String(issued));

  // ---- JWT verification ------------------------------------------------

  // ---- gateway outage --------------------------------------------------

  console.log('\nGateway outage:');
  reset();
  // When ZainCash is down it serves an HTML error page, not JSON. Parsing
  // that as JSON yields {} and a generic "token request failed", which sent
  // us hunting for credential bugs during a v1 outage.
  responder = () => ({ status: 503, body: '<!DOCTYPE html><html><body>503</body></html>' });
  let outageMsg = '';
  let outageBody: unknown;
  try {
    await getAccessToken(cfg);
  } catch (e: any) {
    outageMsg = e.message;
    outageBody = e instanceof ZainCashError ? e.body : undefined;
  }
  check('an HTML error page is reported as an outage, not a credential error',
    outageMsg.includes('unavailable'), outageMsg);
  check('the HTML is kept for the support ticket',
    typeof outageBody === 'string' && outageBody.includes('503'), String(outageBody).slice(0, 40));

  console.log('\nCallback JWT:');
  const payload = {
    eventType: 'STATUS_CHANGED',
    eventId: 'evt-1',
    timestamp: '2026-01-01T00:00:00.000+00:00',
    data: { transactionId: 'tx-1', merchantReferenceId: 'ext-1', orderId: 'sub-1', currentStatus: 'SUCCESS' },
  };

  const good = jwt.sign(payload, cfg.apiKey, { algorithm: 'HS256' });
  check('a token signed with the API key verifies',
    verifyGatewayToken(cfg, good).data.orderId === 'sub-1');

  const wrongKey = jwt.sign(payload, 'not-the-api-key', { algorithm: 'HS256' });
  let rejected = false;
  try { verifyGatewayToken(cfg, wrongKey); } catch { rejected = true; }
  check('a token signed with the wrong key is rejected', rejected);

  // The whole point of pinning algorithms: an unsigned token must not pass.
  const unsigned = jwt.sign(payload, '', { algorithm: 'none' } as any);
  let noneRejected = false;
  try { verifyGatewayToken(cfg, unsigned); } catch { noneRejected = true; }
  check('an alg:none token is rejected (HS256 is pinned)', noneRejected);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
