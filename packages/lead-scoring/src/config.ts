/**
 * Lead scoring weights — deliberately kept as plain config, not buried in logic,
 * so they can be tuned without touching the scoring engine itself.
 * See docs/lead-scoring.md for rationale on each weight.
 */
export const SCORING_WEIGHTS = {
  budgetConfirmed: 20,
  timelineWithin3Months: 15,
  depositConfirmed: 15,
  specificLocationGiven: 12,
  financingReadinessConfirmed: 12,
  requestedPropertyDetails: 10,
  requestedViewingOrAppointment: 10,
  engagedWithTwoPlusFollowups: 6,
  noResponseToTwoPlusFollowups: -10,
} as const;

export const SCORE_BANDS = {
  cold: { min: 0, max: 29 },
  nurture: { min: 30, max: 59 },
  warm: { min: 60, max: 79 },
  hot: { min: 80, max: 100 },
} as const;

export type ScoringSignal = keyof typeof SCORING_WEIGHTS;

export function temperatureForScore(score: number): "cold" | "nurture" | "warm" | "hot" {
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped >= SCORE_BANDS.hot.min) return "hot";
  if (clamped >= SCORE_BANDS.warm.min) return "warm";
  if (clamped >= SCORE_BANDS.nurture.min) return "nurture";
  return "cold";
}
