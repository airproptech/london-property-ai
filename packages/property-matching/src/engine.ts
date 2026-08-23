import type { MatchCriterion, MatchExplanation } from "@lpai/shared";
import { MATCH_WEIGHTS } from "./config.js";

// Minimal shape needed for matching — decoupled from the Drizzle row type
// so this function is easy to unit test without a database.
export interface MatchableLeadPreferences {
  budgetMin: number | null;
  budgetMax: number | null;
  preferredLocations: string[] | null;
  propertyTypes: string[] | null;
  bedroomsMin: number | null;
  bedroomsMax: number | null;
  minimumLeaseLength: number | null;
  desiredRoiPercent: number | null;
  acceptableServiceCharge: number | null;
  investmentOrResidential: "investment" | "residential" | "unknown" | null;
}

export interface MatchableProperty {
  price: number | null;
  londonArea: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  leaseLengthYears: number | null;
  serviceCharge: number | null;
  annualRentalIncome: number | null;
  estimatedYieldPercent: number | null; // pre-calculated elsewhere, always an estimate
}

export interface MatchResult {
  score: number; // 0-100
  explanation: MatchExplanation;
}

/**
 * Computes a match score + explanation between a lead's preferences and a property.
 * Every criterion is explicit and additive — nothing here is a black box, and
 * unknown/missing data on either side simply skips that criterion's points
 * rather than guessing.
 */
export function computeMatch(
  prefs: MatchableLeadPreferences,
  property: MatchableProperty
): MatchResult {
  const criteria: MatchCriterion[] = [];

  // Within budget
  criteria.push(evaluateBudget(prefs, property));

  // Preferred area
  criteria.push(evaluateArea(prefs, property));

  // Bedrooms
  criteria.push(evaluateBedrooms(prefs, property));

  // Lease length
  criteria.push(evaluateLeaseLength(prefs, property));

  // Property type
  criteria.push(evaluatePropertyType(prefs, property));

  // Yield (investment leads only)
  criteria.push(evaluateYield(prefs, property));

  // Service charge
  criteria.push(evaluateServiceCharge(prefs, property));

  const score = criteria.reduce((sum, c) => sum + (c.matched ? c.weight : 0), 0);

  const actualDataFields = ["price", "londonArea", "propertyType", "bedrooms", "leaseLengthYears", "serviceCharge"];
  const calculatedEstimateFields = property.estimatedYieldPercent !== null ? ["estimatedYieldPercent"] : [];

  return {
    score: Math.round(score),
    explanation: {
      criteria,
      dataProvenance: {
        actualDataFields,
        calculatedEstimateFields,
      },
    },
  };
}

function evaluateBudget(prefs: MatchableLeadPreferences, property: MatchableProperty): MatchCriterion {
  const weight = MATCH_WEIGHTS.withinBudget;
  if (property.price === null || (prefs.budgetMin === null && prefs.budgetMax === null)) {
    return { criterion: "Within budget", matched: false, weight, detail: "Insufficient data" };
  }
  const withinMin = prefs.budgetMin === null || property.price >= prefs.budgetMin;
  const withinMax = prefs.budgetMax === null || property.price <= prefs.budgetMax;
  return {
    criterion: "Within budget",
    matched: withinMin && withinMax,
    weight,
    detail: `Price £${property.price.toLocaleString()}`,
  };
}

function evaluateArea(prefs: MatchableLeadPreferences, property: MatchableProperty): MatchCriterion {
  const weight = MATCH_WEIGHTS.preferredAreaMatch;
  if (!property.londonArea || !prefs.preferredLocations?.length) {
    return { criterion: "Preferred London area", matched: false, weight, detail: "Insufficient data" };
  }
  const matched = prefs.preferredLocations.some(
    (loc) => loc.toLowerCase() === property.londonArea!.toLowerCase()
  );
  return { criterion: "Preferred London area", matched, weight, detail: property.londonArea };
}

function evaluateBedrooms(prefs: MatchableLeadPreferences, property: MatchableProperty): MatchCriterion {
  const weight = MATCH_WEIGHTS.bedroomsMatch;
  if (property.bedrooms === null || (prefs.bedroomsMin === null && prefs.bedroomsMax === null)) {
    return { criterion: "Bedrooms", matched: false, weight, detail: "Insufficient data" };
  }
  const withinMin = prefs.bedroomsMin === null || property.bedrooms >= prefs.bedroomsMin;
  const withinMax = prefs.bedroomsMax === null || property.bedrooms <= prefs.bedroomsMax;
  return {
    criterion: "Bedrooms",
    matched: withinMin && withinMax,
    weight,
    detail: `${property.bedrooms} bed`,
  };
}

function evaluateLeaseLength(prefs: MatchableLeadPreferences, property: MatchableProperty): MatchCriterion {
  const weight = MATCH_WEIGHTS.leaseLengthSufficient;
  if (property.leaseLengthYears === null || prefs.minimumLeaseLength === null) {
    return { criterion: "Lease length", matched: false, weight, detail: "Insufficient data" };
  }
  return {
    criterion: "Lease length",
    matched: property.leaseLengthYears >= prefs.minimumLeaseLength,
    weight,
    detail: `${property.leaseLengthYears}-year lease`,
  };
}

function evaluatePropertyType(prefs: MatchableLeadPreferences, property: MatchableProperty): MatchCriterion {
  const weight = MATCH_WEIGHTS.propertyTypeMatch;
  if (!property.propertyType || !prefs.propertyTypes?.length) {
    return { criterion: "Property type", matched: false, weight, detail: "Insufficient data" };
  }
  const matched = prefs.propertyTypes.some(
    (t) => t.toLowerCase() === property.propertyType!.toLowerCase()
  );
  return { criterion: "Property type", matched, weight, detail: property.propertyType };
}

function evaluateYield(prefs: MatchableLeadPreferences, property: MatchableProperty): MatchCriterion {
  const weight = MATCH_WEIGHTS.yieldMeetsTarget;
  // Only relevant for investment leads with both a target and a calculated estimate.
  if (
    prefs.investmentOrResidential !== "investment" ||
    prefs.desiredRoiPercent === null ||
    property.estimatedYieldPercent === null
  ) {
    return { criterion: "Estimated yield meets target", matched: false, weight, detail: "Not applicable or insufficient data" };
  }
  return {
    criterion: "Estimated yield meets target",
    matched: property.estimatedYieldPercent >= prefs.desiredRoiPercent,
    weight,
    detail: `Estimated yield ${property.estimatedYieldPercent}% (calculated estimate, not guaranteed)`,
  };
}

function evaluateServiceCharge(prefs: MatchableLeadPreferences, property: MatchableProperty): MatchCriterion {
  const weight = MATCH_WEIGHTS.serviceChargeAcceptable;
  if (property.serviceCharge === null || prefs.acceptableServiceCharge === null) {
    return { criterion: "Service charge within range", matched: false, weight, detail: "Insufficient data" };
  }
  return {
    criterion: "Service charge within range",
    matched: property.serviceCharge <= prefs.acceptableServiceCharge,
    weight,
    detail: `£${property.serviceCharge}/yr`,
  };
}
