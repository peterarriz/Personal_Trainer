const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const normalizeText = (value = "") => sanitizeText(value, 220).toLowerCase();

const isGenericOnPlanLine = (value = "") => (
  /stays? on plan|current day stays on plan|both parts of the session stay on plan today|this strength session stays on plan today|this session stays on plan today/.test(normalizeText(value))
);

const dedupeLabels = (values = []) => {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => sanitizeText(value, 120))
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeText(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const resolveDayKind = ({ commandCenterModel = null, surfaceModel = null } = {}) => {
  const explicitDayKind = sanitizeText(commandCenterModel?.dayKind || commandCenterModel?.baseDayKind || "", 40).toLowerCase();
  if (explicitDayKind) return explicitDayKind;
  const sessionType = sanitizeText(surfaceModel?.display?.sessionType || "", 80).toLowerCase();
  if (/recovery|rest/.test(sessionType)) return "rest";
  if (/run \+ strength/.test(sessionType)) return "hybrid";
  if (/strength/.test(sessionType)) return "strength_only";
  if (/run/.test(sessionType)) return "run_only";
  return "single_session";
};

const buildFallbackRationaleLine = ({
  dayKind = "single_session",
  display = null,
  commandCenterModel = null,
} = {}) => {
  if (dayKind === "rest") {
    return "Recovery stays light today so the next key session lands better.";
  }
  if (dayKind === "hybrid") {
    return "Run and strength stay paired today so the week keeps one clear direction.";
  }
  if (dayKind === "reduced_load") {
    return "Today backs off a little so the session still moves the week forward.";
  }
  return sanitizeText(
    commandCenterModel?.heroSupportLine
    || display?.purpose
    || "Today's session keeps the week moving.",
    180
  );
};

const resolveRationaleLine = ({
  dayKind = "single_session",
  display = null,
  surfaceModel = null,
  commandCenterModel = null,
} = {}) => {
  const candidates = [
    commandCenterModel?.adaptationSummary,
    surfaceModel?.canonicalReasonLine,
    surfaceModel?.explanationLine,
    display?.why,
    display?.purpose,
  ]
    .map((value) => sanitizeText(value, 180))
    .filter(Boolean)
    .filter((value) => !isGenericOnPlanLine(value));

  return candidates[0] || buildFallbackRationaleLine({
    dayKind,
    display,
    commandCenterModel,
  });
};

const buildSupportLine = ({
  dayKind = "single_session",
  display = null,
  commandCenterModel = null,
} = {}) => {
  if (dayKind === "rest") {
    return "Recovery day";
  }
  if (dayKind === "hybrid") {
    return sanitizeText(
      commandCenterModel?.heroSupportLine
      || display?.structure
      || "Run first, then finish the strength work.",
      160
    );
  }
  return sanitizeText(
    commandCenterModel?.heroSupportLine
    || display?.structure
    || display?.purpose
    || "",
    160
  );
};

const buildProgramContextLine = ({
  dayKind = "single_session",
  title = "",
  sessionContextLine = "",
} = {}) => {
  const explicit = sanitizeText(sessionContextLine, 180);
  if (explicit) return explicit;
  if (dayKind === "rest") {
    return "Today is a real recovery slot inside this week, not an empty day.";
  }
  if (dayKind === "hybrid") {
    return `${title || "Today"} carries both the run and strength work inside this week.`;
  }
  return `${title || "Today"} is the current session inside this week.`;
};

const buildSpecialLine = ({
  dayKind = "single_session",
} = {}) => {
  if (dayKind === "rest") {
    return "Recovery today protects the next meaningful session.";
  }
  if (dayKind === "hybrid") {
    return "Hybrid day keeps both lanes intentional instead of stacking random work.";
  }
  return "";
};

export const buildSharedSessionSummaryModel = ({
  surfaceModel = null,
  commandCenterModel = null,
  sessionContextLine = "",
  currentWeekFocus = "",
} = {}) => {
  const display = surfaceModel?.display || {};
  const dayKind = resolveDayKind({ commandCenterModel, surfaceModel });
  const title = sanitizeText(display?.sessionLabel || "Today", 120);
  const durationLabel = sanitizeText(display?.expectedDuration || "", 60);
  const statusLabel = sanitizeText(commandCenterModel?.statusLabel || display?.sessionType || "", 80);
  const structureLabel = sanitizeText(display?.structure || currentWeekFocus || "", 120);
  const supportLine = buildSupportLine({ dayKind, display, commandCenterModel });
  const rationaleLine = resolveRationaleLine({ dayKind, display, surfaceModel, commandCenterModel });

  return {
    title,
    dayKind,
    durationLabel,
    statusLabel,
    structureLabel,
    supportLine,
    rationaleLine,
    explanationSourceLabel: sanitizeText(surfaceModel?.explanationSourceLabel || commandCenterModel?.adaptationSourceLabel || "", 80),
    specialLine: buildSpecialLine({ dayKind }),
    metaItems: dedupeLabels([
      durationLabel,
      statusLabel,
      dayKind === "hybrid" ? "Run + strength" : "",
      dayKind === "rest" ? "Recovery slot" : "",
      dayKind !== "rest" && dayKind !== "hybrid" ? structureLabel : "",
    ]),
    programContextLine: buildProgramContextLine({
      dayKind,
      title,
      sessionContextLine,
    }),
  };
};
