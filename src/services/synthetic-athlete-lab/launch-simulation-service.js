import {
  runSyntheticAthleteLab,
} from "./runner.js";
import {
  buildLaunchPersonaCoverage,
  generateLaunchSimulationPersonas,
  LAUNCH_FEATURE_CAPABILITIES,
  LAUNCH_SIMULATION_PERSONA_COUNT,
  LAUNCH_SIMULATION_WEEKS,
} from "./launch-persona-generator.js";

export const LAUNCH_SIMULATION_VERDICTS = Object.freeze({
  ready: "LAUNCH READY",
  readyWithKnownRisks: "LAUNCH READY WITH KNOWN RISKS",
  notReady: "NOT LAUNCH READY",
});

export const LAUNCH_SIMULATION_RELEASE_THRESHOLDS = Object.freeze({
  targetPersonaCount: 1000,
  targetSimulationWeeks: 260,
  minimumIntakeCompletionRate: 0.97,
  minimumPlanCreationRate: 0.98,
  maximumCrossSurfaceContradictionRate: 0.08,
  maximumSevereSafetyIssueCount: 0,
  maximumBlockerCount: 0,
  maximumHighSeverityTrustBreakCount: 0,
  minimumAverageSatisfaction: 78,
  maximumHighRetentionRiskShare: 0.18,
  minimumBrowserE2EPassRate: 0.95,
  minimumSimulationCompletionRate: 1,
  minimumAccessibilitySmokePassRate: 1,
});

const ISSUE_CLUSTER_META = Object.freeze({
  intake_friction: {
    title: "Intake still creates recoverable friction instead of a calm one-screen build",
    severity: "high",
    categories: ["intake friction", "copy/UX confusion"],
    rootCauseHypothesis: "The intake flow still asks people to mentally translate system structure instead of simply confirming what they mean.",
    expectedUserImpact: "Users abandon, mistrust the planner, or complete setup with the wrong goal stack.",
    effortEstimate: "medium",
  },
  goal_miscapture: {
    title: "Goal parsing can still misrepresent what the user actually wants",
    severity: "blocker",
    categories: ["blocker", "trust break", "intake friction", "plan-quality problem"],
    rootCauseHypothesis: "Goal resolution still lets ambiguous or multi-goal intent collapse into the wrong primary plan contract.",
    expectedUserImpact: "The user sees the wrong plan and loses trust immediately.",
    effortEstimate: "medium",
  },
  hidden_secondary_goals: {
    title: "Secondary goals still disappear or feel buried after intake",
    severity: "high",
    categories: ["cross-surface contradiction", "intake friction", "copy/UX confusion"],
    rootCauseHypothesis: "Goal ordering and secondary-goal visibility are not equally visible across Program, Today, and Settings.",
    expectedUserImpact: "Users cannot tell what is primary versus supportive, especially in hybrid or recomp cases.",
    effortEstimate: "medium",
  },
  baseline_timing_problems: {
    title: "Baseline and anchor collection still arrives too late or too opaquely",
    severity: "blocker",
    categories: ["blocker", "safety concern", "plan-quality problem", "trust break"],
    rootCauseHypothesis: "The planner still depends on anchor quality without always making the missing baseline obvious and fixable in place.",
    expectedUserImpact: "Plans look arbitrary or unsafe for pain-sensitive and advanced users.",
    effortEstimate: "medium",
  },
  ugly_confusing_copy: {
    title: "Consumer-facing copy still leaks internal or overly dense language",
    severity: "medium",
    categories: ["copy/UX confusion", "visual/polish problem"],
    rootCauseHypothesis: "Trust-critical surfaces still carry explanation-first copy from earlier internal workflows.",
    expectedUserImpact: "Daily use feels heavier and less premium than it should.",
    effortEstimate: "small",
  },
  coach_ambiguity: {
    title: "Coach still risks sounding vague when users need crisp boundaries",
    severity: "high",
    categories: ["trust break", "safety concern", "copy/UX confusion"],
    rootCauseHypothesis: "Coach explanation and boundary language still relies on verbose state narration in ambiguous moments.",
    expectedUserImpact: "Skeptical and safety-sensitive users stop trusting plan changes or recommendations.",
    effortEstimate: "medium",
  },
  audit_confidence_erosion: {
    title: "History and review surfaces still erode trust instead of clarifying what happened",
    severity: "high",
    categories: ["trust break", "cross-surface contradiction", "copy/UX confusion"],
    rootCauseHypothesis: "Review stories still foreground system mechanics instead of a human-readable training story.",
    expectedUserImpact: "Users cannot tell what changed, why, or whether to trust the adaptation.",
    effortEstimate: "medium",
  },
  long_horizon_time_confusion: {
    title: "The long-horizon plan still feels too hidden or too provisional",
    severity: "high",
    categories: ["cross-surface contradiction", "plan-quality problem", "copy/UX confusion"],
    rootCauseHypothesis: "Program still makes the future view harder to scan than the current week, especially on laptop.",
    expectedUserImpact: "Serious athletes do not trust the plan arc or phase logic.",
    effortEstimate: "medium",
  },
  sport_domain_mismatch: {
    title: "Sport-domain intent can still leak into the wrong planning lane",
    severity: "blocker",
    categories: ["blocker", "sport-domain mismatch", "plan-quality problem", "safety concern", "trust break"],
    rootCauseHypothesis: "Domain resolution and surfaced copy still fail visibly when the user is outside the dominant running-strength path.",
    expectedUserImpact: "Swimmers, tactical users, and hybrid athletes see incoherent programming or wrong terminology.",
    effortEstimate: "medium",
  },
  support_tier_dishonesty: {
    title: "The product can still imply stronger support than it really has",
    severity: "high",
    categories: ["trust break", "copy/UX confusion"],
    rootCauseHypothesis: "Support language still overpromises certainty in edge cases where the product is really using a lighter-confidence path.",
    expectedUserImpact: "Users expect more precision than the product can safely deliver.",
    effortEstimate: "small",
  },
  plan_degradation: {
    title: "Long-horizon plan quality still degrades under life events, drift, or adaptation pressure",
    severity: "blocker",
    categories: ["blocker", "plan-quality problem", "cross-surface contradiction", "trust break"],
    rootCauseHypothesis: "When adherence, travel, pain, or nutrition drift stack up, the plan still risks becoming less coherent than the UI implies.",
    expectedUserImpact: "Users churn when Program, Today, Log, and Nutrition stop lining up.",
    effortEstimate: "medium",
  },
  unsupported_feature_gap: {
    title: "High-demand features are still missing for important cohorts",
    severity: "feature gap",
    categories: ["feature gap"],
    rootCauseHypothesis: "The current product scope does not yet meet a meaningful share of cross-device, automation, and media expectations.",
    expectedUserImpact: "Some cohorts will bounce even if the existing planner is coherent.",
    effortEstimate: "large",
  },
  anonymous_access_before_account: {
    title: "New users could reach the product without first creating an account",
    severity: "high",
    categories: ["trust break", "data/sync bug", "copy/UX confusion"],
    rootCauseHypothesis: "Auth entry allowed a local-fallback path before a new user established an account-backed identity.",
    expectedUserImpact: "Users can create data they later struggle to trust or recover across devices.",
    effortEstimate: "small",
  },
  browser_gate_incomplete: {
    title: "Browser verification did not reach the required launch-scale coverage",
    severity: "high",
    categories: ["flaky-test/instrumentation issue"],
    rootCauseHypothesis: "Full browser verification for all 1,000 personas is computationally and operationally expensive, especially in deployed real-account mode.",
    expectedUserImpact: "Some launch risk remains unobserved in true UI flows.",
    effortEstimate: "large",
  },
});

const CATEGORY_TRUST_MULTIPLIER = Object.freeze({
  blocker: 2.6,
  "safety concern": 2.8,
  "trust break": 2.2,
  "data/sync bug": 2.1,
  "plan-quality problem": 2,
  "sport-domain mismatch": 2.2,
  "cross-surface contradiction": 1.8,
  "intake friction": 1.7,
  "copy/UX confusion": 1.5,
  "visual/polish problem": 1.25,
  "accessibility problem": 2.2,
  "performance problem": 1.8,
  "feature gap": 1.2,
  "flaky-test/instrumentation issue": 1.1,
});

const SEVERITY_WEIGHT = Object.freeze({
  blocker: 5,
  high: 4,
  medium: 3,
  low: 2,
  "feature gap": 1.5,
});

const EFFORT_WEIGHT = Object.freeze({
  small: 1,
  medium: 2,
  large: 4,
});

const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const average = (values = []) => {
  const list = values.filter((value) => Number.isFinite(Number(value))).map((value) => Number(value));
  if (!list.length) return 0;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
};

const LONGITUDINAL_ANCHOR_WEEKS = Object.freeze([
  1, 2, 3, 4, 6, 8, 10, 12, 14, 20, 28, 34, 43, 52, 60, 66, 76, 88, 96, 104, 110, 118, 132, 156, 180, 208, 244, 260,
]);

export const buildLaunchSimulationWeekSequence = ({
  effectiveWeeks = LAUNCH_SIMULATION_WEEKS,
  personas = [],
} = {}) => {
  const weekSet = new Set(
    LONGITUDINAL_ANCHOR_WEEKS
      .filter((week) => week >= 1 && week <= effectiveWeeks)
  );

  for (let week = 16; week <= effectiveWeeks; week += 8) {
    weekSet.add(week);
  }

  personas.forEach((persona) => {
    toArray(persona?.fiveYearLifecycleEvents || []).forEach((event) => {
      const week = Number(event?.week || 0);
      if (Number.isFinite(week) && week >= 1 && week <= effectiveWeeks) {
        weekSet.add(week);
      }
    });
  });

  return [...weekSet].sort((left, right) => left - right);
};

const buildBrowserSummary = (browserResults = null, {
  targetPersonaCount = LAUNCH_SIMULATION_PERSONA_COUNT,
} = {}) => {
  const runs = toArray(browserResults?.runs || []);
  const attemptedPersonaCount = Number(browserResults?.attemptedPersonaCount || runs.length || 0);
  const passedPersonaCount = Number(browserResults?.passedPersonaCount || runs.filter((run) => run.ok).length || 0);
  const accessibilityRuns = runs.filter((run) => run.accessibilityChecked);
  const accessibilityPassed = accessibilityRuns.filter((run) => run.ok).length;
  const passRate = attemptedPersonaCount > 0 ? passedPersonaCount / attemptedPersonaCount : null;
  const accessibilityPassRate = accessibilityRuns.length > 0 ? accessibilityPassed / accessibilityRuns.length : null;
  const complete = attemptedPersonaCount >= targetPersonaCount;
  return {
    mode: browserResults?.mode || "not_run",
    targetPersonaCount,
    attemptedPersonaCount,
    passedPersonaCount,
    failedPersonaCount: Math.max(0, attemptedPersonaCount - passedPersonaCount),
    passRate,
    accessibilityAttemptedPersonaCount: accessibilityRuns.length,
    accessibilityPassRate,
    complete,
    releaseGateIncomplete: !complete,
    reachability: browserResults?.reachability || null,
    runs,
  };
};

const buildPersonaLaunchOutcome = ({
  persona = {},
  deterministicResult = {},
} = {}) => {
  const severeBlockers = toArray(deterministicResult?.severeBlockers || []);
  const mediumIssues = toArray(deterministicResult?.mediumIssues || []);
  const overallScore = Number(deterministicResult?.overallScore || 0);
  const coherence = Number(deterministicResult?.releaseDimensionScores?.coherence || 0);
  const safety = Number(deterministicResult?.releaseDimensionScores?.safety || 0);
  const adaptation = Number(deterministicResult?.releaseDimensionScores?.adaptationQuality || 0);
  const support = Number(deterministicResult?.releaseDimensionScores?.crossSurfaceConformity || 0);

  const perceivedTrust = clamp(
    Math.round((coherence * 0.32) + (safety * 0.36) + (adaptation * 0.16) + (support * 0.16) - (severeBlockers.length * 14) - (mediumIssues.length * 5)),
    0,
    100
  );
  const confusion = clamp(
    Math.round(100 - ((overallScore * 0.55) + (coherence * 0.2) + (support * 0.25)) + (mediumIssues.length * 6) + (severeBlockers.length * 12)),
    0,
    100
  );
  const satisfaction = clamp(
    Math.round((overallScore * 0.7) + (adaptation * 0.15) + (safety * 0.15) - (mediumIssues.length * 4) - (severeBlockers.length * 12)),
    0,
    100
  );
  const npsLike = clamp(Math.round((satisfaction - 50) / 5), 0, 10);
  const retentionRisk = severeBlockers.length > 0 || perceivedTrust < 60 || satisfaction < 65
    ? "high"
    : mediumIssues.length > 1 || confusion > 45 || satisfaction < 80
    ? "medium"
    : "low";

  return {
    personaId: persona.id,
    name: persona.name,
    dominantLens: persona.reviewLens,
    lensTags: persona.lensTags || [],
    cohortTags: persona.cohortTags || [],
    overallScore,
    satisfaction,
    perceivedTrust,
    confusion,
    npsLike,
    retentionRisk,
    severeBlockerCount: severeBlockers.length,
    mediumIssueCount: mediumIssues.length,
    topFailures: [...severeBlockers, ...mediumIssues].slice(0, 5).map((failure) => ({
      clusterId: failure.clusterId,
      severity: failure.severity,
      message: failure.message,
      stepRef: failure.stepRef,
    })),
    simulationWeeks: deterministicResult.simulationWeeks || LAUNCH_SIMULATION_WEEKS,
    timelineHighlights: toArray(deterministicResult.timeline || []).filter((entry, index) => {
      if (index === 0) return true;
      return /travel|pain|goal|nutrition|coach|finish|restore|archive/i.test(String(entry?.event || ""));
    }).slice(0, 8),
  };
};

const buildLaunchMetrics = ({
  personas = [],
  deterministicReport = {},
  browserSummary = {},
} = {}) => {
  const personaResults = toArray(deterministicReport?.personaResults || []);
  const checkPassRate = (checkId = "") => {
    const eligible = personaResults.map((result) => toArray(result?.checks || []).find((check) => check.id === checkId)).filter(Boolean);
    if (!eligible.length) return 0;
    return eligible.filter((check) => check.passed).length / eligible.length;
  };
  const crossSurfaceContradictions = personaResults.filter((result) => toArray(result?.failures || []).some((failure) => [
    "hidden_secondary_goals",
    "audit_confidence_erosion",
    "long_horizon_time_confusion",
    "plan_degradation",
  ].includes(failure.clusterId)));
  const severeSafetyIssueCount = personaResults.reduce((sum, result) => (
    sum + toArray(result?.severeBlockers || []).filter((failure) => [
      "baseline_timing_problems",
      "sport_domain_mismatch",
      "coach_ambiguity",
      "plan_degradation",
    ].includes(failure.clusterId)).length
  ), 0);
  const launchPersonaOutcomes = personas.map((persona) => buildPersonaLaunchOutcome({
    persona,
    deterministicResult: personaResults.find((entry) => entry.personaId === persona.id) || {},
  }));
  const averageSatisfaction = average(launchPersonaOutcomes.map((result) => result.satisfaction));
  const retentionRiskDistribution = launchPersonaOutcomes.reduce((acc, result) => {
    acc[result.retentionRisk] = (acc[result.retentionRisk] || 0) + 1;
    return acc;
  }, { low: 0, medium: 0, high: 0 });
  const featureGapDemandByCohort = {};
  personas.forEach((persona) => {
    const unsupportedDemand = toArray(persona.featureExpectations || [])
      .filter((featureId) => LAUNCH_FEATURE_CAPABILITIES[featureId]?.supported === "unsupported");
    toArray(persona.cohortTags || []).forEach((cohortId) => {
      featureGapDemandByCohort[cohortId] = featureGapDemandByCohort[cohortId] || {};
      unsupportedDemand.forEach((featureId) => {
        featureGapDemandByCohort[cohortId][featureId] = (featureGapDemandByCohort[cohortId][featureId] || 0) + 1;
      });
    });
  });
  const highSeverityTrustBreakCount = personaResults.reduce((sum, result) => (
    sum + toArray(result?.severeBlockers || []).filter((failure) => [
      "goal_miscapture",
      "coach_ambiguity",
      "audit_confidence_erosion",
      "sport_domain_mismatch",
      "support_tier_dishonesty",
      "plan_degradation",
    ].includes(failure.clusterId)).length
  ), 0);

  return {
    intakeCompletionRate: checkPassRate("intake_required_anchors_resolved"),
    postIntakePlanCreationRate: checkPassRate("plan_generation_week_1"),
    crossSurfaceContradictionRate: personas.length > 0 ? crossSurfaceContradictions.length / personas.length : 0,
    severeSafetyIssueCount,
    blockerCount: toArray(deterministicReport?.rootCauseClusters || []).filter((cluster) => ISSUE_CLUSTER_META[cluster.clusterId]?.severity === "blocker" && cluster.count > 0).length,
    highSeverityTrustBreakCount,
    averageSatisfaction,
    retentionRiskDistribution,
    featureGapDemandByCohort,
    browserE2EPassRate: browserSummary.passRate,
    simulationCompletionRate: personas.length > 0 ? personaResults.length / personas.length : 0,
    accessibilitySmokePassRate: browserSummary.accessibilityPassRate,
    averageOverallScore: Number(deterministicReport?.summary?.averageScore || 0),
    launchPersonaOutcomes,
  };
};

const buildFeatureGapClusters = ({
  personas = [],
} = {}) => {
  const counters = {};
  personas.forEach((persona) => {
    toArray(persona.featureExpectations || []).forEach((featureId) => {
      if (LAUNCH_FEATURE_CAPABILITIES[featureId]?.supported !== "unsupported") return;
      counters[featureId] = counters[featureId] || { featureId, personas: new Set(), cohorts: new Set(), lenses: new Set() };
      counters[featureId].personas.add(persona.id);
      toArray(persona.cohortTags || []).forEach((cohortId) => counters[featureId].cohorts.add(cohortId));
      toArray(persona.lensTags || []).forEach((lensId) => counters[featureId].lenses.add(lensId));
    });
  });

  return Object.values(counters)
    .map((entry) => {
      const affectedPersonaCount = entry.personas.size;
      const severity = affectedPersonaCount >= 180 ? "high" : affectedPersonaCount >= 90 ? "medium" : "feature gap";
      return {
        clusterId: `feature_gap_${entry.featureId}`,
        title: `${LAUNCH_FEATURE_CAPABILITIES[entry.featureId]?.label || entry.featureId} is a repeated missing expectation`,
        severity,
        categories: ["feature gap"],
        affectedPersonaCount,
        affectedCohorts: [...entry.cohorts].sort(),
        affectedLenses: [...entry.lenses].sort(),
        reproductionPath: ["Expectation raised during intake, Coach, or long-horizon use."],
        screenshots: [],
        traces: [],
        likelyFilesOrServices: [],
        rootCauseHypothesis: "The feature is not part of the current product scope, but multiple cohorts still expect it.",
        recommendedFix: "Decide whether to roadmap it, explicitly position around it, or improve expectation-setting copy earlier.",
        expectedUserImpact: "Users assume the product is incomplete even when core planning is coherent.",
        effortEstimate: "large",
        implemented: false,
        validationTests: [],
        source: "inferred_product_risk",
        confidence: 0.72,
      };
    })
    .sort((left, right) => right.affectedPersonaCount - left.affectedPersonaCount || left.title.localeCompare(right.title));
};

const buildBrowserIssueClusters = ({
  browserSummary = {},
} = {}) => {
  const failures = toArray(browserSummary.runs || []).filter((run) => !run.ok);
  if (!failures.length && browserSummary.complete) return [];
  const incompleteCluster = !browserSummary.complete ? [{
    clusterId: "browser_gate_incomplete",
    title: ISSUE_CLUSTER_META.browser_gate_incomplete.title,
    severity: ISSUE_CLUSTER_META.browser_gate_incomplete.severity,
    categories: ISSUE_CLUSTER_META.browser_gate_incomplete.categories,
    affectedPersonaCount: Math.max(0, Number(browserSummary.targetPersonaCount || 0) - Number(browserSummary.attemptedPersonaCount || 0)),
    affectedCohorts: [],
    affectedLenses: [],
    reproductionPath: ["Launch browser verification stopped short of the full requested 1,000-persona path."],
    screenshots: [],
    traces: [],
    likelyFilesOrServices: [],
    rootCauseHypothesis: ISSUE_CLUSTER_META.browser_gate_incomplete.rootCauseHypothesis,
    recommendedFix: "Run the chunked browser runner to completion, or explicitly accept the incomplete browser gate.",
    expectedUserImpact: ISSUE_CLUSTER_META.browser_gate_incomplete.expectedUserImpact,
    effortEstimate: ISSUE_CLUSTER_META.browser_gate_incomplete.effortEstimate,
    implemented: false,
    validationTests: ["qa:launch-simulation", "qa:launch-simulation:deployed"],
    source: "unverified_hypothesis",
    confidence: 0.4,
  }] : [];

  return [
    ...incompleteCluster,
    ...failures.map((failure, index) => ({
      clusterId: `browser_failure_${index + 1}`,
      title: failure.title || "Browser-observed flow failure",
      severity: failure.severity || "high",
      categories: toArray(failure.categories || ["copy/UX confusion"]),
      affectedPersonaCount: 1,
      affectedCohorts: toArray(failure.cohortTags || []),
      affectedLenses: toArray(failure.lensTags || []),
      reproductionPath: toArray(failure.path || []),
      screenshots: toArray(failure.screenshots || []),
      traces: toArray(failure.traces || []),
      likelyFilesOrServices: toArray(failure.likelyFiles || []),
      rootCauseHypothesis: failure.rootCauseHypothesis || "Observed in browser automation.",
      recommendedFix: failure.recommendedFix || "Inspect the recorded browser artifacts and patch the flow.",
      expectedUserImpact: failure.expectedUserImpact || "A real user can hit this in the UI.",
      effortEstimate: failure.effortEstimate || "medium",
      implemented: false,
      validationTests: toArray(failure.specRefs || []),
      source: "browser_verified",
      confidence: 1,
    })),
  ];
};

const buildDeterministicIssueClusters = ({
  personas = [],
  deterministicReport = {},
  implementedFixIds = [],
} = {}) => {
  const personaMap = new Map(personas.map((persona) => [persona.id, persona]));
  return toArray(deterministicReport?.rootCauseClusters || [])
    .filter((cluster) => Number(cluster?.count || 0) > 0)
    .map((cluster) => {
      const meta = ISSUE_CLUSTER_META[cluster.clusterId] || ISSUE_CLUSTER_META.ugly_confusing_copy;
      const affectedPersonas = toArray(cluster.personas || []).map((personaId) => personaMap.get(personaId)).filter(Boolean);
      return {
        clusterId: cluster.clusterId,
        title: meta.title,
        severity: meta.severity,
        categories: meta.categories,
        affectedPersonaCount: affectedPersonas.length,
        affectedCohorts: [...new Set(affectedPersonas.flatMap((persona) => toArray(persona.cohortTags || [])))].sort(),
        affectedLenses: [...new Set(affectedPersonas.flatMap((persona) => toArray(persona.lensTags || [])))].sort(),
        reproductionPath: toArray(cluster.stepRefs || []),
        screenshots: [],
        traces: [],
        likelyFilesOrServices: toArray(cluster.likelyFiles || []),
        rootCauseHypothesis: meta.rootCauseHypothesis,
        recommendedFix: cluster.recommendedFixCluster || meta.title,
        expectedUserImpact: meta.expectedUserImpact,
        effortEstimate: meta.effortEstimate,
        implemented: implementedFixIds.includes(cluster.clusterId),
        validationTests: toArray(cluster.specRefs || []),
        source: "deterministic_simulation",
        confidence: 0.84,
      };
    });
};

const scoreIssueCluster = (cluster = {}) => {
  const severityWeight = SEVERITY_WEIGHT[cluster.severity] || 1;
  const trustMultiplier = Math.max(
    1,
    ...toArray(cluster.categories || []).map((category) => CATEGORY_TRUST_MULTIPLIER[category] || 1)
  );
  const confidence = Number(cluster.confidence || 0.5);
  const effort = EFFORT_WEIGHT[cluster.effortEstimate] || 2;
  return Number(((severityWeight * Math.max(1, Number(cluster.affectedPersonaCount || 0)) * trustMultiplier * confidence) / effort).toFixed(2));
};

const decorateIssueClusters = (clusters = []) => clusters
  .map((cluster) => ({
    ...cluster,
    impactScore: scoreIssueCluster(cluster),
  }))
  .sort((left, right) => right.impactScore - left.impactScore || left.title.localeCompare(right.title));

const buildLaunchVerdict = ({
  metrics = {},
  browserSummary = {},
  thresholds = LAUNCH_SIMULATION_RELEASE_THRESHOLDS,
} = {}) => {
  const failures = [];
  if (metrics.intakeCompletionRate < thresholds.minimumIntakeCompletionRate) failures.push("intake completion below threshold");
  if (metrics.postIntakePlanCreationRate < thresholds.minimumPlanCreationRate) failures.push("post-intake plan creation below threshold");
  if (metrics.crossSurfaceContradictionRate > thresholds.maximumCrossSurfaceContradictionRate) failures.push("cross-surface contradiction rate too high");
  if (metrics.severeSafetyIssueCount > thresholds.maximumSevereSafetyIssueCount) failures.push("severe safety issues present");
  if (metrics.blockerCount > thresholds.maximumBlockerCount) failures.push("blocker clusters present");
  if (metrics.highSeverityTrustBreakCount > thresholds.maximumHighSeverityTrustBreakCount) failures.push("high-severity trust breaks present");
  if (metrics.averageSatisfaction < thresholds.minimumAverageSatisfaction) failures.push("average satisfaction below threshold");
  if ((Number(metrics.retentionRiskDistribution?.high || 0) / Math.max(1, LAUNCH_SIMULATION_PERSONA_COUNT)) > thresholds.maximumHighRetentionRiskShare) failures.push("too many high retention-risk personas");
  if (metrics.simulationCompletionRate < thresholds.minimumSimulationCompletionRate) failures.push("simulation did not complete for all requested personas");
  if (browserSummary.passRate != null && browserSummary.passRate < thresholds.minimumBrowserE2EPassRate) failures.push("browser E2E pass rate below threshold");
  if (browserSummary.accessibilityPassRate != null && browserSummary.accessibilityPassRate < thresholds.minimumAccessibilitySmokePassRate) failures.push("accessibility smoke pass rate below threshold");
  if (browserSummary.releaseGateIncomplete) failures.push("browser gate incomplete");

  const verdict = failures.length === 0
    ? LAUNCH_SIMULATION_VERDICTS.ready
    : failures.length <= 2 && !failures.includes("severe safety issues present") && !failures.includes("blocker clusters present")
    ? LAUNCH_SIMULATION_VERDICTS.readyWithKnownRisks
    : LAUNCH_SIMULATION_VERDICTS.notReady;

  return {
    verdict,
    blockingReasons: failures,
    thresholds,
  };
};

const selectNarrativePersonas = (launchPersonaOutcomes = []) => {
  const byLens = new Map();
  launchPersonaOutcomes.forEach((outcome) => {
    if (!byLens.has(outcome.dominantLens)) byLens.set(outcome.dominantLens, outcome);
  });
  const selected = [...byLens.values()];
  const remainder = launchPersonaOutcomes
    .filter((outcome) => !selected.some((entry) => entry.personaId === outcome.personaId))
    .sort((left, right) => {
      const leftRisk = left.retentionRisk === "high" ? 3 : left.retentionRisk === "medium" ? 2 : 1;
      const rightRisk = right.retentionRisk === "high" ? 3 : right.retentionRisk === "medium" ? 2 : 1;
      return rightRisk - leftRisk || left.satisfaction - right.satisfaction || left.personaId.localeCompare(right.personaId);
    });
  return [...selected, ...remainder].slice(0, 25);
};

const buildNarrativeMarkdown = ({
  personas = [],
  metrics = {},
} = {}) => {
  const personaMap = new Map(personas.map((persona) => [persona.id, persona]));
  const selected = selectNarrativePersonas(metrics.launchPersonaOutcomes || []);
  return [
    "# Top Persona Narratives",
    "",
    ...selected.flatMap((outcome, index) => {
      const persona = personaMap.get(outcome.personaId) || {};
      return [
        `## ${index + 1}. ${persona.name || outcome.personaId}`,
        "",
        `- Persona id: \`${outcome.personaId}\``,
        `- Dominant lens: ${persona.reviewLensLabel || outcome.dominantLens}`,
        `- Goal stack: ${[persona.primaryGoal, ...toArray(persona.secondaryGoals || [])].filter(Boolean).join(" | ")}`,
        `- Satisfaction: ${outcome.satisfaction}/100`,
        `- Perceived trust: ${outcome.perceivedTrust}/100`,
        `- Retention risk: ${outcome.retentionRisk}`,
        `- Why they matter: ${persona.personalityProfile?.summary || ""}`,
        `- Top friction: ${toArray(outcome.topFailures || []).map((failure) => failure.message).slice(0, 2).join(" / ") || "No major friction captured."}`,
        `- Five-year arc: ${toArray(persona.fiveYearLifecycleEvents || []).slice(0, 4).map((event) => `${event.week}: ${event.label}`).join(" | ")}`,
        "",
      ];
    }),
  ].join("\n");
};

const buildFixPlanMarkdown = ({
  issueClusters = [],
} = {}) => [
  "# Fix Plan",
  "",
  ...issueClusters.slice(0, 20).flatMap((cluster, index) => ([
    `## ${index + 1}. ${cluster.title}`,
    "",
    `- Severity: ${cluster.severity}`,
    `- Categories: ${toArray(cluster.categories || []).join(", ")}`,
    `- Affected personas: ${cluster.affectedPersonaCount}`,
    `- Impact score: ${cluster.impactScore}`,
    `- Recommended fix: ${cluster.recommendedFix}`,
    `- Expected user impact: ${cluster.expectedUserImpact}`,
    `- Effort estimate: ${cluster.effortEstimate}`,
    `- Implemented in this pass: ${cluster.implemented ? "yes" : "no"}`,
    `- Validation: ${toArray(cluster.validationTests || []).join(", ") || "None yet"}`,
    "",
  ])),
].join("\n");

const buildLaunchReportMarkdown = ({
  runConfig = {},
  deployedReachability = null,
  deterministicReport = {},
  browserSummary = {},
  metrics = {},
  verdict = {},
  issueClusters = [],
} = {}) => {
  const topDeterministic = issueClusters.filter((cluster) => cluster.source === "deterministic_simulation").slice(0, 8);
  const topBrowser = issueClusters.filter((cluster) => cluster.source === "browser_verified").slice(0, 5);
  const inferredRisks = issueClusters.filter((cluster) => cluster.source === "inferred_product_risk").slice(0, 5);
  const unverified = issueClusters.filter((cluster) => cluster.source === "unverified_hypothesis").slice(0, 5);

  return [
    "# Launch Simulation Report",
    "",
    `## Verdict`,
    "",
    `**${verdict.verdict}**`,
    "",
    `- Deterministic personas: ${deterministicReport?.summary?.personaCount || 0}`,
    `- Simulation weeks: ${deterministicReport?.summary?.simulationWeeks || 0}`,
    `- Checkpoint weeks executed: ${deterministicReport?.summary?.checkpointWeekCount || deterministicReport?.summary?.simulationWeeks || 0}`,
    `- Compressed longitudinal model: ${deterministicReport?.summary?.compressedLongitudinalModel ? "yes" : "no"}`,
    `- Browser mode: ${browserSummary.mode || "not_run"}`,
    `- Browser attempted personas: ${browserSummary.attemptedPersonaCount || 0}`,
    `- Browser pass rate: ${browserSummary.passRate == null ? "n/a" : `${Math.round(browserSummary.passRate * 100)}%`}`,
    `- Accessibility smoke pass rate: ${browserSummary.accessibilityPassRate == null ? "n/a" : `${Math.round(browserSummary.accessibilityPassRate * 100)}%`}`,
    `- Deployed app reachable: ${deployedReachability?.reachable ? "yes" : "no"}`,
    "",
    `## Release Gate Metrics`,
    "",
    `- Intake completion rate: ${(metrics.intakeCompletionRate * 100).toFixed(1)}%`,
    `- Post-intake plan creation rate: ${(metrics.postIntakePlanCreationRate * 100).toFixed(1)}%`,
    `- Cross-surface contradiction rate: ${(metrics.crossSurfaceContradictionRate * 100).toFixed(1)}%`,
    `- Severe safety issues: ${metrics.severeSafetyIssueCount}`,
    `- Blocker count: ${metrics.blockerCount}`,
    `- High-severity trust-break count: ${metrics.highSeverityTrustBreakCount}`,
    `- Average satisfaction: ${metrics.averageSatisfaction.toFixed(1)}`,
    `- Simulation completion rate: ${(metrics.simulationCompletionRate * 100).toFixed(1)}%`,
    `- High retention-risk personas: ${metrics.retentionRiskDistribution?.high || 0}`,
    "",
    `## Browser-Verified Findings`,
    "",
    ...(topBrowser.length
      ? topBrowser.flatMap((cluster) => [
          `- ${cluster.title}: ${cluster.severity}; affected personas ${cluster.affectedPersonaCount}; ${cluster.recommendedFix}`,
        ])
      : ["- No browser-observed failures were recorded in this run."]),
    "",
    `## Deterministic Simulation Findings`,
    "",
    ...topDeterministic.map((cluster) => `- ${cluster.title}: ${cluster.severity}; affected personas ${cluster.affectedPersonaCount}; ${cluster.recommendedFix}`),
    "",
    `## Inferred Product Risks`,
    "",
    ...(inferredRisks.length
      ? inferredRisks.map((cluster) => `- ${cluster.title}: affects ${cluster.affectedPersonaCount} personas; ${cluster.expectedUserImpact}`)
      : ["- No major inferred-only risks were elevated above the threshold."]),
    "",
    `## Unverified Hypotheses`,
    "",
    ...(unverified.length
      ? unverified.map((cluster) => `- ${cluster.title}: ${cluster.expectedUserImpact}`)
      : ["- No unverified hypotheses were elevated above the threshold."]),
    "",
    `## Blocking Reasons`,
    "",
    ...(verdict.blockingReasons.length
      ? verdict.blockingReasons.map((reason) => `- ${reason}`)
      : ["- None"]),
    "",
    `## Run Config`,
    "",
    `- Mode: ${runConfig.mode || "full"}`,
    `- Requested personas: ${runConfig.personaCount || LAUNCH_SIMULATION_PERSONA_COUNT}`,
    `- Requested weeks: ${runConfig.weeks || LAUNCH_SIMULATION_WEEKS}`,
    `- Executed checkpoint weeks: ${runConfig.checkpointWeekCount || runConfig.weeks || LAUNCH_SIMULATION_WEEKS}`,
    `- Requested browser personas: ${runConfig.browserPersonaTarget || 0}`,
    `- Implemented fix ids: ${toArray(runConfig.implementedFixIds || []).join(", ") || "none"}`,
    "",
  ].join("\n");
};

const compactPersonaResult = (result = {}) => ({
  personaId: result.personaId,
  name: result.name,
  supportTierExpected: result.supportTierExpected,
  supportTierActual: result.supportTierActual,
  supportHeadline: result.supportHeadline,
  simulationWeeks: result.simulationWeeks,
  checkpointWeekCount: result.checkpointWeekCount || result.simulationWeeks || 0,
  checksPassed: result.checksPassed,
  checksFailed: result.checksFailed,
  severeBlockerCount: toArray(result.severeBlockers || []).length,
  mediumIssueCount: toArray(result.mediumIssues || []).length,
  releaseDimensionScores: result.releaseDimensionScores,
  categoryScores: result.categoryScores,
  overallScore: result.overallScore,
  score: result.score,
  overallPass: result.overallPass,
  cohortTags: result.cohortTags || [],
  recommendedFixClusters: result.recommendedFixClusters || [],
  topFailures: [...toArray(result.severeBlockers || []), ...toArray(result.mediumIssues || [])]
    .slice(0, 6)
    .map((failure) => ({
      clusterId: failure.clusterId,
      message: failure.message,
      stepRef: failure.stepRef,
      severity: failure.severity,
    })),
  timelineHighlights: toArray(result.timeline || []).filter((entry, index) => {
    if (index === 0) return true;
    return /travel|pain|goal|nutrition|coach|finish|restore|archive|sync|delete/i.test(String(entry?.event || ""));
  }).slice(0, 10),
  snapshots: result.snapshots || {},
});

const buildSerializableLaunchResults = (results = {}) => ({
  schemaVersion: results.schemaVersion || "2026-04-launch-simulation-v1",
  mode: results.mode || "full",
  deterministicReport: {
    summary: results?.deterministicReport?.summary || {},
    releaseDimensionSummary: results?.deterministicReport?.releaseDimensionSummary || {},
    cohortCoverage: results?.deterministicReport?.cohortCoverage || {},
    fairnessSignals: results?.deterministicReport?.fairnessSignals || {},
    releaseGate: results?.deterministicReport?.releaseGate || {},
    releaseGateMatrix: results?.deterministicReport?.releaseGateMatrix || [],
    catalogCoverage: results?.deterministicReport?.catalogCoverage || {},
    rootCauseClusters: results?.deterministicReport?.rootCauseClusters || [],
    personaResults: toArray(results?.deterministicReport?.personaResults || []).map(compactPersonaResult),
  },
  browserSummary: results.browserSummary || {},
  metrics: {
    ...results.metrics,
    launchPersonaOutcomes: toArray(results?.metrics?.launchPersonaOutcomes || []),
  },
  issueClusters: toArray(results.issueClusters || []),
  verdict: results.verdict || {},
  deployedReachability: results.deployedReachability || null,
  artifacts: results.artifacts || {},
});

export const buildLaunchSimulationArtifacts = ({
  personas = [],
  personaCoverage = {},
  results = {},
  issueClusters = [],
} = {}) => ({
  personasJson: JSON.stringify(personas, null, 2),
  personaCoverageJson: JSON.stringify(personaCoverage, null, 2),
  resultsJson: JSON.stringify(buildSerializableLaunchResults(results), null, 2),
  issueClustersJson: JSON.stringify(issueClusters, null, 2),
  launchReportMarkdown: results?.artifacts?.launchReportMarkdown || "",
  topPersonaNarrativesMarkdown: results?.artifacts?.topPersonaNarrativesMarkdown || "",
  fixPlanMarkdown: results?.artifacts?.fixPlanMarkdown || "",
});

export const refreshLaunchSimulationFromExisting = ({
  existingResults = {},
  browserResults = null,
  deployedReachability = null,
  mode = "deployed",
} = {}) => {
  const deterministicIssueClusters = toArray(existingResults.issueClusters || []).filter((cluster) => (
    cluster?.source !== "browser_verified"
    && cluster?.clusterId !== "browser_gate_incomplete"
    && cluster?.source !== "unverified_hypothesis"
  ));
  const browserSummary = buildBrowserSummary(browserResults, {
    targetPersonaCount: browserResults?.targetPersonaCount
      || existingResults?.browserSummary?.targetPersonaCount
      || existingResults?.deterministicReport?.summary?.personaCount
      || LAUNCH_SIMULATION_PERSONA_COUNT,
  });
  const issueClusters = decorateIssueClusters([
    ...deterministicIssueClusters,
    ...buildBrowserIssueClusters({ browserSummary }),
  ]);
  const verdict = buildLaunchVerdict({
    metrics: existingResults.metrics || {},
    browserSummary,
  });
  const launchReportMarkdown = buildLaunchReportMarkdown({
    runConfig: {
      mode,
      personaCount: existingResults?.deterministicReport?.summary?.personaCount || LAUNCH_SIMULATION_PERSONA_COUNT,
      weeks: existingResults?.deterministicReport?.summary?.simulationWeeks || LAUNCH_SIMULATION_WEEKS,
      checkpointWeekCount: existingResults?.deterministicReport?.summary?.checkpointWeekCount || existingResults?.deterministicReport?.summary?.simulationWeeks || 0,
      browserPersonaTarget: browserSummary.targetPersonaCount,
      implementedFixIds: ["anonymous_access_before_account"],
    },
    deployedReachability,
    deterministicReport: existingResults.deterministicReport || {},
    browserSummary,
    metrics: existingResults.metrics || {},
    verdict,
    issueClusters,
  });
  const fixPlanMarkdown = buildFixPlanMarkdown({
    issueClusters,
  });

  return {
    ...existingResults,
    mode,
    browserSummary,
    deployedReachability,
    issueClusters,
    verdict,
    artifacts: {
      ...existingResults.artifacts,
      launchReportMarkdown,
      fixPlanMarkdown,
    },
  };
};

export const runLaunchSimulation = ({
  personaCount = LAUNCH_SIMULATION_PERSONA_COUNT,
  weeks = LAUNCH_SIMULATION_WEEKS,
  browserResults = null,
  browserTargetPersonaCount = 0,
  deployedReachability = null,
  implementedFixIds = [],
  mode = "full",
} = {}) => {
  const personas = generateLaunchSimulationPersonas({ count: personaCount });
  const personaCoverage = buildLaunchPersonaCoverage(personas);
  const weekSequence = weeks >= 104
    ? buildLaunchSimulationWeekSequence({ effectiveWeeks: weeks, personas })
    : null;
  const deterministicReport = runSyntheticAthleteLab({
    personas,
    weeks,
    weekSequence,
    includeArchetypeMatrix: true,
  });
  const browserSummary = buildBrowserSummary(browserResults, {
    targetPersonaCount: browserTargetPersonaCount || browserResults?.targetPersonaCount || personaCount,
  });
  const metrics = buildLaunchMetrics({
    personas,
    deterministicReport,
    browserSummary,
  });
  const issueClusters = decorateIssueClusters([
    ...buildDeterministicIssueClusters({
      personas,
      deterministicReport,
      implementedFixIds,
    }),
    ...buildFeatureGapClusters({ personas }),
    ...buildBrowserIssueClusters({ browserSummary }),
  ]);
  const verdict = buildLaunchVerdict({
    metrics,
    browserSummary,
  });

  const topPersonaNarrativesMarkdown = buildNarrativeMarkdown({
    personas,
    metrics,
  });
  const fixPlanMarkdown = buildFixPlanMarkdown({
    issueClusters,
  });
  const launchReportMarkdown = buildLaunchReportMarkdown({
    runConfig: {
      mode,
      personaCount,
      weeks,
      checkpointWeekCount: deterministicReport?.summary?.checkpointWeekCount || weeks,
      browserPersonaTarget: browserSummary.targetPersonaCount,
      implementedFixIds,
    },
    deployedReachability,
    deterministicReport,
    browserSummary,
    metrics,
    verdict,
    issueClusters,
  });

  return {
    schemaVersion: "2026-04-launch-simulation-v1",
    mode,
    personas,
    personaCoverage,
    deterministicReport,
    browserSummary,
    metrics,
    issueClusters,
    verdict,
    deployedReachability,
    artifacts: {
      launchReportMarkdown,
      topPersonaNarrativesMarkdown,
      fixPlanMarkdown,
    },
  };
};
