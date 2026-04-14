import { buildProvenanceEvent, PROVENANCE_ACTORS } from "./services/provenance-service.js";

export const AI_PACKET_VERSION = "2026-04-v1";

export const AI_PACKET_INTENTS = {
  coachChat: "coach_chat",
  planAnalysis: "plan_analysis",
  intakeInterpretation: "intake_interpretation",
  intakeFieldExtraction: "intake_field_extraction",
  intakeCoachVoice: "intake_coach_voice",
};

const clonePlainValueAiState = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const sanitizeTextAiState = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const clampNumberAiState = (value, min, max, fallback = min) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
};

const sortEntriesByDate = (collection = {}) => Object.entries(collection || {})
  .filter(([dateKey]) => Boolean(dateKey))
  .sort((a, b) => a[0].localeCompare(b[0]));

const compactTrainingShape = (training = null) => {
  if (!training) return null;
  return clonePlainValueAiState({
    label: training?.label || "",
    type: training?.type || "",
    run: training?.run || null,
    strengthTrack: training?.strengthTrack || "",
    strengthDuration: training?.strengthDuration || "",
    success: training?.success || "",
    fallback: training?.fallback || "",
    minDay: Boolean(training?.minDay),
    readinessState: training?.readinessState || "",
    recoveryRecommendation: training?.recoveryRecommendation || "",
    environmentNote: training?.environmentNote || "",
    nutri: training?.nutri || "",
  });
};

const compactSessionsByDay = (sessionsByDay = {}) => {
  return clonePlainValueAiState(
    Object.fromEntries(
      Object.entries(sessionsByDay || {}).map(([dayKey, session]) => [
        dayKey,
        compactTrainingShape(session),
      ])
    )
  );
};

const compactProgramBlock = (programBlock = null) => {
  if (!programBlock) return null;
  return clonePlainValueAiState({
    id: programBlock?.id || "",
    label: programBlock?.label || "",
    architecture: programBlock?.architecture || "",
    phase: programBlock?.phase || "",
    window: programBlock?.window || null,
    dominantEmphasis: programBlock?.dominantEmphasis || null,
    secondaryEmphasis: programBlock?.secondaryEmphasis || null,
    recoveryPosture: programBlock?.recoveryPosture || null,
    nutritionPosture: programBlock?.nutritionPosture || null,
    successCriteria: (programBlock?.successCriteria || []).slice(0, 4),
    constraints: (programBlock?.constraints || []).slice(0, 5),
    tradeoffs: (programBlock?.tradeoffs || []).slice(0, 5),
    goalAllocation: programBlock?.goalAllocation || null,
    summary: programBlock?.summary || "",
  });
};

const compactPlanDay = (planDay = null) => {
  if (!planDay) return null;
  return clonePlainValueAiState({
    id: planDay?.id || "",
    dateKey: planDay?.dateKey || "",
    dayOfWeek: planDay?.dayOfWeek ?? null,
    decision: planDay?.decision || null,
    flags: planDay?.flags || null,
    week: {
      currentWeek: planDay?.week?.currentWeek || null,
      phase: planDay?.week?.phase || "",
      label: planDay?.week?.label || "",
      status: planDay?.week?.status || "",
      adjusted: Boolean(planDay?.week?.adjusted),
      summary: planDay?.week?.summary || "",
      constraints: planDay?.week?.constraints || [],
      successDefinition: planDay?.week?.successDefinition || "",
      programBlock: compactProgramBlock(planDay?.week?.programBlock || null),
      weeklyIntent: planDay?.week?.weeklyIntent || null,
    },
    base: {
      training: compactTrainingShape(planDay?.base?.training || null),
      nutrition: planDay?.base?.nutrition || null,
      recovery: planDay?.base?.recovery || null,
      supplements: planDay?.base?.supplements || null,
      logging: planDay?.base?.logging || null,
    },
    resolved: {
      training: compactTrainingShape(planDay?.resolved?.training || null),
      nutrition: planDay?.resolved?.nutrition || null,
      recovery: planDay?.resolved?.recovery || null,
      supplements: planDay?.resolved?.supplements || null,
      logging: planDay?.resolved?.logging || null,
    },
    provenance: planDay?.provenance || null,
  });
};

const compactPlanWeek = (planWeek = null) => {
  if (!planWeek) return null;
  return clonePlainValueAiState({
    id: planWeek?.id || "",
    weekNumber: planWeek?.weekNumber || null,
    absoluteWeek: planWeek?.absoluteWeek || null,
    phase: planWeek?.phase || "",
    label: planWeek?.label || "",
    status: planWeek?.status || "",
    adjusted: Boolean(planWeek?.adjusted),
    summary: planWeek?.summary || "",
    constraints: planWeek?.constraints || [],
    programBlock: compactProgramBlock(planWeek?.programBlock || null),
    weeklyIntent: planWeek?.weeklyIntent || null,
    sessionsByDay: compactSessionsByDay(planWeek?.sessionsByDay || {}),
  });
};

const buildRecentSessions = (logs = {}, limit = 7) => sortEntriesByDate(logs)
  .slice(-Math.max(1, limit))
  .map(([dateKey, log]) => ({
    dateKey,
    label: sanitizeTextAiState(log?.type || log?.label || "Session", 80),
    status: sanitizeTextAiState(log?.actualSession?.status || log?.checkin?.status || "", 40),
    feel: Number(log?.feel || 0) || null,
    miles: Number(log?.miles || 0) || null,
    pace: sanitizeTextAiState(log?.pace || "", 24),
    note: sanitizeTextAiState(log?.notes || "", 140),
    comparison: clonePlainValueAiState(log?.comparison || null),
  }));

const buildRecentCheckins = (dailyCheckins = {}, limit = 7) => sortEntriesByDate(dailyCheckins)
  .slice(-Math.max(1, limit))
  .map(([dateKey, checkin]) => ({
    dateKey,
    status: sanitizeTextAiState(checkin?.status || "", 40),
    sessionFeel: sanitizeTextAiState(checkin?.sessionFeel || "", 40),
    blocker: sanitizeTextAiState(checkin?.blocker || "", 40),
    readiness: clonePlainValueAiState(checkin?.readiness || {}),
  }));

const buildRecentNutritionLogs = (nutritionActualLogs = {}, limit = 7) => sortEntriesByDate(nutritionActualLogs)
  .slice(-Math.max(1, limit))
  .map(([dateKey, log]) => ({
    dateKey,
    quickStatus: sanitizeTextAiState(log?.quickStatus || "", 40),
    adherence: sanitizeTextAiState(log?.adherence || "", 40),
    deviationKind: sanitizeTextAiState(log?.deviationKind || "", 40),
    issue: sanitizeTextAiState(log?.issue || "", 60),
    note: sanitizeTextAiState(log?.note || "", 120),
    hydration: clonePlainValueAiState(log?.hydration || null),
    supplements: clonePlainValueAiState(log?.supplements || null),
  }));

const buildRecentBodyweights = (bodyweights = [], limit = 6) => (Array.isArray(bodyweights) ? bodyweights : [])
  .slice(-Math.max(1, limit))
  .map((row) => ({
    date: row?.date || row?.d || "",
    weight: Number(row?.w || row?.weight || 0) || null,
  }));

const buildGoalsSnapshot = (goals = []) => (Array.isArray(goals) ? goals : [])
  .filter((goal) => goal?.active)
  .slice(0, 5)
  .map((goal) => ({
    id: goal?.id || "",
    name: sanitizeTextAiState(goal?.name || "", 120),
    category: sanitizeTextAiState(goal?.category || "", 40),
    priority: Number(goal?.priority || 0) || null,
    horizon: sanitizeTextAiState(goal?.horizon || "", 40),
    target: sanitizeTextAiState(goal?.target || goal?.metric || "", 120),
    deadline: goal?.deadline || goal?.targetDate || "",
    status: sanitizeTextAiState(goal?.status || "", 40),
  }));

const sanitizePaceValue = (value = "") => {
  const text = sanitizeTextAiState(value, 24);
  if (!text) return "";
  return /^[0-9:\/\-\u2013\u2014 .mi]+$/i.test(text) ? text : "";
};

const compactIntakeContext = (intakeContext = {}) => {
  const baseline = intakeContext?.baselineContext || {};
  const schedule = intakeContext?.scheduleReality || {};
  const equipment = intakeContext?.equipmentAccessContext || {};
  const injury = intakeContext?.injuryConstraintContext || {};
  const userConstraints = intakeContext?.userProvidedConstraints || {};

  return clonePlainValueAiState({
    rawGoalText: sanitizeTextAiState(intakeContext?.rawGoalText || "", 320),
    baselineContext: {
      primaryGoalKey: sanitizeTextAiState(baseline?.primaryGoalKey || "", 40),
      primaryGoalLabel: sanitizeTextAiState(baseline?.primaryGoalLabel || "", 80),
      experienceLevel: sanitizeTextAiState(baseline?.experienceLevel || "", 40),
      fitnessLevel: sanitizeTextAiState(baseline?.fitnessLevel || "", 40),
      startingFresh: Boolean(baseline?.startingFresh),
      currentBaseline: sanitizeTextAiState(baseline?.currentBaseline || "", 180),
      priorMemory: (Array.isArray(baseline?.priorMemory) ? baseline.priorMemory : [])
        .slice(-6)
        .map((item) => sanitizeTextAiState(item, 120))
        .filter(Boolean),
    },
    scheduleReality: {
      trainingDaysPerWeek: clampNumberAiState(schedule?.trainingDaysPerWeek, 0, 14, 0),
      sessionLength: sanitizeTextAiState(schedule?.sessionLength || "", 40),
      trainingLocation: sanitizeTextAiState(schedule?.trainingLocation || "", 60),
      scheduleNotes: sanitizeTextAiState(schedule?.scheduleNotes || "", 180),
    },
    equipmentAccessContext: {
      trainingLocation: sanitizeTextAiState(equipment?.trainingLocation || schedule?.trainingLocation || "", 60),
      equipment: (Array.isArray(equipment?.equipment) ? equipment.equipment : [])
        .slice(0, 8)
        .map((item) => sanitizeTextAiState(item, 40))
        .filter(Boolean),
      accessNotes: sanitizeTextAiState(equipment?.accessNotes || "", 140),
    },
    injuryConstraintContext: {
      injuryText: sanitizeTextAiState(injury?.injuryText || "", 180),
      constraints: (Array.isArray(injury?.constraints) ? injury.constraints : [])
        .slice(0, 6)
        .map((item) => sanitizeTextAiState(item, 120))
        .filter(Boolean),
    },
    userProvidedConstraints: {
      timingConstraints: (Array.isArray(userConstraints?.timingConstraints) ? userConstraints.timingConstraints : [])
        .slice(0, 4)
        .map((item) => sanitizeTextAiState(item, 120))
        .filter(Boolean),
      appearanceConstraints: (Array.isArray(userConstraints?.appearanceConstraints) ? userConstraints.appearanceConstraints : [])
        .slice(0, 4)
        .map((item) => sanitizeTextAiState(item, 120))
        .filter(Boolean),
      additionalContext: sanitizeTextAiState(userConstraints?.additionalContext || "", 180),
    },
  });
};

export const buildAiStatePacket = ({
  intent = AI_PACKET_INTENTS.coachChat,
  input = "",
  dateKey = "",
  currentWeek = 1,
  canonicalGoalState = {},
  canonicalUserProfile = {},
  goals = [],
  planDay = null,
  planWeek = null,
  logs = {},
  dailyCheckins = {},
  nutritionActualLogs = {},
  bodyweights = [],
  momentum = {},
  expectations = {},
  strengthLayer = {},
  optimizationLayer = {},
  failureMode = {},
  readiness = null,
  nutritionComparison = null,
  arbitration = {},
  memoryInsights = [],
  coachMemoryContext = null,
  weekNotes = {},
  paceOverrides = {},
  planAlerts = [],
  recentWindow = 7,
  intakeContext = null,
} = {}) => {
  const compactDay = compactPlanDay(planDay);
  const compactWeek = compactPlanWeek(planWeek || planDay?.week?.planWeek || null);
  const goalsSnapshot = buildGoalsSnapshot(goals);
  const readinessSummary = clonePlainValueAiState(readiness || planDay?.resolved?.recovery || null);
  const nutritionSummary = clonePlainValueAiState(nutritionComparison || planDay?.resolved?.nutrition?.comparison || null);
  const availablePacePhases = Array.from(new Set([
    ...Object.keys(paceOverrides || {}),
    compactWeek?.phase || "",
    compactDay?.week?.phase || "",
  ].filter(Boolean)));

  return {
    version: AI_PACKET_VERSION,
    intent,
    generatedAt: new Date().toISOString(),
    scope: {
      dateKey: dateKey || compactDay?.dateKey || "",
      currentWeek: Number(currentWeek) || compactWeek?.weekNumber || compactDay?.week?.currentWeek || 1,
      input: sanitizeTextAiState(input, 280),
    },
    canonical: {
      goalState: clonePlainValueAiState({
        primaryGoal: canonicalGoalState?.primaryGoal || "",
        deadline: canonicalGoalState?.deadline || "",
        planStartDate: canonicalGoalState?.planStartDate || "",
      }),
      userProfile: clonePlainValueAiState({
        name: canonicalUserProfile?.name || canonicalUserProfile?.profile?.name || "",
        fitnessLevel: canonicalUserProfile?.fitnessLevel || canonicalUserProfile?.profile?.fitnessLevel || "",
        equipmentAccess: canonicalUserProfile?.equipmentAccess || canonicalUserProfile?.environment?.equipment || [],
        constraints: canonicalUserProfile?.constraints || canonicalUserProfile?.scheduleConstraints || [],
        preferences: canonicalUserProfile?.preferences || {},
      }),
      goals: goalsSnapshot,
      programBlock: clonePlainValueAiState(compactWeek?.programBlock || compactDay?.week?.programBlock || null),
      weeklyIntent: clonePlainValueAiState(compactWeek?.weeklyIntent || compactDay?.week?.weeklyIntent || null),
      planWeek: compactWeek,
      planDay: compactDay,
    },
    actuals: {
      recentSessions: buildRecentSessions(logs, recentWindow),
      recentCheckins: buildRecentCheckins(dailyCheckins, recentWindow),
      recentNutrition: buildRecentNutritionLogs(nutritionActualLogs, recentWindow),
      recentBodyweights: buildRecentBodyweights(bodyweights, 6),
    },
    summaries: {
      readiness: clonePlainValueAiState(readinessSummary),
      adherence: clonePlainValueAiState({
        momentumState: momentum?.momentumState || "",
        completionRate: Number(momentum?.completionRate || 0) || 0,
        score: Number(momentum?.score || 0) || 0,
        inconsistencyRisk: momentum?.inconsistencyRisk || "",
        logGapDays: Number(momentum?.logGapDays || 0) || 0,
      }),
      progression: clonePlainValueAiState({
        strengthFocus: strengthLayer?.focus || "",
        planFocus: strengthLayer?.planFocus || "",
        adjustmentBias: optimizationLayer?.adjustmentBias || "",
        experimentationReady: Boolean(optimizationLayer?.experimentation?.canExperiment),
        pendingExperiment: optimizationLayer?.experimentation?.pendingExperiment || "",
      }),
      nutrition: clonePlainValueAiState({
        comparison: nutritionSummary,
      }),
      arbitration: clonePlainValueAiState({
        primary: arbitration?.primary || null,
        todayLine: arbitration?.todayLine || "",
      }),
      expectations: clonePlainValueAiState({
        coachLine: expectations?.coachLine || "",
        rationale: expectations?.rationale || "",
      }),
      failureMode: clonePlainValueAiState({
        mode: failureMode?.mode || "normal",
        isLowEngagement: Boolean(failureMode?.isLowEngagement),
        isReEntry: Boolean(failureMode?.isReEntry),
      }),
      provenance: clonePlainValueAiState({
        summary: compactDay?.provenance?.summary || "",
        keyDrivers: compactDay?.provenance?.keyDrivers || [],
        events: compactDay?.provenance?.events || [],
      }),
      memory: clonePlainValueAiState({
        insights: (memoryInsights || []).slice(0, 4),
        coachMemory: coachMemoryContext ? {
          preferredMotivationStyle: coachMemoryContext?.preferredMotivationStyle || "",
          injuryHistory: (coachMemoryContext?.injuryHistory || []).slice(0, 3),
          recurringBreakdowns: (coachMemoryContext?.recurringBreakdowns || []).slice(0, 3),
        } : null,
      }),
    },
    planningContext: {
      paceOverrides: clonePlainValueAiState(paceOverrides || {}),
      weekNotes: clonePlainValueAiState(weekNotes || {}),
      alerts: clonePlainValueAiState((planAlerts || []).slice(0, 6)),
      availablePacePhases,
    },
    intake: compactIntakeContext(intakeContext || {}),
    boundaries: {
      sourceOfTruth: "canonical_app_state",
      mutationPolicy: "acceptance_only",
      aiMay: ["explain", "summarize", "propose"],
      aiMayNot: ["directly_mutate_plan", "directly_mutate_logs", "be_source_of_truth"],
    },
  };
};

export const parseAiJsonObjectFromText = (text = "") => {
  const cleaned = String(text || "").replace(/```json|```/gi, "").trim();
  if (!cleaned) return null;
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const stringifyPacketForPrompt = (packet = null) => {
  try {
    return JSON.stringify(packet || {});
  } catch {
    return "{}";
  }
};

export const buildCoachAiSystemPrompt = ({ statePacket = null } = {}) => `You are an adaptive fitness coach inside a personal training app.
Your source of truth is the typed AI state packet below.
The packet is derived from canonical app state. Do not invent workouts, logs, readiness, or nutrition facts outside it.
You may explain, summarize, and suggest. You may not return machine-action proposals or act as the system of record.
Any plan, nutrition, or recovery change must be phrased as a suggestion that requires deterministic acceptance inside the app.
Keep responses direct, specific, and under 4 sentences unless more detail is clearly required.
End with one concrete action or decision.
AI_STATE_PACKET_JSON:${stringifyPacketForPrompt(statePacket)}`;

export const buildPlanAnalysisAiSystemPrompt = ({ statePacket = null } = {}) => `You are an AI training analyst operating inside a fitness app. Respond ONLY with valid JSON, no other text.
Your source of truth is the typed AI state packet below.
Treat all output as a proposal only. The app will deterministically accept, reject, or transform anything you return before state changes.
Never invent state outside the packet.
AI_STATE_PACKET_JSON:${stringifyPacketForPrompt(statePacket)}

Return JSON in this exact format:
{
  "paceAdjustments": {
    "PHASE_NAME": { "easy": "X:XX-X:XX", "tempo": "X:XX-X:XX", "int": "X:XX-X:XX", "long": "X:XX-X:XX" }
  },
  "weekNotes": {
    "WEEK_NUMBER": "note text"
  },
  "alerts": [
    { "id": "unique_id", "type": "upgrade|warning|info|makeup", "msg": "message text" }
  ],
  "noChange": true
}

RULES:
- Only propose paceAdjustments for phases already present in the packet.
- Only propose weekNotes for weeks materially affected by recent actuals.
- alerts must be short, direct, and actionable. Max 3 alerts total.
- If nothing needs changing, return { "noChange": true }`;

export const buildIntakeInterpretationAiSystemPrompt = ({ statePacket = null } = {}) => `You are an intake interpretation assistant inside a fitness app. Respond ONLY with valid JSON, no other text.
Your source of truth is the typed intake packet below.
Treat all output as a proposal only. You are not the system of record and you may not resolve goals as canonical truth.
Do not invent injuries, deadlines, baseline facts, or appearance constraints that are not present in the packet.
Keep output compact and practical for planning.
AI_STATE_PACKET_JSON:${stringifyPacketForPrompt(statePacket)}

Return JSON in this exact format:
{
  "interpretedGoalType": "performance|strength|body_comp|appearance|hybrid|general_fitness|re_entry",
  "measurabilityTier": "fully_measurable|proxy_measurable|exploratory_fuzzy",
  "primaryMetric": { "key": "metric_key", "label": "Metric label", "unit": "time", "kind": "primary", "targetValue": "1:45:00" },
  "proxyMetrics": [
    { "key": "metric_key", "label": "Metric label", "unit": "lb", "kind": "proxy" }
  ],
  "confidence": "low|medium|high",
  "timelineRealism": {
    "status": "realistic|aggressive|unclear",
    "summary": "short timeline realism assessment",
    "suggestedHorizonWeeks": 12
  },
  "detectedConflicts": ["short conflict"],
  "missingClarifyingQuestions": ["short question"],
  "coachSummary": "2-4 sentence intake interpretation for the user"
}

RULES:
- Max 1 primaryMetric.
- Max 4 proxyMetrics.
- Use "unclear" for timelineRealism.status when the user has not given enough timing specificity.
- missingClarifyingQuestions should be the smallest useful set. Max 3.
- detectedConflicts should describe goal tension or planning tradeoffs, not generic warnings. Max 3.
- confidence should reflect how complete and usable the current goal language is.
- coachSummary must stay under 120 words and remain interpretation-only.
- Never claim the goal is impossible. If the timeline is aggressive, say what is realistic first.`;

export const buildIntakeFieldExtractionAiSystemPrompt = ({
  statePacket = null,
  extractionRequest = null,
} = {}) => `You are a bounded intake extraction assistant inside a fitness app. Respond ONLY with valid JSON, no other text.
Your source of truth is the typed intake packet and extraction request below.
You may propose candidate values only for the explicitly allowed missing fields.
You are not the system of record and you may not write canonical goals, plan state, or any field not listed in missingFields.
AI_STATE_PACKET_JSON:${stringifyPacketForPrompt(statePacket)}
EXTRACTION_REQUEST_JSON:${stringifyPacketForPrompt(extractionRequest)}

Return JSON in this exact format:
{
  "candidates": [
    {
      "field_id": "field_id_from_missingFields",
      "confidence": 0.0,
      "raw_text": "exact supporting text",
      "parsed_value": {},
      "evidence_spans": [
        { "start": 0, "end": 7, "text": "supporting text" }
      ]
    }
  ]
}

RULES:
- Only use field_id values that appear in missingFields.
- Max 1 candidate per field_id.
- If the utterance does not clearly support a field, omit it.
- confidence must be between 0 and 1 and reflect extraction certainty only.
- evidence_spans must quote exact supporting text from the utterance.
- parsed_value must stay small and schema-aligned.
- If nothing is clear, return {"candidates":[]}.`;

const dedupeLowercaseAiState = (values = []) => {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .filter(Boolean)
    .filter((value) => {
      const key = String(value || "").toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const normalizeScheduleBoundaryAiState = (value = {}) => {
  const daysRaw = value?.trainingDaysPerWeek;
  const trainingDaysPerWeek = Number.isFinite(Number(daysRaw))
    ? clampNumberAiState(daysRaw, 0, 14, 0)
    : null;
  return {
    trainingDaysPerWeek,
    sessionLength: sanitizeTextAiState(value?.sessionLength || "", 40),
    trainingLocation: sanitizeTextAiState(value?.trainingLocation || "", 60),
  };
};

const normalizeEquipmentBoundaryAiState = (value = {}) => ({
  trainingLocation: sanitizeTextAiState(value?.trainingLocation || "", 60),
  equipment: dedupeLowercaseAiState(
    (Array.isArray(value?.equipment) ? value.equipment : [])
      .map((item) => sanitizeTextAiState(item, 40))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))
  ),
});

const normalizeInjuryBoundaryAiState = (value = {}) => ({
  injuryText: sanitizeTextAiState(value?.injuryText || "", 180),
  constraints: dedupeLowercaseAiState(
    (Array.isArray(value?.constraints) ? value.constraints : [])
      .map((item) => sanitizeTextAiState(item, 120))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))
  ),
});

const arraysEqualAiState = (left = [], right = []) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const buildExplicitBoundarySnapshotAiState = (statePacket = null) => {
  const intake = statePacket?.intake || {};
  const scheduleReality = normalizeScheduleBoundaryAiState(intake?.scheduleReality || {});
  const equipmentAccessContext = normalizeEquipmentBoundaryAiState(intake?.equipmentAccessContext || {});
  const injuryConstraintContext = normalizeInjuryBoundaryAiState(intake?.injuryConstraintContext || {});
  return {
    scheduleReality,
    equipmentAccessContext,
    injuryConstraintContext,
    hasExplicitSchedule: scheduleReality.trainingDaysPerWeek !== null
      || Boolean(scheduleReality.sessionLength)
      || Boolean(scheduleReality.trainingLocation),
    hasExplicitEquipment: equipmentAccessContext.equipment.length > 0,
    hasExplicitInjury: Boolean(injuryConstraintContext.injuryText) || injuryConstraintContext.constraints.length > 0,
  };
};

const buildProposalBoundarySnapshotAiState = (proposal = {}) => {
  const scheduleSource = proposal?.scheduleReality && typeof proposal.scheduleReality === "object"
    ? proposal.scheduleReality
    : proposal?.schedule && typeof proposal.schedule === "object"
      ? proposal.schedule
      : {};
  const equipmentSource = proposal?.equipmentAccessContext && typeof proposal.equipmentAccessContext === "object"
    ? proposal.equipmentAccessContext
    : {};
  const injurySource = proposal?.injuryConstraintContext && typeof proposal.injuryConstraintContext === "object"
    ? proposal.injuryConstraintContext
    : {};
  const scheduleReality = normalizeScheduleBoundaryAiState({
    trainingDaysPerWeek: proposal?.trainingDaysPerWeek ?? scheduleSource?.trainingDaysPerWeek,
    sessionLength: proposal?.sessionLength || scheduleSource?.sessionLength || "",
    trainingLocation: proposal?.trainingLocation || scheduleSource?.trainingLocation || "",
  });
  const equipmentAccessContext = normalizeEquipmentBoundaryAiState({
    trainingLocation: equipmentSource?.trainingLocation || proposal?.trainingLocation || "",
    equipment: equipmentSource?.equipment || proposal?.equipment || proposal?.availableEquipment || [],
  });
  const injuryConstraintContext = normalizeInjuryBoundaryAiState({
    injuryText: injurySource?.injuryText || proposal?.injuryText || "",
    constraints: injurySource?.constraints || proposal?.constraints || proposal?.injuryConstraints || [],
  });
  return {
    scheduleReality,
    equipmentAccessContext,
    injuryConstraintContext,
    hasScheduleSuggestion: Boolean(proposal?.scheduleReality || proposal?.schedule)
      || scheduleReality.trainingDaysPerWeek !== null
      || Boolean(scheduleReality.sessionLength)
      || Boolean(scheduleReality.trainingLocation),
    hasEquipmentSuggestion: Boolean(proposal?.equipmentAccessContext)
      || equipmentAccessContext.equipment.length > 0,
    hasInjurySuggestion: Boolean(proposal?.injuryConstraintContext)
      || Boolean(injuryConstraintContext.injuryText)
      || injuryConstraintContext.constraints.length > 0,
  };
};

const collectExplicitBoundaryDropsAiState = ({ proposal = null, statePacket = null } = {}) => {
  if (!proposal || typeof proposal !== "object") return [];
  const explicit = buildExplicitBoundarySnapshotAiState(statePacket);
  const suggested = buildProposalBoundarySnapshotAiState(proposal);
  const drops = [];

  const scheduleConflict = explicit.hasExplicitSchedule
    && suggested.hasScheduleSuggestion
    && (
      (explicit.scheduleReality.trainingDaysPerWeek !== null
        && suggested.scheduleReality.trainingDaysPerWeek !== null
        && explicit.scheduleReality.trainingDaysPerWeek !== suggested.scheduleReality.trainingDaysPerWeek)
      || (explicit.scheduleReality.sessionLength
        && suggested.scheduleReality.sessionLength
        && explicit.scheduleReality.sessionLength.toLowerCase() !== suggested.scheduleReality.sessionLength.toLowerCase())
      || (explicit.scheduleReality.trainingLocation
        && suggested.scheduleReality.trainingLocation
        && explicit.scheduleReality.trainingLocation.toLowerCase() !== suggested.scheduleReality.trainingLocation.toLowerCase())
    );
  if (scheduleConflict) drops.push("scheduleReality");

  const equipmentConflict = explicit.hasExplicitEquipment
    && suggested.hasEquipmentSuggestion
    && !arraysEqualAiState(explicit.equipmentAccessContext.equipment, suggested.equipmentAccessContext.equipment);
  if (equipmentConflict) drops.push("equipmentAccessContext");

  const injuryConflict = explicit.hasExplicitInjury
    && suggested.hasInjurySuggestion
    && (
      (explicit.injuryConstraintContext.injuryText
        && suggested.injuryConstraintContext.injuryText
        && explicit.injuryConstraintContext.injuryText.toLowerCase() !== suggested.injuryConstraintContext.injuryText.toLowerCase())
      || (
        explicit.injuryConstraintContext.constraints.length > 0
        && suggested.injuryConstraintContext.constraints.length > 0
        && !arraysEqualAiState(explicit.injuryConstraintContext.constraints, suggested.injuryConstraintContext.constraints)
      )
    );
  if (injuryConflict) drops.push("injuryConstraintContext");

  return dedupeLowercaseAiState([
    ...(Array.isArray(proposal?.boundaryDrops) ? proposal.boundaryDrops : []).map((item) => sanitizeTextAiState(item, 80)).filter(Boolean),
    ...drops,
  ]);
};

export const sanitizeIntakeInterpretationProposal = (proposal = null, { statePacket = null } = {}) => {
  const safeGoalTypes = new Set(["performance", "strength", "body_comp", "appearance", "hybrid", "general_fitness", "re_entry"]);
  const safeMeasurability = new Set(["fully_measurable", "proxy_measurable", "exploratory_fuzzy"]);
  const safeTimelineStatuses = new Set(["realistic", "aggressive", "unclear"]);
  const safeMetricKinds = new Set(["primary", "proxy"]);
  const safeConfidence = new Set(["low", "medium", "high"]);

  const fallback = {
    interpretedGoalType: "general_fitness",
    measurabilityTier: "exploratory_fuzzy",
    primaryMetric: null,
    proxyMetrics: [],
    suggestedMetrics: [],
    confidence: "low",
    timelineRealism: {
      status: "unclear",
      summary: "",
      suggestedHorizonWeeks: null,
    },
    detectedConflicts: [],
    missingClarifyingQuestions: [],
    coachSummary: "",
    boundaryDrops: [],
  };

  if (!proposal || typeof proposal !== "object") return fallback;

  const interpretedGoalType = sanitizeTextAiState(proposal?.interpretedGoalType || "", 40).toLowerCase();
  const measurabilityTier = sanitizeTextAiState(proposal?.measurabilityTier || "", 40).toLowerCase();
  const timelineStatus = sanitizeTextAiState(proposal?.timelineRealism?.status || "", 24).toLowerCase();
  const confidence = sanitizeTextAiState(proposal?.confidence || proposal?.confidenceLevel || "", 20).toLowerCase();
  const suggestedHorizonWeeksRaw = Number(proposal?.timelineRealism?.suggestedHorizonWeeks);
  const suggestedHorizonWeeks = Number.isFinite(suggestedHorizonWeeksRaw)
    ? clampNumberAiState(suggestedHorizonWeeksRaw, 1, 104, 12)
    : null;

  const candidateMetrics = [
    proposal?.primaryMetric || null,
    ...(Array.isArray(proposal?.proxyMetrics) ? proposal.proxyMetrics : []),
    ...(Array.isArray(proposal?.suggestedMetrics) ? proposal.suggestedMetrics : []),
  ]
    .map((metric, index) => {
      const rawKey = sanitizeTextAiState(metric?.key || `metric_${index + 1}`, 32)
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
      const label = sanitizeTextAiState(metric?.label || "", 60);
      const unit = sanitizeTextAiState(metric?.unit || "", 16);
      const kind = sanitizeTextAiState(metric?.kind || "", 16).toLowerCase();
      if (!rawKey || !label || !safeMetricKinds.has(kind)) return null;
      return {
        key: rawKey,
        label,
        unit,
        kind,
      };
    })
    .filter(Boolean);
  const seenMetrics = new Set();
  const suggestedMetrics = candidateMetrics
    .filter((metric) => {
      const dedupeKey = `${metric.key}:${metric.kind}:${metric.unit}`;
      if (seenMetrics.has(dedupeKey)) return false;
      seenMetrics.add(dedupeKey);
      return true;
    })
    .slice(0, 5);
  const primaryMetric = suggestedMetrics.find((metric) => metric.kind === "primary") || null;
  const proxyMetrics = suggestedMetrics.filter((metric) => metric.kind === "proxy").slice(0, 4);
  const boundaryDrops = collectExplicitBoundaryDropsAiState({ proposal, statePacket });

  return {
    interpretedGoalType: safeGoalTypes.has(interpretedGoalType) ? interpretedGoalType : fallback.interpretedGoalType,
    measurabilityTier: safeMeasurability.has(measurabilityTier) ? measurabilityTier : fallback.measurabilityTier,
    primaryMetric,
    proxyMetrics,
    suggestedMetrics,
    confidence: safeConfidence.has(confidence) ? confidence : fallback.confidence,
    timelineRealism: {
      status: safeTimelineStatuses.has(timelineStatus) ? timelineStatus : fallback.timelineRealism.status,
      summary: sanitizeTextAiState(proposal?.timelineRealism?.summary || "", 220),
      suggestedHorizonWeeks,
    },
    detectedConflicts: (Array.isArray(proposal?.detectedConflicts) ? proposal.detectedConflicts : [])
      .slice(0, 3)
      .map((item) => sanitizeTextAiState(item, 140))
      .filter(Boolean),
    missingClarifyingQuestions: (Array.isArray(proposal?.missingClarifyingQuestions) ? proposal.missingClarifyingQuestions : [])
      .slice(0, 3)
      .map((item) => sanitizeTextAiState(item, 160))
      .filter(Boolean),
    coachSummary: sanitizeTextAiState(proposal?.coachSummary || "", 420),
    boundaryDrops,
  };
};

export const acceptAiPlanAnalysisProposal = ({ proposal = null, statePacket = null } = {}) => {
  const rejected = [];
  const currentWeek = Number(statePacket?.scope?.currentWeek || 1) || 1;
  const allowedPhases = new Set((statePacket?.planningContext?.availablePacePhases || []).filter(Boolean));
  const acceptedAt = Date.now();
  const proposalProvenance = buildProvenanceEvent({
    actor: PROVENANCE_ACTORS.aiInterpretation,
    trigger: "plan_analysis",
    mutationType: "ai_proposal_acceptance",
    revisionReason: "AI plan-analysis proposal accepted by deterministic gate.",
    sourceInputs: [
      "typed_ai_state_packet",
      statePacket?.intent || AI_PACKET_INTENTS.planAnalysis,
      statePacket?.version || AI_PACKET_VERSION,
    ],
    confidence: "medium",
    timestamp: acceptedAt,
    details: {
      packetVersion: statePacket?.version || AI_PACKET_VERSION,
      packetIntent: statePacket?.intent || AI_PACKET_INTENTS.planAnalysis,
    },
  });
  const accepted = {
    noChange: Boolean(proposal?.noChange),
    paceAdjustments: {},
    weekNotes: {},
    alerts: [],
    provenance: proposalProvenance,
  };

  if (!proposal || typeof proposal !== "object") {
    return { accepted, rejected: ["proposal_missing_or_invalid"], hasChanges: false };
  }

  Object.entries(proposal?.paceAdjustments || {}).forEach(([phase, zones]) => {
    const phaseKey = sanitizeTextAiState(String(phase || "").toUpperCase(), 24);
    if (!phaseKey || !allowedPhases.has(phaseKey)) {
      rejected.push(`pace_phase_rejected:${phaseKey || "unknown"}`);
      return;
    }
    const normalizedZones = {};
    ["easy", "tempo", "int", "long"].forEach((zoneKey) => {
      const safeValue = sanitizePaceValue(zones?.[zoneKey] || "");
      if (safeValue) normalizedZones[zoneKey] = safeValue;
    });
    if (Object.keys(normalizedZones).length > 0) accepted.paceAdjustments[phaseKey] = normalizedZones;
  });

  Object.entries(proposal?.weekNotes || {}).forEach(([weekKey, note]) => {
    const numericWeek = Number(weekKey);
    const safeNote = sanitizeTextAiState(note, 220);
    if (!Number.isFinite(numericWeek) || numericWeek < (currentWeek - 1) || numericWeek > (currentWeek + 2) || !safeNote) {
      rejected.push(`week_note_rejected:${weekKey}`);
      return;
    }
    accepted.weekNotes[String(numericWeek)] = safeNote;
  });

  const allowedAlertTypes = new Set(["upgrade", "warning", "info", "makeup"]);
  (Array.isArray(proposal?.alerts) ? proposal.alerts : []).slice(0, 3).forEach((alert, index) => {
    const type = sanitizeTextAiState(alert?.type || "", 24).toLowerCase();
    const msg = sanitizeTextAiState(alert?.msg || "", 160);
    if (!allowedAlertTypes.has(type) || !msg) {
      rejected.push(`alert_rejected:${type || index}`);
      return;
    }
    const rawId = sanitizeTextAiState(alert?.id || `alert_${index + 1}`, 40).replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
    accepted.alerts.push({
      id: rawId ? `ai_plan_${rawId}` : `ai_plan_${index + 1}`,
      type,
      msg,
      source: "ai_proposal_accepted",
      acceptedBy: "deterministic_gate",
      packetVersion: statePacket?.version || AI_PACKET_VERSION,
      packetIntent: statePacket?.intent || AI_PACKET_INTENTS.planAnalysis,
      provenance: buildProvenanceEvent({
        actor: PROVENANCE_ACTORS.aiInterpretation,
        trigger: "plan_analysis_alert",
        mutationType: "plan_alert",
        revisionReason: msg,
        sourceInputs: [
          "typed_ai_state_packet",
          type,
        ],
        confidence: "medium",
        timestamp: acceptedAt,
        details: {
          packetVersion: statePacket?.version || AI_PACKET_VERSION,
          packetIntent: statePacket?.intent || AI_PACKET_INTENTS.planAnalysis,
          alertType: type,
        },
      }),
    });
  });

  const hasChanges = Boolean(
    Object.keys(accepted.paceAdjustments).length
    || Object.keys(accepted.weekNotes).length
    || accepted.alerts.length
  );

  return { accepted, rejected, hasChanges };
};
