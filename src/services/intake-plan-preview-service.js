import { normalizeGoals, composeGoalNativePlan } from "../modules-planning.js";
import {
  applyResolvedGoalsToGoalSlots,
  buildPlanningGoalsFromResolvedGoals,
} from "./goal-resolution-service.js";
import { deriveCanonicalAthleteState } from "./canonical-athlete-service.js";
import {
  buildTrainingContextFromAnswers,
  trainingEnvironmentToDisplayMode,
  trainingEquipmentToEnvironmentCode,
} from "./training-context-service.js";
import { buildIntakeInjuryConstraintContext } from "./intake-flow-service.js";
import {
  assemblePlanWeekRuntime,
  resolveProgramDisplayHorizon,
} from "./plan-week-service.js";
import {
  buildProgramRoadmapRows,
  buildProgramTrajectoryHeaderModel,
  buildProgramWeekGridCells,
} from "./program-roadmap-service.js";

const sanitizeText = (value = "", maxLength = 180) => String(value || "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maxLength);

const toArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);
const INTAKE_PREVIEW_VISIBLE_WEEK_COUNT = 1;

const parseTrainingDays = (value = "") => {
  const cleanValue = sanitizeText(value, 20);
  if (cleanValue === "6+") return 6;
  const parsed = Number(cleanValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
};

const buildCompatibilityPrimaryGoalKey = (category = "") => {
  const cleanCategory = sanitizeText(category, 40).toLowerCase();
  if (cleanCategory === "body_comp") return "fat_loss";
  if (cleanCategory === "strength") return "muscle_gain";
  if (cleanCategory === "running") return "endurance";
  return "general_fitness";
};

const countCellsByMatcher = (cells = [], matcher = () => false) => (
  cells.filter((cell) => !cell?.isRest && matcher(cell)).length
);

const isStrengthCell = (cell = null) => /strength/i.test(
  `${cell?.title || ""} ${cell?.detail || ""}`
);

const isQualityCell = (cell = null) => /tempo|interval|threshold|quality|speed/i.test(
  `${cell?.title || ""} ${cell?.detail || ""}`
);

const isHybridCell = (cell = null) => {
  const text = `${cell?.title || ""} ${cell?.detail || ""}`.toLowerCase();
  return /run.*strength|strength.*run|hybrid/.test(text);
};

const isLongRunCell = (cell = null) => /(^|\s)long(\s|$)/i.test(
  `${cell?.title || ""} ${cell?.detail || ""}`
);

const formatWeekSummary = (cells = []) => {
  const plannedCells = cells.filter((cell) => !cell?.isRest);
  const strengthCount = countCellsByMatcher(plannedCells, isStrengthCell);
  const qualityCount = countCellsByMatcher(plannedCells, isQualityCell);
  const longRunCell = plannedCells.find((cell) => isLongRunCell(cell)) || null;
  const parts = [
    plannedCells.length ? `${plannedCells.length} session${plannedCells.length === 1 ? "" : "s"}` : "Recovery week",
    qualityCount ? `${qualityCount} key run${qualityCount === 1 ? "" : "s"}` : "",
    strengthCount ? `${strengthCount} strength day${strengthCount === 1 ? "" : "s"}` : "",
    longRunCell?.detail ? `long run ${sanitizeText(longRunCell.detail, 36)}` : "",
  ].filter(Boolean);
  return sanitizeText(parts.join(" • "), 120) || "Week shape is ready.";
};

const formatCellTone = (cell = null) => {
  if (!cell || cell?.isRest) return "rest";
  if (isHybridCell(cell)) return "hybrid";
  if (isLongRunCell(cell)) return "long_run";
  if (isQualityCell(cell)) return "quality";
  if (isStrengthCell(cell)) return "strength";
  return "steady";
};

const formatCellTitle = (cell = null) => {
  if (!cell) return "Session";
  if (cell.isRest) return "Reset";
  if (isHybridCell(cell)) return "Hybrid";
  if (isLongRunCell(cell)) return "Long run";
  if (isStrengthCell(cell)) return "Strength";
  if (isQualityCell(cell)) return "Key run";
  return sanitizeText(cell.title || "Session", 24);
};

const formatCellDetail = (cell = null) => {
  if (!cell) return "";
  if (cell.isRest) return "Recover";
  return sanitizeText(cell.detail || "", 28);
};

const normalizeHomeEquipment = (answers = {}) => {
  const selection = Array.isArray(answers?.home_equipment) ? answers.home_equipment : [];
  const otherText = sanitizeText(answers?.home_equipment_other || "", 80);
  const normalized = [
    ...selection.filter((item) => item && item !== "Other"),
    ...(selection.includes("Other") && otherText ? [otherText] : []),
  ];
  if (!normalized.length && ["Home", "Outdoor"].includes(sanitizeText(answers?.training_location || "", 20))) {
    return ["Bodyweight only"];
  }
  return normalized;
};

const buildPreviewPersonalization = ({
  personalization = {},
  answers = {},
  primaryCategory = "",
  trainingContext = null,
  constraints = [],
  normalizedEquipment = [],
} = {}) => {
  const defaultMode = trainingContext?.environment?.confirmed
    ? trainingEnvironmentToDisplayMode(trainingContext.environment.value)
    : (personalization?.environmentConfig?.defaultMode || "Unknown");
  const sessionDuration = trainingContext?.sessionDuration?.confirmed
    ? trainingContext.sessionDuration.value
    : (sanitizeText(answers?.session_length || "", 20) || "30");
  return {
    ...personalization,
    profile: {
      ...(personalization?.profile || {}),
      profileSetupComplete: true,
    },
    trainingContext,
    userGoalProfile: {
      ...(personalization?.userGoalProfile || {}),
      primary_goal: buildCompatibilityPrimaryGoalKey(primaryCategory),
      experience_level: sanitizeText(answers?.experience_level || "", 20) || "intermediate",
      days_per_week: parseTrainingDays(answers?.training_days),
      session_length: sessionDuration,
      equipment_access: normalizedEquipment,
      constraints,
    },
    environmentConfig: {
      ...(personalization?.environmentConfig || {}),
      defaultMode,
      base: {
        ...(personalization?.environmentConfig?.base || {}),
        equipment: trainingContext?.equipmentAccess?.confirmed
          ? trainingEquipmentToEnvironmentCode(trainingContext.equipmentAccess.value)
          : "unknown",
        time: sessionDuration,
      },
    },
  };
};

const buildPreviewWeekModel = ({
  row = null,
  currentWeek = 1,
  currentDayOfWeek = 0,
  currentPlanSession = null,
} = {}) => {
  const cells = buildProgramWeekGridCells({
    weekRow: row,
    currentWeek,
    currentDayOfWeek,
    liveTodayTraining: row?.absoluteWeek === currentWeek ? currentPlanSession : null,
  });
  return {
    key: `week-${Number(row?.absoluteWeek || currentWeek)}`,
    label: row?.absoluteWeek === currentWeek ? "Week 1" : `Week ${Number(row?.absoluteWeek || 0)}`,
    headline: sanitizeText(row?.focus || row?.phaseLabel || row?.weekLabel || "Plan week", 120),
    summary: formatWeekSummary(cells),
    milestone: sanitizeText(
      row?.longRunLabel && row.longRunLabel !== "No long run"
        ? `Milestone: ${row.longRunLabel}`
        : row?.strengthLabel || row?.qualityLabel || "",
      120
    ),
    cells: cells.map((cell) => ({
      dayLabel: cell?.dayLabel || "",
      title: formatCellTitle(cell),
      detail: formatCellDetail(cell),
      tone: formatCellTone(cell),
      isToday: Boolean(cell?.isToday),
    })),
  };
};

export const buildIntakePlanPreviewModel = ({
  orderedResolvedGoals = [],
  answers = {},
  personalization = {},
  goalSlots = [],
  profileDefaults = {},
  weekTemplates = [],
  baseWeek = {},
  todayKey = "",
  dayOfWeek = 0,
} = {}) => {
  const safeResolvedGoals = Array.isArray(orderedResolvedGoals) ? orderedResolvedGoals.filter(Boolean) : [];
  if (!safeResolvedGoals.length) {
    return {
      isReady: false,
      placeholderLine: "Pick a goal path and a few week-one realities to see the draft plan shape.",
    };
  }

  try {
    const currentWeek = 1;
    const safeTodayKey = sanitizeText(todayKey || new Date().toISOString().split("T")[0], 24);
    const trainingContext = buildTrainingContextFromAnswers({ answers });
    const injuryConstraintContext = buildIntakeInjuryConstraintContext({
      injuryText: answers?.injury_text,
      injuryImpact: answers?.injury_impact,
      injuryArea: answers?.injury_area,
      injurySide: answers?.injury_side,
      injuryLimitations: answers?.injury_limitations,
    });
    const normalizedEquipment = normalizeHomeEquipment(answers);
    const previewGoals = normalizeGoals(applyResolvedGoalsToGoalSlots({
      resolvedGoals: safeResolvedGoals,
      goalSlots,
    }));
    const planningGoals = buildPlanningGoalsFromResolvedGoals({
      resolvedGoals: safeResolvedGoals,
    });
    const primaryCategory = planningGoals?.[0]?.category || "general_fitness";
    const previewPersonalization = buildPreviewPersonalization({
      personalization,
      answers,
      primaryCategory,
      trainingContext,
      constraints: injuryConstraintContext.constraints,
      normalizedEquipment,
    });
    const athleteProfile = deriveCanonicalAthleteState({
      goals: previewGoals,
      personalization: previewPersonalization,
      profileDefaults,
    });
    const safeWeekTemplates = Array.isArray(weekTemplates) && weekTemplates.length
      ? weekTemplates
      : [baseWeek || {}];
    const safeBaseWeek = baseWeek && Object.keys(baseWeek).length
      ? baseWeek
      : (safeWeekTemplates[0] || {});
    const planComposer = composeGoalNativePlan({
      goals: previewGoals,
      personalization: previewPersonalization,
      athleteProfile,
      currentWeek,
      baseWeek: safeBaseWeek,
      weekTemplates: safeWeekTemplates,
      todayKey: safeTodayKey,
      currentDayOfWeek: dayOfWeek,
    });
    const runtime = assemblePlanWeekRuntime({
      todayKey: safeTodayKey,
      currentWeek,
      dayOfWeek,
      goals: previewGoals,
      baseWeek: safeBaseWeek,
      weekTemplates: safeWeekTemplates,
      planComposer,
      horizonWeeks: 2,
    });
    const displayHorizon = resolveProgramDisplayHorizon({
      rollingHorizon: runtime?.rollingHorizon || [],
      currentWeek,
      currentPlanWeek: runtime?.currentPlanWeek || null,
      weekTemplates: safeWeekTemplates,
      goals: previewGoals,
      planComposer,
      previewLength: 2,
    }).slice(0, 2);
    const roadmapRows = buildProgramRoadmapRows({
      displayHorizon,
      currentWeek,
    });
    const trajectoryHeader = buildProgramTrajectoryHeaderModel({
      roadmapRows,
      phaseNarrative: runtime?.currentPlanWeek?.programBlock?.phaseNarrative
        || planComposer?.programBlock?.phaseNarrative
        || [],
      currentWeek,
      primaryCategory,
      currentWeekLabel: runtime?.currentPlanWeek?.label || "",
      currentWeekFocus: runtime?.currentPlanWeek?.weeklyIntent?.focus || runtime?.currentPlanWeek?.summary || "",
    });
    const weeks = displayHorizon
      .slice(0, INTAKE_PREVIEW_VISIBLE_WEEK_COUNT)
      .map((row) => buildPreviewWeekModel({
      row,
      currentWeek,
      currentDayOfWeek: dayOfWeek,
      currentPlanSession: runtime?.currentPlanSession || null,
    }));

    return {
      isReady: true,
      heading: sanitizeText(trajectoryHeader?.heading || "Week 1 preview", 80),
      trajectoryLine: sanitizeText(trajectoryHeader?.trajectoryLine || "", 160),
      nextMilestoneLine: sanitizeText(trajectoryHeader?.nextMilestoneLine || "", 140),
      arcLine: sanitizeText(trajectoryHeader?.arcLine || "", 140),
      progressBadge: sanitizeText(trajectoryHeader?.progressBadge || "Draft", 40),
      nextBadge: sanitizeText(trajectoryHeader?.nextBadge || "Next", 40),
      weeks,
    };
  } catch {
    return {
      isReady: false,
      placeholderLine: "Add one more meaningful detail to see week 1.",
    };
  }
};

export default buildIntakePlanPreviewModel;
