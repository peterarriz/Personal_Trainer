const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  0: "Sun",
};

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const humanizePhaseKey = (phaseKey = "") => sanitizeText(String(phaseKey || "")
  .replace(/_/g, " ")
  .toLowerCase()
  .replace(/\b\w/g, (char) => char.toUpperCase()), 80) || "Plan";

const buildTemplateStrengthSession = (template = {}) => (
  template?.str
    ? {
        dayKey: 2,
        type: "strength+prehab",
        label: `Strength ${sanitizeText(template.str, 40)}`,
        strSess: sanitizeText(template.str, 20),
        strengthDose: "30-45 min strength",
      }
    : null
);

const buildSessionsFromTemplate = (template = {}) => {
  const sessions = [];
  if (template?.mon) {
    sessions.push({
      dayKey: 1,
      type: "easy-run",
      label: sanitizeText(template.mon.t || "Easy run", 80),
      run: template.mon,
    });
  }
  if (template?.thu) {
    const thuType = /tempo|interval|threshold|quality/i.test(String(template.thu.t || ""))
      ? "hard-run"
      : "easy-run";
    sessions.push({
      dayKey: 4,
      type: thuType,
      label: sanitizeText(template.thu.t || "Run", 80),
      run: template.thu,
    });
  }
  if (template?.fri) {
    sessions.push({
      dayKey: 5,
      type: "easy-run",
      label: sanitizeText(template.fri.t || "Easy run", 80),
      run: template.fri,
    });
  }
  if (template?.sat) {
    sessions.push({
      dayKey: 6,
      type: /long/i.test(String(template.sat.t || "")) ? "long-run" : "easy-run",
      label: sanitizeText(template.sat.t || "Long run", 80),
      run: template.sat,
    });
  }
  const strengthSession = buildTemplateStrengthSession(template);
  if (strengthSession) sessions.push(strengthSession);
  return sessions;
};

const resolveWeekSessions = (weekRow = null) => {
  const sessionsByDay = weekRow?.planWeek?.sessionsByDay || {};
  const canonicalSessions = DAY_ORDER
    .map((dayKey) => {
      const session = sessionsByDay?.[dayKey];
      if (!session || session?.type === "rest") return null;
      return {
        ...session,
        dayKey,
      };
    })
    .filter(Boolean);
  if (canonicalSessions.length) return canonicalSessions;
  return buildSessionsFromTemplate(weekRow?.template || {});
};

const isQualitySession = (session = null) => {
  const type = String(session?.type || "").toLowerCase();
  const text = `${session?.label || ""} ${session?.run?.t || ""}`.toLowerCase();
  return type === "hard-run" || /tempo|interval|threshold|quality|speed/.test(text);
};

const isStrengthSession = (session = null) => {
  const type = String(session?.type || "").toLowerCase();
  return Boolean(session?.strSess) || /strength/.test(type);
};

const isRunSession = (session = null) => {
  const type = String(session?.type || "").toLowerCase();
  const text = `${session?.label || ""} ${session?.run?.t || ""}`.toLowerCase();
  return Boolean(session?.run) || /(easy-run|hard-run|long-run|run\+strength)/.test(type) || /\brun\b/.test(text);
};

const resolveLongRunDescriptor = (weekRow = null, sessions = []) => {
  const longRunSession = sessions.find((session) => {
    const type = String(session?.type || "").toLowerCase();
    const text = `${session?.label || ""} ${session?.run?.t || ""}`.toLowerCase();
    return type === "long-run" || /\blong\b/.test(text);
  });
  if (longRunSession?.run?.d) return sanitizeText(longRunSession.run.d, 80);
  if (longRunSession?.detail) return sanitizeText(longRunSession.detail, 80);
  if (weekRow?.template?.sat?.d) return sanitizeText(weekRow.template.sat.d, 80);
  return "No long run";
};

const parseProgressionValue = (detail = "") => {
  const text = sanitizeText(detail, 80).toLowerCase();
  const milesMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:miles?|mi)\b/);
  if (milesMatch) {
    return { value: Number(milesMatch[1]), unit: "mi" };
  }
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min)\b/);
  if (minuteMatch) {
    return { value: Number(minuteMatch[1]), unit: "min" };
  }
  return null;
};

const formatProgressionDelta = (current = null, previous = null) => {
  if (!current || !previous || current.unit !== previous.unit) return "";
  const delta = Number((current.value - previous.value).toFixed(1));
  if (!Number.isFinite(delta) || delta === 0) return "Hold";
  if (delta > 0) return `+${delta}${current.unit}`;
  return `${delta}${current.unit}`;
};

export const buildProgramRoadmapRows = ({
  displayHorizon = [],
  currentWeek = 1,
} = {}) => {
  const safeRows = Array.isArray(displayHorizon) ? displayHorizon.filter(Boolean) : [];
  const currentWeekNumber = Number(currentWeek || 0);
  let previousLongRun = null;
  const rows = safeRows.map((weekRow) => {
    const absoluteWeek = Number(weekRow?.absoluteWeek || 0) || currentWeek;
    const sessions = resolveWeekSessions(weekRow);
    const longRunLabel = resolveLongRunDescriptor(weekRow, sessions);
    const longRunProgress = parseProgressionValue(longRunLabel);
    const phaseKey = sanitizeText(
      weekRow?.planWeek?.phase
      || weekRow?.phase
      || weekRow?.template?.phase
      || weekRow?.programBlock?.phase
      || "",
      60
    ) || "PLAN";
    const phaseLabel = sanitizeText(
      weekRow?.planWeek?.programBlock?.label
      || weekRow?.programBlock?.label
      || humanizePhaseKey(phaseKey),
      100
    );
    const focus = sanitizeText(
      weekRow?.planWeek?.weeklyIntent?.focus
      || weekRow?.focus
      || weekRow?.planWeek?.summary
      || weekRow?.template?.label
      || "Projected week",
      140
    );
    const qualityCount = sessions.filter((session) => isQualitySession(session)).length;
    const strengthCount = Math.max(
      sessions.filter((session) => isStrengthSession(session)).length,
      weekRow?.template?.str ? 1 : 0
    );
    const runCount = sessions.filter((session) => isRunSession(session)).length;
    const row = {
      absoluteWeek,
      weekLabel: sanitizeText(weekRow?.weekLabel || weekRow?.planWeek?.label || `Week ${absoluteWeek}`, 100),
      phaseKey,
      phaseLabel,
      focus,
      longRunLabel,
      longRunDeltaLabel: formatProgressionDelta(longRunProgress, previousLongRun),
      longRunValue: longRunProgress?.value ?? null,
      longRunUnit: longRunProgress?.unit || "",
      qualityCount,
      qualityLabel: qualityCount === 1 ? "1 quality session" : `${qualityCount} quality sessions`,
      runCount,
      runLabel: runCount > 0 ? `${runCount} run day${runCount === 1 ? "" : "s"}` : "No run day",
      strengthCount,
      strengthLabel: strengthCount > 0 ? `${strengthCount} strength day${strengthCount === 1 ? "" : "s"}` : "No strength day",
      cutback: Boolean(weekRow?.cutback || weekRow?.planWeek?.cutback),
      isCurrentWeek: absoluteWeek === currentWeekNumber,
    };
    if (longRunProgress) previousLongRun = longRunProgress;
    return row;
  });
  return rows.map((row, index) => ({
    ...row,
    isNextWeek: row.absoluteWeek === currentWeekNumber + 1,
    isPhaseStart: index === 0 || row.phaseKey !== rows[index - 1]?.phaseKey,
    isPhaseEnd: index === rows.length - 1 || row.phaseKey !== rows[index + 1]?.phaseKey,
  }));
};

const buildGridCellFromSession = (session = null, { dayKey = 1, isToday = false } = {}) => {
  if (!session || session?.type === "rest") {
    return {
      dayKey,
      dayLabel: DAY_LABELS[dayKey],
      title: "Rest / recovery",
      detail: "Recovery or off day",
      isToday,
      isRest: true,
    };
  }
  const title = sanitizeText(session?.label || session?.run?.t || session?.type || "Session", 80);
  const detail = sanitizeText(
    session?.run?.d
    || session?.strengthDose
    || session?.strengthDuration
    || session?.fallback
    || session?.success
    || "Planned session",
    100
  );
  return {
    dayKey,
    dayLabel: DAY_LABELS[dayKey],
    title,
    detail,
    isToday,
    isRest: false,
  };
};

export const buildProgramWeekGridCells = ({
  weekRow = null,
  currentWeek = 1,
  currentDayOfWeek = 0,
  liveTodayTraining = null,
  fallbackSessionsByDay = {},
} = {}) => {
  const sessionsByDay = weekRow?.planWeek?.sessionsByDay
    || (Object.keys(fallbackSessionsByDay || {}).length ? fallbackSessionsByDay : null)
    || {};
  const templateSessionMap = buildSessionsFromTemplate(weekRow?.template || {}).reduce((map, session) => {
    map[session.dayKey] = session;
    return map;
  }, {});
  const isCurrentWeek = Number(weekRow?.absoluteWeek || currentWeek) === Number(currentWeek || 0);
  return DAY_ORDER.map((dayKey) => {
    const isToday = isCurrentWeek && Number(dayKey) === Number(currentDayOfWeek);
    const session = isToday && liveTodayTraining
      ? liveTodayTraining
      : sessionsByDay?.[dayKey] || templateSessionMap?.[dayKey] || null;
    return buildGridCellFromSession(session, { dayKey, isToday });
  });
};

const buildNextMilestoneLine = ({
  currentRow = null,
  nextRow = null,
  nextPhaseBlock = null,
  primaryCategory = "",
} = {}) => {
  if (primaryCategory === "running") {
    if (nextRow?.longRunLabel && nextRow.longRunLabel !== "No long run") {
      return `Next milestone: ${nextRow.longRunLabel} in week ${nextRow.absoluteWeek}.`;
    }
    if (nextPhaseBlock?.name) {
      return `Next milestone: ${sanitizeText(nextPhaseBlock.name, 100)} begins in week ${nextPhaseBlock.startWeek}.`;
    }
    if (currentRow?.longRunLabel && currentRow.longRunLabel !== "No long run") {
      return `Current long run is ${currentRow.longRunLabel}.`;
    }
  }
  if (primaryCategory === "strength") {
    if (nextRow?.strengthCount > 0) {
      return `Next milestone: ${nextRow.strengthLabel} in week ${nextRow.absoluteWeek}.`;
    }
    if (nextPhaseBlock?.name) {
      return `Next milestone: ${sanitizeText(nextPhaseBlock.name, 100)} begins in week ${nextPhaseBlock.startWeek}.`;
    }
  }
  if (primaryCategory === "hybrid") {
    if (nextRow?.runCount > 0 || nextRow?.strengthCount > 0) {
      return `Next milestone: ${sanitizeText(
        [
          nextRow?.runCount > 0 ? nextRow.runLabel : "",
          nextRow?.strengthCount > 0 ? nextRow.strengthLabel : "",
        ].filter(Boolean).join(" + "),
        120
      )} in week ${nextRow.absoluteWeek}.`;
    }
  }
  if (nextRow?.focus) {
    return `Next milestone: ${sanitizeText(nextRow.focus, 120)}`;
  }
  if (nextPhaseBlock?.name) {
    return `Next milestone: ${sanitizeText(nextPhaseBlock.name, 100)} begins in week ${nextPhaseBlock.startWeek}.`;
  }
  return "Next milestone is still inside the current visible block.";
};

export const buildProgramTrajectoryHeaderModel = ({
  roadmapRows = [],
  phaseNarrative = [],
  currentWeek = 1,
  primaryCategory = "",
  currentWeekLabel = "",
  currentWeekFocus = "",
} = {}) => {
  const safeRows = Array.isArray(roadmapRows) ? roadmapRows.filter(Boolean) : [];
  const currentRow = safeRows.find((row) => row.isCurrentWeek) || safeRows.find((row) => Number(row?.absoluteWeek || 0) === Number(currentWeek || 0)) || safeRows[0] || null;
  const nextRow = safeRows.find((row) => row.isNextWeek) || safeRows.find((row) => Number(row?.absoluteWeek || 0) > Number(currentWeek || 0)) || null;
  const activePhaseBlock = (Array.isArray(phaseNarrative) ? phaseNarrative : []).find((block) => Number(currentWeek || 0) >= Number(block?.startWeek || 0) && Number(currentWeek || 0) <= Number(block?.endWeek || 0)) || phaseNarrative?.[0] || null;
  const nextPhaseBlock = (Array.isArray(phaseNarrative) ? phaseNarrative : []).find((block) => Number(block?.startWeek || 0) > Number(currentWeek || 0)) || null;

  const chapterLabel = sanitizeText(
    activePhaseBlock?.name
    || currentRow?.phaseLabel
    || currentWeekLabel
    || "Current chapter",
    100
  );
  const chapterWindow = activePhaseBlock
    ? `Weeks ${activePhaseBlock.startWeek}-${activePhaseBlock.endWeek}`
    : currentRow?.weekLabel
    ? sanitizeText(currentRow.weekLabel, 100)
    : `Week ${Number(currentWeek || currentRow?.absoluteWeek || 1)}`;
  const trajectoryLine = sanitizeText(
    currentWeekFocus
    || currentRow?.focus
    || currentWeekLabel
    || "Current week is moving the block forward.",
    160
  );
  const heading = currentRow?.cutback
    ? "Absorbing this block"
    : primaryCategory === "running"
    ? "Building the next run milestone"
    : primaryCategory === "strength"
    ? "Building the next strength milestone"
    : primaryCategory === "hybrid"
    ? "Balancing both lanes on purpose"
    : "Moving this block forward";

  return {
    heading,
    trajectoryLine,
    chapterLabel,
    chapterWindow: sanitizeText(chapterWindow, 100),
    nextMilestoneLine: buildNextMilestoneLine({
      currentRow,
      nextRow,
      nextPhaseBlock,
      primaryCategory,
    }),
    arcLine: sanitizeText(
      nextPhaseBlock?.name
        ? `${nextPhaseBlock.name} begins in week ${nextPhaseBlock.startWeek}.`
        : `${chapterLabel} carries through the visible arc.`,
      140
    ),
    progressBadge: currentRow?.cutback
      ? "Cutback week"
      : currentRow?.isCurrentWeek
      ? "Current chapter"
      : "Visible plan",
    nextBadge: nextRow?.cutback
      ? "Recovery ahead"
      : nextPhaseBlock?.name
      ? "Next chapter"
      : "On track",
  };
};
