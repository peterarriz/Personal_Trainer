import {
  average,
  humanizeEnum,
  roundTo,
  sanitizeSlug,
  sanitizeText,
  sortByScoreThenSample,
  toArray,
} from "./shared.js";

const MIN_COMPARISON_EFFECT = 0.08;

const groupBy = (items = [], keyFn = () => "") => {
  const map = new Map();
  toArray(items).forEach((item) => {
    const key = String(keyFn(item) || "").trim();
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
};

const computeMetricSummary = (rows = []) => {
  const safeRows = toArray(rows);
  const immediateRows = safeRows.filter((row) => row?.immediateOutcome?.hasOutcome);
  const shortRows = safeRows.filter((row) => (row?.shortTermOutcome?.count || 0) > 0);
  const mediumRows = safeRows.filter((row) => (row?.mediumTermOutcome?.count || 0) > 0);
  return {
    sampleSize: safeRows.length,
    immediateCoverage: safeRows.length ? immediateRows.length / safeRows.length : 0,
    shortCoverage: safeRows.length ? shortRows.length / safeRows.length : 0,
    mediumCoverage: safeRows.length ? mediumRows.length / safeRows.length : 0,
    immediateSuccessRate: average(immediateRows.map((row) => row?.immediateOutcome?.score)),
    shortTermBetterRate: average(shortRows.map((row) => row?.shortTermOutcome?.label === "success" ? 1 : row?.shortTermOutcome?.label === "failure" ? 0 : 0.5)),
    mediumTermBetterRate: average(mediumRows.map((row) => row?.mediumTermOutcome?.label === "success" ? 1 : row?.mediumTermOutcome?.label === "failure" ? 0 : 0.5)),
    compositeSuccessAverage: average(safeRows.map((row) => row?.compositeSuccessScore)),
    failureRate: average(safeRows.map((row) => row?.successBucket === "failure" ? 1 : 0)),
    mixedRate: average(safeRows.map((row) => row?.successBucket === "mixed" ? 1 : 0)),
    painRate: average(safeRows.map((row) => Number(row?.immediateOutcome?.painRate || 0))),
    frustrationRate: average(safeRows.map((row) => toArray(row?.immediateOutcome?.frustrationSignals).length > 0 ? 1 : 0)),
  };
};

const buildConfidenceScore = ({
  sampleSize = 0,
  effectSize = 0,
  coverage = 0,
} = {}) => {
  const sampleFactor = Math.min(1, Number(sampleSize || 0) / 18);
  const effectFactor = Math.min(1, Math.abs(Number(effectSize || 0)) / 0.2);
  const coverageFactor = Math.min(1, Math.max(0.2, Number(coverage || 0)));
  return Math.round(100 * sampleFactor * effectFactor * coverageFactor);
};

const pickTargetMetric = (summary = {}, preferred = "compositeSuccessAverage") => {
  if (preferred === "immediateSuccessRate") return Number(summary?.immediateSuccessRate ?? 0);
  if (preferred === "mediumTermBetterRate") {
    return summary?.mediumTermBetterRate == null ? Number(summary?.compositeSuccessAverage ?? 0) : Number(summary.mediumTermBetterRate);
  }
  return Number(summary?.compositeSuccessAverage ?? 0);
};

const summarizeGroupedRows = ({
  rows = [],
  keyFn = () => "",
  labelFn = (key) => key,
  minSampleSize = 1,
}) => (
  [...groupBy(rows, keyFn).entries()]
    .map(([key, groupedRows]) => ({
      id: key,
      label: labelFn(key, groupedRows),
      summary: computeMetricSummary(groupedRows),
      rows: groupedRows,
    }))
    .filter((entry) => entry.summary.sampleSize >= minSampleSize)
);

const buildCohortLabel = (entry = null) => {
  const [goal = "", experience = "", recommendationKind = ""] = String(entry?.id || "").split("__");
  return `${humanizeEnum(experience)} ${humanizeEnum(goal)} users on ${humanizeEnum(recommendationKind)}`.trim();
};

export const buildCohortSummaries = ({
  rows = [],
  minSampleSize = 4,
} = {}) => sortByScoreThenSample(
  summarizeGroupedRows({
    rows,
    keyFn: (row) => [row?.primaryGoalCategory, row?.experienceLevel, row?.recommendationKind].map((part) => sanitizeSlug(part, 80)).join("__"),
    labelFn: (_, groupedRows) => buildCohortLabel({ id: [groupedRows?.[0]?.primaryGoalCategory, groupedRows?.[0]?.experienceLevel, groupedRows?.[0]?.recommendationKind].join("__") }),
    minSampleSize,
  }).map((entry) => ({
    id: entry.id,
    label: buildCohortLabel(entry),
    ...entry.summary,
    dominantTokens: entry.rows?.[0]?.ruleTokens?.slice(0, 6) || [],
    score: roundTo(entry.summary.compositeSuccessAverage ?? 0, 4),
  })),
  { scoreKey: "score", sampleKey: "sampleSize" },
);

export const buildRecommendationSuccessRates = ({
  rows = [],
  minSampleSize = 4,
} = {}) => ({
  byKind: sortByScoreThenSample(
    summarizeGroupedRows({
      rows,
      keyFn: (row) => sanitizeSlug(row?.recommendationKind || "", 80),
      labelFn: (key) => humanizeEnum(key),
      minSampleSize,
    }).map((entry) => ({
      id: entry.id,
      label: entry.label,
      ...entry.summary,
      score: roundTo(entry.summary.compositeSuccessAverage ?? 0, 4),
    })),
    { scoreKey: "score", sampleKey: "sampleSize" },
  ),
  byNutritionStyle: sortByScoreThenSample(
    summarizeGroupedRows({
      rows: rows.filter((row) => row?.nutritionStyle),
      keyFn: (row) => sanitizeSlug(row?.nutritionStyle || "", 80),
      labelFn: (key) => humanizeEnum(key),
      minSampleSize,
    }).map((entry) => ({
      id: entry.id,
      label: entry.label,
      ...entry.summary,
      score: roundTo(entry.summary.compositeSuccessAverage ?? 0, 4),
    })),
    { scoreKey: "score", sampleKey: "sampleSize" },
  ),
  byCoachPromptType: sortByScoreThenSample(
    summarizeGroupedRows({
      rows: rows.filter((row) => row?.coachPromptType),
      keyFn: (row) => sanitizeSlug(row?.coachPromptType || "", 80),
      labelFn: (key) => humanizeEnum(key),
      minSampleSize,
    }).map((entry) => ({
      id: entry.id,
      label: entry.label,
      ...entry.summary,
      score: roundTo(entry.summary.compositeSuccessAverage ?? 0, 4),
    })),
    { scoreKey: "score", sampleKey: "sampleSize" },
  ),
});

const buildFamilyInsightRows = ({
  rows = [],
  filterFn = () => true,
  keyFn = () => "",
  labelFn = (key) => key,
  minSampleSize = 4,
} = {}) => sortByScoreThenSample(
  summarizeGroupedRows({
    rows: rows.filter(filterFn),
    keyFn,
    labelFn,
    minSampleSize,
  }).map((entry) => ({
    id: entry.id,
    label: entry.label,
    ...entry.summary,
    score: roundTo(entry.summary.compositeSuccessAverage ?? 0, 4),
  })),
  { scoreKey: "score", sampleKey: "sampleSize" },
);

export const buildQuestionFamilyInsights = ({
  rows = [],
  minSampleSize = 4,
} = {}) => ({
  runRampTolerance: buildFamilyInsightRows({
    rows,
    filterFn: (row) => row?.weeklyRunRampBand,
    keyFn: (row) => [
      sanitizeSlug(row?.primaryGoalCategory || "", 80),
      sanitizeSlug(row?.experienceLevel || "", 80),
      sanitizeSlug(row?.scheduleReliability || "stable", 80),
      sanitizeSlug(row?.weeklyRunRampBand || "", 80),
    ].join("__"),
    labelFn: (key) => {
      const [goal, experience, schedule, rampBand] = String(key || "").split("__");
      return `${humanizeEnum(experience)} ${humanizeEnum(goal)} users with ${humanizeEnum(schedule)} schedules on ${humanizeEnum(rampBand)} run-ramp weeks`;
    },
    minSampleSize,
  }),
  hybridLoadCombos: buildFamilyInsightRows({
    rows,
    filterFn: (row) => row?.hybridAthlete && row?.hybridLoadCombo,
    keyFn: (row) => sanitizeSlug(row?.hybridLoadCombo || "", 120),
    labelFn: (key) => humanizeEnum(String(key || "").replace(/__+/g, " plus ").replace(/_run/g, " run").replace(/_strength/g, " strength")),
    minSampleSize,
  }),
  travelSubstitutions: buildFamilyInsightRows({
    rows,
    filterFn: (row) => row?.travelHeavy && row?.substitutionStyle,
    keyFn: (row) => sanitizeSlug(row?.substitutionStyle || "", 80),
    labelFn: (key) => `${humanizeEnum(key)} substitutions`,
    minSampleSize,
  }),
  deloadTiming: buildFamilyInsightRows({
    rows,
    filterFn: (row) => row?.deloadTiming,
    keyFn: (row) => sanitizeSlug(row?.deloadTiming || "", 80),
    labelFn: (key) => `${humanizeEnum(key)} deload timing`,
    minSampleSize,
  }),
  nutritionStyles: buildFamilyInsightRows({
    rows,
    filterFn: (row) => row?.recommendationKind === "nutrition_recommendation" && row?.nutritionStyle,
    keyFn: (row) => sanitizeSlug(row?.nutritionStyle || "", 80),
    labelFn: (key) => humanizeEnum(key),
    minSampleSize,
  }),
  coachPromptTypes: buildFamilyInsightRows({
    rows,
    filterFn: (row) => row?.recommendationKind === "coach_suggestion" && row?.coachPromptType,
    keyFn: (row) => sanitizeSlug(row?.coachPromptType || "", 80),
    labelFn: (key) => humanizeEnum(key),
    minSampleSize,
  }),
});

export const buildCommonTraitSummaries = ({
  rows = [],
  minSampleSize = 4,
} = {}) => {
  const successRows = rows.filter((row) => row?.successBucket === "success");
  const failureRows = rows.filter((row) => row?.successBucket === "failure");
  const totalRows = rows.length || 1;
  const tokenUniverse = new Set(rows.flatMap((row) => toArray(row?.ruleTokens)));
  const traits = [...tokenUniverse].map((token) => {
    const sampleSize = rows.filter((row) => toArray(row?.ruleTokens).includes(token)).length;
    if (sampleSize < minSampleSize) return null;
    const successPrevalence = successRows.length
      ? successRows.filter((row) => toArray(row?.ruleTokens).includes(token)).length / successRows.length
      : 0;
    const failurePrevalence = failureRows.length
      ? failureRows.filter((row) => toArray(row?.ruleTokens).includes(token)).length / failureRows.length
      : 0;
    const overallPrevalence = rows.filter((row) => toArray(row?.ruleTokens).includes(token)).length / totalRows;
    return {
      token,
      label: humanizeEnum(String(token).split(":")[1] || token),
      sampleSize,
      successLift: roundTo(successPrevalence - overallPrevalence, 4),
      failureLift: roundTo(failurePrevalence - overallPrevalence, 4),
    };
  }).filter(Boolean);
  return {
    successfulPlanTraits: sortByScoreThenSample(
      traits.filter((trait) => trait.successLift > 0).map((trait) => ({ ...trait, score: trait.successLift })),
      { scoreKey: "score", sampleKey: "sampleSize" },
    ).slice(0, 10),
    failedPlanTraits: sortByScoreThenSample(
      traits.filter((trait) => trait.failureLift > 0).map((trait) => ({ ...trait, score: trait.failureLift })),
      { scoreKey: "score", sampleKey: "sampleSize" },
    ).slice(0, 10),
  };
};

export const buildFailureClusters = ({
  rows = [],
  minSampleSize = 4,
} = {}) => {
  const grouped = summarizeGroupedRows({
    rows: rows.filter((row) => row?.successBucket === "failure"),
    keyFn: (row) => [
      sanitizeSlug(row?.primaryGoalCategory || "", 80),
      sanitizeSlug(row?.recommendationKind || "", 80),
      sanitizeSlug(row?.scheduleReliability || row?.nutritionStyle || row?.coachPromptType || row?.deloadTiming || row?.substitutionStyle || "general", 80),
    ].join("__"),
    labelFn: (key) => {
      const [goal, recommendationKind, driver] = String(key || "").split("__");
      return `${humanizeEnum(goal)} ${humanizeEnum(recommendationKind)} failures around ${humanizeEnum(driver)}`;
    },
    minSampleSize,
  }).map((entry) => {
    const comparisonPool = rows.filter((row) => row?.recommendationKind === entry.rows?.[0]?.recommendationKind);
    const comparisonSummary = computeMetricSummary(comparisonPool);
    const effectSize = (entry.summary.compositeSuccessAverage ?? 0) - (comparisonSummary.compositeSuccessAverage ?? 0);
    const coverage = average([entry.summary.immediateCoverage, entry.summary.shortCoverage, entry.summary.mediumCoverage]) || 0;
    const confidenceScore = buildConfidenceScore({
      sampleSize: entry.summary.sampleSize,
      effectSize,
      coverage,
    });
    return {
      id: entry.id,
      label: entry.label,
      ...entry.summary,
      score: roundTo((entry.summary.failureRate ?? 0) * (confidenceScore / 100), 4),
      confidenceScore,
      humanSummary: `${entry.label} show a ${Math.round((entry.summary.failureRate || 0) * 100)}% failure rate across ${entry.summary.sampleSize} recommendations.`,
    };
  });
  return sortByScoreThenSample(grouped, { scoreKey: "score", sampleKey: "sampleSize" }).slice(0, 12);
};

const buildRuleNarrative = ({
  family = "",
  cohortPhrase = "",
  betterLabel = "",
  worseLabel = "",
  effectSize = 0,
  horizonLabel = "4-8 week adherence",
} = {}) => {
  if (family === "runRampTolerance") {
    return `For ${cohortPhrase}, ${betterLabel} is associated with higher ${horizonLabel} than ${worseLabel}.`;
  }
  if (family === "hybridLoadCombos") {
    return `For hybrid athletes, ${betterLabel} is associated with better ${horizonLabel} than ${worseLabel}.`;
  }
  if (family === "travelSubstitutions") {
    return `For travel-heavy users, ${betterLabel} preserve adherence better than ${worseLabel}.`;
  }
  if (family === "deloadTiming") {
    return `${betterLabel} is associated with better ${horizonLabel} than ${worseLabel}.`;
  }
  if (family === "nutritionStyles") {
    return `${betterLabel} are followed more consistently than ${worseLabel}.`;
  }
  if (family === "coachPromptTypes") {
    return `${betterLabel} drive better follow-through than ${worseLabel}.`;
  }
  return `${betterLabel} outperforms ${worseLabel} by ${Math.round(effectSize * 100)} points on the target outcome.`;
};

const formatSubstitutionPhrase = (label = "") => {
  const normalized = sanitizeSlug(label, 80);
  if (normalized === "none" || normalized === "none_substitutions") return "no substitution weeks";
  if (/substitution/i.test(String(label || ""))) return humanizeEnum(label);
  return `${humanizeEnum(label)} substitutions`;
};

const formatDeloadPhrase = (label = "") => `${humanizeEnum(label)} deload timing`;
const formatNutritionPhrase = (label = "") => /nutrition/i.test(String(label || ""))
  ? humanizeEnum(label)
  : `${humanizeEnum(label)} nutrition prescriptions`;
const formatCoachPromptPhrase = (label = "") => `${humanizeEnum(label)} coach prompts`;
const formatHybridComboPhrase = (label = "") => humanizeEnum(String(label || "").replace(/__+/g, " plus ").replace(/_run/g, " run").replace(/_strength/g, " strength"));

const buildComparisonCandidates = ({
  family = "",
  insights = [],
  groupKeyFn = () => "",
  betterMetric = "compositeSuccessAverage",
  minSampleSize = 6,
}) => {
  const groups = groupBy(insights, groupKeyFn);
  const candidates = [];
  groups.forEach((entries) => {
    if (entries.length < 2) return;
    const sorted = [...entries]
      .filter((entry) => (entry?.sampleSize || 0) >= minSampleSize)
      .sort((left, right) => pickTargetMetric(right, betterMetric) - pickTargetMetric(left, betterMetric));
    if (sorted.length < 2) return;
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const effectSize = pickTargetMetric(best, betterMetric) - pickTargetMetric(worst, betterMetric);
    if (Math.abs(effectSize) < MIN_COMPARISON_EFFECT) return;
    const coverage = average([
      best?.mediumCoverage ?? best?.immediateCoverage ?? 0,
      worst?.mediumCoverage ?? worst?.immediateCoverage ?? 0,
    ]) || 0;
    const confidenceScore = buildConfidenceScore({
      sampleSize: Math.min(best.sampleSize, worst.sampleSize),
      effectSize,
      coverage,
    });
    candidates.push({
      id: `${family}_${best.id}_vs_${worst.id}`,
      family,
      sampleSize: Math.min(best.sampleSize, worst.sampleSize),
      confidenceScore,
      confidenceBand: confidenceScore >= 70 ? "high" : confidenceScore >= 45 ? "medium" : "low",
      effectSize: roundTo(effectSize, 4),
      score: roundTo((confidenceScore / 100) * Math.abs(effectSize), 4),
      betterLabel: best.label,
      worseLabel: worst.label,
      betterMetrics: best,
      worseMetrics: worst,
      summary: "",
    });
  });
  return candidates;
};

export const buildCandidatePolicySuggestions = ({
  questionFamilyInsights = {},
  minSampleSize = 6,
} = {}) => {
  const runRampCandidates = buildComparisonCandidates({
    family: "runRampTolerance",
    insights: questionFamilyInsights?.runRampTolerance || [],
    groupKeyFn: (entry) => String(entry?.id || "").split("__").slice(0, 3).join("__"),
    betterMetric: "mediumTermBetterRate",
    minSampleSize,
  }).map((candidate) => ({
    ...candidate,
    summary: buildRuleNarrative({
      family: candidate.family,
      cohortPhrase: candidate?.betterLabel?.replace(/\s+on\s+.*$/i, "").toLowerCase(),
      betterLabel: `${candidate.betterLabel.split(" on ")[1] || candidate.betterLabel}`.toLowerCase(),
      worseLabel: `${candidate.worseLabel.split(" on ")[1] || candidate.worseLabel}`.toLowerCase(),
      effectSize: candidate.effectSize,
    }),
  }));

  const hybridCandidates = buildComparisonCandidates({
    family: "hybridLoadCombos",
    insights: questionFamilyInsights?.hybridLoadCombos || [],
    groupKeyFn: () => "hybrid",
    betterMetric: "mediumTermBetterRate",
    minSampleSize,
  }).map((candidate) => ({
    ...candidate,
    summary: buildRuleNarrative({
      family: candidate.family,
      betterLabel: formatHybridComboPhrase(candidate.betterLabel).toLowerCase(),
      worseLabel: formatHybridComboPhrase(candidate.worseLabel).toLowerCase(),
      effectSize: candidate.effectSize,
    }),
  }));

  const travelCandidates = buildComparisonCandidates({
    family: "travelSubstitutions",
    insights: questionFamilyInsights?.travelSubstitutions || [],
    groupKeyFn: () => "travel",
    betterMetric: "mediumTermBetterRate",
    minSampleSize,
  }).map((candidate) => ({
    ...candidate,
    summary: buildRuleNarrative({
      family: candidate.family,
      betterLabel: formatSubstitutionPhrase(candidate.betterLabel).toLowerCase(),
      worseLabel: formatSubstitutionPhrase(candidate.worseLabel).toLowerCase(),
      effectSize: candidate.effectSize,
    }),
  }));

  const deloadCandidates = buildComparisonCandidates({
    family: "deloadTiming",
    insights: questionFamilyInsights?.deloadTiming || [],
    groupKeyFn: () => "deload",
    betterMetric: "mediumTermBetterRate",
    minSampleSize,
  }).map((candidate) => ({
    ...candidate,
    summary: buildRuleNarrative({
      family: candidate.family,
      betterLabel: formatDeloadPhrase(candidate.betterLabel).toLowerCase(),
      worseLabel: formatDeloadPhrase(candidate.worseLabel).toLowerCase(),
      effectSize: candidate.effectSize,
    }),
  }));

  const nutritionCandidates = buildComparisonCandidates({
    family: "nutritionStyles",
    insights: questionFamilyInsights?.nutritionStyles || [],
    groupKeyFn: () => "nutrition",
    betterMetric: "immediateSuccessRate",
    minSampleSize,
  }).map((candidate) => ({
    ...candidate,
    summary: buildRuleNarrative({
      family: candidate.family,
      betterLabel: formatNutritionPhrase(candidate.betterLabel).toLowerCase(),
      worseLabel: formatNutritionPhrase(candidate.worseLabel).toLowerCase(),
      effectSize: candidate.effectSize,
      horizonLabel: "same-day follow-through",
    }),
  }));

  const coachCandidates = buildComparisonCandidates({
    family: "coachPromptTypes",
    insights: questionFamilyInsights?.coachPromptTypes || [],
    groupKeyFn: () => "coach",
    betterMetric: "immediateSuccessRate",
    minSampleSize,
  }).map((candidate) => ({
    ...candidate,
    summary: buildRuleNarrative({
      family: candidate.family,
      betterLabel: formatCoachPromptPhrase(candidate.betterLabel).toLowerCase(),
      worseLabel: formatCoachPromptPhrase(candidate.worseLabel).toLowerCase(),
      effectSize: candidate.effectSize,
      horizonLabel: "same-screen acceptance",
    }),
  }));

  const allCandidates = sortByScoreThenSample([
    ...runRampCandidates,
    ...hybridCandidates,
    ...travelCandidates,
    ...deloadCandidates,
    ...nutritionCandidates,
    ...coachCandidates,
  ], { scoreKey: "score", sampleKey: "sampleSize" });

  return {
    highConfidence: allCandidates.filter((candidate) => candidate.confidenceBand === "high"),
    mediumConfidence: allCandidates.filter((candidate) => candidate.confidenceBand === "medium"),
    lowConfidence: allCandidates.filter((candidate) => candidate.confidenceBand === "low"),
  };
};
