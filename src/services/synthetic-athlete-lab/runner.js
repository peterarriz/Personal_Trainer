import { composeGoalNativePlan, buildRollingHorizonWeeks, generateTodayPlan, normalizeGoals } from "../../modules-planning.js";
import { deriveAdaptiveNutrition, deriveRealWorldNutritionEngine } from "../../modules-nutrition.js";
import { classifyStorageError } from "../../modules-auth-storage.js";
import { buildBrandThemeState, BRAND_THEME_IDS } from "../brand-theme-service.js";
import { deriveCanonicalAthleteState } from "../canonical-athlete-service.js";
import { resolveGoalTranslation } from "../goal-resolution-service.js";
import { buildMetricsBaselinesModel } from "../metrics-baselines-service.js";
import { buildSupportTierModel } from "../support-tier-service.js";
import { buildTrainingContextFromEditor } from "../training-context-service.js";
import { buildWorkoutLogDraft } from "../workout-log-form-service.js";
import {
  createProgramInstance,
  createStyleSelection,
  getProgramDefinitionById,
  getStyleDefinitionById,
  PROGRAM_FIDELITY_MODES,
} from "../program-catalog-service.ts";
import { deriveWeeklyNutritionAdaptation } from "../weekly-nutrition-review-service.js";
import { SYNTHETIC_ATHLETE_PERSONAS } from "./persona-catalog.js";

const LAB_TODAY_KEY = "2026-04-17";
const LAB_CURRENT_WEEK = 3;
const LAB_CURRENT_DAY_OF_WEEK = 5;
const LAB_BASE_WEEK = {
  phase: "BUILDING",
  label: "Sharpen",
  mon: { t: "Easy", d: "35 min" },
  thu: { t: "Tempo", d: "30 min" },
  fri: { t: "Easy", d: "30 min" },
  sat: { t: "Long", d: "60 min" },
  str: "A",
  nutri: "hardRun",
};
const LAB_WEEK_TEMPLATES = [
  { phase: "BASE", label: "Foundation", mon: { t: "Easy", d: "30 min" }, thu: { t: "Tempo", d: "20 min" }, fri: { t: "Easy", d: "25 min" }, sat: { t: "Long", d: "40 min" }, str: "A", nutri: "easyRun" },
  { phase: "BASE", label: "Foundation 2", mon: { t: "Easy", d: "35 min" }, thu: { t: "Tempo", d: "24 min" }, fri: { t: "Easy", d: "30 min" }, sat: { t: "Long", d: "45 min" }, str: "B", nutri: "easyRun" },
  LAB_BASE_WEEK,
  { phase: "BUILDING", label: "Sharpen 2", mon: { t: "Easy", d: "40 min" }, thu: { t: "Intervals", d: "5 x 3 min" }, fri: { t: "Easy", d: "35 min" }, sat: { t: "Long", d: "65 min" }, str: "B", nutri: "hardRun" },
  { phase: "PEAK", label: "Peak", mon: { t: "Easy", d: "35 min" }, thu: { t: "Tempo", d: "35 min" }, fri: { t: "Easy", d: "30 min" }, sat: { t: "Long", d: "70 min" }, str: "A", nutri: "hardRun" },
  { phase: "DELOAD", label: "Reset", mon: { t: "Easy", d: "25 min" }, thu: { t: "Steady", d: "20 min" }, fri: { t: "Easy", d: "20 min" }, sat: { t: "Long", d: "45 min" }, str: "A", nutri: "easyRun" },
];

const toNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hashString = (value = "") => {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const midpointAge = (ageRange = "30-39") => {
  const match = String(ageRange || "").match(/(\d{2})-(\d{2})/);
  if (!match) return 34;
  return Math.round((Number(match[1]) + Number(match[2])) / 2);
};

const inferDaysPerWeek = (scheduleReality = "") => {
  const match = String(scheduleReality || "").match(/(\d)\s*(?:to|-)?\s*(\d)?\s*(?:sessions|runs|days)/i);
  if (!match) return 4;
  const first = Number(match[1] || 0);
  const second = Number(match[2] || 0);
  return second ? Math.round((first + second) / 2) : first || 4;
};

const buildManualProgressInputs = (baselineMetrics = {}, todayKey = LAB_TODAY_KEY) => ({
  measurements: {
    waist_circumference: baselineMetrics?.waist ? [{ date: todayKey, value: baselineMetrics.waist, source: "user_override" }] : [],
  },
  benchmarks: {
    lift_results: baselineMetrics?.lift ? [{ date: todayKey, exercise: baselineMetrics.lift.exercise, weight: baselineMetrics.lift.weight, reps: baselineMetrics.lift.reps, sets: baselineMetrics.lift.sets || 1, source: "user_override" }] : [],
    run_results: baselineMetrics?.run ? [{ date: todayKey, distanceMiles: baselineMetrics.run.distanceMiles, durationMinutes: baselineMetrics.run.durationMinutes, paceText: baselineMetrics.run.paceText, source: "user_override" }] : [],
  },
  metrics: {
    swim_benchmark: baselineMetrics?.swim ? [{ date: todayKey, distance: baselineMetrics.swim.distance, duration: baselineMetrics.swim.duration, note: baselineMetrics.swim.note || "", source: "user_override" }] : [],
    vertical_jump: baselineMetrics?.jump ? [{ date: todayKey, value: baselineMetrics.jump.value, unit: baselineMetrics.jump.unit || "in", source: "user_override" }] : [],
  },
});

const buildGoalsFromPersona = (persona = {}) => {
  if (!Array.isArray(persona.goalIntents) || persona.goalIntents.length === 0) return [];
  const rawGoalIntent = persona.goalIntents.join(" but ");
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalIntent,
    typedIntakePacket: { intake: { rawGoalText: rawGoalIntent } },
  });
  return normalizeGoals((resolution?.planningGoals || []).map((goal, index) => ({
    ...goal,
    id: `${persona.id}_goal_${index + 1}`,
    active: true,
    priority: goal?.priority || index + 1,
    resolvedGoal: resolution?.resolvedGoals?.[index] || goal?.resolvedGoal || null,
  })));
};

const createPersonalization = ({ persona = {}, includeMetrics = true, programs = null } = {}) => {
  const age = midpointAge(persona.ageRange);
  const heightSeed = 64 + (hashString(persona.id) % 10);
  const bodyweight = persona?.baselineMetrics?.bodyweight || (140 + (hashString(`${persona.id}:bw`) % 70));
  const isTravelHeavy = String(persona.travelLikelihood || "").toLowerCase() === "high";
  const environmentMode = isTravelHeavy ? "travel" : String(persona.environmentMode || "Gym").toLowerCase() === "travel" ? "travel" : "home";
  const sessionLength = persona.sessionLength || "45";
  const equipmentReality = persona.equipmentReality || persona.equipmentAccess || "basic gym";
  return {
    settings: {
      units: persona.units === "metric"
        ? { weight: "kg", height: "cm", distance: "kilometers" }
        : { weight: "lbs", height: "ft_in", distance: "miles" },
      trainingPreferences: {
        intensityPreference: persona.preferredIntensity || "Standard",
        defaultEnvironment: persona.environmentMode || "Gym",
      },
      appearance: { theme: "Atlas", mode: "System" },
    },
    profile: {
      name: persona.name,
      timezone: persona.timezone || "America/Chicago",
      birthYear: 2026 - age,
      age,
      height: persona.units === "metric" ? Math.round(heightSeed * 2.54) : `${Math.floor(heightSeed / 12)}'${heightSeed % 12}"`,
      weight: bodyweight,
      bodyweight,
      trainingAgeYears: persona.trainingAgeYears || 0,
      onboardingComplete: true,
      profileSetupComplete: true,
    },
    userGoalProfile: {
      days_per_week: inferDaysPerWeek(persona.scheduleReality),
      session_length: sessionLength,
      equipment_access: [persona.equipmentAccess || "basic_gym"],
    },
    trainingContext: buildTrainingContextFromEditor({
      mode: persona.environmentMode || "Gym",
      equipment: persona.equipmentAccess || "basic_gym",
      equipmentItems: [equipmentReality],
      time: sessionLength,
      intensity: persona.preferredIntensity || "Standard",
    }),
    travelState: {
      environmentMode,
      access: environmentMode === "travel" ? "hotel" : "stable",
      isTravelWeek: isTravelHeavy,
    },
    environmentConfig: {
      defaultMode: persona.environmentMode || "Gym",
      base: {
        mode: persona.environmentMode || "Gym",
        equipment: [equipmentReality],
        time: sessionLength,
      },
      schedule: [],
    },
    localFoodContext: {
      city: persona.timezone?.includes("Los_Angeles") ? "Los Angeles" : "Chicago",
      groceryOptions: [persona.travelLikelihood === "high" ? "Whole Foods" : "Trader Joe's"],
    },
    nutritionPreferenceState: {
      style: persona.bodyCompContext ? "structured" : "flexible",
      preferredMeals: ["protein-forward breakfast", "simple lunch bowl"],
    },
    manualProgressInputs: includeMetrics ? buildManualProgressInputs(persona.baselineMetrics || {}, LAB_TODAY_KEY) : buildManualProgressInputs({}, LAB_TODAY_KEY),
    programs,
  };
};

const buildProgramsState = ({ persona = {}, athleteProfile = null } = {}) => {
  const state = {};
  const programDefinition = getProgramDefinitionById(persona.programId || "");
  if (programDefinition) {
    state.activeProgramInstance = createProgramInstance({
      programDefinition,
      athleteProfile,
      fidelityMode: PROGRAM_FIDELITY_MODES.adaptToMe,
    });
  }
  const styleDefinition = getStyleDefinitionById(persona.styleId || "");
  if (styleDefinition) {
    state.activeStyleSelection = createStyleSelection({ styleDefinition });
  }
  return Object.keys(state).length ? state : null;
};

const buildScenarioNutritionReview = (persona = {}) => {
  const behaviorText = `${persona.nutritionBehavior || ""} ${(persona.likelyFailureModes || []).join(" ")}`.toLowerCase();
  const summary = {
    actual: { loggedDays: 5 },
    adherence: { lowDays: /chaotic|drift|airport|under|messy|snack/.test(behaviorText) ? 3 : 1 },
    deviationPattern: { counts: { under_fueled: /under|hungry|airport|class-heavy/.test(behaviorText) ? 2 : 0 } },
    hydration: { belowTargetDays: /travel|airport|hydration/.test(behaviorText) ? 3 : 1 },
    supplements: { missedDays: 0, expectedDays: 0 },
    friction: { topCauses: [{ key: /travel|airport/.test(behaviorText) ? "travel" : /chaotic|busy|shift/.test(behaviorText) ? "time_pressure" : "convenience" }] },
    prescribed: { hardTrainingDays: 2 },
  };
  return {
    summary,
    adaptation: deriveWeeklyNutritionAdaptation({ summary }),
  };
};

const buildPlannedDayRecord = (dateKey, training) => ({
  id: `plan_day_${dateKey}`,
  dateKey,
  base: { training },
  resolved: { training },
});

const signatureOfTemplates = (dayTemplates = {}) => JSON.stringify(
  Object.fromEntries(
    Object.entries(dayTemplates || {}).map(([day, session]) => [day, {
      type: session?.type || "",
      label: session?.label || "",
      run: session?.run?.d || "",
      swim: session?.swim?.d || "",
      power: session?.power?.dose || "",
      strengthDose: session?.strengthDose || "",
    }])
  )
);

const runPersona = (persona = {}) => {
  const goals = buildGoalsFromPersona(persona);
  const barePersonalization = createPersonalization({ persona, includeMetrics: false });
  const bareAthlete = deriveCanonicalAthleteState({ goals, personalization: barePersonalization, profileDefaults: { name: persona.name } });
  const programs = buildProgramsState({ persona, athleteProfile: bareAthlete });
  const personalization = createPersonalization({ persona, includeMetrics: true, programs });
  const athleteProfile = deriveCanonicalAthleteState({ goals, personalization, profileDefaults: { name: persona.name } });
  const momentum = { inconsistencyRisk: /sporadic|drift|quick logs only|chaotic/.test(String(persona.loggingBehavior || "").toLowerCase()) ? "high" : "medium", momentumState: "stable" };
  const composer = composeGoalNativePlan({
    goals,
    personalization,
    athleteProfile,
    momentum,
    learningLayer: {},
    baseWeek: LAB_BASE_WEEK,
    currentWeek: LAB_CURRENT_WEEK,
    weekTemplates: LAB_WEEK_TEMPLATES,
    logs: {},
    bodyweights: persona?.baselineMetrics?.bodyweight ? [{ date: LAB_TODAY_KEY, w: persona.baselineMetrics.bodyweight }] : [],
    dailyCheckins: {},
    nutritionActualLogs: {},
    weeklyNutritionReview: null,
    coachActions: [],
    todayKey: LAB_TODAY_KEY,
    currentDayOfWeek: LAB_CURRENT_DAY_OF_WEEK,
    plannedDayRecords: {},
    planWeekRecords: {},
  });
  const rollingHorizon = buildRollingHorizonWeeks({
    currentWeek: LAB_CURRENT_WEEK,
    horizonWeeks: 6,
    goals,
    weekTemplates: LAB_WEEK_TEMPLATES,
    architecture: composer.architecture,
    programBlock: composer.programBlock,
    programContext: composer.programContext,
    blockIntent: composer.blockIntent,
    split: composer.split,
    sessionsByDay: composer.dayTemplates,
    referenceTemplate: LAB_BASE_WEEK,
    constraints: composer.constraints,
  });
  const plannedSession = composer?.dayTemplates?.[LAB_CURRENT_DAY_OF_WEEK] || null;
  const plannedDayRecord = buildPlannedDayRecord(LAB_TODAY_KEY, plannedSession);
  const todayPlan = generateTodayPlan(
    {
      primaryGoalKey: athleteProfile?.userProfile?.primaryGoalKey,
      experienceLevel: athleteProfile?.userProfile?.experienceLevel,
      daysPerWeek: athleteProfile?.userProfile?.daysPerWeek,
      sessionLength: athleteProfile?.userProfile?.sessionLength,
      constraints: athleteProfile?.userProfile?.constraints || [],
      trainingContext: athleteProfile?.trainingContext,
    },
    { todayKey: LAB_TODAY_KEY, logs: {} },
    { fatigueScore: /sleep|shift|newborn/.test(String(persona.injuryContext || "").toLowerCase()) ? 4 : 2, trend: "stable", momentum: "stable", injuryLevel: /pain|flare|rehab|achilles|back/.test(String(persona.injuryContext || "").toLowerCase()) ? "moderate_pain" : "none" },
    {
      plannedSession,
      planningBasis: composer.planningBasis,
      programBlock: composer.programBlock,
      weeklyIntent: { focus: composer.programBlock?.summary || "Execute the current week cleanly." },
      changeSummary: composer.changeSummary,
    }
  );
  const logDraft = buildWorkoutLogDraft({ dateKey: LAB_TODAY_KEY, plannedDayRecord, fallbackTraining: plannedSession });
  const nutritionReview = buildScenarioNutritionReview(persona);
  const nutritionLayer = deriveAdaptiveNutrition({
    todayWorkout: plannedSession,
    goals,
    momentum,
    personalization,
    bodyweights: persona?.baselineMetrics?.bodyweight ? [{ date: LAB_TODAY_KEY, w: persona.baselineMetrics.bodyweight }] : [],
    learningLayer: {},
    nutritionActualLogs: {},
    coachPlanAdjustments: {},
    salvageLayer: {},
    failureMode: {},
  });
  const realWorldNutrition = deriveRealWorldNutritionEngine({
    location: personalization?.localFoodContext?.city || "Chicago",
    dayType: nutritionLayer?.dayType,
    goalContext: nutritionLayer?.goalContext,
    nutritionLayer,
    momentum,
    favorites: { groceries: personalization?.localFoodContext?.groceryOptions || [] },
    travelMode: nutritionLayer?.travelMode,
    learningLayer: {},
    timeOfDay: "evening",
    loggedIntake: null,
  });
  const metricsWithoutOverride = buildMetricsBaselinesModel({ athleteProfile, personalization: barePersonalization, logs: {}, bodyweights: [] });
  const metricsWithOverride = buildMetricsBaselinesModel({ athleteProfile, personalization, logs: {}, bodyweights: persona?.baselineMetrics?.bodyweight ? [{ date: LAB_TODAY_KEY, w: persona.baselineMetrics.bodyweight }] : [] });
  const supportTier = composer?.supportTier || buildSupportTierModel({ goals, domainAdapterId: composer?.domainAdapter?.id || "", goalCapabilityStack: composer?.goalCapabilityStack || null });
  const conservativeComposer = composeGoalNativePlan({ goals, personalization: createPersonalization({ persona: { ...persona, preferredIntensity: "Conservative" }, includeMetrics: true, programs }), athleteProfile, momentum, learningLayer: {}, baseWeek: LAB_BASE_WEEK, currentWeek: LAB_CURRENT_WEEK, weekTemplates: LAB_WEEK_TEMPLATES, todayKey: LAB_TODAY_KEY, currentDayOfWeek: LAB_CURRENT_DAY_OF_WEEK });
  const aggressiveComposer = composeGoalNativePlan({ goals, personalization: createPersonalization({ persona: { ...persona, preferredIntensity: "Aggressive" }, includeMetrics: true, programs }), athleteProfile, momentum, learningLayer: {}, baseWeek: LAB_BASE_WEEK, currentWeek: LAB_CURRENT_WEEK, weekTemplates: LAB_WEEK_TEMPLATES, todayKey: LAB_TODAY_KEY, currentDayOfWeek: LAB_CURRENT_DAY_OF_WEEK });
  const skippedDateKey = "2026-04-16";
  const priorDayTraining = composeGoalNativePlan({ goals, personalization, athleteProfile, momentum, learningLayer: {}, baseWeek: LAB_BASE_WEEK, currentWeek: LAB_CURRENT_WEEK, weekTemplates: LAB_WEEK_TEMPLATES, todayKey: LAB_TODAY_KEY, currentDayOfWeek: LAB_CURRENT_DAY_OF_WEEK, plannedDayRecords: {}, logs: {} }).dayTemplates?.[4] || null;
  const workoutAdaptedComposer = composeGoalNativePlan({
    goals,
    personalization,
    athleteProfile,
    momentum,
    learningLayer: {},
    baseWeek: LAB_BASE_WEEK,
    currentWeek: LAB_CURRENT_WEEK,
    weekTemplates: LAB_WEEK_TEMPLATES,
    logs: { [skippedDateKey]: { checkin: { status: "skipped" } } },
    plannedDayRecords: priorDayTraining ? { [skippedDateKey]: buildPlannedDayRecord(skippedDateKey, priorDayTraining) } : {},
    todayKey: LAB_TODAY_KEY,
    currentDayOfWeek: LAB_CURRENT_DAY_OF_WEEK,
  });
  const nutritionAdaptedComposer = composeGoalNativePlan({
    goals,
    personalization,
    athleteProfile,
    momentum,
    learningLayer: {},
    baseWeek: LAB_BASE_WEEK,
    currentWeek: LAB_CURRENT_WEEK,
    weekTemplates: LAB_WEEK_TEMPLATES,
    weeklyNutritionReview: nutritionReview,
    todayKey: LAB_TODAY_KEY,
    currentDayOfWeek: LAB_CURRENT_DAY_OF_WEEK,
  });
  const coachAdaptedComposer = composeGoalNativePlan({
    goals,
    personalization,
    athleteProfile,
    momentum,
    learningLayer: {},
    baseWeek: LAB_BASE_WEEK,
    currentWeek: LAB_CURRENT_WEEK,
    weekTemplates: LAB_WEEK_TEMPLATES,
    coachActions: [{
      type: /strength|jump|power/.test(`${persona.strengthContext} ${persona.goalIntents.join(" ")}`.toLowerCase()) ? "PROGRESS_STRENGTH_EMPHASIS" : "REDUCE_WEEKLY_VOLUME",
      ts: Date.now(),
    }],
    todayKey: LAB_TODAY_KEY,
    currentDayOfWeek: LAB_CURRENT_DAY_OF_WEEK,
  });

  const checks = [
    { id: "profile_setup", subsystem: "auth_profile", passed: Boolean(personalization?.profile?.profileSetupComplete && personalization?.profile?.name && personalization?.profile?.timezone), detail: "Signup and immediate profile setup leave a usable planning identity." },
    { id: "goal_resolution", subsystem: "intake_planner", passed: goals.length > 0 || persona.goalIntents.length === 0, detail: "Goal resolution returns planning goals unless the persona is intentionally goal-free." },
    { id: "support_tier", subsystem: "support_tiers", passed: supportTier?.id === persona.supportTierExpectation, detail: `Expected ${persona.supportTierExpectation}, got ${supportTier?.id || "unknown"}.` },
    { id: "plan_generation", subsystem: "planner", passed: Boolean(composer?.programBlock && Object.keys(composer?.dayTemplates || {}).length > 0), detail: "The shared planner produced a program block and day templates." },
    { id: "today_useful", subsystem: "today", passed: Boolean(todayPlan?.label && todayPlan?.reason), detail: "Today returns a concrete label and a plain-English reason." },
    { id: "log_prepopulated", subsystem: "log", passed: Boolean(logDraft?.prescribedLabel || logDraft?.strength?.hasPrescribedStructure || logDraft?.run?.enabled), detail: "Log draft stays meaningfully pre-populated from the plan." },
    { id: "nutrition_daily", subsystem: "nutrition_daily", passed: Boolean(nutritionLayer?.targets?.cal && nutritionLayer?.explanation), detail: "Daily nutrition has a target and an explanation." },
    { id: "nutrition_weekly", subsystem: "nutrition_weekly", passed: Boolean(realWorldNutrition?.groceryHooks?.priorityItems?.length), detail: "Weekly grocery support returns priority items and carry-forward meal anchors." },
    { id: "future_weeks", subsystem: "program", passed: (rollingHorizon || []).length >= 6 && new Set((rollingHorizon || []).map((row) => row?.weekLabel || row?.planWeek?.label || "")).size >= 3, detail: "Program horizon shows multiple future weeks with readable variation." },
    { id: "metrics_override", subsystem: "metrics", passed: (metricsWithOverride?.missingCards?.length || 0) <= (metricsWithoutOverride?.missingCards?.length || 0), detail: "Adding metric overrides should not increase missing anchor count." },
    { id: "preference_diff", subsystem: "planner", passed: signatureOfTemplates(conservativeComposer?.dayTemplates) !== signatureOfTemplates(aggressiveComposer?.dayTemplates), detail: "Conservative and Aggressive should not collapse into the same week." },
    { id: "workout_adaptation", subsystem: "adaptation", passed: !priorDayTraining || signatureOfTemplates(composer?.dayTemplates) !== signatureOfTemplates(workoutAdaptedComposer?.dayTemplates), detail: "A skipped prior key session should visibly affect the current week when the planner can preserve it." },
    { id: "nutrition_adaptation", subsystem: "adaptation", passed: !nutritionReview?.adaptation?.shouldAdapt || signatureOfTemplates(composer?.dayTemplates) !== signatureOfTemplates(nutritionAdaptedComposer?.dayTemplates) || Boolean(nutritionAdaptedComposer?.changeSummary?.headline), detail: "Repeated nutrition issues should create a visible short-horizon protection signal." },
    { id: "coach_action", subsystem: "coach", passed: Boolean(coachAdaptedComposer?.changeSummary?.headline), detail: "Accepted coach actions should produce a deterministic change summary." },
    { id: "program_style", subsystem: "program_style", passed: (!persona.programId || composer?.planningBasis?.activeProgramId === persona.programId) && (!persona.styleId || composer?.planningBasis?.activeStyleId === persona.styleId), detail: "Selected Programs and Styles should appear in the live planning basis." },
    { id: "cloud_degraded", subsystem: "cloud", passed: classifyStorageError(new Error("fetch_timeout"))?.label === "SYNC RETRYING", detail: "Transient cloud failures classify as quiet local retry, not as a hard product failure." },
  ];

  const failures = checks.filter((check) => !check.passed).map((check) => ({
    clusterId: check.id,
    subsystem: check.subsystem,
    message: check.detail,
  }));
  const passedCount = checks.filter((check) => check.passed).length;
  const score = Number((passedCount / Math.max(1, checks.length)).toFixed(2));

  return {
    personaId: persona.id,
    name: persona.name,
    supportTierExpected: persona.supportTierExpectation,
    supportTierActual: supportTier?.id || "",
    score,
    passed: score >= 0.8,
    failures,
    checks,
    snapshots: {
      resolvedGoalCount: goals.length,
      todayLabel: todayPlan?.label || "",
      changeSummary: composer?.changeSummary?.surfaceLine || "",
      supportHeadline: supportTier?.headline || "",
      metricsMissingBefore: metricsWithoutOverride?.missingCards?.length || 0,
      metricsMissingAfter: metricsWithOverride?.missingCards?.length || 0,
      weeklyGroceryLine: realWorldNutrition?.summary || "",
      activeProgramId: composer?.planningBasis?.activeProgramId || "",
      activeStyleId: composer?.planningBasis?.activeStyleId || "",
    },
  };
};

export const runSyntheticAthleteLab = ({ personas = SYNTHETIC_ATHLETE_PERSONAS } = {}) => {
  const personaResults = (Array.isArray(personas) ? personas : []).map((persona) => runPersona(persona));
  const clustersById = new Map();
  const subsystemHeatmap = {};

  personaResults.forEach((result) => {
    (result.failures || []).forEach((failure) => {
      if (!clustersById.has(failure.clusterId)) {
        clustersById.set(failure.clusterId, {
          clusterId: failure.clusterId,
          subsystem: failure.subsystem,
          count: 0,
          personas: [],
          sampleMessage: failure.message,
        });
      }
      const cluster = clustersById.get(failure.clusterId);
      cluster.count += 1;
      cluster.personas.push(result.personaId);
      subsystemHeatmap[failure.subsystem] = (subsystemHeatmap[failure.subsystem] || 0) + 1;
    });
  });

  const themeSignatures = BRAND_THEME_IDS.map((themeId) => ({
    id: themeId,
    dark: `${buildBrandThemeState({ appearance: { theme: themeId, mode: "Dark" } }).cssVars["--bg"]}|${buildBrandThemeState({ appearance: { theme: themeId, mode: "Dark" } }).cssVars["--brand-accent"]}`,
    light: `${buildBrandThemeState({ appearance: { theme: themeId, mode: "Light" } }).cssVars["--bg"]}|${buildBrandThemeState({ appearance: { theme: themeId, mode: "Light" } }).cssVars["--brand-accent"]}`,
  }));

  return {
    summary: {
      personaCount: personaResults.length,
      passedCount: personaResults.filter((result) => result.passed).length,
      failedCount: personaResults.filter((result) => !result.passed).length,
      averageScore: Number((personaResults.reduce((sum, result) => sum + Number(result.score || 0), 0) / Math.max(1, personaResults.length)).toFixed(2)),
    },
    globalChecks: {
      transientCloudStatus: classifyStorageError(new Error("fetch_timeout")),
      themeCount: BRAND_THEME_IDS.length,
      distinctDarkThemes: new Set(themeSignatures.map((entry) => entry.dark)).size,
      distinctLightThemes: new Set(themeSignatures.map((entry) => entry.light)).size,
    },
    personaResults,
    clusters: [...clustersById.values()].sort((a, b) => b.count - a.count || a.clusterId.localeCompare(b.clusterId)),
    failsForWho: [...clustersById.values()]
      .sort((a, b) => b.count - a.count || a.clusterId.localeCompare(b.clusterId))
      .slice(0, 10)
      .map((cluster) => ({
        clusterId: cluster.clusterId,
        subsystem: cluster.subsystem,
        count: cluster.count,
        personas: cluster.personas.slice(0, 12),
      })),
    subsystemHeatmap,
  };
};
