import { deriveCanonicalAthleteState } from "../canonical-athlete-service.js";
import { composeGoalNativePlan } from "../../modules-planning.js";
import { NUTRITION_DAY_TYPES } from "../nutrition-day-taxonomy-service.js";
import { buildPeterAuditGoalFixture } from "./peter-audit-fixture.js";

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

export const PETER_AUDIT_WEEK_TEMPLATES = Object.freeze([
  { w: 1, phase: "BASE", label: "Getting legs back", mon: { t: "Easy", d: "3 mi" }, thu: { t: "Tempo", d: "2mi WU+20min+1mi CD" }, fri: { t: "Easy", d: "4 mi" }, sat: { t: "Long", d: "4 mi" }, str: "A", nutri: NUTRITION_DAY_TYPES.runEasy },
  { w: 2, phase: "BASE", label: "Building rhythm", mon: { t: "Easy", d: "3 mi" }, thu: { t: "Tempo", d: "2mi WU+25min+1mi CD" }, fri: { t: "Easy", d: "4 mi" }, sat: { t: "Long", d: "5 mi" }, str: "A", nutri: NUTRITION_DAY_TYPES.runEasy },
  { w: 3, phase: "BASE", label: "First intervals", mon: { t: "Easy", d: "3.5 mi" }, thu: { t: "Intervals", d: "1mi+3x8min/3min+1mi" }, fri: { t: "Easy", d: "4.5 mi" }, sat: { t: "Long", d: "5 mi" }, str: "A", nutri: NUTRITION_DAY_TYPES.runQuality },
  { w: 4, phase: "BASE", label: "Cutback", cutback: true, mon: { t: "Easy", d: "3 mi" }, thu: { t: "Tempo", d: "1mi WU+20min easy+1mi" }, fri: { t: "Easy", d: "3 mi" }, sat: { t: "Long", d: "4 mi" }, str: "A", nutri: NUTRITION_DAY_TYPES.runEasy },
  { w: 5, phase: "BUILDING", label: "New territory", mon: { t: "Easy", d: "3.5 mi" }, thu: { t: "Tempo", d: "2mi WU+30min+1mi CD" }, fri: { t: "Easy", d: "5 mi" }, sat: { t: "Long", d: "6 mi" }, str: "B", nutri: NUTRITION_DAY_TYPES.runEasy },
  { w: 6, phase: "BUILDING", label: "Speed sharpening", mon: { t: "Easy", d: "4 mi" }, thu: { t: "Intervals", d: "1mi+4x6min/2min+1mi" }, fri: { t: "Easy", d: "5 mi" }, sat: { t: "Long", d: "7 mi" }, str: "B", nutri: NUTRITION_DAY_TYPES.runQuality },
  { w: 7, phase: "BUILDING", label: "Dialing in", mon: { t: "Easy", d: "4 mi" }, thu: { t: "Tempo", d: "2mi WU+35min+1mi CD" }, fri: { t: "Easy", d: "5.5 mi" }, sat: { t: "Long", d: "7 mi" }, str: "B", nutri: NUTRITION_DAY_TYPES.runEasy },
  { w: 8, phase: "BUILDING", label: "Cutback", cutback: true, mon: { t: "Easy", d: "3 mi" }, thu: { t: "Tempo", d: "1mi WU+20min+1mi" }, fri: { t: "Easy", d: "4 mi" }, sat: { t: "Long", d: "5 mi" }, str: "B", nutri: NUTRITION_DAY_TYPES.runEasy },
  { w: 9, phase: "PEAKBUILD", label: "Double digits incoming", mon: { t: "Easy", d: "4 mi" }, thu: { t: "Intervals", d: "1mi+4x8min/3min+1mi" }, fri: { t: "Easy", d: "6 mi" }, sat: { t: "Long", d: "8 mi" }, str: "A", nutri: NUTRITION_DAY_TYPES.runQuality },
  { w: 10, phase: "PEAKBUILD", label: "Pushing toward 9", mon: { t: "Easy", d: "4.5 mi" }, thu: { t: "Tempo", d: "2mi WU+40min+1mi CD" }, fri: { t: "Easy", d: "6 mi" }, sat: { t: "Long", d: "9 mi" }, str: "A", nutri: NUTRITION_DAY_TYPES.runEasy },
  { w: 11, phase: "PEAKBUILD", label: "Holding strong", mon: { t: "Easy", d: "4.5 mi" }, thu: { t: "Intervals", d: "1mi+5x6min/2min+1mi" }, fri: { t: "Easy", d: "6.5 mi" }, sat: { t: "Long", d: "9 mi" }, str: "A", nutri: NUTRITION_DAY_TYPES.runQuality },
  { w: 12, phase: "PEAKBUILD", label: "Cutback", cutback: true, mon: { t: "Easy", d: "3.5 mi" }, thu: { t: "Tempo", d: "1mi WU+25min+1mi" }, fri: { t: "Easy", d: "4 mi" }, sat: { t: "Long", d: "5 mi" }, str: "A", nutri: NUTRITION_DAY_TYPES.runEasy },
]);

const buildWeekSnapshot = ({ fixture, athleteProfile, baseWeek, currentWeek }) => {
  const composer = composeGoalNativePlan({
    goals: fixture.goals,
    personalization: fixture.personalization,
    athleteProfile,
    momentum: { inconsistencyRisk: "low", momentumState: "stable" },
    learningLayer: {},
    currentWeek,
    baseWeek,
    weekTemplates: PETER_AUDIT_WEEK_TEMPLATES,
    logs: {},
    bodyweights: fixture.bodyweights,
    dailyCheckins: {},
    nutritionActualLogs: {},
    coachActions: [],
    todayKey: fixture.referenceDate,
    currentDayOfWeek: 4,
    plannedDayRecords: {},
    planWeekRecords: {},
  });
  const sessions = Object.entries(composer.dayTemplates || {}).map(([dayKey, session]) => ({
    dayKey,
    label: sanitizeText(session?.label || "", 140),
    type: sanitizeText(session?.type || "", 60),
    nutritionDayType: sanitizeText(session?.nutri || "", 80),
    runDetail: sanitizeText(session?.run?.d || "", 120),
    optionalSecondary: sanitizeText(session?.optionalSecondary || "", 160),
    upperBodyBias: Boolean(session?.upperBodyBias),
  }));
  return {
    weekNumber: currentWeek,
    phase: sanitizeText(baseWeek.phase || "", 60),
    label: sanitizeText(baseWeek.label || "", 120),
    cutback: Boolean(baseWeek.cutback),
    architecture: sanitizeText(composer.architecture || "", 80),
    dominantCategory: sanitizeText(composer.programBlock?.dominantEmphasis?.category || "", 60),
    secondaryCategory: sanitizeText(composer.programBlock?.secondaryEmphasis?.category || "", 60),
    sessions,
  };
};

const countSessions = (sessions = [], matcher = () => false) => sessions.filter(matcher).length;

export const buildPeterTwelveWeekPlanAudit = () => {
  const fixture = buildPeterAuditGoalFixture();
  const athleteProfile = deriveCanonicalAthleteState({
    goals: fixture.goals,
    personalization: fixture.personalization,
    profileDefaults: { name: fixture.assumptions.profile.name },
  });
  const weeks = PETER_AUDIT_WEEK_TEMPLATES.map((baseWeek, index) => buildWeekSnapshot({
    fixture,
    athleteProfile,
    baseWeek,
    currentWeek: index + 1,
  }));

  const longRunDetails = weeks.map((week) => week.sessions.find((session) => session.type === "long-run")?.runDetail || "");
  const explicitBenchExposureCount = weeks.reduce((sum, week) => sum + countSessions(week.sessions, (session) => /bench|press/i.test(session.label)), 0);
  const genericStrengthExposureCount = weeks.reduce((sum, week) => sum + countSessions(week.sessions, (session) => /strength/.test(session.type)), 0);
  const qualitySessionCount = weeks.reduce((sum, week) => sum + countSessions(week.sessions, (session) => session.type === "hard-run"), 0);
  const recoveryDaysPerWeek = weeks.map((week) => countSessions(week.sessions, (session) => session.type === "rest"));
  const weeklyRunFrequency = weeks.map((week) => countSessions(week.sessions, (session) => /run/.test(session.type)));
  const nutritionDayTypes = [...new Set(weeks.flatMap((week) => week.sessions.map((session) => session.nutritionDayType).filter(Boolean)))];
  const goalFamilies = new Set(
    fixture.goals
      .map((goal) => sanitizeText(goal?.resolvedGoal?.goalFamily || goal?.goalFamily || goal?.category || "", 40).toLowerCase())
      .filter(Boolean)
  );
  const emphasisCategories = new Set(
    weeks
      .flatMap((week) => [week.dominantCategory, week.secondaryCategory])
      .map((value) => sanitizeText(value || "", 40).toLowerCase())
      .filter(Boolean)
  );
  const riskFlags = [];

  if (new Set(longRunDetails.filter(Boolean)).size <= 1) {
    riskFlags.push({
      key: "long_run_progression_flat",
      severity: "high",
      summary: "The generated long-run prescription stays flat at 45-60 min across the whole 12-week block even while the underlying week templates escalate.",
    });
  }
  if (explicitBenchExposureCount === 0) {
    riskFlags.push({
      key: "bench_specificity_missing",
      severity: "high",
      summary: "The generated block never surfaces an explicit bench-specific session, only a generic short strength support slot.",
    });
  }
  if (genericStrengthExposureCount < weeks.length * 2) {
    riskFlags.push({
      key: "strength_exposure_sparse",
      severity: "medium",
      summary: "Strength exposure lands at roughly one generic session per week, which is a weak signal for pushing a 225 bench while the run goal leads.",
    });
  }
  if (weeks.some((week) => week.sessions.some((session) => session.type === "strength+prehab" && !session.upperBodyBias))) {
    riskFlags.push({
      key: "lower_body_fatigue_conflict_unresolved",
      severity: "medium",
      summary: "The support strength day is not explicitly upper-body biased, so the planner does not clearly prove that lower-body fatigue stays subordinate to the run lane.",
    });
  }
  if ((goalFamilies.has("body_comp") || goalFamilies.has("appearance")) && !emphasisCategories.has("body_comp")) {
    riskFlags.push({
      key: "body_comp_lane_not_explicit",
      severity: "medium",
      summary: "The generated block stays running-led with strength support and never exposes body composition as a visible planning emphasis despite active fat-loss and appearance goals.",
    });
  }

  return {
    fixture,
    weeks,
    summary: {
      weeklyRunFrequency,
      longRunDetails,
      qualitySessionCount,
      explicitBenchExposureCount,
      genericStrengthExposureCount,
      recoveryDaysPerWeek,
      deloadWeeks: weeks.filter((week) => week.cutback).map((week) => week.weekNumber),
      nutritionDayTypes,
    },
    riskFlags,
  };
};
