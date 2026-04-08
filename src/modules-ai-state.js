export const AI_PACKET_VERSION = "2026-04-v1";

export const AI_PACKET_INTENTS = {
  coachChat: "coach_chat",
  planAnalysis: "plan_analysis",
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

export const acceptAiPlanAnalysisProposal = ({ proposal = null, statePacket = null } = {}) => {
  const rejected = [];
  const currentWeek = Number(statePacket?.scope?.currentWeek || 1) || 1;
  const allowedPhases = new Set((statePacket?.planningContext?.availablePacePhases || []).filter(Boolean));
  const accepted = {
    noChange: Boolean(proposal?.noChange),
    paceAdjustments: {},
    weekNotes: {},
    alerts: [],
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
    });
  });

  const hasChanges = Boolean(
    Object.keys(accepted.paceAdjustments).length
    || Object.keys(accepted.weekNotes).length
    || accepted.alerts.length
  );

  return { accepted, rejected, hasChanges };
};
