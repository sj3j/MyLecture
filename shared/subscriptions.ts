/**
 * Subscription lifecycle: activation, settlement of ZainCash payments, and the
 * plan table the server trusts.
 *
 * Shared by server.ts and api/index.ts for the usual reason — vercel.json routes
 * production /api/* to api/index.ts, so anything defined in only one of them
 * silently never runs where it matters.
 *
 * Follows the shared/ convention of taking `db` and `FieldValue`/`Timestamp` as
 * parameters rather than importing firebase-admin, so this stays testable
 * against the emulator. FCM is injected the same way, via `notify`.
 */
import {
  ZainCashConfig,
  ZainCashEvent,
  ZainCashStatus,
  inquireTransaction,
  parseOrderId,
} from './zaincash.js';

/**
 * Server-side plan table. Mirrors PLAN_CONFIG in src/types.ts, which is the
 * client's copy — the client's is for display, this one is what money is
 * checked against, so never trust a plan or amount sent by the browser.
 */
export const PLAN_CONFIG: Record<string, { days: number; price: number }> = {
  monthly: { days: 30, price: 1000 },
  seasonal: { days: 90, price: 3000 },
  semi_annual: { days: 180, price: 5000 },
};

export type SubscriptionEvent = 'activated' | 'expired' | 'approved' | 'rejected';

export type NotifyFn = (
  userId: string,
  event: SubscriptionEvent,
  plan?: string,
) => Promise<void>;

export interface SubscriptionCtx {
  db: FirebaseFirestore.Firestore;
  FieldValue: { serverTimestamp(): any; delete(): any };
  Timestamp: { now(): any; fromDate(d: Date): any };
  /** Optional: omitted in tests, supplied by the route files in production. */
  notify?: NotifyFn;
}

/** Activate a subscription and refresh the denormalised cache on the user doc. */
export async function activateSubscription(
  ctx: SubscriptionCtx,
  subId: string,
  userId: string,
  plan: string,
  approvedBy?: string,
): Promise<void> {
  const { db, FieldValue, Timestamp } = ctx;
  const config = PLAN_CONFIG[plan];
  if (!config) throw new Error(`Invalid plan: ${plan}`);

  // Stack time: if an active subscription exists, extend from its end date
  // rather than from now, so renewing early never costs the customer days.
  const existingSubs = await db
    .collection('subscriptions')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .get();

  const startDate = Timestamp.now();
  let endBaseDate = new Date();

  if (!existingSubs.empty) {
    const activeSub = existingSubs.docs[0];
    const activeEndDate = activeSub.data().endDate?.toDate();
    if (activeEndDate && activeEndDate > new Date()) {
      endBaseDate = activeEndDate;
    }
    await activeSub.ref.update({
      status: 'inactive',
      updatedAt: FieldValue.serverTimestamp(),
      notes: `Replaced by subscription ${subId}`,
    });
  }

  const endDate = new Date(endBaseDate.getTime() + config.days * 24 * 60 * 60 * 1000);

  const updateData: any = {
    status: 'active',
    startDate,
    endDate: Timestamp.fromDate(endDate),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (approvedBy) updateData.approvedBy = approvedBy;

  await db.collection('subscriptions').doc(subId).update(updateData);

  await db.collection('users').doc(userId).update({
    isSubscribed: true,
    subscriptionEnd: Timestamp.fromDate(endDate),
    subscriptionPlan: plan,
  });

  await ctx.notify?.(userId, 'activated', plan);
}

// ─── ZainCash settlement ────────────────────────────────────────────────────

export type SettlementOutcome =
  | 'activated'
  | 'already_settled'
  | 'duplicate_event'
  | 'failed'
  | 'refunded'
  | 'still_pending'
  | 'not_found'
  | 'amount_mismatch'
  | 'reference_mismatch';

export interface SettlementResult {
  outcome: SettlementOutcome;
  subscriptionId: string;
  status?: ZainCashStatus;
  detail?: string;
}

/**
 * Atomically claim a pending subscription for settlement.
 *
 * The redirect and the webhook can arrive for the same payment at the same
 * moment; without this both would activate it and the customer would get two
 * plans' worth of days from one payment. Returns null if someone else won.
 */
async function claimForSettlement(
  ctx: SubscriptionCtx,
  subId: string,
  eventId: string,
): Promise<{ data: FirebaseFirestore.DocumentData } | { conflict: SettlementOutcome } | null> {
  const ref = ctx.db.collection('subscriptions').doc(subId);
  return ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data()!;

    if (data.lastEventId === eventId) return { conflict: 'duplicate_event' as const };
    if (data.settling || data.status !== 'pending') {
      return { conflict: 'already_settled' as const };
    }

    tx.update(ref, { settling: true, lastEventId: eventId });
    return { data };
  });
}

/** Release the claim so a later, valid callback can still settle the payment. */
async function releaseClaim(ctx: SubscriptionCtx, subId: string): Promise<void> {
  await ctx.db.collection('subscriptions').doc(subId).update({ settling: false });
}

/**
 * Settle a ZainCash payment from a verified redirect or webhook event.
 *
 * The event's JWT signature is verified by the caller, but the event itself is
 * only a hint: the redirect arrives through the customer's browser and is
 * therefore attacker-reachable. Access is granted strictly on what the Inquiry
 * API says, and only when the amount paid matches the plan's price.
 */
export async function settleZainCashPayment(
  ctx: SubscriptionCtx,
  cfg: ZainCashConfig,
  event: ZainCashEvent,
  source: 'redirect' | 'webhook',
): Promise<SettlementResult> {
  const { db, FieldValue } = ctx;
  // orderId carries a tenant prefix so a shared merchant webhook can be routed;
  // the document id is what is left after it.
  const subId = parseOrderId(event.data.orderId).id;
  const transactionId = event.data.transactionId;

  const claim = await claimForSettlement(ctx, subId, event.eventId);
  if (claim === null) return { outcome: 'not_found', subscriptionId: subId };
  if ('conflict' in claim) return { outcome: claim.conflict, subscriptionId: subId };

  const sub = claim.data;

  // The redirect leg arrives through the customer's browser, so orderId is
  // attacker-reachable. The signature check catches forgeries; this stops a
  // *validly signed* event for one transaction being replayed against a
  // different subscription. Skipped for documents predating externalReferenceId.
  const expectedRef = sub.externalReferenceId;
  const gotRef = event.data.merchantReferenceId;
  if (expectedRef && gotRef && expectedRef !== gotRef) {
    await releaseClaim(ctx, subId).catch(() => undefined);
    return {
      outcome: 'reference_mismatch',
      subscriptionId: subId,
      detail: `event referenced ${gotRef}, subscription holds ${expectedRef}`,
    };
  }

  try {
    // Authoritative check. Never trust the callback's own currentStatus.
    const inquiry = await inquireTransaction(cfg, transactionId);
    const status = inquiry.status;

    if (status === 'SUCCESS') {
      const expected = PLAN_CONFIG[sub.plan]?.price;
      const paid = Number(inquiry.transactionDetails?.amount?.value);

      if (expected === undefined || !Number.isFinite(paid) || paid !== expected) {
        await db.collection('subscriptions').doc(subId).update({
          settling: false,
          status: 'cancelled',
          updatedAt: FieldValue.serverTimestamp(),
          notes: `Amount mismatch: paid ${paid}, expected ${expected} for plan ${sub.plan}`,
        });
        return {
          outcome: 'amount_mismatch',
          subscriptionId: subId,
          status,
          detail: `paid ${paid}, expected ${expected}`,
        };
      }

      await db.collection('subscriptions').doc(subId).update({
        settling: false,
        transactionId,
        settledVia: source,
      });

      await activateSubscription(ctx, subId, sub.userId, sub.plan);

      // Remember the wallet the customer actually paid from, refreshed every
      // time: the spec notes it may differ from their registered number and
      // may change between payments.
      const msisdn = event.data.customerMsisdn || inquiry.customer?.phone;
      if (msisdn) {
        await db
          .collection('users')
          .doc(sub.userId)
          .update({ zaincashMsisdn: msisdn })
          .catch(() => undefined);
      }

      return { outcome: 'activated', subscriptionId: subId, status };
    }

    if (status === 'FAILED' || status === 'EXPIRED') {
      await db.collection('subscriptions').doc(subId).update({
        settling: false,
        status: 'cancelled',
        updatedAt: FieldValue.serverTimestamp(),
        notes: `ZainCash ${status}${event.data.errorMessage ? `: ${event.data.errorMessage}` : ''}`,
      });
      return { outcome: 'failed', subscriptionId: subId, status };
    }

    if (status === 'REFUNDED') {
      await db.collection('subscriptions').doc(subId).update({
        settling: false,
        status: 'cancelled',
        updatedAt: FieldValue.serverTimestamp(),
        notes: 'ZainCash REFUNDED',
      });
      await db
        .collection('users')
        .doc(sub.userId)
        .update({ isSubscribed: false, subscriptionEnd: null, subscriptionPlan: null })
        .catch(() => undefined);
      return { outcome: 'refunded', subscriptionId: subId, status };
    }

    // PENDING / OTP_SENT / CUSTOMER_AUTHENTICATION_REQUIRED — not final yet.
    // Leave it pending so the webhook (or a later inquiry) can still settle it.
    await releaseClaim(ctx, subId);
    return { outcome: 'still_pending', subscriptionId: subId, status };
  } catch (err) {
    // Never leave a claim stuck: an inquiry outage would otherwise permanently
    // block the webhook from settling a payment the customer already made.
    await releaseClaim(ctx, subId).catch(() => undefined);
    throw err;
  }
}
