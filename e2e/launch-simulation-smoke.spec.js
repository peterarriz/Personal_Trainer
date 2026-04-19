const { test, expect } = require("@playwright/test");
const {
  completeStructuredIntakeOnOneScreen,
  gotoIntakeInLocalMode,
  readLocalCache,
} = require("./intake-test-utils.js");

const {
  generateLaunchSimulationPersonas,
} = require("../src/services/synthetic-athlete-lab/launch-persona-generator.js");

const SUPABASE_URL = "https://forma.example.supabase.co";
const SUPABASE_KEY = "test-anon-key";

const buildConsumerAuthBoot = async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ supabaseUrl, supabaseKey }) => {
    window.__SUPABASE_URL = supabaseUrl;
    window.__SUPABASE_ANON_KEY = supabaseKey;
    localStorage.removeItem("trainer_auth_session_v1");
    localStorage.removeItem("trainer_local_cache_v4");
    localStorage.removeItem("trainer_debug");
  }, {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
  });
  await page.goto("/");
};

const REPRESENTATIVE_PERSONAS = (() => {
  const personas = generateLaunchSimulationPersonas({ count: 80 });
  return {
    running: personas.find((persona) => persona.goalCategory === "running"),
    strength: personas.find((persona) => persona.goalCategory === "strength"),
    hybrid: personas.find((persona) => persona.goalCategory === "hybrid"),
  };
})();

test.describe("launch simulation smoke", () => {
  test("first-time consumers must create an account before using FORMA", async ({ page }) => {
    await buildConsumerAuthBoot(page);
    await expect(page.getByTestId("auth-gate")).toBeVisible();
    await expect(page.getByTestId("continue-local-mode")).toHaveCount(0);
    await expect(page.getByText(/create your account before you start/i)).toBeVisible();
  });

  test("representative launch personas can still reach Today from the trusted local lab path", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });

    const cases = [
      {
        persona: REPRESENTATIVE_PERSONAS.running,
        config: {
          goalType: "endurance",
          templateId: "half_marathon",
          quickMetrics: {
            event_distance: "half_marathon",
            target_timeline: "October",
            current_run_frequency: "4",
            longest_recent_run_value: "8",
            longest_recent_run_unit: "miles",
          },
          experienceLevel: "Intermediate",
          trainingDays: "4",
          sessionLength: "45 min",
          trainingLocation: "Both",
          coachingStyle: "Balanced coaching",
        },
      },
      {
        persona: REPRESENTATIVE_PERSONAS.strength,
        config: {
          goalType: "strength",
          templateId: "improve_big_lifts",
          quickMetrics: {
            lift_focus: "bench",
            lift_target_weight: "245",
            lift_target_reps: "3",
            target_timeline: "12 weeks",
            current_strength_baseline_weight: "205",
            current_strength_baseline_reps: "5",
          },
          experienceLevel: "Intermediate",
          trainingDays: "4",
          sessionLength: "45 min",
          trainingLocation: "Gym",
          coachingStyle: "Balanced coaching",
        },
      },
      {
        persona: REPRESENTATIVE_PERSONAS.hybrid,
        config: {
          goalType: "hybrid",
          templateId: "run_and_lift",
          quickMetrics: {
            hybrid_priority: "strength",
            equipment_profile: "full_gym",
            current_run_frequency: "2",
            goal_focus: "strength",
            current_strength_baseline_weight: "205",
            current_strength_baseline_reps: "5",
          },
          experienceLevel: "Intermediate",
          trainingDays: "5",
          sessionLength: "45 min",
          trainingLocation: "Gym",
          coachingStyle: "Balanced coaching",
        },
      },
    ];

    for (const entry of cases) {
      await gotoIntakeInLocalMode(page, {}, { freshStart: true });
      await completeStructuredIntakeOnOneScreen(page, entry.config);
      const cache = await readLocalCache(page);
      expect(cache?.personalization?.profile?.onboardingComplete).toBe(true);
      await expect(page.getByTestId("today-session-card")).toBeVisible();
      await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
    }
  });
});
