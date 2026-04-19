const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const normalizeText = (value = "") => sanitizeText(value, 220).toLowerCase();

const hasSectionRows = (summary = null, key = "") => (
  Array.isArray(summary?.sessionPlan?.sections)
  && summary.sessionPlan.sections.some((section) => (
    String(section?.key || "").toLowerCase() === String(key || "").toLowerCase()
    && Array.isArray(section?.rows)
    && section.rows.length > 0
  ))
);

const isRunType = (rawType = "") => /run|conditioning/.test(rawType);
const isSwimType = (rawType = "") => /swim/.test(rawType);
const isPowerType = (rawType = "") => /power|reactive|sprint/.test(rawType);

const resolveBaseDayKind = ({ training = null, summary = null } = {}) => {
  const rawType = normalizeText(training?.type || "");
  const hasRunLane = Boolean(training?.run) || hasSectionRows(summary, "run");
  const hasStrengthLane = Boolean(training?.strSess)
    || ["strength", "strength+prehab", "run+strength"].includes(rawType)
    || hasSectionRows(summary, "strength");

  if (["rest", "recovery"].includes(rawType)) return "rest";
  if (rawType === "run+strength" || (hasRunLane && hasStrengthLane)) return "hybrid";
  if (hasStrengthLane) return "strength_only";
  if (hasRunLane || isRunType(rawType)) return "run_only";
  if (isSwimType(rawType)) return "swim_only";
  if (isPowerType(rawType)) return "power_only";
  return "single_session";
};

const resolveStatusLabel = ({ baseDayKind = "single_session", dayKind = "single_session" } = {}) => {
  if (dayKind === "reduced_load") return "Reduced load";
  if (baseDayKind === "hybrid") return "Hybrid day";
  if (baseDayKind === "strength_only") return "Strength day";
  if (baseDayKind === "rest") return "Recovery day";
  if (baseDayKind === "swim_only") return "Swim day";
  if (baseDayKind === "power_only") return "Power day";
  return "Run day";
};

const buildHeroSupportLine = ({
  dayKind = "single_session",
  baseDayKind = "single_session",
  summary = null,
} = {}) => {
  const runSummary = sanitizeText(summary?.structure || summary?.purpose || "", 140);
  const strengthSummary = sanitizeText(summary?.purpose || summary?.structure || "", 140);

  if (dayKind === "reduced_load") {
    if (baseDayKind === "hybrid") return "Run first, then finish the lighter strength work.";
    if (baseDayKind === "strength_only") return "Keep the lift crisp and leave a little in reserve today.";
    return "Keep the session smooth and controlled today.";
  }
  if (baseDayKind === "rest") return "Reset, recover, and keep the day light.";
  if (baseDayKind === "hybrid") return "Run first, then finish with strength.";
  if (baseDayKind === "strength_only") return strengthSummary || "Strength focus with clean, repeatable work.";
  if (baseDayKind === "swim_only") return runSummary || "Clean aerobic work in the water today.";
  if (baseDayKind === "power_only") return runSummary || "Explosive work first, fatigue second.";
  return runSummary || "Main session for today.";
};

const isGenericOnPlanCopy = (value = "") => (
  /stays? on plan|staying on plan|on plan today|today is staying on plan/.test(normalizeText(value))
);

const buildAdaptationSummary = ({
  dayKind = "single_session",
  baseDayKind = "single_session",
  changeSummary = "",
  explanationLine = "",
} = {}) => {
  const normalizedChange = sanitizeText(changeSummary, 180);
  const normalizedExplanation = sanitizeText(explanationLine, 180);
  const hasMeaningfulChange = normalizedChange && !isGenericOnPlanCopy(normalizedChange);

  if (dayKind === "reduced_load") {
    return normalizedChange || normalizedExplanation || "Load came down today so the session stays productive without forcing it.";
  }
  if (baseDayKind === "rest") {
    return normalizedChange || normalizedExplanation || "Today stays light so the next productive session lands well.";
  }
  if (hasMeaningfulChange) return normalizedChange;
  if (normalizedExplanation && !isGenericOnPlanCopy(normalizedExplanation)) return normalizedExplanation;
  if (baseDayKind === "hybrid") return "Both parts of the session stay on plan today.";
  if (baseDayKind === "strength_only") return "This strength session stays on plan today.";
  return "This session stays on plan today.";
};

const buildNextStepFallback = ({
  dayKind = "single_session",
  baseDayKind = "single_session",
} = {}) => {
  if (dayKind === "reduced_load") return "Keep the effort controlled, then log how it felt.";
  if (baseDayKind === "rest") return "Keep the day light and save a quick recovery note if anything changed.";
  if (baseDayKind === "hybrid") return "Move through the run first, then finish the strength work and log it.";
  if (baseDayKind === "strength_only") return "Finish the lift cleanly, then log it.";
  if (baseDayKind === "swim_only") return "Finish the set cleanly, then log it.";
  if (baseDayKind === "power_only") return "Keep the quality high, then log how it felt.";
  return "Finish the session, then log it.";
};

const buildComposerHint = ({
  dayKind = "single_session",
  baseDayKind = "single_session",
  hasLogged = false,
} = {}) => {
  if (baseDayKind === "rest") return hasLogged ? "Update anything that changed about recovery." : "Save a quick recovery check-in.";
  if (dayKind === "reduced_load") return hasLogged ? "Update how the lighter version felt." : "Save how the lighter version actually went.";
  return hasLogged ? "Update only what changed." : "Save only what changed.";
};

export const TODAY_COMMAND_CENTER_RULES = Object.freeze({
  strength_only: {
    hero: "Lead with the main strength session and show only the strength stack on first load.",
    adaptation: "Use one compact note for load, setup, or schedule changes.",
    action: "Primary action opens inline logging. Secondary action opens the week view.",
  },
  run_only: {
    hero: "Lead with the run and keep the visible plan to the key session blocks only.",
    adaptation: "Keep the change note to one sentence unless the user opens why it changed.",
    action: "Primary action opens inline logging. Secondary action opens the week view.",
  },
  hybrid: {
    hero: "Show one hero card with both run and strength in a single stacked session plan.",
    adaptation: "Explain one combined change note for the day instead of splitting by lane.",
    action: "Primary action opens inline logging. Secondary action opens the week view.",
  },
  rest: {
    hero: "Present the day as recovery, not as a missing workout.",
    adaptation: "Use the note to explain why the day is light only when needed.",
    action: "Primary action opens a recovery log. Secondary action opens the week view.",
  },
  reduced_load: {
    hero: "Keep the underlying session visible, but add a reduced-load signal in the status area.",
    adaptation: "Use the compact note to explain the lighter version in plain language.",
    action: "Primary action opens inline logging. Secondary action opens the week view.",
  },
});

export const buildTodayCommandCenterModel = ({
  training = null,
  summary = null,
  readinessState = "",
  changeSummary = "",
  explanation = null,
  nextStep = "",
  hasLogged = false,
} = {}) => {
  const baseDayKind = resolveBaseDayKind({ training, summary });
  const dayKind = ["recovery", "reduced_load"].includes(normalizeText(readinessState)) && baseDayKind !== "rest"
    ? "reduced_load"
    : baseDayKind;
  const primaryActionLabel = hasLogged
    ? "Update log"
    : baseDayKind === "rest"
    ? "Log recovery"
    : "Log today";

  return {
    dayKind,
    baseDayKind,
    statusLabel: resolveStatusLabel({ baseDayKind, dayKind }),
    heroSupportLine: buildHeroSupportLine({ dayKind, baseDayKind, summary }),
    adaptationTitle: "What changed",
    adaptationSummary: buildAdaptationSummary({
      dayKind,
      baseDayKind,
      changeSummary,
      explanationLine: explanation?.line || "",
    }),
    adaptationSourceLabel: sanitizeText(explanation?.sourceLabel || "", 80),
    adaptationDetailLine: sanitizeText(explanation?.detailLine || "", 180),
    adaptationTone: dayKind === "reduced_load"
      ? "warning"
      : baseDayKind === "rest"
      ? "recovery"
      : isGenericOnPlanCopy(changeSummary)
      ? "quiet"
      : "info",
    nextStepLine: sanitizeText(nextStep || buildNextStepFallback({ dayKind, baseDayKind }), 180),
    primaryActionLabel,
    secondaryActionLabel: "View week",
    composerTitle: baseDayKind === "rest" ? "LOG RECOVERY" : "LOG TODAY",
    composerHint: buildComposerHint({ dayKind, baseDayKind, hasLogged }),
    shouldMergeLanes: baseDayKind === "hybrid",
    rules: TODAY_COMMAND_CENTER_RULES[dayKind] || TODAY_COMMAND_CENTER_RULES[baseDayKind] || TODAY_COMMAND_CENTER_RULES.run_only,
  };
};
