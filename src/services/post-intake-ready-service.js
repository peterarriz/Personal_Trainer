import {
  buildProgramRoadmapRows,
  buildProgramWeekGridCells,
} from "./program-roadmap-service.js";
import { joinDisplayParts } from "./text-format-service.js";

const sanitizeText = (value = "", maxLength = 180) => String(value || "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maxLength);

const pluralize = (count = 0, singular = "", plural = "") => (
  `${count} ${count === 1 ? singular : (plural || `${singular}s`)}`
);

const isQualityCell = (cell = null) => /tempo|interval|threshold|quality|speed/i.test(
  `${cell?.title || ""} ${cell?.detail || ""}`
);

const isStrengthCell = (cell = null) => /strength/i.test(
  `${cell?.title || ""} ${cell?.detail || ""}`
);

const isLongRunCell = (cell = null) => /(^|\s)long(\s|$)/i.test(
  `${cell?.title || ""} ${cell?.detail || ""}`
);

const compactCellTitle = (cell = null) => {
  if (!cell) return "Session";
  if (cell.isRest) return "Reset";
  if (isLongRunCell(cell)) return "Long run";
  if (isStrengthCell(cell)) return "Strength";
  if (isQualityCell(cell)) return "Key run";
  return sanitizeText(cell.title || "Session", 28);
};

const compactCellDetail = (cell = null) => {
  if (!cell || cell?.isRest) return "";
  const detail = sanitizeText(cell?.detail || "", 100);
  if (!detail) return "";
  if (isStrengthCell(cell)) {
    const durationMatch = detail.match(/\d+\s*(?:-\s*\d+)?\s*min/i);
    return durationMatch ? `${durationMatch[0]} strength` : "Strength session";
  }
  if (isLongRunCell(cell)) {
    return sanitizeText(detail.replace(/^long run\s*/i, ""), 28);
  }
  return sanitizeText(detail, 32);
};

const buildWeekShapeSummary = (cells = []) => {
  const plannedCells = cells.filter((cell) => !cell?.isRest);
  const qualityCount = plannedCells.filter((cell) => isQualityCell(cell)).length;
  const strengthCount = plannedCells.filter((cell) => isStrengthCell(cell)).length;
  const longRunCell = plannedCells.find((cell) => isLongRunCell(cell)) || null;
  const parts = [
    pluralize(plannedCells.length, "session"),
    qualityCount ? pluralize(qualityCount, "key run") : null,
    strengthCount ? pluralize(strengthCount, "strength day") : null,
    longRunCell?.detail ? `long run ${sanitizeText(longRunCell.detail, 40)}` : null,
  ].filter(Boolean);
  return joinDisplayParts(parts) || "Your first week is set.";
};

const buildRoadmapSecondaryLine = (row = null) => {
  if (!row) return "";
  if (row.cutback) return "Recovery week";
  if (row.isPhaseStart && !row.isCurrentWeek) return "New block";
  if (row.longRunDeltaLabel && row.longRunDeltaLabel !== "Hold") return `Long run ${row.longRunDeltaLabel}`;
  if (row.longRunLabel && row.longRunLabel !== "No long run") return `Long run ${row.longRunLabel}`;
  return row.strengthLabel || row.qualityLabel || "";
};

const buildRoadmapSummary = (rows = []) => {
  if (!rows.length) return "The next few weeks are already in view.";
  const hasCutback = rows.some((row) => row?.cutback);
  const hasPhaseChange = rows.some((row) => row?.isPhaseStart && !row?.isCurrentWeek);
  if (hasCutback && hasPhaseChange) {
    return "You can already see the build, the lighter week, and the next block.";
  }
  if (hasCutback) return "You can already see the build and the lighter week.";
  if (hasPhaseChange) return "You can already see what this block builds toward.";
  return "You can already see the next few weeks.";
};

const findActionCells = (cells = []) => {
  const todayCell = cells.find((cell) => cell?.isToday) || null;
  const plannedCells = cells.filter((cell) => !cell?.isRest);
  if (!todayCell) {
    return {
      todayCell: plannedCells[0] || cells[0] || null,
      nextCell: plannedCells[0] || null,
    };
  }
  if (!todayCell.isRest) {
    return {
      todayCell,
      nextCell: todayCell,
    };
  }
  const todayIndex = cells.findIndex((cell) => cell?.isToday);
  const nextCell = cells.slice(Math.max(0, todayIndex + 1)).find((cell) => !cell?.isRest)
    || plannedCells[0]
    || null;
  return {
    todayCell,
    nextCell,
  };
};

const buildAdaptationLines = ({ roadmapRows = [], hasLogged = false } = {}) => {
  const nextRow = roadmapRows.find((row) => !row?.isCurrentWeek) || null;
  return [
    hasLogged
      ? "Your latest log is already shaping the next sessions."
      : "Each log helps the next sessions match what actually happened.",
    nextRow?.phaseLabel
      ? `The bigger build toward ${sanitizeText(nextRow.phaseLabel, 40)} stays in view.`
      : "The bigger build stays in view while the details sharpen.",
  ].map((line) => sanitizeText(line, 170));
};

const buildChecklistItems = ({
  firstActionTitle = "",
  firstActionMeta = "",
  nextCell = null,
  todayCell = null,
  hasLogged = false,
} = {}) => {
  const openerLabel = todayCell?.isRest
    ? `Use today as a reset, then be ready for ${sanitizeText(nextCell?.dayLabel || "the next session", 32)} ${sanitizeText(nextCell?.title || "training", 56)}.`
    : `Do ${sanitizeText(firstActionTitle || "today's opener", 72)}${firstActionMeta ? ` in ${sanitizeText(firstActionMeta, 36)}` : ""}.`;
  const protectWeekLabel = nextCell && isLongRunCell(nextCell)
    ? "Protect the long run this week, even if other details move around."
    : "Keep the key session and the long run in place if the week gets busy.";
  return [
    {
      id: "opener",
      label: openerLabel,
      done: Boolean(hasLogged),
    },
    {
      id: "log",
      label: "Log each session right after you finish so the plan can stay honest.",
      done: Boolean(hasLogged),
    },
    {
      id: "protect",
      label: protectWeekLabel,
      done: false,
    },
  ];
};

export const buildPostIntakeReadyModel = ({
  currentWeek = 1,
  currentDayOfWeek = 0,
  currentWeekRow = null,
  rollingHorizon = [],
  liveTodayTraining = null,
  fallbackSessionsByDay = {},
  todayPrescriptionSummary = null,
  todayLog = null,
} = {}) => {
  const safeWeekRow = currentWeekRow
    || (Array.isArray(rollingHorizon)
      ? rollingHorizon.find((row) => Number(row?.absoluteWeek || 0) === Number(currentWeek || 0)) || null
      : null)
    || {
      absoluteWeek: currentWeek,
      planWeek: {
        sessionsByDay: fallbackSessionsByDay || {},
      },
    };
  const horizonRows = Array.isArray(rollingHorizon) ? rollingHorizon.filter(Boolean) : [];
  const currentWeekNumber = Number(currentWeek || 0);
  const normalizedHorizon = (() => {
    const nextRows = [];
    let insertedCurrentWeek = false;
    horizonRows.forEach((row) => {
      if (Number(row?.absoluteWeek || 0) === currentWeekNumber) {
        if (!insertedCurrentWeek) {
          nextRows.push(safeWeekRow);
          insertedCurrentWeek = true;
        }
        return;
      }
      nextRows.push(row);
    });
    if (!insertedCurrentWeek) {
      nextRows.unshift(safeWeekRow);
    }
    return nextRows;
  })();
  const weekShapeCells = buildProgramWeekGridCells({
    weekRow: safeWeekRow,
    currentWeek,
    currentDayOfWeek,
    liveTodayTraining,
    fallbackSessionsByDay,
  });
  const roadmapRows = buildProgramRoadmapRows({
    displayHorizon: normalizedHorizon.slice(0, 4),
    currentWeek,
  });
  const { todayCell, nextCell } = findActionCells(weekShapeCells);
  const todayIsRecovery = Boolean(todayCell?.isRest);
  const firstActionTitle = todayIsRecovery
    ? sanitizeText(todayPrescriptionSummary?.sessionLabel || "Recovery day", 72)
    : sanitizeText(todayPrescriptionSummary?.sessionLabel || todayCell?.title || "Today's session", 72);
  const firstActionMeta = sanitizeText(
    todayPrescriptionSummary?.expectedDuration
      || todayCell?.detail
      || nextCell?.detail
      || "",
    48,
  );
  const firstActionDetail = todayIsRecovery
    ? sanitizeText(
      `Today stays light so ${sanitizeText(nextCell?.dayLabel || "your next session", 24)} ${sanitizeText(nextCell?.title || "training", 56)} lands well.`,
      150,
    )
    : sanitizeText(
      todayPrescriptionSummary?.why
        || todayPrescriptionSummary?.structure
        || safeWeekRow?.planWeek?.weeklyIntent?.focus
        || todayCell?.detail
        || "Start with today's first session.",
      150,
    );
  const firstActionSupport = todayIsRecovery
    ? sanitizeText(nextCell?.detail || "", 72)
    : sanitizeText(
      todayPrescriptionSummary?.structure
        || safeWeekRow?.planWeek?.summary
        || safeWeekRow?.planWeek?.successDefinition
        || "",
      120,
    );
  const hasLogged = Boolean(todayLog?.ts);

  return {
    title: "You're ready",
    headline: todayIsRecovery
      ? "Your first week is set and today stays easy."
      : "Your first week is set and today has a clear start.",
    credibilityLine: sanitizeText(
      joinDisplayParts([
        "Built around your goal and routine",
        buildRoadmapSummary(roadmapRows),
      ]),
      180,
    ),
    firstAction: {
      eyebrow: todayIsRecovery ? "Today starts easy" : "Today's first action",
      title: firstActionTitle,
      detail: firstActionDetail,
      meta: firstActionMeta || "Planned today",
      support: sanitizeText(firstActionSupport, 88),
    },
    weekShape: {
      summary: buildWeekShapeSummary(weekShapeCells),
      cells: weekShapeCells.map((cell) => ({
        ...cell,
        shortTitle: compactCellTitle(cell),
        shortDetail: compactCellDetail(cell),
        tone: cell?.isRest
          ? "rest"
          : isLongRunCell(cell)
          ? "long_run"
          : isQualityCell(cell)
          ? "quality"
          : isStrengthCell(cell)
          ? "strength"
          : "steady",
      })),
    },
    roadmap: {
      summary: buildRoadmapSummary(roadmapRows),
      rows: roadmapRows.map((row) => ({
        ...row,
        label: row?.isCurrentWeek ? "Now" : `Week ${row?.absoluteWeek || ""}`,
        focus: sanitizeText(row?.focus || "", 86),
        primaryLine: row?.longRunLabel && row.longRunLabel !== "No long run"
          ? `Long run ${sanitizeText(row.longRunLabel, 40)}`
          : sanitizeText(row?.qualityLabel || "Key work stays visible", 48),
        secondaryLine: sanitizeText(buildRoadmapSecondaryLine(row), 44),
      })),
    },
    adaptation: {
      title: "What changes after you log",
      lines: buildAdaptationLines({ roadmapRows, hasLogged }),
    },
    checklist: {
      title: "First-week checklist",
      items: buildChecklistItems({
        firstActionTitle,
        firstActionMeta,
        nextCell,
        todayCell,
        hasLogged,
      }),
    },
  };
};

export default buildPostIntakeReadyModel;
