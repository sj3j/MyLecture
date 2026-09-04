/**
 * Every string that names a way to hand over real money.
 *
 * Split out of TRANSLATIONS so the native build can drop it. Google Play and
 * the App Store enforce their payments policy by SCANNING the uploaded
 * artefact, not by using the app - so a runtime `if (!IS_STORE_BUILD)` that
 * merely hides a button still ships "ZainCash", "Pay with ZainCash" and "IQD"
 * inside the binary for a static scan to find. scripts/assert-no-payment-surface.mjs
 * is what proves they are gone, and it was failing on exactly these keys.
 *
 * vite.config.ts aliases this module to src/native-stubs/payments.ts when
 * mode === 'native', so the literals never enter the native graph at all.
 *
 * Only keys used SOLELY by the purchase UI belong here. Anything a store build
 * still needs to say - "subscription required", "ask your representative",
 * "subscription active" - stays in src/types.ts, because the native app still
 * has to explain why content is locked even though it cannot sell access.
 */

export const PAYMENT_STRINGS = {
  ar: {
    pricePerMonth: 'دينار/شهر',
    choosePayment: 'اختر طريقة الدفع',
    zaincash: 'زين كاش',
    superkey: 'سوبر كي',
    payWithZaincash: 'ادفع عبر زين كاش',
    payWithSuperkey: 'ادفع عبر سوبر كي',
    superkeyInstructions: 'أرسل المبلغ إلى رقم سوبر كي التالي:',
    enterTransactionId: 'أدخل رقم العملية',
    submitPayment: 'تأكيد الدفع',
    totalRevenue: 'إجمالي الإيرادات',
    paymentMethodStats: 'إحصائيات طرق الدفع',
    iqd: 'دينار',
    paymentSuccessful: 'تم الدفع بنجاح!',
    paymentFailed: 'فشل الدفع',
  },
  en: {
    pricePerMonth: 'IQD/mo',
    choosePayment: 'Choose Payment Method',
    zaincash: 'ZainCash',
    superkey: 'SuperKey',
    payWithZaincash: 'Pay with ZainCash',
    payWithSuperkey: 'Pay with SuperKey',
    superkeyInstructions: 'Send the amount to the following SuperKey number:',
    enterTransactionId: 'Enter Transaction ID',
    submitPayment: 'Confirm Payment',
    totalRevenue: 'Total Revenue',
    paymentMethodStats: 'Payment Method Stats',
    iqd: 'IQD',
    paymentSuccessful: 'Payment Successful!',
    paymentFailed: 'Payment Failed',
  },
};
