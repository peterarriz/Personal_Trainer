export const DEFAULT_PLANNING_HORIZON_WEEKS = 12;

export const daysUntil = (dateStr) => {
  if (!dateStr) return 9999;
  const t = new Date(`${dateStr}T12:00:00`).getTime();
  if (Number.isNaN(t)) return 9999;
  return Math.floor((t - Date.now()) / 86400000);
};

export const composeGoalNativePlan = ({ goals, personalization, momentum, learningLayer, baseWeek }) => {
  const active = (goals || []).filter(g => g.active).sort((a, b) => a.priority - b.priority);
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

  const dayTemplates = {
    race_prep_dominant: {
      1: { type: "run+strength", label: "Quality Run + Strength", run: baseWeek.mon, strSess: baseWeek.str, nutri: "hardRun" },
      2: { type: "conditioning", label: "Conditioning / OTF", nutri: "otf" },
      3: { type: "strength+prehab", label: "Strength + Prehab", strSess: baseWeek.str === "A" ? "B" : "A", nutri: "strength" },
      4: { type: "hard-run", label: `${baseWeek.thu?.t || "Tempo"} Run`, run: baseWeek.thu, nutri: "hardRun" },
      5: { type: "easy-run", label: "Easy Run", run: baseWeek.fri, nutri: "easyRun" },
      6: { type: "long-run", label: "Long Run", run: baseWeek.sat, nutri: "longRun" },
      0: { type: "rest", label: "Recovery / Mobility", nutri: "rest" },
    },
    strength_dominant: {
      1: { type: "strength+prehab", label: "Strength Priority A", strSess: "A", nutri: "strength" },
      2: { type: "easy-run", label: "Supportive Conditioning Run", run: { t: "Easy", d: "20-30 min zone-2" }, nutri: "easyRun" },
      3: { type: "strength+prehab", label: "Strength Priority B", strSess: "B", nutri: "strength" },
      4: { type: "strength+prehab", label: "Upper Push/Pull Strength", strSess: "A", nutri: "strength" },
      5: { type: "easy-run", label: "Conditioning Support", run: { t: "Easy", d: "20-25 min + strides optional" }, nutri: "easyRun" },
      6: { type: "strength+prehab", label: "Full-Body Strength", strSess: "B", nutri: "strength" },
      0: { type: "rest", label: "Recovery / Mobility", nutri: "rest" },
    },
    body_comp_conditioning: {
      1: { type: "strength+prehab", label: "Metabolic Strength A", strSess: "A", nutri: "strength" },
      2: { type: "easy-run", label: "Conditioning (low-friction)", run: { t: "Easy", d: "25-35 min zone-2" }, nutri: "easyRun" },
      3: { type: "strength+prehab", label: "Metabolic Strength B", strSess: "B", nutri: "strength" },
      4: { type: "conditioning", label: "Conditioning Intervals / OTF", nutri: "otf" },
      5: { type: "strength+prehab", label: "Strength Retention", strSess: "A", nutri: "strength" },
      6: { type: "easy-run", label: "Supportive Run/Walk", run: { t: "Easy", d: "20-30 min" }, nutri: "easyRun" },
      0: { type: "rest", label: "Recovery / Steps + Mobility", nutri: "rest" },
    },
    hybrid_performance: {
      1: { type: "run+strength", label: "Run + Strength", run: baseWeek.mon, strSess: baseWeek.str, nutri: "easyRun" },
      2: { type: "conditioning", label: "Conditioning", nutri: "otf" },
      3: { type: "strength+prehab", label: "Strength B + Prehab", strSess: baseWeek.str === "A" ? "B" : "A", nutri: "strength" },
      4: { type: "hard-run", label: `${baseWeek.thu?.t || "Tempo"} Run`, run: baseWeek.thu, nutri: "hardRun" },
      5: { type: "strength+prehab", label: "Strength Focus", strSess: baseWeek.str, nutri: "strength" },
      6: { type: "easy-run", label: "Supportive Endurance", run: baseWeek.fri, nutri: "easyRun" },
      0: { type: "rest", label: "Recovery", nutri: "rest" },
    },
    maintenance_rebuild: {
      1: { type: "strength+prehab", label: "Minimum Viable Strength", strSess: "A", nutri: "strength" },
      2: { type: "rest", label: "Recovery / Walk", nutri: "rest" },
      3: { type: "easy-run", label: "Short Conditioning", run: { t: "Easy", d: "20-25 min" }, nutri: "easyRun" },
      4: { type: "strength+prehab", label: "Minimum Viable Strength B", strSess: "B", nutri: "strength" },
      5: { type: "rest", label: "Recovery", nutri: "rest" },
      6: { type: "conditioning", label: "Optional Conditioning", nutri: "easyRun" },
      0: { type: "rest", label: "Recovery", nutri: "rest" },
    },
  };

  return {
    architecture,
    split,
    why,
    constraints,
    drivers: [primary?.name, ...secondary.map(g => g.name)].filter(Boolean),
    unlockMessage: !hasGym && strengthGoal ? "When gym access returns, bench-specific progression can move from foundation mode to direct loading." : "",
    dayTemplates: dayTemplates[architecture],
  };
};

export const getSpecificityBand = (offset) => offset <= 1 ? "high" : offset <= 5 ? "medium" : "directional";

export const getHorizonAnchor = (goals = [], horizonWeeks = DEFAULT_PLANNING_HORIZON_WEEKS) => {
  const activeDated = (goals || []).filter(g => g.active && g.targetDate).map(g => ({ ...g, days: daysUntil(g.targetDate) })).filter(g => g.days >= 0).sort((a,b) => a.days - b.days);
  const nearest = activeDated[0] || null;
  if (!nearest) return { nearest: null, withinHorizon: false, weekIndex: null };
  const weekIndex = Math.ceil((nearest.days + 1) / 7);
  return { nearest, withinHorizon: weekIndex <= horizonWeeks, weekIndex };
};

export const buildRollingHorizonWeeks = ({ currentWeek, horizonWeeks = DEFAULT_PLANNING_HORIZON_WEEKS, goals, weekTemplates }) => {
  const anchor = getHorizonAnchor(goals, horizonWeeks);
  return Array.from({ length: horizonWeeks }).map((_, idx) => {
    const absoluteWeek = currentWeek + idx;
    const template = weekTemplates[(absoluteWeek - 1) % weekTemplates.length] || weekTemplates[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + (idx * 7));
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    return {
      slot: idx + 1,
      absoluteWeek,
      template,
      specificity: getSpecificityBand(idx),
      startDate,
      endDate,
      anchorHit: anchor.withinHorizon && anchor.weekIndex === (idx + 1),
    };
  });
};
