/**
 * Native replacement for src/i18n/payments.ts.
 *
 * Empty on purpose. The only consumers of those keys are the three
 * subscription components, which this build also replaces with stubs, so
 * nothing reads them - and with the literals absent,
 * scripts/assert-no-payment-surface.mjs has nothing to find.
 *
 * Aliased in by vite.config.ts when mode === 'native'.
 */
export const PAYMENT_STRINGS = { ar: {}, en: {} };
