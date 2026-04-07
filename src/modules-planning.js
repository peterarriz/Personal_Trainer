export const DEFAULT_PLANNING_HORIZON_WEEKS = 12;
export const RECOVERY_BLOCK_WEEKS = 2;

export const inferGoalType = (goal = {}) => {
  if (goal?.type === "time_bound" || goal?.type === "ongoing") return goal.type;
  return goal?.targetDate ? "time_bound" : "ongoing";
};

export const normalizeGoalObject = (goal = {}, idx = 0) => {
  const type = inferGoalType(goal);
  const tracking = goal?.tracking || (type === "ongoing"
    ? {
        mode: goal?.category === "body_comp" ? "weekly_checkin" : goal?.category === "strength" ? "logged_lifts" : "progress_tracker",
        unit: goal?.category === "body_comp" ? "lb" : goal?.category === "strength" ? "lb" : "",
      }
    : { mode: "deadline" });
  return {
    id: goal?.id || `goal_${idx + 1}`,
    name: goal?.name || "Goal",
    category: goal?.category || "running",
    priority: Number(goal?.priority || (idx + 1)),
    targetDate: goal?.targetDate || "",
    measurableTarget: goal?.measurableTarget || "",
    active: goal?.active !== false,
    ...goal,
    type,
    tracking,
  };
};

export const normalizeGoals = (goals = []) => (goals || []).map((g, idx) => normalizeGoalObject(g, idx));

export const getGoalBuckets = (goals = []) => {
  const normalized = normalizeGoals(goals);
  const active = normalized.filter(g => g.active).sort((a, b) => a.priority - b.priority);
  const timeBound = active.filter(g => g.type === "time_bound");
  const ongoing = active.filter(g => g.type === "ongoing");
  return { normalized, active, timeBound, ongoing };
};

export const daysUntil = (dateStr) => {
  if (!dateStr) return 9999;
  const t = new Date(`${dateStr}T12:00:00`).getTime();
  if (Number.isNaN(t)) return 9999;
  return Math.floor((t - Date.now()) / 86400000);
};

export const getActiveTimeBoundGoal = (goals = []) => {
  const { timeBound } = getGoalBuckets(goals);
  return (timeBound || [])
    .map(g => ({ ...g, days: daysUntil(g.targetDate) }))
    .filter(g => Number.isFinite(g.days))
    .sort((a, b) => a.days - b.days)[0] || null;
};

export const composeGoalNativePlan = ({ goals, personalization, momentum, learningLayer, baseWeek }) => {
  const { active } = getGoalBuckets(goals);
  const primary = active[0] || null;
  const secondary = active.slice(1, 3);
  const env = personalization?.travelState?.environmentMode || personalization?.travelState?.access || "home";
  const hasGym = ["full gym", "limited gym"].includes(env);
  const runningGoal = active.find(g => g.category === "running");
  const strengthGoal = active.find(g => g.category === "strength");
  const bodyCompGoal = active.find(g => g.category === "body_comp");
  const raceNear = daysUntil(runningGoal?.targetDate) <= 56;
  const inconsistencyRisk = momentum?.inconsistencyRisk || "medium";
  const lowBandwidth = inconsistencyRisk === "high" || learningLayer?.adjustmentBias === "simplify";
  const strengthPriority = primary?.category === "strength" && !lowBandwidth;
  const bodyCompActive = !!bodyCompGoal;

  const runningScore = (primary?.category === "running" ? 3 : 0) + (runningGoal ? 2 : 0) + (raceNear ? 2 : 0);
  const strengthScore = (primary?.category === "strength" ? 3 : 0) + (strengthGoal ? 2 : 0) + (hasGym ? 1 : -1);
  const bodyCompScore = (primary?.category === "body_comp" ? 3 : 0) + (bodyCompGoal ? 2 : 0) + (lowBandwidth ? 1 : 0);

  let architecture = "hybrid_performance";
  if (lowBandwidth) architecture = "maintenance_rebuild";
  else if (runningScore >= Math.max(strengthScore, bodyCompScore) && (raceNear || primary?.category === "running")) architecture = "race_prep_dominant";
  else if (bodyCompScore >= Math.max(runningScore, strengthScore)) architecture = "body_comp_conditioning";
  else if (strengthScore >= Math.max(runningScore, bodyCompScore)) architecture = hasGym ? "strength_dominant" : "hybrid_performance";

  const splits = {
    race_prep_dominant: { run: 4, strength: 2, conditioning: 1, recovery: 1 },
    strength_dominant: { run: 2, strength: 4, conditioning: 1, recovery: 1 },
    body_comp_conditioning: { run: 2, strength: 3, conditioning: 2, recovery: 1 },
    hybrid_performance: { run: 3, strength: 3, conditioning: 1, recovery: 1 },
    maintenance_rebuild: { run: 2, strength: 2, conditioning: 1, recovery: 2 },
  };
  const split = splits[architecture];

  const constraints = [];
  if (!hasGym && strengthGoal) constraints.push("Bench-specific progression constrained by no gym access; using home/limited-equipment substitutes.");
  if (architecture !== "race_prep_dominant" && runningGoal) constraints.push("Running kept supportive/maintenance until running priority or race proximity increases.");
  const why = [
    `Primary goal: ${primary?.name || "none set"}.`,
    `Environment: ${env}.`,
    `Inconsistency risk: ${inconsistencyRisk}.`,
    bodyCompGoal ? "Body-comp goal is active and materially affects split allocation." : null,
    raceNear ? "Race date is near enough to increase running weight." : null,
  ].filter(Boolean);

  const restDay = (label = "Active Recovery") => ({ type: "rest", label, nutri: "rest", isRecoverySlot: true });

  const dayTemplates = {
    race_prep_dominant: {
      1: { type: "run+strength", label: "Quality Run + Strength", run: baseWeek.mon, strSess: baseWeek.str, nutri: "hardRun" },
      2: { type: "conditioning", label: "Conditioning / OTF", nutri: "otf" },
      3: { type: "strength+prehab", label: "Strength + Prehab", strSess: baseWeek.str === "A" ? "B" : "A", nutri: "strength" },
      4: { type: "hard-run", label: `${baseWeek.thu?.t || "Tempo"} Run`, run: baseWeek.thu, nutri: "hardRun" },
      5: { type: "easy-run", label: "Easy Run", run: baseWeek.fri, nutri: "easyRun" },
      6: { type: "long-run", label: "Long Run", run: baseWeek.sat, nutri: "longRun" },
      0: restDay("Active Recovery"),
    },
    strength_dominant: {
      1: { type: "strength+prehab", label: "Strength Priority A", strSess: "A", nutri: "strength" },
      2: { type: "easy-run", label: "Supportive Conditioning Run", run: { t: "Easy", d: "20-30 min zone-2" }, nutri: "easyRun" },
      3: { type: "strength+prehab", label: "Strength Priority B", strSess: "B", nutri: "strength" },
      4: { type: "strength+prehab", label: "Upper Push/Pull Strength", strSess: "A", nutri: "strength" },
      5: { type: "easy-run", label: "Conditioning Support", run: { t: "Easy", d: "20-25 min + strides optional" }, nutri: "easyRun" },
      6: { type: "strength+prehab", label: "Full-Body Strength", strSess: "B", nutri: "strength" },
      0: restDay("Active Recovery"),
    },
    body_comp_conditioning: {
      1: { type: "strength+prehab", label: "Metabolic Strength A", strSess: "A", nutri: "strength" },
      2: { type: "easy-run", label: "Conditioning (low-friction)", run: { t: "Easy", d: "25-35 min zone-2" }, nutri: "easyRun" },
      3: { type: "strength+prehab", label: "Metabolic Strength B", strSess: "B", nutri: "strength" },
      4: { type: "conditioning", label: "Conditioning Intervals / OTF", nutri: "otf" },
      5: { type: "strength+prehab", label: "Strength Retention", strSess: "A", nutri: "strength" },
      6: { type: "easy-run", label: "Supportive Run/Walk", run: { t: "Easy", d: "20-30 min" }, nutri: "easyRun" },
      0: restDay("Active Recovery — Steps + Mobility"),
    },
    hybrid_performance: {
      1: { type: "run+strength", label: "Run + Strength", run: baseWeek.mon, strSess: baseWeek.str, nutri: "easyRun" },
      2: { type: "conditioning", label: "Conditioning", nutri: "otf" },
      3: { type: "strength+prehab", label: "Strength B + Prehab", strSess: baseWeek.str === "A" ? "B" : "A", nutri: "strength" },
      4: { type: "hard-run", label: `${baseWeek.thu?.t || "Tempo"} Run`, run: baseWeek.thu, nutri: "hardRun" },
      5: { type: "strength+prehab", label: "Strength Focus", strSess: baseWeek.str, nutri: "strength" },
      6: { type: "easy-run", label: "Supportive Endurance", run: baseWeek.fri, nutri: "easyRun" },
      0: restDay("Active Recovery"),
    },
    maintenance_rebuild: {
      1: { type: "strength+prehab", label: "Short Version Strength", strSess: "A", nutri: "strength" },
      2: restDay("Active Recovery — Walk"),
      3: { type: "easy-run", label: "Short Conditioning", run: { t: "Easy", d: "20-25 min" }, nutri: "easyRun" },
      4: { type: "strength+prehab", label: "Short Version Strength B", strSess: "B", nutri: "strength" },
      5: restDay("Active Recovery"),
      6: { type: "conditioning", label: "Optional Conditioning", nutri: "easyRun" },
      0: restDay("Active Recovery"),
    },
  };

  const annotateTemplate = (template) => {
    const out = Object.fromEntries(Object.entries(template || {}).map(([day, session]) => {
      const nextSession = { ...session };
      const isStrengthSession = ["run+strength", "strength+prehab"].includes(nextSession.type);
      if (isStrengthSession && !strengthPriority && !/short strength/i.test(nextSession.label || "")) {
        nextSession.label = `${nextSession.label} (Short Strength)`;
      }
      if (isStrengthSession) {
        nextSession.strengthDose = strengthPriority ? "40-55 min strength progression" : "20-35 min maintenance strength";
      }
      const allowsOptionalCore = nextSession.type !== "rest";
      if (bodyCompActive && allowsOptionalCore) {
        nextSession.optionalSecondary = "Optional: 10 min core finisher";
      }
      return [day, nextSession];
    }));
    return out;
  };

  const annotatedTemplates = annotateTemplate(dayTemplates[architecture]);
  let strengthSessionsPerWeek = Object.values(annotatedTemplates).filter(s => ["run+strength", "strength+prehab"].includes(s?.type)).length;
  if (strengthGoal && strengthSessionsPerWeek < 1) {
    annotatedTemplates[3] = { type: "strength+prehab", label: "Minimum Strength Touchpoint (Short Strength)", strSess: "A", nutri: "strength", strengthDose: "20-30 min maintenance strength" };
    strengthSessionsPerWeek = 1;
  }

  const maintainedGoals = active
    .filter(g => g.id !== primary?.id && g.category !== "injury_prevention")
    .slice(0, 2)
    .map(g => g.name);
  const minimizedGoal = active.find(g => g.category === "injury_prevention")?.name || "non-primary volume";
  const blockIntent = {
    prioritized: primary?.name || "Consistency and execution",
    maintained: maintainedGoals.length ? maintainedGoals : ["general fitness"],
    minimized: minimizedGoal,
    narrative: `This block prioritizes ${primary?.category || "consistency"}. ${maintainedGoals[0] ? `${maintainedGoals[0]} is maintained.` : "Secondary goals are maintained."} ${bodyCompActive ? "Core work stays minimal but consistent." : "Non-primary accessories stay intentionally limited."}`,
  };

  return {
    architecture,
    split,
    why,
    constraints,
    drivers: [primary?.name, ...secondary.map(g => g.name)].filter(Boolean),
    unlockMessage: !hasGym && strengthGoal ? "When gym access returns, bench-specific progression can move from foundation mode to direct loading." : "",
    dayTemplates: annotatedTemplates,
    blockIntent,
    strengthAllocation: {
      sessionsPerWeek: strengthSessionsPerWeek,
      dosing: strengthPriority ? "full" : "maintenance",
      targetSessionDuration: strengthPriority ? "40-55 min" : "20-35 min",
    },
    aestheticAllocation: bodyCompActive ? {
      active: true,
      weeklyCoreFinishers: 3,
      dosage: "8-12 min optional finishers",
    } : { active: false },
  };
};

export const getSpecificityBand = (offset) => offset <= 1 ? "high" : offset <= 5 ? "medium" : "directional";

export const getHorizonAnchor = (goals = [], horizonWeeks = DEFAULT_PLANNING_HORIZON_WEEKS) => {
  const timeGoal = getActiveTimeBoundGoal(goals);
  if (!timeGoal) return { nearest: null, withinHorizon: false, weekIndex: null };
  const weekIndex = Math.ceil((Math.max(0, timeGoal.days) + 1) / 7);
  return { nearest: timeGoal, withinHorizon: weekIndex <= horizonWeeks, weekIndex };
};

const labelPhaseWeeks = (rows = []) => {
  const counts = {};
  return rows.map((row) => {
    if (row.kind !== "plan") return row;
    const phase = row?.template?.phase || "BASE";
    counts[phase] = (counts[phase] || 0) + 1;
    return { ...row, phaseWeek: counts[phase], phaseLabel: `${phase} · Week ${counts[phase]}` };
  });
};

export const buildRollingHorizonWeeks = ({ currentWeek, horizonWeeks = DEFAULT_PLANNING_HORIZON_WEEKS, goals, weekTemplates }) => {
  const anchor = getHorizonAnchor(goals, horizonWeeks);
  const timeGoal = getActiveTimeBoundGoal(goals);
  const today = new Date();

  const buildPlanWeek = (idx) => {
    const absoluteWeek = currentWeek + idx;
    const templateIndex = Math.max(0, Math.min((absoluteWeek - 1), (weekTemplates?.length || 1) - 1));
    const template = weekTemplates[templateIndex] || weekTemplates[weekTemplates.length - 1] || {};
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + (idx * 7));
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    return {
      kind: "plan",
      slot: idx + 1,
      absoluteWeek,
      template,
      specificity: getSpecificityBand(idx),
      startDate,
      endDate,
      anchorHit: anchor.withinHorizon && anchor.weekIndex === (idx + 1),
    };
  };

  if (!timeGoal) {
    const fallback = Array.from({ length: horizonWeeks }).map((_, idx) => buildPlanWeek(idx));
    return fallback.map((row) => ({
      ...row,
      weekLabel: `${row?.template?.phase || "BASE"} · Week ${row.absoluteWeek}`,
    }));
  }

  const daysToDeadline = daysUntil(timeGoal.targetDate);
  if (daysToDeadline >= 0) {
    const weeksToDeadline = Math.max(1, Math.ceil((daysToDeadline + 1) / 7));
    const visiblePlanWeeks = Math.min(horizonWeeks, weeksToDeadline);
    const rows = Array.from({ length: visiblePlanWeeks }).map((_, idx) => buildPlanWeek(idx));
    if (visiblePlanWeeks < horizonWeeks) {
      const recoveryStart = new Date(`${timeGoal.targetDate}T12:00:00`);
      recoveryStart.setDate(recoveryStart.getDate() + 1);
      const recoveryEnd = new Date(recoveryStart);
      recoveryEnd.setDate(recoveryStart.getDate() + (RECOVERY_BLOCK_WEEKS * 7) - 1);
      rows.push({
        kind: "recovery",
        slot: visiblePlanWeeks + 1,
        absoluteWeek: currentWeek + visiblePlanWeeks,
        weekLabel: "Recovery Block",
        focus: "Post-race recovery, low intensity, mobility, and reflection.",
        startDate: recoveryStart,
        endDate: recoveryEnd,
      });
      rows.push({
        kind: "next_goal_prompt",
        slot: visiblePlanWeeks + 2,
        absoluteWeek: currentWeek + visiblePlanWeeks + 1,
        weekLabel: "Set Next Goal",
        focus: "Choose the next time-bound objective while ongoing goals continue.",
      });
    }
    return labelPhaseWeeks(rows).map(row => ({ ...row, weekLabel: row.weekLabel || row.phaseLabel || `Week ${row.absoluteWeek}` }));
  }

  const daysSinceDeadline = Math.abs(daysToDeadline);
  const recoveryWeeksRemaining = Math.max(0, RECOVERY_BLOCK_WEEKS - Math.floor(daysSinceDeadline / 7));
  if (recoveryWeeksRemaining > 0) {
    const recoveryRows = Array.from({ length: Math.min(horizonWeeks, recoveryWeeksRemaining) }).map((_, idx) => {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() + (idx * 7));
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      return {
        kind: "recovery",
        slot: idx + 1,
        absoluteWeek: currentWeek + idx,
        weekLabel: `Recovery · Week ${idx + 1}`,
        focus: "Rebuild freshness and mobility before selecting a new race block.",
        startDate,
        endDate,
      };
    });
    if (recoveryRows.length < horizonWeeks) {
      recoveryRows.push({ kind: "next_goal_prompt", slot: recoveryRows.length + 1, absoluteWeek: currentWeek + recoveryRows.length, weekLabel: "Set Next Goal", focus: "Recovery block complete. Set your next time-bound goal." });
    }
    return recoveryRows;
  }

  return [{ kind: "next_goal_prompt", slot: 1, absoluteWeek: currentWeek, weekLabel: "Set Next Goal", focus: "Your previous race block has ended. Start the next time-bound plan." }];
};

// ── DETERMINISTIC TODAY-PLAN ENGINE ─────────────────────────────────────────

const GOAL_SESSION_ROTATIONS = {
  fat_loss:        ["strength", "cardio", "strength", "cardio", "strength", "cardio"],
  muscle_gain:     ["strength", "strength", "cardio", "strength", "strength", "cardio"],
  endurance:       ["cardio", "cardio", "strength", "cardio", "cardio", "strength"],
  general_fitness: ["strength", "cardio", "strength", "cardio", "strength", "cardio"],
};

const STRENGTH_LABELS = {
  fat_loss:        ["Metabolic Strength A", "Metabolic Strength B", "Strength Retention"],
  muscle_gain:     ["Upper Body Strength", "Lower Body Strength", "Push/Pull Strength", "Full-Body Strength"],
  endurance:       ["Maintenance Strength", "Prehab + Core"],
  general_fitness: ["Full-Body Strength A", "Full-Body Strength B"],
};

const CARDIO_LABELS = {
  fat_loss:        ["Conditioning Intervals", "Steady-State Cardio", "HIIT Circuit"],
  muscle_gain:     ["Easy Conditioning", "Low-Intensity Cardio"],
  endurance:       ["Tempo Run", "Easy Run", "Long Run", "Interval Session"],
  general_fitness: ["Conditioning", "Easy Cardio", "Interval Training"],
};

const INTENSITY_MAP = {
  beginner:     { base: "low",    push: "moderate" },
  intermediate: { base: "moderate", push: "high"   },
  advanced:     { base: "moderate", push: "high"   },
};

const SESSION_DURATIONS = { "20": 20, "30": 30, "45": 45, "60+": 60 };

/**
 * generateTodayPlan — deterministic engine that decides today's workout.
 *
 * @param {Object} userProfile - personalization.userGoalProfile
 *   { primary_goal, experience_level, days_per_week, session_length, equipment_access, constraints }
 * @param {Object} recentActivity - { logs: { [dateKey]: { date, type, feel, notes } }, todayKey: "YYYY-MM-DD" }
 * @param {Object} fatigueSignals - { fatigueScore (0-10), trend: "improving"|"stable"|"worsening", momentum: string, injuryLevel: string }
 * @returns {{ type, duration, intensity, label, reason }}
 */
export const generateTodayPlan = (userProfile = {}, recentActivity = {}, fatigueSignals = {}) => {
  const goal = userProfile.primary_goal || "general_fitness";
  const experience = userProfile.experience_level || "beginner";
  const targetDays = userProfile.days_per_week || 3;
  const sessionLen = userProfile.session_length || "30";
  const duration = SESSION_DURATIONS[sessionLen] || 30;
  const hasConstraints = (userProfile.constraints || []).length > 0;

  const todayKey = recentActivity.todayKey || new Date().toISOString().split("T")[0];
  const logs = recentActivity.logs || {};
  const fatigue = fatigueSignals.fatigueScore ?? 2;
  const fatigueTrend = fatigueSignals.trend || "stable";
  const momentum = fatigueSignals.momentum || "stable";
  const injuryLevel = fatigueSignals.injuryLevel || "none";

  // ── 1. Compute recent activity window (last 7 days) ──────────────
  const today = new Date(todayKey + "T12:00:00");
  const recentEntries = Object.entries(logs)
    .filter(([d]) => {
      const diff = (today.getTime() - new Date(d + "T12:00:00").getTime()) / 86400000;
      return diff > 0 && diff <= 7;
    })
    .sort((a, b) => b[0].localeCompare(a[0]));

  const sessionsThisWeek = recentEntries.length;
  const daysSinceLastWorkout = recentEntries.length
    ? Math.floor((today.getTime() - new Date(recentEntries[0][0] + "T12:00:00").getTime()) / 86400000)
    : 99;

  // ── 2. Classify recent sessions ───────────────────────────────────
  const recentTypes = recentEntries.map(([, l]) => {
    const t = String(l.type || "").toLowerCase();
    if (/strength|push|pull|upper|lower|full.body|metabolic/i.test(t)) return "strength";
    if (/run|cardio|conditioning|interval|tempo|hiit|otf/i.test(t)) return "cardio";
    return "other";
  });

  const recentStrength = recentTypes.filter(t => t === "strength").length;
  const recentCardio = recentTypes.filter(t => t === "cardio").length;

  // ── 3. Recovery gate ──────────────────────────────────────────────
  const needsRecovery =
    injuryLevel === "severe" ||
    injuryLevel === "moderate_pain" ||
    fatigue >= 7 ||
    fatigueTrend === "worsening" && fatigue >= 5 ||
    momentum === "falling off" && daysSinceLastWorkout <= 1 ||
    sessionsThisWeek >= targetDays ||
    daysSinceLastWorkout === 0; // already logged today

  if (needsRecovery) {
    const reason = injuryLevel === "severe"
      ? "Injury severity requires full rest."
      : injuryLevel === "moderate_pain"
      ? "Moderate pain detected — active recovery only."
      : fatigue >= 7
      ? "Fatigue is elevated — recovery prioritized to protect next session."
      : sessionsThisWeek >= targetDays
      ? `Weekly target of ${targetDays} sessions already reached. Recovery day.`
      : daysSinceLastWorkout === 0
      ? "Session already logged today."
      : "Accumulated fatigue warrants a recovery day.";

    return {
      type: "recovery",
      duration: Math.min(duration, 20),
      intensity: "low",
      label: injuryLevel === "severe"
        ? "Rest Day"
        : "Active Recovery — Walk + Mobility",
      reason,
    };
  }

  // ── 4. Re-entry logic (long gap) ─────────────────────────────────
  const isReEntry = daysSinceLastWorkout >= 4;
  if (isReEntry) {
    return {
      type: "strength",
      duration: Math.min(duration, 25),
      intensity: "low",
      label: "Re-entry: Easy Full-Body Movement",
      reason: `${daysSinceLastWorkout} days since last session. Starting easy to rebuild rhythm.`,
    };
  }

  // ── 5. Determine session type via goal rotation ───────────────────
  const rotation = GOAL_SESSION_ROTATIONS[goal] || GOAL_SESSION_ROTATIONS.general_fitness;
  // Position in rotation = total sessions completed this week
  const rotationIndex = sessionsThisWeek % rotation.length;
  let sessionType = rotation[rotationIndex];

  // Balance correction: if one type is overrepresented, flip
  const targetSplit = rotation.filter(t => t === "strength").length / rotation.length;
  const actualStrengthRatio = sessionsThisWeek > 0 ? recentStrength / sessionsThisWeek : 0;
  if (sessionType === "strength" && actualStrengthRatio > targetSplit + 0.2 && recentCardio === 0) {
    sessionType = "cardio";
  } else if (sessionType === "cardio" && actualStrengthRatio < targetSplit - 0.2 && recentStrength === 0) {
    sessionType = "strength";
  }

  // ── 6. Determine intensity ────────────────────────────────────────
  const intensityBase = INTENSITY_MAP[experience] || INTENSITY_MAP.beginner;
  let intensity = intensityBase.base;
  // Push harder when fresh (2+ days gap, low fatigue, building momentum)
  if (daysSinceLastWorkout >= 2 && fatigue <= 3 && (momentum === "building momentum" || momentum === "stable")) {
    intensity = intensityBase.push;
  }
  // Pull back if constraints or elevated fatigue
  if (hasConstraints || fatigue >= 5) {
    intensity = "low";
  }

  // ── 7. Select label ──────────────────────────────────────────────
  const labelPool = sessionType === "strength"
    ? (STRENGTH_LABELS[goal] || STRENGTH_LABELS.general_fitness)
    : (CARDIO_LABELS[goal] || CARDIO_LABELS.general_fitness);
  const labelIndex = (sessionType === "strength" ? recentStrength : recentCardio) % labelPool.length;
  const label = labelPool[labelIndex];

  // ── 8. Build reason ──────────────────────────────────────────────
  const reasonParts = [
    `Goal: ${goal.replace(/_/g, " ")}.`,
    `${sessionsThisWeek} of ${targetDays} sessions done this week.`,
    daysSinceLastWorkout >= 2
      ? `${daysSinceLastWorkout} days rest — ready to push.`
      : daysSinceLastWorkout === 1
      ? "Back-to-back day — moderate approach."
      : null,
    fatigue >= 4 ? `Fatigue elevated (${fatigue}/10) — intensity adjusted.` : null,
    hasConstraints ? `Active constraints: ${userProfile.constraints.join(", ")}.` : null,
  ].filter(Boolean);

  return {
    type: sessionType,
    duration,
    intensity,
    label,
    reason: reasonParts.join(" "),
  };
};
