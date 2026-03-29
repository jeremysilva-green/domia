/**
 * Tenant Scoring System (1-Year Contract, Score out of 100)
 *
 * - Starts at 100, loses points for late payments
 * - N = 12 payments, G = 3 grace days
 * - Delay_i = max(0, PaymentDate - DueDate - GraceDays) in days
 * - P_i     = min(8.33, 0.5 * Delay_i)
 * - Score   = 100 - Σ P_i  (clamped to [0, 100])
 * - Unpaid payments accrue delay daily after the grace period
 *
 * Ratings: 95–100 Top Tenant · 85–94 Reliable · 70–84 Risky · <70 High Risk
 */

const MAX_PENALTY_PER_PAYMENT = 100 / 12; // ≈ 8.33
const RATE = 0.5;                          // points per day
const GRACE_DAYS = 3;

export type ScoreTier = 'top' | 'reliable' | 'risky' | 'highRisk';

export interface TenantScoreResult {
  score: number;        // 0–100
  scoreNorm: number;    // 0–1  (for progress bar width)
  label: ScoreTier;     // tier key — look up display string in translations
  totalPayments: number;
  onTimeCount: number;
  lateCount: number;
}

export function calcTenantScore(
  payments: Array<{ status: string; due_date: string; paid_date?: string | null }>
): TenantScoreResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Only consider paid or currently-overdue payments
  const relevant = payments.filter(
    (p) => p.status === 'paid' || p.status === 'due' || p.status === 'late'
  );

  if (relevant.length === 0) {
    return { score: 100, scoreNorm: 1, label: 'Top Tenant', totalPayments: 0, onTimeCount: 0, lateCount: 0 };
  }

  let totalPenalty = 0;
  let onTimeCount = 0;
  let lateCount = 0;

  relevant.forEach((p) => {
    const dueDate = new Date(p.due_date);
    dueDate.setHours(0, 0, 0, 0);

    let effectivePaidDate: Date;
    if (p.status === 'paid' && p.paid_date) {
      effectivePaidDate = new Date(p.paid_date);
      effectivePaidDate.setHours(0, 0, 0, 0);
    } else {
      // Unpaid — delay grows until today
      effectivePaidDate = today;
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const rawDelay = Math.round((effectivePaidDate.getTime() - dueDate.getTime()) / msPerDay);
    const delayDays = Math.max(0, rawDelay - GRACE_DAYS);
    const penalty = Math.min(MAX_PENALTY_PER_PAYMENT, RATE * delayDays);

    totalPenalty += penalty;

    if (delayDays === 0) {
      onTimeCount++;
    } else {
      lateCount++;
    }
  });

  const score = Math.max(0, Math.round(100 - totalPenalty));
  const scoreNorm = score / 100;

  let label: ScoreTier;
  if (score >= 95) label = 'top';
  else if (score >= 85) label = 'reliable';
  else if (score >= 70) label = 'risky';
  else label = 'highRisk';

  return { score, scoreNorm, label, totalPayments: relevant.length, onTimeCount, lateCount };
}
