import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { BarChart3, Check } from 'lucide-react';
import { db } from '../../lib/firebase';
import type { Poll } from '../../types/announcement.types';

/**
 * A poll as the reader sees it.
 *
 * Two properties are worth stating because they pull in opposite directions and
 * the storage layout is what reconciles them:
 *
 *   ANONYMOUS - who voted for what lives in `announcements/{id}/votes/{uid}`,
 *   which firestore.rules opens only to that uid and to staff. No student can
 *   read another student's ballot, and a poll about a scheduling grievance is
 *   therefore safe to answer honestly.
 *
 *   TRANSPARENT - the tallies are public and always visible, before voting as
 *   well as after. They live on the parent announcement in `poll.counts`, which
 *   ONLY the tallyPollVotes Cloud Function writes, so a student cannot inflate
 *   their preferred option by editing the document.
 *
 * The optimistic delta below is why a vote feels instant: the function round
 * trip is ~1s, and the card must not sit inert for it.
 */

interface Props {
  postId: string;
  poll: Poll;
  uid: string | null;
  isRtl: boolean;
}

export default function PollCard({ postId, poll, uid, isRtl }: Props) {
  const [myVote, setMyVote] = useState<string[] | null>(null);
  const [pending, setPending] = useState<string[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, 'announcements', postId, 'votes', uid);
    return onSnapshot(
      ref,
      snap => {
        setMyVote(snap.exists() ? (snap.data().optionIds ?? []) : []);
        setPending(null);
      },
      // A denied read here is not worth surfacing: the poll still renders with
      // public tallies, just without "you voted for this" highlighting.
      () => setMyVote([]),
    );
  }, [postId, uid]);

  const selected = pending ?? myVote ?? [];
  const hasVoted = selected.length > 0;

  /**
   * Counts, adjusted for a vote the server has not tallied yet.
   *
   * `poll.counts` is server truth and lags the tap by a function invocation, so
   * the difference between the confirmed ballot and the pending one is applied
   * on top of it. Without this the bar visibly jumps backwards on tap.
   */
  const counts = useMemo(() => {
    const base: Record<string, number> = { ...(poll.counts ?? {}) };
    if (pending && myVote) {
      for (const id of myVote) if (!pending.includes(id)) base[id] = Math.max(0, (base[id] ?? 0) - 1);
      for (const id of pending) if (!myVote.includes(id)) base[id] = (base[id] ?? 0) + 1;
    }
    return base;
  }, [poll.counts, pending, myVote]);

  const totalVoters = useMemo(() => {
    const server = poll.totalVoters ?? 0;
    if (!pending || !myVote) return server;
    const was = myVote.length > 0;
    const now = pending.length > 0;
    return Math.max(0, server + (now ? 1 : 0) - (was ? 1 : 0));
  }, [poll.totalVoters, pending, myVote]);

  const vote = async (optionId: string) => {
    if (!uid || myVote === null) return;

    const next = poll.allowsMultiple
      ? (selected.includes(optionId) ? selected.filter(id => id !== optionId) : [...selected, optionId])
      : (selected.length === 1 && selected[0] === optionId ? [] : [optionId]);

    setPending(next);

    const ref = doc(db, 'announcements', postId, 'votes', uid);
    try {
      // An empty ballot is a deletion, not a document holding an empty array -
      // otherwise totalVoters counts people who un-voted.
      if (next.length === 0) await deleteDoc(ref);
      else await setDoc(ref, { optionIds: next, votedAt: serverTimestamp() });
    } catch {
      setPending(null);
    }
  };

  const share = (optionId: string) => {
    const n = counts[optionId] ?? 0;
    // Percentage of VOTERS, not of votes cast. In a multi-select poll the
    // shares deliberately sum past 100%, which is the honest reading of
    // "62% of the class picked Saturday".
    return totalVoters > 0 ? Math.round((n / totalVoters) * 100) : 0;
  };

  return (
    <div className="mt-2 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900/40 p-3">
      <div className="flex items-start gap-2 mb-2.5">
        <BarChart3 className="w-4 h-4 mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" strokeWidth={2.5} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-900 dark:text-stone-100 leading-snug" dir="auto">
            {poll.question}
          </p>
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">
            {poll.allowsMultiple ? (isRtl ? 'اختيار متعدد' : 'Multiple choice') : (isRtl ? 'اختيار واحد' : 'Single choice')}
            {' · '}
            {isRtl ? `${totalVoters} مصوّت` : `${totalVoters} voted`}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {poll.options.map(option => {
          const isMine = selected.includes(option.id);
          const pct = share(option.id);

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => vote(option.id)}
              disabled={!uid}
              dir="auto"
              aria-pressed={isMine}
              className={`relative w-full overflow-hidden text-start px-3 py-2 rounded-xl border transition-colors disabled:pointer-events-none ${
                isMine
                  ? 'border-sky-400 dark:border-sky-600 bg-white dark:bg-zinc-950'
                  : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-sky-300'
              }`}
            >
              {/* The fill is a sibling behind the label rather than a background
                  on it, so the label never inherits the bar's opacity. */}
              <span
                aria-hidden
                className={`absolute inset-y-0 start-0 transition-[width] duration-500 ease-out ${
                  isMine ? 'bg-sky-100 dark:bg-sky-900/40' : 'bg-slate-100 dark:bg-zinc-800/70'
                }`}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center gap-2">
                <span className={`w-4 h-4 shrink-0 flex items-center justify-center border-2 transition-colors ${
                  poll.allowsMultiple ? 'rounded' : 'rounded-full'
                } ${isMine ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 dark:border-zinc-600'}`}>
                  {isMine && <Check className="w-2.5 h-2.5" strokeWidth={4} />}
                </span>
                <span className="flex-1 min-w-0 text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                  {option.text}
                </span>
                <span className="shrink-0 text-xs font-black text-slate-500 dark:text-slate-400 tabular-nums">
                  {pct}%
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 font-medium">
        {hasVoted
          ? (isRtl ? 'يمكنك تغيير تصويتك في أي وقت. تصويتك مجهول.' : 'You can change your vote anytime. Your vote is anonymous.')
          : (isRtl ? 'تصويتك مجهول ولا يظهر لبقية الطلاب.' : 'Your vote is anonymous and hidden from other students.')}
      </p>
    </div>
  );
}
