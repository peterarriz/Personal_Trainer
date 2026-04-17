const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NUTRITION_AUDIT_LANES,
  buildNutritionCompatibilityAudit,
  buildPeterNutritionCompatibilityAudit,
  renderNutritionCompatibilityAuditMarkdown,
} = require("../src/services/audits/nutrition-compatibility-audit-service.js");

const buildRepresentativeDay = ({
  laneKey,
  sessionType = "",
  sessionLabel = "",
  dayType,
  targets,
  phaseMode = "maintain",
  adjustmentReasons = [],
}) => ({
  laneKey,
  sessionType,
  sessionLabel,
  dayType,
  targets,
  phaseMode,
  adjustmentReasons,
});

test("Peter nutrition audit exposes the current plan's representative target pattern and hydration proof gap", () => {
  const audit = buildPeterNutritionCompatibilityAudit();
  const riskKeys = audit.riskFlags.map((flag) => flag.key);
  const hardRun = audit.representativeDays.find((day) => day.laneKey === NUTRITION_AUDIT_LANES.hardRun);
  const longRun = audit.representativeDays.find((day) => day.laneKey === NUTRITION_AUDIT_LANES.longRun);
  const strength = audit.representativeDays.find((day) => day.laneKey === NUTRITION_AUDIT_LANES.strength);
  const recovery = audit.representativeDays.find((day) => day.laneKey === NUTRITION_AUDIT_LANES.recovery);

  assert.equal(audit.model, "nutrition_compatibility_audit");
  assert.equal(audit.version, 1);
  assert.equal(audit.verdict, "compatible_with_gaps");
  assert.equal(audit.representativeDays.length, 4);
  assert.equal(audit.auditContext.planCoverage.hardRunDays, 12);
  assert.equal(audit.auditContext.planCoverage.longRunDays, 12);
  assert.equal(audit.auditContext.planCoverage.strengthDays, 12);
  assert.equal(audit.auditContext.planCoverage.recoveryDays, 36);

  assert.equal(hardRun.targets.cal, 2700);
  assert.equal(hardRun.targets.c, 305);
  assert.equal(longRun.targets.cal, 2900);
  assert.equal(longRun.targets.c, 345);
  assert.equal(strength.targets.p, 200);
  assert.equal(recovery.targets.cal, 2210);
  assert.equal(recovery.targets.p, 185);

  assert.ok(riskKeys.includes("high_demand_hydration_targets_not_explicit"));
  assert.ok(riskKeys.includes("moderate_cut_is_relative_not_first_class"));
});

test("nutrition compatibility audit flags common target failures like flat carbs before quality work and low retention protein", () => {
  const audit = buildNutritionCompatibilityAudit({
    representativeDays: [
      buildRepresentativeDay({
        laneKey: NUTRITION_AUDIT_LANES.hardRun,
        sessionType: "hard-run",
        sessionLabel: "Threshold run",
        dayType: "run_quality",
        targets: { cal: 2400, c: 220, p: 190, f: 70, hydrationTargetOz: 100 },
      }),
      buildRepresentativeDay({
        laneKey: NUTRITION_AUDIT_LANES.longRun,
        sessionType: "long-run",
        sessionLabel: "Long run",
        dayType: "run_long",
        targets: { cal: 2450, c: 230, p: 185, f: 72, hydrationTargetOz: 102 },
      }),
      buildRepresentativeDay({
        laneKey: NUTRITION_AUDIT_LANES.strength,
        sessionType: "strength+prehab",
        sessionLabel: "Support strength",
        dayType: "strength_support",
        targets: { cal: 2380, c: 215, p: 160, f: 68, hydrationTargetOz: 96 },
      }),
      buildRepresentativeDay({
        laneKey: NUTRITION_AUDIT_LANES.recovery,
        sessionType: "rest",
        sessionLabel: "Recovery",
        dayType: "recovery",
        targets: { cal: 2300, c: 210, p: 160, f: 65, hydrationTargetOz: 92 },
      }),
    ],
    bodyweightLb: 185,
    auditContext: {
      name: "Broken target fixture",
      referenceDate: "2026-04-17",
      hasBodyCompGoal: true,
      explicitMaintenanceModel: true,
    },
  });

  const riskKeys = audit.riskFlags.map((flag) => flag.key);

  assert.equal(audit.verdict, "not_compatible");
  assert.ok(riskKeys.includes("hard_run_carbs_not_high_enough_above_recovery"));
  assert.ok(riskKeys.includes("hard_run_calories_not_high_enough_above_recovery"));
  assert.ok(riskKeys.includes("long_run_carbs_not_high_enough_above_hard_run"));
  assert.ok(riskKeys.includes("long_run_calories_not_high_enough_above_hard_run"));
  assert.ok(riskKeys.includes("strength_protein_below_retention_floor"));
  assert.ok(riskKeys.includes("recovery_protein_below_retention_floor"));
});

test("nutrition compatibility audit flags repeated under-fueling before hard or long sessions", () => {
  const audit = buildNutritionCompatibilityAudit({
    representativeDays: [
      buildRepresentativeDay({
        laneKey: NUTRITION_AUDIT_LANES.hardRun,
        sessionType: "hard-run",
        sessionLabel: "Threshold run",
        dayType: "run_quality",
        targets: { cal: 2700, c: 305, p: 190, f: 65, hydrationTargetOz: 123 },
      }),
      buildRepresentativeDay({
        laneKey: NUTRITION_AUDIT_LANES.longRun,
        sessionType: "long-run",
        sessionLabel: "Long run",
        dayType: "run_long",
        targets: { cal: 2900, c: 345, p: 190, f: 67, hydrationTargetOz: 123 },
      }),
      buildRepresentativeDay({
        laneKey: NUTRITION_AUDIT_LANES.strength,
        sessionType: "strength+prehab",
        sessionLabel: "Support strength",
        dayType: "strength_support",
        targets: { cal: 2500, c: 225, p: 200, f: 69, hydrationTargetOz: 111 },
      }),
      buildRepresentativeDay({
        laneKey: NUTRITION_AUDIT_LANES.recovery,
        sessionType: "rest",
        sessionLabel: "Recovery",
        dayType: "recovery",
        targets: { cal: 2210, c: 175, p: 185, f: 69, hydrationTargetOz: 101 },
      }),
    ],
    bodyweightLb: 185,
    auditContext: {
      name: "Execution drift fixture",
      referenceDate: "2026-04-17",
      hasBodyCompGoal: true,
      explicitMaintenanceModel: true,
    },
    plannedDayRecords: {
      "2026-04-09": { resolved: { nutrition: { prescription: { dayType: "run_quality", targets: { cal: 2700 } } } } },
      "2026-04-12": { resolved: { nutrition: { prescription: { dayType: "run_long", targets: { cal: 2900 } } } } },
    },
    nutritionActualLogs: {
      "2026-04-08": { deviationKind: "under_fueled", issue: "hunger", hydrationOz: 40, hydrationTargetOz: 100 },
      "2026-04-11": { deviationKind: "under_fueled", issue: "hunger", hydrationOz: 55, hydrationTargetOz: 100 },
    },
  });

  const driftRisk = audit.riskFlags.find((flag) => flag.key === "under_fueled_before_quality_day");

  assert.ok(driftRisk);
  assert.equal(driftRisk.severity, "high");
  assert.match(driftRisk.evidence, /2026-04-08 -> 2026-04-09/);
  assert.match(driftRisk.evidence, /2026-04-11 -> 2026-04-12/);
});

test("nutrition compatibility markdown renders a reviewer-friendly risk table", () => {
  const audit = buildPeterNutritionCompatibilityAudit();
  const markdown = renderNutritionCompatibilityAuditMarkdown(audit);

  assert.match(markdown, /^# Nutrition Compatibility Audit/m);
  assert.match(markdown, /\| Lane \| Day type \| Calories \| Carbs \| Protein \| Fat \| Hydration \| Notes \|/);
  assert.match(markdown, /\| ID \| Severity \| Area \| Finding \| Evidence \|/);
  assert.match(markdown, /high_demand_hydration_targets_not_explicit/);
  assert.match(markdown, /Hard run/);
  assert.match(markdown, /Long run/);
});
