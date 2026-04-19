const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const {
  completeStructuredIntakeOnOneScreen,
  gotoIntakeInLocalMode,
  readLocalCache,
} = require("./intake-test-utils.js");

const {
  generateLaunchSimulationPersonas,
  LAUNCH_SIMULATION_PERSONA_COUNT,
} = require("../src/services/synthetic-athlete-lab/launch-persona-generator.js");

const parsePositiveInt = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : fallback;
};

const TOTAL_PERSONAS = parsePositiveInt(process.env.LAUNCH_BROWSER_TOTAL, LAUNCH_SIMULATION_PERSONA_COUNT);
const CHUNK_START = parsePositiveInt(process.env.LAUNCH_BROWSER_START, 0);
const CHUNK_COUNT = parsePositiveInt(process.env.LAUNCH_BROWSER_COUNT, 25);
const SHOULD_RESUME = process.env.LAUNCH_BROWSER_RESUME !== "0";
const FAIL_ON_ERROR = process.env.LAUNCH_BROWSER_FAIL_ON_ERROR === "1";
const OUTPUT_DIR = process.env.LAUNCH_BROWSER_OUTPUT_DIR
  || path.join(process.cwd(), "artifacts", "launch-simulation", "browser-chunks");
const OUTPUT_FILE = process.env.LAUNCH_BROWSER_OUTPUT_FILE
  || path.join(OUTPUT_DIR, `chunk-${String(CHUNK_START).padStart(4, "0")}-${String(CHUNK_COUNT).padStart(4, "0")}.json`);

const ensureDir = (dirPath = "") => {
  if (!dirPath) return;
  fs.mkdirSync(dirPath, { recursive: true });
};

const loadPriorChunkResults = () => {
  if (!SHOULD_RESUME || !fs.existsSync(OUTPUT_FILE)) return { results: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
    return parsed && Array.isArray(parsed.results) ? parsed : { results: [] };
  } catch {
    return { results: [] };
  }
};

const writeChunkResults = ({
  personas = [],
  existingResults = [],
  newResults = [],
} = {}) => {
  ensureDir(path.dirname(OUTPUT_FILE));
  const results = [...existingResults, ...newResults];
  const payload = {
    schemaVersion: "2026-04-launch-browser-chunk-v1",
    generatedAt: new Date().toISOString(),
    baseURL: process.env.FORMA_E2E_BASE_URL || "http://127.0.0.1:4173",
    totalPersonas: TOTAL_PERSONAS,
    chunkStart: CHUNK_START,
    chunkCount: CHUNK_COUNT,
    requestedPersonaIds: personas.map((persona) => persona.id),
    attemptedPersonaCount: results.length,
    passedPersonaCount: results.filter((entry) => entry.ok).length,
    failedPersonaCount: results.filter((entry) => !entry.ok).length,
    complete: results.length >= personas.length,
    results,
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2), "utf8");
  return payload;
};

const normalizeTrainingDays = (persona = {}) => {
  const text = `${persona.scheduleReality || ""} ${persona.trainingAgeLabel || ""}`.toLowerCase();
  if (/\b6\+|\bsix\b/.test(text)) return "6";
  if (/\b5\b|five/.test(text)) return "5";
  if (/\b4\b|four/.test(text)) return "4";
  if (/\b2\b|two/.test(text)) return "2";
  return "3";
};

const normalizeSessionLength = (persona = {}) => {
  const text = `${persona.scheduleReality || ""} ${persona.reviewLens || ""}`.toLowerCase();
  if (/20|minimal|time-crunched|busy/.test(text)) return "20 min";
  if (/30|short|compressed/.test(text)) return "30 min";
  if (/60|long session|endurance block/.test(text)) return "60+ min";
  return "45 min";
};

const normalizeTrainingLocation = (persona = {}) => {
  const text = `${persona.equipmentReality || ""} ${persona.scheduleReality || ""}`.toLowerCase();
  if (/hotel gym|hotel gyms|commercial gym plus hotel gyms/.test(text)) return "Both";
  if (/hotel|bodyweight only|no equipment|bands only|home gym|minimal equipment|apartment/.test(text)) return "Home";
  if (/full gym|barbell|gym/.test(text)) return "Gym";
  return "Both";
};

const normalizeHomeEquipment = (persona = {}) => {
  const text = `${persona.equipmentReality || ""}`.toLowerCase();
  if (/dumbbell/.test(text)) return ["Dumbbells"];
  if (/band/.test(text)) return ["Resistance bands"];
  if (/pull-up/.test(text)) return ["Pull-up bar"];
  return ["Bodyweight only"];
};

const normalizeExperienceLevel = (persona = {}) => {
  const text = `${persona.trainingAgeLabel || ""} ${persona.trainingAgeYears || ""}`.toLowerCase();
  if (/advanced|elite|high training age/.test(text) || Number(persona.trainingAgeYears || 0) >= 8) return "Advanced";
  if (/beginner|brand new|novice/.test(text) || Number(persona.trainingAgeYears || 0) <= 1) return "Beginner";
  return "Intermediate";
};

const normalizeCoachingStyle = (persona = {}) => {
  if (persona.reviewLens === "low_tech_literal") return "Keep me consistent";
  if (persona.reviewLens === "expert_athlete_coach" || persona.reviewLens === "technical_data_heavy") {
    return "Push me (with guardrails)";
  }
  return "Balanced coaching";
};

const buildGoalConfigForPersona = (persona = {}) => {
  const goalText = String(persona.primaryGoal || "").toLowerCase();
  const schedule = {
    experienceLevel: normalizeExperienceLevel(persona),
    trainingDays: normalizeTrainingDays(persona),
    sessionLength: normalizeSessionLength(persona),
    trainingLocation: normalizeTrainingLocation(persona),
    homeEquipment: normalizeHomeEquipment(persona),
    coachingStyle: normalizeCoachingStyle(persona),
  };

  if (persona.goalCategory === "swimming") {
    return {
      ...schedule,
      goalType: "endurance",
      templateId: "swim_better",
      quickMetrics: {
        goal_focus: /open water/.test(goalText) ? "open_water" : /technique/.test(goalText) ? "technique" : "endurance",
      },
    };
  }

  if (persona.goalCategory === "cycling") {
    return {
      ...schedule,
      goalType: "endurance",
      templateId: "ride_stronger",
      quickMetrics: {
        goal_focus: /endurance|peloton|aerobic/.test(goalText) ? "endurance" : "fitness",
      },
    };
  }

  if (persona.goalCategory === "strength") {
    const liftFocus = /squat/.test(goalText) ? "squat" : /deadlift/.test(goalText) ? "deadlift" : "bench";
    return {
      ...schedule,
      goalType: "strength",
      templateId: /bench|squat|deadlift|powerlift|meet/.test(goalText) ? "improve_big_lifts" : "get_stronger",
      quickMetrics: {
        lift_focus: liftFocus,
        lift_target_weight: "225",
        lift_target_reps: "3",
        target_timeline: /12 weeks|meet/.test(goalText) ? "12 weeks" : "16 weeks",
        current_strength_baseline_weight: "185",
        current_strength_baseline_reps: "5",
      },
      trainingLocation: schedule.trainingLocation === "Home" ? "Both" : schedule.trainingLocation,
    };
  }

  if (persona.goalCategory === "physique") {
    return {
      ...schedule,
      goalType: "physique",
      templateId: /recomp/.test(goalText) ? "recomp" : /lean/.test(goalText) ? "get_leaner" : "lose_body_fat",
      quickMetrics: {
        body_comp_tempo: "steady",
        muscle_retention_priority: "high",
        cardio_preference: "walks",
      },
    };
  }

  if (persona.goalCategory === "body_comp") {
    return {
      ...schedule,
      goalType: "physique",
      templateId: /recomp/.test(goalText) ? "recomp" : /lean/.test(goalText) ? "get_leaner" : "lose_body_fat",
      quickMetrics: {
        body_comp_tempo: "steady",
        muscle_retention_priority: "high",
        cardio_preference: "walks",
      },
    };
  }

  if (persona.goalCategory === "re_entry") {
    return {
      ...schedule,
      goalType: "re_entry",
      templateId: /run/.test(goalText) ? "restart_safely" : "ease_back_in",
    };
  }

  if (persona.goalCategory === "hybrid") {
    return {
      ...schedule,
      goalType: "hybrid",
      templateId: /tactical|firefighter|military|police/.test(goalText) ? "tactical_fitness" : "run_and_lift",
      quickMetrics: {
        hybrid_priority: /strength|lift/.test(goalText) ? "strength" : "endurance",
        equipment_profile: schedule.trainingLocation === "Gym" ? "full_gym" : "limited_home",
        current_run_frequency: "2",
        goal_focus: /strength|lift/.test(goalText) ? "strength" : "balanced",
        current_strength_baseline_weight: "185",
        current_strength_baseline_reps: "5",
      },
    };
  }

  if (persona.goalCategory === "travel") {
    return {
      ...schedule,
      trainingLocation: "Both",
      homeEquipment: normalizeHomeEquipment(persona),
      goalType: "general_fitness",
      templateId: "build_consistency",
    };
  }

  if (persona.goalCategory === "endurance" || persona.goalCategory === "running") {
    const eventDistance = /marathon/.test(goalText)
      ? "marathon"
      : /half/.test(goalText)
      ? "half_marathon"
      : /10k/.test(goalText)
      ? "10k"
      : "5k";
    if (/return to running|run again|layoff|safely/.test(goalText)) {
      return {
        ...schedule,
        goalType: "endurance",
        templateId: "return_to_running",
        quickMetrics: {
          current_run_frequency: "2",
        },
      };
    }
    if (/base|endurance|cardio consistency/.test(goalText) && !/5k|10k|half|marathon/.test(goalText)) {
      return {
        ...schedule,
        goalType: "endurance",
        templateId: "build_endurance",
        quickMetrics: {
          goal_focus: "endurance",
        },
      };
    }
    return {
      ...schedule,
      goalType: "endurance",
      templateId: "train_for_run_race",
      quickMetrics: {
        event_distance: eventDistance,
        target_timeline: "October",
        current_run_frequency: "4",
        longest_recent_run_value: eventDistance === "marathon" ? "12" : eventDistance === "half_marathon" ? "8" : "4",
        longest_recent_run_unit: "miles",
      },
    };
  }

  return {
    ...schedule,
    goalType: "general_fitness",
    templateId: /athletic|work capacity/.test(goalText) ? "feel_more_athletic" : "build_consistency",
  };
};

const personas = generateLaunchSimulationPersonas({ count: TOTAL_PERSONAS })
  .slice(CHUNK_START, CHUNK_START + CHUNK_COUNT);

test.describe.serial("launch browser chunk", () => {
  test("browser chunk can run the initial product journey for a persona slice", async ({ page }) => {
    test.setTimeout(Math.max(300_000, CHUNK_COUNT * 45_000));
    const prior = loadPriorChunkResults();
    const completedIds = new Set((prior.results || []).map((entry) => entry.personaId));
    const pendingPersonas = personas.filter((persona) => !completedIds.has(persona.id));
    const newResults = [];

    for (const persona of pendingPersonas) {
      const startedAt = new Date().toISOString();
      const config = buildGoalConfigForPersona(persona);
      let screenshotPath = "";
      try {
        await page.setViewportSize({ width: 390, height: 844 });
        await gotoIntakeInLocalMode(page, {}, { freshStart: true });
        await completeStructuredIntakeOnOneScreen(page, config);
        const cache = await readLocalCache(page);
        await expect(page.getByTestId("today-session-card")).toBeVisible();
        newResults.push({
          personaId: persona.id,
          ok: Boolean(cache?.personalization?.profile?.onboardingComplete),
          startedAt,
          finishedAt: new Date().toISOString(),
          goalCategory: persona.goalCategory,
          reviewLens: persona.reviewLens,
          config,
          screenshotPath: "",
        });
      } catch (error) {
        ensureDir(path.join(OUTPUT_DIR, "screenshots"));
        screenshotPath = path.join(OUTPUT_DIR, "screenshots", `${persona.id}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        newResults.push({
          personaId: persona.id,
          ok: false,
          startedAt,
          finishedAt: new Date().toISOString(),
          goalCategory: persona.goalCategory,
          reviewLens: persona.reviewLens,
          config,
          error: error?.message || String(error),
          screenshotPath,
        });
      }

      writeChunkResults({
        personas,
        existingResults: prior.results || [],
        newResults,
      });
    }

    const finalPayload = writeChunkResults({
      personas,
      existingResults: prior.results || [],
      newResults,
    });
    expect(finalPayload.attemptedPersonaCount).toBeGreaterThan(0);
    if (FAIL_ON_ERROR) {
      expect(finalPayload.failedPersonaCount).toBe(0);
    }
  });
});
