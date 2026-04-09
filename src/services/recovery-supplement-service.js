import { normalizeActualNutritionLog } from "../modules-nutrition.js";

export const RECOVERY_PRESCRIPTION_MODEL = "recovery_prescription_v1";
export const SUPPLEMENT_PLAN_MODEL = "supplement_plan_v1";
export const ACTUAL_RECOVERY_LOG_MODEL = "actual_recovery_log_v1";

const cloneRecoveryValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const sanitizeRecoveryText = (value = "", fallback = "") => String(value || "")
  .replace(/\s+/g, " ")
  .trim() || fallback;

const toRecoveryNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const slugifyRecovery = (value = "") => String(value || "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

const normalizeDayType = (value = "") => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const isHardSessionDay = (training = null, nutritionPrescription = null) => {
  const trainingType = normalizeDayType(training?.type || training?.run?.t || "");
  const nutritionDayType = normalizeDayType(nutritionPrescription?.dayType || training?.nutri || "");
  return ["hard", "hardrun", "tempo", "intervals", "long", "longrun", "travelrun", "otf", "conditioning"].includes(trainingType)
    || ["hardrun", "longrun", "travelrun", "otf"].includes(nutritionDayType);
};

const isStrengthSessionDay = (training = null, nutritionPrescription = null) => {
  const trainingType = normalizeDayType(training?.type || "");
  const nutritionDayType = normalizeDayType(nutritionPrescription?.dayType || training?.nutri || "");
  return trainingType.includes("strength") || ["strength"].includes(nutritionDayType);
};

const isRecoveryDay = (training = null, readinessState = null) => {
  const trainingType = normalizeDayType(training?.type || "");
  const readiness = String(readinessState?.state || "").toLowerCase();
  return ["rest", "recovery"].includes(trainingType) || readiness === "recovery";
};

const buildPainManagementProtocol = ({ injuryState = null, readinessState = null } = {}) => {
  const level = String(injuryState?.level || "").trim().toLowerCase();
  const area = sanitizeRecoveryText(injuryState?.area || "", "affected area");
  const readiness = String(readinessState?.state || "").trim().toLowerCase();
  if (!level && readiness !== "recovery" && readiness !== "reduced_load") return null;
  const cautious = level && level !== "none";
  const steps = cautious
    ? [
        "Keep movement easy and pain-aware.",
        "Do the planned mobility before adding load.",
        "Stop escalating the session if pain rises.",
      ]
    : readiness === "recovery"
    ? [
        "Use recovery-only movement today.",
        "Prioritize light mobility and easy aerobic work.",
      ]
    : [
        "Cap intensity early.",
        "Finish with mobility or tissue work instead of extra volume.",
      ];
  return {
    area,
    level: level || (readiness === "recovery" ? "recovery_focus" : "watch"),
    steps,
    summary: cautious
      ? `${area} needs a simple pain-management protocol today.`
      : readiness === "recovery"
      ? "Recovery posture is elevated today, so pain-management stays protective."
      : "Use a lighter recovery protocol today to avoid compounding fatigue.",
  };
};

const SUPPLEMENT_LIBRARY = {
  creatine: {
    category: "performance",
    defaultDose: "5g",
    defaultTiming: "with breakfast",
    purpose: "supports strength output and lean-mass retention",
  },
  protein: {
    category: "recovery",
    defaultDose: "20-40g",
    defaultTiming: "post-session if food protein is short",
    purpose: "closes protein gaps when meals fall short",
  },
  electrolytes: {
    category: "hydration",
    defaultDose: "1 serving",
    defaultTiming: "before or during training",
    purpose: "supports hydration and sweat replacement",
  },
  "omega-3": {
    category: "general_recovery",
    defaultDose: "2 caps",
    defaultTiming: "with lunch",
    purpose: "supports general recovery",
  },
  magnesium: {
    category: "sleep",
    defaultDose: "300-400mg",
    defaultTiming: "before bed",
    purpose: "supports relaxation and sleep quality",
  },
  "vitamin d3": {
    category: "general_health",
    defaultDose: "1 cap",
    defaultTiming: "with first meal",
    purpose: "supports general health when sun exposure is inconsistent",
  },
};

const resolveSupplementDescriptor = (rawName = "") => {
  const normalized = sanitizeRecoveryText(rawName).toLowerCase();
  return SUPPLEMENT_LIBRARY[normalized]
    || SUPPLEMENT_LIBRARY[normalized.replace(/\s+/g, " ")]
    || (normalized.includes("electrolyte") ? SUPPLEMENT_LIBRARY.electrolytes : null)
    || (normalized.includes("protein") ? SUPPLEMENT_LIBRARY.protein : null)
    || (normalized.includes("creatine") ? SUPPLEMENT_LIBRARY.creatine : null)
    || (normalized.includes("magnesium") ? SUPPLEMENT_LIBRARY.magnesium : null)
    || (normalized.includes("omega") ? SUPPLEMENT_LIBRARY["omega-3"] : null)
    || (normalized.includes("vitamin d") ? SUPPLEMENT_LIBRARY["vitamin d3"] : null);
};

export const buildCanonicalSupplementPlan = ({
  dateKey = "",
  supplementPlan = [],
  training = null,
  nutritionPrescription = null,
} = {}) => {
  const hardDay = isHardSessionDay(training, nutritionPrescription);
  const recoveryDay = isRecoveryDay(training, null);
  const items = (Array.isArray(supplementPlan) ? supplementPlan : [])
    .map((raw, index) => {
      const name = typeof raw === "string"
        ? sanitizeRecoveryText(raw)
        : sanitizeRecoveryText(raw?.name || raw?.label || "");
      if (!name) return null;
      const descriptor = resolveSupplementDescriptor(name) || {};
      const defaultTiming = descriptor.defaultTiming || "with a meal";
      const defaultDose = descriptor.defaultDose || "1 serving";
      const category = descriptor.category || "general_support";
      const timing = sanitizeRecoveryText(
        raw?.timing,
        category === "hydration" && hardDay
          ? "30 min pre-session"
          : category === "sleep"
          ? "before bed"
          : defaultTiming
      );
      return {
        id: `supplement_${slugifyRecovery(name)}_${index}`,
        name,
        category,
        dose: sanitizeRecoveryText(raw?.dose || raw?.defaultDose, defaultDose),
        timing,
        priority: raw?.priority || (category === "hydration" || category === "performance" ? "core" : "support"),
        purpose: sanitizeRecoveryText(raw?.purpose || raw?.reason, descriptor.purpose || "supports daily consistency"),
        withHydration: Boolean(raw?.withHydration || category === "hydration"),
        conditional: Boolean(raw?.conditional || (recoveryDay && category === "hydration")),
      };
    })
    .filter(Boolean);
  return {
    model: SUPPLEMENT_PLAN_MODEL,
    dateKey,
    strategy: hardDay ? "performance_support" : recoveryDay ? "recovery_support" : "daily_consistency",
    items,
    summary: items.length
      ? `Planned supplements: ${items.map((item) => `${item.name} (${item.timing})`).join(", ")}.`
      : "No supplement plan is prescribed for this day.",
    adherenceRule: items.length
      ? "Adherence is measured against planned supplement items, not against a generic stack."
      : "No supplement adherence is expected without a stored plan.",
  };
};

export const deriveSupplementActual = ({
  supplementPlan = null,
  nutritionActualLog = null,
  supplementLog = null,
} = {}) => {
  const normalizedNutrition = normalizeActualNutritionLog({
    dateKey: nutritionActualLog?.dateKey || "",
    feedback: nutritionActualLog || {},
  });
  const takenMap = (() => {
    if (supplementLog && typeof supplementLog === "object" && !Array.isArray(supplementLog)) {
      return Object.fromEntries(
        Object.entries(supplementLog || {}).map(([key, value]) => [key, Boolean(value)])
      );
    }
    return cloneRecoveryValue(normalizedNutrition?.supplements?.takenMap || {});
  })();
  const expectedItems = Array.isArray(supplementPlan?.items) ? supplementPlan.items : [];
  const expectedNames = expectedItems.map((item) => String(item?.name || "").trim().toLowerCase()).filter(Boolean);
  const takenNames = Object.entries(takenMap)
    .filter(([, taken]) => Boolean(taken))
    .map(([name]) => String(name || "").trim())
    .filter(Boolean);
  const matchedCount = expectedNames.length
    ? expectedNames.filter((name) => takenNames.some((taken) => String(taken || "").trim().toLowerCase() === name)).length
    : 0;
  const adherence = !expectedNames.length
    ? "not_planned"
    : matchedCount >= expectedNames.length
    ? "full"
    : matchedCount > 0
    ? "partial"
    : "missed";
  return {
    takenMap,
    takenNames,
    takenCount: takenNames.length,
    expectedCount: expectedNames.length,
    matchedCount,
    adherence,
    summary: !expectedNames.length
      ? "No planned supplements to compare against."
      : `${matchedCount} of ${expectedNames.length} planned supplements were marked taken.`,
    loggedAt: normalizedNutrition?.loggedAt || null,
  };
};

export const buildRecoveryPrescription = ({
  dateKey = "",
  training = null,
  readinessState = null,
  nutritionPrescription = null,
  supplementPlan = null,
  injuryState = null,
} = {}) => {
  const hardDay = isHardSessionDay(training, nutritionPrescription);
  const strengthDay = isStrengthSessionDay(training, nutritionPrescription);
  const recoveryDay = isRecoveryDay(training, readinessState);
  const cautiousDay = ["recovery", "reduced_load"].includes(String(readinessState?.state || "").toLowerCase());
  const injuryLevel = String(injuryState?.level || "").toLowerCase();
  const hydrationTargetOz = Number(
    nutritionPrescription?.targets?.hydrationTargetOz
    || nutritionPrescription?.hydrationTargetOz
    || 0
  ) || 0;
  const mobilityMinutes = cautiousDay ? 10 : hardDay || strengthDay ? 8 : 5;
  const tissueWorkMinutes = cautiousDay || (injuryLevel && injuryLevel !== "none")
    ? 6
    : hardDay
    ? 4
    : 0;
  const sleepTargetHours = cautiousDay || hardDay ? 8.5 : 8;
  const painManagementProtocol = buildPainManagementProtocol({ injuryState, readinessState });
  const hydrationSupport = {
    targetOz: hydrationTargetOz || null,
    electrolyteSupport: Boolean(
      Array.isArray(supplementPlan?.items)
      && supplementPlan.items.some((item) => String(item?.category || "").toLowerCase() === "hydration")
    ),
    timing: hardDay ? "Front-load hydration before training and close the day back at target." : "Keep hydration steady across the day.",
    summary: hydrationTargetOz
      ? `Hydration support target: ${Math.round(hydrationTargetOz)} oz.`
      : "Hydration support is available, but no explicit daily target was stored.",
  };
  const actions = [
    {
      id: `recovery_sleep_${dateKey || "day"}`,
      type: "sleep",
      label: "Sleep target",
      target: `${sleepTargetHours} hours`,
      timing: "tonight",
      required: true,
    },
    {
      id: `recovery_mobility_${dateKey || "day"}`,
      type: "mobility",
      label: "Mobility / tissue quality",
      target: `${mobilityMinutes}-${mobilityMinutes + 2} min`,
      timing: training?.type === "rest" ? "today" : "post-session",
      required: true,
    },
    tissueWorkMinutes > 0 ? {
      id: `recovery_tissue_${dateKey || "day"}`,
      type: "tissue_work",
      label: "Tissue work",
      target: `${tissueWorkMinutes}-${tissueWorkMinutes + 2} min`,
      timing: "later today",
      required: false,
    } : null,
    painManagementProtocol ? {
      id: `recovery_pain_${dateKey || "day"}`,
      type: "pain_management",
      label: "Pain-management protocol",
      target: painManagementProtocol.summary,
      timing: "before extra load",
      required: true,
    } : null,
  ].filter(Boolean);
  const emphasis = recoveryDay
    ? "restore"
    : cautiousDay
    ? "protect"
    : hardDay || strengthDay
    ? "absorb_training"
    : "maintain";
  return {
    model: RECOVERY_PRESCRIPTION_MODEL,
    dateKey,
    emphasis,
    sleepTargetHours,
    mobilityMinutes,
    tissueWorkMinutes,
    painManagementProtocol,
    hydrationSupport,
    actions,
    summary: recoveryDay
      ? "Recovery day: keep movement easy, land mobility, and protect tonight's sleep."
      : cautiousDay
      ? "Recovery posture is elevated today: protect tissue quality, mobility, and sleep."
      : hardDay
      ? "Hard training day: close the loop with hydration, mobility, and an early sleep target."
      : strengthDay
      ? "Strength day: protect tissue quality and land the normal recovery anchors."
      : "Standard recovery day: keep sleep and mobility consistent.",
    successCriteria: [
      `Sleep at least ${sleepTargetHours} hours tonight.`,
      `Complete ${mobilityMinutes}+ minutes of mobility.`,
      hydrationTargetOz ? `Finish the day near ${Math.round(hydrationTargetOz)} oz hydration.` : "",
    ].filter(Boolean),
  };
};

export const normalizeActualRecoveryLog = ({
  dateKey = "",
  dailyCheckin = null,
  nutritionActualLog = null,
  recoveryPrescription = null,
  supplementPlan = null,
  supplementLog = null,
  injuryState = null,
} = {}) => {
  const raw = cloneRecoveryValue(dailyCheckin?.actualRecovery || dailyCheckin?.recovery || {});
  const normalizedNutrition = normalizeActualNutritionLog({
    dateKey,
    feedback: nutritionActualLog || {},
  });
  const supplementActual = deriveSupplementActual({
    supplementPlan,
    nutritionActualLog: normalizedNutrition,
    supplementLog,
  });
  const readiness = cloneRecoveryValue(dailyCheckin?.readiness || raw?.readiness || {});
  const sleepHours = toRecoveryNumber(raw?.sleepHours ?? raw?.sleep?.hours, null);
  const mobilityMinutes = toRecoveryNumber(raw?.mobilityMinutes ?? raw?.mobility?.minutes, 0);
  const tissueWorkMinutes = toRecoveryNumber(raw?.tissueWorkMinutes ?? raw?.tissueWork?.minutes, 0);
  const painProtocolCompleted = Boolean(
    raw?.painProtocolCompleted
    ?? raw?.painManagement?.completed
    ?? false
  );
  const hydrationPct = normalizedNutrition?.hydration?.pct ?? null;
  const hydrationSupportFollowed = raw?.hydrationSupportFollowed != null
    ? Boolean(raw.hydrationSupportFollowed)
    : hydrationPct != null
    ? Number(hydrationPct) >= 85
    : null;
  const loggedAt = Number(raw?.loggedAt || dailyCheckin?.ts || normalizedNutrition?.loggedAt || 0) || null;
  const hasAnySignal = Boolean(
    loggedAt
    || sleepHours != null
    || mobilityMinutes > 0
    || tissueWorkMinutes > 0
    || painProtocolCompleted
    || hydrationSupportFollowed != null
    || supplementActual.loggedAt
    || sanitizeRecoveryText(raw?.recoveryNote || dailyCheckin?.note || raw?.note || "")
  );
  const sleepTargetHours = Number(recoveryPrescription?.sleepTargetHours || 0) || null;
  const mobilityTarget = Number(recoveryPrescription?.mobilityMinutes || 0) || 0;
  const anchorsCompleted = [
    sleepHours != null && sleepTargetHours ? sleepHours >= (sleepTargetHours - 0.5) : false,
    mobilityMinutes >= Math.max(1, Math.round(mobilityTarget * 0.7)),
    hydrationSupportFollowed === true,
    !recoveryPrescription?.painManagementProtocol || painProtocolCompleted,
  ].filter(Boolean).length;
  return {
    id: dateKey ? `actual_recovery_${dateKey}` : `actual_recovery_${Date.now()}`,
    model: ACTUAL_RECOVERY_LOG_MODEL,
    dateKey,
    status: dailyCheckin?.status || "not_logged",
    sessionFeel: dailyCheckin?.sessionFeel || "",
    blocker: dailyCheckin?.blocker || "",
    note: sanitizeRecoveryText(raw?.recoveryNote || raw?.note || dailyCheckin?.note || ""),
    bodyweight: dailyCheckin?.bodyweight || "",
    readiness,
    sleepHours,
    mobilityMinutes,
    tissueWorkMinutes,
    painProtocolCompleted,
    painArea: sanitizeRecoveryText(raw?.painArea || injuryState?.area || ""),
    painLevel: sanitizeRecoveryText(raw?.painLevel || injuryState?.level || ""),
    hydrationSupport: {
      targetOz: recoveryPrescription?.hydrationSupport?.targetOz ?? null,
      actualOz: normalizedNutrition?.hydration?.oz ?? null,
      pct: hydrationPct,
      followed: hydrationSupportFollowed,
      summary: hydrationPct == null
        ? "Hydration support has not been logged yet."
        : `Hydration support reached ${Math.round(hydrationPct)}% of target.`,
    },
    supplementAdherence: {
      adherence: supplementActual.adherence,
      expectedCount: supplementActual.expectedCount,
      matchedCount: supplementActual.matchedCount,
      takenNames: supplementActual.takenNames,
      summary: supplementActual.summary,
    },
    anchorsCompleted,
    summary: !hasAnySignal
      ? "Actual recovery has not been logged yet."
      : `${anchorsCompleted} recovery anchors were completed or supported today.`,
    loggedAt: hasAnySignal ? (loggedAt || Date.now()) : null,
  };
};
