const sanitizeText = (value = "", maxLength = 80) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const normalizeText = (value = "") => sanitizeText(value, 120).toLowerCase();

const dedupeChips = (chips = []) => {
  const seen = new Set();
  return (Array.isArray(chips) ? chips : [])
    .filter(Boolean)
    .map((chip, index) => ({
      key: sanitizeText(chip?.key || `chip_${index}`, 80) || `chip_${index}`,
      label: sanitizeText(chip?.label || "", 48),
      sourceKind: sanitizeText(chip?.sourceKind || "plan", 24).toLowerCase() || "plan",
    }))
    .filter((chip) => chip.label)
    .filter((chip) => {
      const token = `${chip.sourceKind}:${normalizeText(chip.label)}`;
      if (!token || seen.has(token)) return false;
      seen.add(token);
      return true;
    });
};

const pushChip = (chips, label, sourceKind = "plan", key = "") => {
  const cleanedLabel = sanitizeText(label, 48);
  if (!cleanedLabel) return;
  chips.push({
    key: sanitizeText(key || `${sourceKind}_${cleanedLabel}`, 80),
    label: cleanedLabel,
    sourceKind: sanitizeText(sourceKind, 24).toLowerCase() || "plan",
  });
};

const resolveExplanationChip = (surfaceModel = null) => {
  const category = normalizeText(surfaceModel?.explanationCategory || surfaceModel?.explanationModel?.category || "");
  const sourceLabel = normalizeText(surfaceModel?.explanationSourceLabel || "");
  if (category === "adaptive_personalization" || /recent training/.test(sourceLabel)) {
    return { label: "Recent workouts", sourceKind: "inferred", key: "recent_workouts" };
  }
  if (category === "protective_adjustment" || /recovery-first/.test(sourceLabel)) {
    return { label: "Recovery protection", sourceKind: "inferred", key: "recovery_protection" };
  }
  if (category === "user_driven_modification" || /you changed this/.test(sourceLabel)) {
    return { label: "Your setup", sourceKind: "explicit", key: "your_setup" };
  }
  return { label: "Your priorities", sourceKind: "plan", key: "your_priorities" };
};

export const buildTodayTrustModel = ({
  surfaceModel = null,
  adjustments = {},
  environmentSelection = null,
  family = "",
} = {}) => {
  const chips = [];
  if (adjustments?.time === "short") pushChip(chips, "Time cap", "explicit", "time_cap");
  if (adjustments?.recovery === "low_energy") pushChip(chips, "Low recovery", "explicit", "low_recovery");
  if (adjustments?.soreness === "legs") pushChip(chips, "Sore legs", "explicit", "sore_legs");
  if (adjustments?.soreness === "upper") pushChip(chips, "Upper fatigue", "explicit", "upper_fatigue");
  if (adjustments?.impact === "low_impact") pushChip(chips, "Low impact", "explicit", "low_impact");
  if (adjustments?.cardioSwap === "bike") pushChip(chips, "Bike swap", "explicit", "bike_swap");
  if (adjustments?.cardioSwap === "elliptical") pushChip(chips, "Elliptical swap", "explicit", "elliptical_swap");
  if (adjustments?.cardioSwap === "treadmill") pushChip(chips, "Treadmill swap", "explicit", "treadmill_swap");
  if (environmentSelection?.scope === "today" && sanitizeText(environmentSelection?.mode || "")) {
    pushChip(chips, `${sanitizeText(environmentSelection.mode, 24)} setup`, "explicit", "today_setup");
  }

  const explanationChip = resolveExplanationChip(surfaceModel);
  pushChip(chips, explanationChip.label, explanationChip.sourceKind, explanationChip.key);

  if (normalizeText(family) === "hybrid") {
    pushChip(chips, "Goal balance", "plan", "goal_balance");
  }

  return {
    chips: dedupeChips(chips).slice(0, 4),
  };
};

export const buildPlanWeekTrustModel = ({
  currentDay = null,
  previewWeek = null,
} = {}) => {
  const chips = [];
  if (currentDay?.status?.key === "adjusted" || currentDay?.isToday) {
    pushChip(chips, "Adaptive today", "status", "adaptive_today");
  } else {
    pushChip(chips, "Fixed week", "status", "fixed_week");
  }
  if (Array.isArray(previewWeek?.days) && previewWeek.days.length) {
    pushChip(chips, "Next week can change", "forecast", "next_week_preview");
  }
  return {
    chips: dedupeChips(chips).slice(0, 3),
  };
};

export const buildPlanDayTrustModel = ({
  day = null,
  preview = false,
} = {}) => {
  if (!day) return { chips: [] };
  const chips = [];
  const isPreview = Boolean(preview || day?.status?.key === "preview");
  if (isPreview) {
    pushChip(chips, "Preview", "forecast", "preview");
    pushChip(chips, "Can change", "forecast", "can_change");
  } else {
    pushChip(chips, "Committed", "status", "committed");
    pushChip(chips, day?.status?.key === "adjusted" || day?.isToday ? "Adaptive day" : "Fixed day", "status", "day_mode");
  }

  if (day?.status?.key === "adjusted") pushChip(chips, "Adjusted", "status", "adjusted");
  if (day?.status?.key === "completed") pushChip(chips, "Completed", "status", "completed");
  if (day?.status?.key === "missed") pushChip(chips, "Missed", "status", "missed");
  if (day?.status?.key === "recovery") pushChip(chips, "Recovery", "plan", "recovery");
  if (!isPreview && day?.isToday) pushChip(chips, "Today", "status", "today");

  return {
    chips: dedupeChips(chips).slice(0, 4),
  };
};

export const buildLogTrustModel = ({
  completionSelection = "completed",
  hasSignalsInput = false,
  actualModalityKey = "",
} = {}) => {
  const chips = [];
  pushChip(chips, "Prescribed loaded", "plan", "prescribed_loaded");

  if (completionSelection === "partial") {
    pushChip(chips, "Partial session", "status", "partial_session");
  } else if (completionSelection === "skipped") {
    pushChip(chips, "Skipped day", "status", "skipped_day");
  } else if (completionSelection === "swapped") {
    const modality = normalizeText(actualModalityKey);
    if (["run", "treadmill", "bike", "elliptical", "walk", "rower", "swim"].includes(modality)) {
      pushChip(chips, "Cardio substitute", "status", "cardio_substitute");
    } else if (modality === "strength") {
      pushChip(chips, "Strength substitute", "status", "strength_substitute");
    } else {
      pushChip(chips, "Swapped session", "status", "swapped_session");
    }
  } else {
    pushChip(chips, "Actual session", "status", "actual_session");
  }

  if (hasSignalsInput) pushChip(chips, "Recovery signal", "explicit", "recovery_signal");
  pushChip(chips, "Used later", "inferred", "used_later");

  return {
    chips: dedupeChips(chips).slice(0, 4),
  };
};

