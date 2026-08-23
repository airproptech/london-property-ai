/**
 * Property-matching weights. Rule-based and auditable by design —
 * every point awarded must map to a concrete, explainable criterion.
 * Total possible = 100.
 */
export const MATCH_WEIGHTS = {
  withinBudget: 25,
  preferredAreaMatch: 20,
  bedroomsMatch: 15,
  leaseLengthSufficient: 15,
  propertyTypeMatch: 10,
  yieldMeetsTarget: 10,
  serviceChargeAcceptable: 5,
} as const;
