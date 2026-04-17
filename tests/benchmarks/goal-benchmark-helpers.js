const {
  resolveGoalTranslation,
  buildPlanningGoalsFromResolvedGoals,
} = require("../../src/services/goal-resolution-service.js");
const {
  buildGoalTemplateSelection,
} = require("../../src/services/goal-template-catalog-service.js");
const {
  composeGoalNativePlan,
  buildRollingHorizonWeeks,
  normalizeGoals,
} = require("../../src/modules-planning.js");
const {
  findStructuredGoalIntentById,
} = require("../../src/data/goal-intents/index.js");
const {
  getNutritionDayTypeMeta,
} = require("../../src/services/nutrition-day-taxonomy-service.js");

const BENCHMARK_NOW = "2026-04-16";

const DEFAULT_BASE_WEEK = Object.freeze({
  phase: "BUILD",
  label: "Build",
  mon: { t: "Easy", d: "35 min" },
  thu: { t: "Tempo", d: "30 min" },
  fri: { t: "Easy", d: "30 min" },
  sat: { t: "Long", d: "60 min" },
  str: "A",
  nutri: "hardRun",
});

const DEFAULT_WEEK_TEMPLATES = Object.freeze([
  DEFAULT_BASE_WEEK,
  { phase: "BUILD", label: "Build 2", mon: { t: "Easy", d: "40 min" }, thu: { t: "Tempo", d: "34 min" }, fri: { t: "Easy", d: "35 min" }, sat: { t: "Long", d: "70 min" }, str: "B", nutri: "hardRun" },
  { phase: "PEAK", label: "Peak", mon: { t: "Easy", d: "35 min" }, thu: { t: "Intervals", d: "4 x 4 min" }, fri: { t: "Easy", d: "30 min" }, sat: { t: "Long", d: "75 min" }, str: "A", nutri: "hardRun" },
  { phase: "DELOAD", label: "Reset", mon: { t: "Easy", d: "25 min" }, thu: { t: "Steady", d: "20 min" }, fri: { t: "Easy", d: "20 min" }, sat: { t: "Long", d: "45 min" }, str: "A", nutri: "easyRun" },
]);

const CLONE = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const lower = (value = "") => sanitizeText(value, 220).toLowerCase();
const uniqueStrings = (values = []) => {
  const seen = new Set();
  return toArray(values)
    .map((value) => sanitizeText(value, 220))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const readMaybeValue = (value = null) => {
  if (value == null) return "";
  if (typeof value === "object" && value.value != null) return sanitizeText(value.value, 120);
  return sanitizeText(value, 120);
};

const APPROXIMATE_MINUTE_PATTERN = /(\d{1,3})\s*(?:min|mins|minute|minutes)\b/i;

const readApproximateMinutes = (text = "") => {
  const normalized = sanitizeText(text, 160);
  if (!normalized) return 0;
  const rangeMatch = normalized.match(/(\d{1,3})\s*-\s*(\d{1,3})\s*(?:min|mins|minute|minutes)\b/i);
  if (rangeMatch?.[1] && rangeMatch?.[2]) {
    return Math.round((Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2);
  }
  const minuteMatch = normalized.match(APPROXIMATE_MINUTE_PATTERN);
  if (minuteMatch?.[1]) return Number(minuteMatch[1]);
  const runClockMatch = normalized.match(/\b(\d{1,2}):(\d{2})\b/);
  if (runClockMatch?.[1]) return (Number(runClockMatch[1]) * 60) + Number(runClockMatch[2] || 0);
  return 0;
};

const buildTypedIntakePacket = (caseDef = {}) => {
  const fields = CLONE(caseDef.profile?.fields || {});
  const rawGoalText = sanitizeText(caseDef.rawGoalText || caseDef.goalText || "", 420);
  const templateSelection = caseDef.flow === "structured_intake" && caseDef.templateId
    ? buildGoalTemplateSelection({
        templateId: caseDef.templateId,
        specificityDefaults: CLONE(caseDef.specificityDefaults || {}),
      })
    : null;

  return {
    version: "2026-04-v1",
    intent: caseDef.flow === "goal_switch" ? "goal_change_preview" : "intake_interpretation",
    intake: {
      rawGoalText,
      baselineContext: {
        primaryGoalLabel: sanitizeText(caseDef.profile?.baselineLabel || "General Fitness", 80),
        currentBaseline: sanitizeText(caseDef.profile?.baselineContext || caseDef.profile?.baselineSummary || "General training background with some recent movement history.", 220),
      },
      scheduleReality: {
        trainingDaysPerWeek: Number(caseDef.profile?.schedule || caseDef.profile?.days || 4),
        sessionLength: sanitizeText(caseDef.profile?.sessionLength || "45 min", 80),
        trainingLocation: sanitizeText(caseDef.profile?.environment || caseDef.profile?.trainingLocation || "Mixed", 80),
      },
      equipmentAccessContext: {
        trainingLocation: sanitizeText(caseDef.profile?.environment || caseDef.profile?.trainingLocation || "Mixed", 80),
        equipment: CLONE(caseDef.profile?.equipment || []),
      },
      injuryConstraintContext: {
        injuryText: sanitizeText(caseDef.profile?.injuryText || "", 180),
        constraints: toArray(caseDef.profile?.injuryText).map((item) => sanitizeText(item, 180)).filter(Boolean),
      },
      userProvidedConstraints: {
        timingConstraints: toArray(caseDef.profile?.timingConstraints || []).map((item) => sanitizeText(item, 120)).filter(Boolean),
        appearanceConstraints: toArray(caseDef.profile?.appearanceConstraints || []).map((item) => sanitizeText(item, 120)).filter(Boolean),
        additionalContext: sanitizeText(caseDef.profile?.additionalContext || "", 220),
      },
      goalCompletenessContext: {
        fields,
      },
      ...(templateSelection ? { goalTemplateSelection: templateSelection } : {}),
    },
  };
};

const buildPersonalization = (caseDef = {}) => ({
  userGoalProfile: {
    days_per_week: Number(caseDef.profile?.schedule || caseDef.profile?.days || 4),
    session_length: sanitizeText(caseDef.profile?.sessionLength || "45 min", 80),
  },
  canonicalAthlete: {
    userProfile: {
      daysPerWeek: Number(caseDef.profile?.schedule || caseDef.profile?.days || 4),
      experienceLevel: sanitizeText(caseDef.profile?.experience || "unknown", 40).toLowerCase(),
    },
  },
  settings: {
    trainingPreferences: {
      intensityPreference: sanitizeText(caseDef.profile?.riskPosture || "", 40).toLowerCase() === "protective"
        ? "Conservative"
        : "Standard",
    },
  },
});

const mapResolvedGoalToDiscoveryFamily = (resolvedGoal = null) => {
  const discoveryFamily = sanitizeText(resolvedGoal?.goalDiscoveryFamilyId || "", 40).toLowerCase();
  if (discoveryFamily) return discoveryFamily;
  const structuredIntentId = sanitizeText(resolvedGoal?.structuredIntentId || "", 80).toLowerCase();
  if (structuredIntentId) {
    const intent = findStructuredGoalIntentById(structuredIntentId);
    if (intent?.familyId) return intent.familyId;
  }
  const goalFamily = sanitizeText(resolvedGoal?.goalFamily || "", 40).toLowerCase();
  const planningCategory = sanitizeText(resolvedGoal?.planningCategory || "", 40).toLowerCase();
  const primaryDomain = sanitizeText(resolvedGoal?.primaryDomain || "", 80).toLowerCase();
  if (goalFamily === "re_entry") return "re_entry";
  if (goalFamily === "hybrid") return "hybrid";
  if (goalFamily === "strength") return "strength";
  if (goalFamily === "body_comp" || goalFamily === "appearance") return "physique";
  if (goalFamily === "general_fitness") return "general_fitness";
  if (goalFamily === "athletic_power") return "hybrid";
  if (primaryDomain.includes("swimming") || primaryDomain.includes("cycling") || primaryDomain.includes("triathlon")) return "endurance";
  if (planningCategory === "running") return "endurance";
  if (planningCategory === "strength") return "strength";
  if (planningCategory === "body_comp") return "physique";
  return "general_fitness";
};

const classifyResolutionMode = ({ caseDef = {}, resolution = null } = {}) => {
  const resolvedGoals = toArray(resolution?.resolvedGoals);
  const primary = resolvedGoals[0] || null;
  if (!primary) return "missing";
  if (sanitizeText(primary?.planArchetypeId || "", 80)) return "structured_archetype";
  if (sanitizeText(primary?.structuredIntentId || "", 80)) return "structured_intent_only";
  if (resolvedGoals.length > 1) {
    return caseDef.allowLegacyMultiGoalCapture ? "legacy_multi_goal_acceptable" : "legacy_multi_goal";
  }
  return "unstructured_single_goal";
};

const collectSessionText = (session = null) => uniqueStrings([
  session?.label,
  session?.fallback,
  session?.run?.t,
  session?.run?.d,
  session?.swim?.focus,
  session?.swim?.d,
  session?.swim?.setLine,
  session?.strengthDose,
  session?.optionalSecondary,
  session?.power?.focus,
  session?.power?.dose,
  session?.power?.support,
]).join(" ").toLowerCase();

const classifySession = (session = null) => {
  if (!session) return { category: "empty", text: "" };
  const type = lower(session?.type || "");
  const text = collectSessionText(session);
  if (type === "rest" || type === "recovery" || session?.isRecoverySlot) return { category: "recovery", text };
  if (/run\+strength/.test(type)) return { category: "run_strength", text };
  if (/^swim-/.test(type) || /\bswim|pool|open water\b/.test(text)) return { category: "swim", text };
  if (/ride|cycling|bike|brick/.test(type) || /\bride|bike|cycling|brick|cadence\b/.test(text)) return { category: "ride", text };
  if (/long-run/.test(type) || /\blong run\b/.test(text)) return { category: "long_run", text };
  if (/hard-run/.test(type) || /\btempo|interval|threshold|race-pace|quality\b/.test(text)) return { category: "run_quality", text };
  if (/easy-run|run\+strength/.test(type) || /\brun\b/.test(text)) return { category: "run", text };
  if (/power|plyo|sprint-support/.test(type) || /\bjump|power|reactive|plyo|explosive\b/.test(text)) return { category: "power", text };
  if (/strength/.test(type) || /\bstrength|hypertrophy|press|squat|deadlift|bench|lift\b/.test(text)) return { category: "strength", text };
  if (/conditioning/.test(type) || /\bconditioning|aerobic|tempo\b/.test(text)) return { category: "conditioning", text };
  return { category: "other", text };
};

const analyzePlan = (composer = null, horizonRows = []) => {
  const sessions = Object.entries(composer?.dayTemplates || {})
    .map(([day, session]) => ({ day: Number(day), session, ...classifySession(session) }))
    .filter((entry) => entry.session);
  const counts = {
    total: sessions.length,
    nonRest: sessions.filter((entry) => entry.category !== "recovery").length,
    recovery: sessions.filter((entry) => entry.category === "recovery").length,
    run: sessions.filter((entry) => ["run", "run_quality", "long_run", "run_strength"].includes(entry.category)).length,
    runQuality: sessions.filter((entry) => entry.category === "run_quality").length,
    longRun: sessions.filter((entry) => entry.category === "long_run").length,
    swim: sessions.filter((entry) => entry.category === "swim").length,
    ride: sessions.filter((entry) => entry.category === "ride").length,
    strength: sessions.filter((entry) => ["strength", "run_strength"].includes(entry.category)).length,
    conditioning: sessions.filter((entry) => entry.category === "conditioning").length,
    power: sessions.filter((entry) => entry.category === "power").length,
  };
  const nutritionTypes = uniqueStrings(
    sessions
      .map((entry) => sanitizeText(entry?.session?.nutri || "", 80).toLowerCase())
      .filter(Boolean)
  );
  const nutritionDomains = uniqueStrings(nutritionTypes.map((type) => sanitizeText(getNutritionDayTypeMeta(type)?.domain || "", 40).toLowerCase()).filter(Boolean));
  const textCorpus = sessions.map((entry) => entry.text).join(" ");
  const maxApproxMinutes = Math.max(
    0,
    ...sessions.map((entry) => Math.max(
      readApproximateMinutes(entry?.session?.run?.d || ""),
      readApproximateMinutes(entry?.session?.swim?.d || ""),
      readApproximateMinutes(entry?.session?.strengthDose || ""),
      readApproximateMinutes(entry?.session?.fallback || ""),
      readApproximateMinutes(entry?.text || "")
    ))
  );
  const horizonFocusLines = toArray(horizonRows).map((row) => sanitizeText(row?.planWeek?.focus || row?.focus || "", 160)).filter(Boolean);
  return {
    sessions,
    counts,
    nutritionTypes,
    nutritionDomains,
    textCorpus,
    maxApproxMinutes,
    horizonFocusLines,
  };
};

const makeFailure = (code, detail) => ({ code, detail: sanitizeText(detail, 220) });

const deriveAcceptableIntentIds = (caseDef = {}) => {
  const expected = sanitizeText(caseDef.expectedIntentId || "", 80).toLowerCase();
  if (!expected) return [];
  const acceptable = new Set([expected]);
  if (expected === "build_consistency") acceptable.add("healthy_routine_fitness");
  if (expected === "healthy_routine_fitness") acceptable.add("build_consistency");
  if (expected === "restart_safely") acceptable.add("conservative_return");
  if (expected === "rebuild_routine") acceptable.add("ease_back_in");
  return [...acceptable];
};

const deriveAcceptableArchetypeIds = (caseDef = {}) => {
  const acceptable = new Set(toArray(caseDef.expectedArchetypeIds || []).map((value) => sanitizeText(value, 80).toLowerCase()).filter(Boolean));
  const tags = caseDef.tags || [];
  const expectedIntentId = sanitizeText(caseDef.expectedIntentId || "", 80).toLowerCase();
  if (expectedIntentId === "train_for_run_race" && tags.includes("improvement") && (tags.includes("partial") || tags.includes("protective"))) {
    if (acceptable.has("run_half_improvement_intermediate")) acceptable.add("run_half_completion_builder");
    if (acceptable.has("run_marathon_improvement_intermediate")) acceptable.add("run_marathon_completion_novice");
  }
  if (expectedIntentId === "swim_better" && acceptable.has("swim_endurance_improvement") && (tags.includes("partial") || tags.includes("protective"))) {
    acceptable.add("swim_fitness_base");
  }
  if (expectedIntentId === "swim_better" && acceptable.has("swim_fitness_base") && /\bendurance\b/.test(lower(caseDef.rawGoalText || ""))) {
    acceptable.add("swim_endurance_improvement");
  }
  if (expectedIntentId === "get_stronger") {
    acceptable.add("strength_beginner_barbell");
    acceptable.add("limited_equipment_strength");
  }
  if (expectedIntentId === "build_muscle") {
    acceptable.add("hypertrophy_full_gym_upper_lower");
    acceptable.add("hypertrophy_dumbbell_only");
  }
  if (expectedIntentId === "healthy_routine_fitness") acceptable.add("general_fitness_consistency");
  if (expectedIntentId === "build_consistency") {
    acceptable.add("general_fitness_consistency");
    acceptable.add("healthy_routine_busy");
  }
  return [...acceptable];
};

const evaluateExpectedResolution = ({ caseDef = {}, resolution = null, resolutionMode = "", primary = null } = {}) => {
  const failures = [];
  const actualFamily = mapResolvedGoalToDiscoveryFamily(primary);
  if (!caseDef.shouldRequireCustom && caseDef.expectedFamily && actualFamily !== caseDef.expectedFamily) {
    failures.push(makeFailure("wrong_family", `Expected ${caseDef.expectedFamily} but resolved to ${actualFamily || "unknown"}.`));
  }
  if (caseDef.expectedIntentId && sanitizeText(primary?.structuredIntentId || "", 80).toLowerCase()) {
    const acceptableIntentIds = deriveAcceptableIntentIds(caseDef);
    if (!acceptableIntentIds.includes(sanitizeText(primary?.structuredIntentId || "", 80).toLowerCase())) {
      failures.push(makeFailure("wrong_intent", `Expected ${caseDef.expectedIntentId} but resolved to ${primary?.structuredIntentId || "unknown"}.`));
    }
  }
  if (!caseDef.shouldRequireCustom) {
    if (resolutionMode === "missing" || resolutionMode === "unstructured_single_goal") {
      failures.push(makeFailure("inappropriate_custom_fallback", "A mainstream case collapsed out of the structured goal path."));
    }
    if (resolutionMode === "legacy_multi_goal" && !caseDef.allowLegacyMultiGoalCapture) {
      failures.push(makeFailure("legacy_flattening", "The case fell back to the older multi-goal lane instead of a flagship structured path."));
    }
  } else if (resolutionMode === "structured_archetype" || resolutionMode === "structured_intent_only") {
    failures.push(makeFailure("should_stay_custom", "This edge-case goal resolved into a flagship structured path even though it should stay custom or specialist-only."));
  }
  const expectedArchetypes = deriveAcceptableArchetypeIds(caseDef);
  if (expectedArchetypes.length && sanitizeText(primary?.planArchetypeId || "", 80)) {
    const actual = sanitizeText(primary.planArchetypeId, 80).toLowerCase();
    const matches = expectedArchetypes.some((candidate) => {
      const normalized = sanitizeText(candidate, 80).toLowerCase();
      return normalized.endsWith("*")
        ? actual.startsWith(normalized.slice(0, -1))
        : actual === normalized;
    });
    if (!matches) {
      failures.push(makeFailure("wrong_archetype", `Expected ${expectedArchetypes.join(", ")} but resolved to ${primary.planArchetypeId}.`));
    }
  }
  return failures;
};

const evaluateScheduleAndEquipment = ({ caseDef = {}, features = null } = {}) => {
  const failures = [];
  const schedule = Number(caseDef.profile?.schedule || caseDef.profile?.days || 0);
  if (schedule > 0 && Number(features?.counts?.nonRest || 0) > schedule + 1) {
    failures.push(makeFailure("schedule_overflow", `Week scheduled ${features.counts.nonRest} non-rest sessions against a ${schedule}-day reality.`));
  }
  if ((caseDef.tags || []).includes("limited_equipment") && /\bbarbell|rack|leg press|smith\b/.test(features?.textCorpus || "")) {
    failures.push(makeFailure("equipment_mismatch", "A limited-equipment case still assumes full-gym tools."));
  }
  if ((caseDef.tags || []).includes("dumbbell_only") && /\bbarbell|rack|deadlift platform\b/.test(features?.textCorpus || "")) {
    failures.push(makeFailure("dumbbell_bluff", "A dumbbell-only case still reads like a barbell plan."));
  }
  return failures;
};

const evaluateNutritionAlignment = ({ caseDef = {}, features = null } = {}) => {
  const failures = [];
  const tags = caseDef.tags || [];
  const isStrengthRetentionCut = tags.includes("maintenance_strength") && tags.includes("fat_loss");
  const isTriathlon = tags.includes("triathlon");
  if ((tags.includes("swim") || tags.includes("cycling") || tags.includes("triathlon")) && !features.nutritionTypes.length) {
    failures.push(makeFailure("nutrition_missing", "Endurance-oriented plans should carry nutrition day typing."));
  }
  if (tags.includes("run_race") && !features.nutritionTypes.some((type) => /run_/.test(type))) {
    failures.push(makeFailure("nutrition_run_mismatch", "Race-prep plans should include run-specific day fueling patterns."));
  }
  if (tags.includes("swim") && !features.nutritionTypes.some((type) => /^swim_/.test(type))) {
    failures.push(makeFailure("nutrition_swim_mismatch", "Swim plans should expose swim-specific day fueling patterns."));
  }
  if (tags.includes("strength") && !features.nutritionTypes.some((type) => type === "strength_support" || type === "hybrid_support")) {
    failures.push(makeFailure("nutrition_strength_mismatch", "Strength plans should protect lifting days nutritionally."));
  }
  if (
    tags.includes("hybrid")
    && !features.nutritionTypes.some((type) => type === "hybrid_support")
    && !(isTriathlon && features.nutritionTypes.some((type) => /^swim_/.test(type) || /^run_/.test(type) || type === "conditioning_mixed" || type === "strength_support"))
    && !(isStrengthRetentionCut && features.nutritionTypes.some((type) => type === "strength_support" || type === "conditioning_mixed"))
  ) {
    failures.push(makeFailure("nutrition_hybrid_mismatch", "Hybrid plans should show hybrid-aware fueling for the mixed-demand days."));
  }
  return failures;
};

const evaluateEnduranceHeuristics = ({ caseDef = {}, primary = null, features = null } = {}) => {
  const failures = [];
  const tags = caseDef.tags || [];
  const schedule = Number(caseDef.profile?.schedule || caseDef.profile?.days || 0);
  if (tags.includes("run_race")) {
    const minimumRunExposures = schedule <= 2 || tags.includes("protective") ? 2 : 3;
    if (features.counts.run < minimumRunExposures) failures.push(makeFailure("run_frequency_too_low", "Race plans should carry a believable number of explicit run exposures for the stated schedule."));
    if (tags.includes("needs_long_session") && features.counts.longRun < 1) failures.push(makeFailure("long_session_missing", "This event plan needs an obvious long-run lane."));
    if (tags.includes("improvement") && features.counts.runQuality < 1) failures.push(makeFailure("quality_missing", "Improvement race plans need a quality lane, not only easy work."));
    if (tags.includes("protective") && features.counts.runQuality > 1) failures.push(makeFailure("quality_density_too_high", "Protected running plans should not stack multiple quality exposures."));
  }
  if (tags.includes("swim")) {
    const minimumSwimSessions = schedule <= 2 ? 2 : 3;
    if (features.counts.swim < minimumSwimSessions) failures.push(makeFailure("swim_depth_missing", "Swim paths should include multiple actual swim sessions."));
    if ((schedule > 2 || tags.includes("improvement")) && !/\btechnique\b/.test(features.textCorpus)) failures.push(makeFailure("swim_technique_missing", "Swim plans should expose technique work explicitly."));
    if (!/\bendurance|threshold|aerobic\b/.test(features.textCorpus)) failures.push(makeFailure("swim_progression_shallow", "Swim plans should differentiate aerobic/endurance or threshold work."));
  }
  if (tags.includes("cycling")) {
    const minimumRideSessions = schedule <= 2 ? 2 : 3;
    if (features.counts.ride < minimumRideSessions) failures.push(makeFailure("ride_depth_missing", "Cycling plans should include multiple actual ride sessions."));
    if (!/\blong ride\b/.test(features.textCorpus)) failures.push(makeFailure("ride_long_missing", "Cycling plans should include a long ride."));
    if (!/\btempo|cadence|aerobic ride\b/.test(features.textCorpus)) failures.push(makeFailure("ride_taxonomy_shallow", "Cycling plans should differentiate ride types beyond generic conditioning."));
  }
  if (tags.includes("triathlon")) {
    if (!(features.counts.swim >= 1 && features.counts.ride >= 1 && features.counts.run >= 1)) {
      failures.push(makeFailure("tri_modality_gap", "Triathlon plans need visible swim, bike, and run exposures."));
    }
    if (!/\bbrick|transition\b/.test(features.textCorpus)) {
      failures.push(makeFailure("tri_brick_missing", "Triathlon plans should include a brick or transition-oriented session."));
    }
  }
  if (lower(primary?.goalFamily || "") === "re_entry" && features.counts.runQuality > 0) {
    failures.push(makeFailure("reentry_endurance_too_sharp", "Protected return plans should not start with quality-heavy endurance work."));
  }
  return failures;
};

const evaluateStrengthHeuristics = ({ caseDef = {}, features = null } = {}) => {
  const failures = [];
  const tags = caseDef.tags || [];
  if (tags.includes("strength") || tags.includes("hypertrophy") || tags.includes("maintenance_strength")) {
    if (features.counts.strength < 2) failures.push(makeFailure("strength_frequency_too_low", "Strength-oriented plans should keep at least two lifting exposures."));
  }
  if (tags.includes("hypertrophy") && !/\blower|upper|pump|hypertrophy\b/.test(features.textCorpus)) {
    failures.push(makeFailure("hypertrophy_signal_missing", "Muscle-gain plans should read like hypertrophy work, not generic strength maintenance."));
  }
  if (tags.includes("bench_focus")) {
    const benchHits = (features.textCorpus.match(/\bbench\b/g) || []).length;
    if (benchHits < 2) failures.push(makeFailure("bench_bias_missing", "Bench-focus plans should visibly bias bench work more than once."));
  }
  if (tags.includes("maintenance_strength") && !/\bmaintenance\b/.test(features.textCorpus)) {
    failures.push(makeFailure("maintenance_signal_missing", "Strength-maintenance plans should read clearly like maintenance, not full progression."));
  }
  return failures;
};

const evaluatePhysiqueHeuristics = ({ caseDef = {}, features = null } = {}) => {
  const failures = [];
  const tags = caseDef.tags || [];
  const isBodyCompCase = tags.includes("physique") || tags.includes("fat_loss") || tags.includes("recomp") || tags.includes("leaner") || tags.includes("event_cut");
  if (!isBodyCompCase) return failures;
  if ((tags.includes("fat_loss") || tags.includes("recomp") || tags.includes("leaner")) && features.counts.strength < 2) {
    failures.push(makeFailure("physique_strength_protection_missing", "Body-composition plans should keep enough strength work to protect muscle and performance."));
  }
  if (tags.includes("busy") && features.maxApproxMinutes > 40) {
    failures.push(makeFailure("busy_plan_too_long", "Busy-life physique plans should not default to long sessions."));
  }
  if (tags.includes("event_cut") && !/\bconditioning intervals|tempo conditioning|strength retention\b/.test(features.textCorpus)) {
    failures.push(makeFailure("event_cut_structure_shallow", "Event cuts need visible strength-retention and controlled conditioning structure."));
  }
  if (tags.includes("recomp") && /\bretention only\b/.test(features.textCorpus)) {
    failures.push(makeFailure("recomp_too_passive", "Recomp plans should not read like pure maintenance."));
  }
  return failures;
};

const evaluateGeneralFitnessHeuristics = ({ caseDef = {}, features = null } = {}) => {
  const failures = [];
  const tags = caseDef.tags || [];
  if (tags.includes("general_fitness") && features.counts.nonRest > 5) {
    failures.push(makeFailure("general_fitness_overbuilt", "General-fitness plans should stay compact and adherable."));
  }
  if (tags.includes("consistency") && /\bthreshold|race-pace|brick\b/.test(features.textCorpus)) {
    failures.push(makeFailure("consistency_too_specialized", "Consistency-focused users should not get specialist endurance structure they did not ask for."));
  }
  return failures;
};

const evaluateReEntryHeuristics = ({ caseDef = {}, features = null } = {}) => {
  const failures = [];
  const tags = caseDef.tags || [];
  if (!tags.includes("re_entry")) return failures;
  if (features.maxApproxMinutes > 40) failures.push(makeFailure("reentry_session_too_long", "Re-entry plans should start with finishable session lengths."));
  if (features.counts.recovery < 2) failures.push(makeFailure("reentry_recovery_too_sparse", "Re-entry plans should preserve clear recovery space."));
  if (/\btempo|interval|threshold|reactive\b/.test(features.textCorpus)) failures.push(makeFailure("reentry_too_aggressive", "Re-entry plans should avoid sharp intensity language up front."));
  return failures;
};

const evaluateHybridHeuristics = ({ caseDef = {}, primary = null, resolutionMode = "", resolution = null, features = null } = {}) => {
  const failures = [];
  const tags = caseDef.tags || [];
  if (!tags.includes("hybrid")) return failures;
  if (tags.includes("triathlon")) return failures;
  const isStrengthRetentionCut = tags.includes("maintenance_strength") && tags.includes("fat_loss");
  const isLowScheduleHybrid = Number(features?.counts?.nonRest || 0) <= 2;
  const isRunLiftPriority = ["run_lift_running_priority", "run_lift_strength_priority"].includes(primary?.planArchetypeId || "");
  const requiredEnduranceLanes = isStrengthRetentionCut
    ? tags.includes("busy") ? 0 : 1
    : isLowScheduleHybrid ? 1 : 2;
  if (features.counts.strength < 1 || (features.counts.run + features.counts.ride + features.counts.swim + features.counts.conditioning) < requiredEnduranceLanes) {
    failures.push(makeFailure("hybrid_lane_missing", "Hybrid plans should visibly keep both lanes alive."));
  }
  if (tags.includes("run_priority") && isRunLiftPriority) {
    if (features.counts.longRun < 1) failures.push(makeFailure("hybrid_run_priority_missing_long_run", "Run-priority hybrids should still protect the long run or main endurance anchor."));
    if (!/\bmaintenance strength|strength support\b/.test(features.textCorpus)) failures.push(makeFailure("hybrid_run_priority_strength_signal_missing", "Run-priority hybrids should keep strength explicitly subordinate, not invisible."));
  }
  if (tags.includes("strength_priority") && isRunLiftPriority) {
    if (features.counts.strength < 2) failures.push(makeFailure("hybrid_strength_priority_missing_strength", "Strength-priority hybrids should visibly protect multiple lifting touches."));
    if (/\blong run\b/.test(features.textCorpus)) failures.push(makeFailure("hybrid_strength_priority_too_run_heavy", "Strength-priority hybrids should not read like race prep."));
  }
  if (resolutionMode === "legacy_multi_goal_acceptable") {
    const categories = uniqueStrings(toArray(resolution?.resolvedGoals).map((goal) => sanitizeText(goal?.planningCategory || "", 40).toLowerCase()));
    if (categories.length < 2) failures.push(makeFailure("legacy_tradeoff_flattened", "A legacy multi-goal case should still preserve more than one live lane."));
  }
  if (!uniqueStrings(toArray(primary?.tradeoffs || [])).length && !/\bprotect|interference|subordinate|supportive\b/.test(features.textCorpus)) {
    failures.push(makeFailure("hybrid_tradeoff_signal_missing", "Hybrid plans should make the tradeoff posture legible."));
  }
  return failures;
};

const evaluatePlanHeuristics = ({ caseDef = {}, resolution = null, resolutionMode = "", composer = null, horizonRows = [] } = {}) => {
  const primary = toArray(resolution?.resolvedGoals)[0] || null;
  const features = analyzePlan(composer, horizonRows);
  const failures = [
    ...evaluateScheduleAndEquipment({ caseDef, features }),
    ...evaluateNutritionAlignment({ caseDef, features }),
    ...evaluateEnduranceHeuristics({ caseDef, primary, features }),
    ...evaluateStrengthHeuristics({ caseDef, features }),
    ...evaluatePhysiqueHeuristics({ caseDef, features }),
    ...evaluateGeneralFitnessHeuristics({ caseDef, features }),
    ...evaluateReEntryHeuristics({ caseDef, features }),
    ...evaluateHybridHeuristics({ caseDef, primary, resolutionMode, resolution, features }),
  ];
  return {
    failures,
    features,
    score: Math.max(0, 100 - (failures.length * 12)),
  };
};

const buildBenchmarkPlan = (caseDef = {}, resolution = null) => {
  const resolvedGoals = toArray(resolution?.resolvedGoals).filter(Boolean);
  if (!resolvedGoals.length) return { planningGoals: [], composer: null, horizonRows: [] };
  const planningGoals = normalizeGoals(buildPlanningGoalsFromResolvedGoals({ resolvedGoals }));
  const composer = composeGoalNativePlan({
    goals: planningGoals,
    personalization: buildPersonalization(caseDef),
    momentum: { inconsistencyRisk: "low", momentumState: "stable" },
    learningLayer: {},
    baseWeek: DEFAULT_BASE_WEEK,
    currentWeek: 1,
    weekTemplates: DEFAULT_WEEK_TEMPLATES,
    logs: {},
    bodyweights: [],
    dailyCheckins: {},
    nutritionActualLogs: {},
    weeklyNutritionReview: null,
    coachActions: [],
    todayKey: BENCHMARK_NOW,
    currentDayOfWeek: 4,
    plannedDayRecords: {},
    planWeekRecords: {},
  });
  const horizonRows = buildRollingHorizonWeeks({
    currentWeek: 1,
    horizonWeeks: 4,
    goals: planningGoals,
    weekTemplates: DEFAULT_WEEK_TEMPLATES,
    architecture: composer.architecture,
    programBlock: composer.programBlock,
    programContext: composer.programContext,
    blockIntent: composer.blockIntent,
    split: composer.split,
    sessionsByDay: composer.dayTemplates,
    referenceTemplate: DEFAULT_BASE_WEEK,
    momentum: { inconsistencyRisk: "low", momentumState: "stable" },
    learningLayer: {},
    constraints: composer.constraints || [],
  });
  return { planningGoals, composer, horizonRows };
};

const evaluateBenchmarkCase = (caseDef = {}) => {
  const typedIntakePacket = buildTypedIntakePacket(caseDef);
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: sanitizeText(caseDef.rawGoalText || caseDef.goalText || "", 420),
    typedIntakePacket,
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true, source: caseDef.flow === "goal_switch" ? "goal_change_preview" : "structured_intake" },
    now: BENCHMARK_NOW,
  });
  const primary = toArray(resolution?.resolvedGoals)[0] || null;
  const resolutionMode = classifyResolutionMode({ caseDef, resolution });
  const { planningGoals, composer, horizonRows } = buildBenchmarkPlan(caseDef, resolution);
  const resolutionFailures = evaluateExpectedResolution({ caseDef, resolution, resolutionMode, primary });
  const planEvaluation = composer
    ? evaluatePlanHeuristics({ caseDef, resolution, resolutionMode, composer, horizonRows })
    : { failures: [makeFailure("plan_missing", "No plan could be generated for the resolved goal bundle.")], features: null, score: 0 };
  return {
    caseId: caseDef.id,
    flow: caseDef.flow,
    shouldRequireCustom: Boolean(caseDef.shouldRequireCustom),
    expectedFamily: caseDef.expectedFamily,
    resolution,
    resolutionMode,
    primary,
    planningGoals,
    composer,
    horizonRows,
    failures: [...resolutionFailures, ...planEvaluation.failures],
    planScore: planEvaluation.score,
    features: planEvaluation.features,
  };
};

const summarizeBenchmark = (cases = [], evaluations = []) => {
  const mainstreamCases = cases.filter((caseDef) => !caseDef.shouldRequireCustom);
  const edgeCases = cases.filter((caseDef) => caseDef.shouldRequireCustom);
  const evaluationById = new Map(evaluations.map((entry) => [entry.caseId, entry]));
  const evaluateSubset = (subset = []) => subset.map((caseDef) => evaluationById.get(caseDef.id)).filter(Boolean);
  const mainstreamEvals = evaluateSubset(mainstreamCases);
  const edgeEvals = evaluateSubset(edgeCases);
  const structuredMainstream = mainstreamEvals.filter((entry) => entry.resolutionMode === "structured_archetype" || entry.resolutionMode === "structured_intent_only");
  const inappropriateCustomFallbacks = mainstreamEvals.filter((entry) => entry.failures.some((failure) => failure.code === "inappropriate_custom_fallback"));
  const appropriateCustom = edgeEvals.filter((entry) => !["structured_archetype", "structured_intent_only"].includes(entry.resolutionMode));
  const mainstreamFailureCounts = {};
  const edgeFailureCounts = {};
  const archetypeCounts = {};
  const familySummary = {};
  evaluations.forEach((entry) => {
    const targetFailureCounts = entry.shouldRequireCustom ? edgeFailureCounts : mainstreamFailureCounts;
    toArray(entry.failures).forEach((failure) => {
      targetFailureCounts[failure.code] = (targetFailureCounts[failure.code] || 0) + 1;
    });
    const archetypeId = sanitizeText(entry.primary?.planArchetypeId || "", 80);
    if (archetypeId) archetypeCounts[archetypeId] = (archetypeCounts[archetypeId] || 0) + 1;
    const family = sanitizeText(entry.expectedFamily || mapResolvedGoalToDiscoveryFamily(entry.primary), 40) || "unknown";
    if (!familySummary[family]) {
      familySummary[family] = {
        total: 0,
        structured: 0,
        planQualityPass: 0,
        fallback: 0,
      };
    }
    familySummary[family].total += 1;
    if (["structured_archetype", "structured_intent_only"].includes(entry.resolutionMode)) familySummary[family].structured += 1;
    if (!entry.failures.some((failure) => failure.code === "inappropriate_custom_fallback")) familySummary[family].fallback += 1;
    if (!entry.failures.length) familySummary[family].planQualityPass += 1;
  });
  const topFailureModes = Object.entries(mainstreamFailureCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([code, count]) => ({ code, count }));
  const edgeFailureModes = Object.entries(edgeFailureCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([code, count]) => ({ code, count }));
  const archetypeDistribution = Object.entries(archetypeCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 20)
    .map(([archetypeId, count]) => ({ archetypeId, count }));
  return {
    totalCases: cases.length,
    mainstreamCases: mainstreamCases.length,
    edgeCases: edgeCases.length,
    structuredResolutionRate: mainstreamCases.length ? structuredMainstream.length / mainstreamCases.length : 0,
    inappropriateCustomFallbackRate: mainstreamCases.length ? inappropriateCustomFallbacks.length / mainstreamCases.length : 0,
    appropriateCustomRate: edgeCases.length ? appropriateCustom.length / edgeCases.length : 0,
    averagePlanScore: evaluations.length
      ? evaluations.reduce((sum, entry) => sum + Number(entry.planScore || 0), 0) / evaluations.length
      : 0,
    familySummary,
    topFailureModes,
    edgeFailureModes,
    archetypeDistribution,
  };
};

let cachedBenchmarkReport = null;

const runGoalBenchmark = (cases = []) => {
  const evaluations = cases.map((caseDef) => evaluateBenchmarkCase(caseDef));
  const summary = summarizeBenchmark(cases, evaluations);
  return { cases, evaluations, summary };
};

const getCachedGoalBenchmarkReport = (cases = []) => {
  if (!cachedBenchmarkReport) {
    cachedBenchmarkReport = runGoalBenchmark(cases);
  }
  return cachedBenchmarkReport;
};

module.exports = {
  BENCHMARK_NOW,
  DEFAULT_BASE_WEEK,
  DEFAULT_WEEK_TEMPLATES,
  analyzePlan,
  buildTypedIntakePacket,
  classifyResolutionMode,
  evaluateBenchmarkCase,
  evaluatePlanHeuristics,
  getCachedGoalBenchmarkReport,
  mapResolvedGoalToDiscoveryFamily,
  runGoalBenchmark,
};
