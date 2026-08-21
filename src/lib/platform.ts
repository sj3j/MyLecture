/**
 * Platform detection for App Store compliance.
 * 
 * IS_STORE_BUILD is true when building for native (Capacitor) distribution.
 * Use this to conditionally hide payment surfaces (ZainCash, SuperKey)
 * from iOS/Android builds to comply with Apple Guideline 3.1.1/3.1.3
 * and Google Play Billing policies.
 * 
 * This is a BUILD-TIME constant — Vite's dead code elimination will
 * completely remove payment code from native bundles.
 */

declare const __NATIVE_BUILD__: boolean;

export const IS_STORE_BUILD: boolean = 
  typeof __NATIVE_BUILD__ !== 'undefined' ? __NATIVE_BUILD__ : false;
