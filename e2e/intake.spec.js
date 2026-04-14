const { test, expect } = require("@playwright/test");
const {
  answerCurrentAnchor,
  confirmIntakeBuild,
  completeAnchors,
  completeIntroQuestionnaire,
  enterLocalIntakeIfNeeded,
  getAppEvents,
  getConfirmationStatus,
  getCurrentFieldId,
  getCurrentPhase,
  getTranscriptEntries,
  gotoIntakeInLocalMode,
  readIntakeSession,
  readLocalCache,
  waitForPostOnboarding,
  waitForReview,
} = require("./intake-test-utils.js");

const uniqueNonEmpty = (items = []) => [...new Set(items.filter(Boolean))];

const expectTranscriptKeysUnique = async (page) => {
  const entries = await getTranscriptEntries(page);
  const keys = entries.map((entry) => entry.key).filter(Boolean);
  expect(uniqueNonEmpty(keys)).toEqual(keys);
};

const expectNoSecondaryPromptYet = async (page) => {
  await expect(page.getByTestId("intake-secondary-goal-step")).toHaveCount(0);
};

const answerActiveAnchorFromMap = async (page, responsesByFieldId = {}) => {
  const fieldId = await getCurrentFieldId(page);
  if (!fieldId || !responsesByFieldId[fieldId]) {
    throw new Error(`No mapped E2E response for current field: ${fieldId || "none"}`);
  }
  await answerCurrentAnchor(page, responsesByFieldId[fieldId]);
};

const getActiveNonResilienceGoals = (cache = null) => (
  Array.isArray(cache?.goals)
    ? cache.goals.filter((goal) => goal?.active && goal?.category !== "injury_prevention" && goal?.id !== "g_resilience")
    : []
);

test.describe("intake onboarding e2e", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1120 });
  });

  test("simple running goal supports natural answers, warn gating, and planner handoff", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "run a 1:45 half marathon",
      experienceLevel: "Intermediate",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      coachingStyle: "Balanced coaching",
    });

    await expectNoSecondaryPromptYet(page);
    const visitedFields = await completeAnchors(page, {
      target_timeline: { type: "natural", value: "October" },
      current_run_frequency: { type: "natural", value: "3 runs/week" },
      running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
      longest_recent_run: { type: "natural", value: "7 miles" },
      recent_pace_baseline: { type: "natural", value: "8:55 pace" },
    });

    expect(visitedFields).toContain("current_run_frequency");
    expect(visitedFields).toContain("target_timeline");
    expect(visitedFields).toContain("running_endurance_anchor_kind");
    await waitForReview(page);
    await expectTranscriptKeysUnique(page);

    const confirmationStatus = await getConfirmationStatus(page);
    expect(["proceed", "warn"]).toContain(confirmationStatus);

    if (confirmationStatus === "warn") {
      await expect(page.getByTestId("intake-warning-ack")).toBeVisible();
      await expect(page.getByTestId("intake-confirm-build")).toBeDisabled();
      await page.getByTestId("intake-warning-ack-checkbox").check();
      await expect(page.getByTestId("intake-confirm-build")).toBeEnabled();
    } else {
      await expect(page.getByTestId("intake-confirm-build")).toBeEnabled();
    }

    await page.getByTestId("intake-confirm-build").click();
    await waitForPostOnboarding(page);
    await expect(page.getByTestId("today-plan-basis")).toContainText("Plan basis:");

    const cache = await readLocalCache(page);
    expect(cache?.personalization?.profile?.onboardingComplete).toBe(true);
    expect(getActiveNonResilienceGoals(cache).length).toBeGreaterThan(0);
    await expect.poll(() => readIntakeSession(page)).toBeNull();
  });

  test("simple strength goal captures a structured top set without repeating the same anchor", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "bench 225",
      experienceLevel: "Intermediate",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    const seen = [];
    for (let index = 0; index < 4; index += 1) {
      const phase = await getCurrentPhase(page);
      if (phase !== "clarify") break;
      const fieldId = await getCurrentFieldId(page);
      seen.push(fieldId);
      if (fieldId === "target_timeline") {
        await completeAnchors(page, {
          target_timeline: { type: "natural", value: "next year" },
          current_strength_baseline: { type: "strength_top_set", weight: 185, reps: 5 },
        }, { maxSteps: 2 });
        break;
      }
      if (fieldId === "current_strength_baseline") {
        await completeAnchors(page, {
          current_strength_baseline: { type: "strength_top_set", weight: 185, reps: 5 },
          target_timeline: { type: "natural", value: "next year" },
        }, { maxSteps: 2 });
        break;
      }
    }

    expect(uniqueNonEmpty(seen).length).toBe(seen.length);
    await waitForReview(page);
    await page.getByTestId("intake-confirm-build").click();
    await waitForPostOnboarding(page);
  });

  test("appearance goal uses explicit proxy selection and value capture without looping", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "look leaner and more defined by October",
      experienceLevel: "Intermediate",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    const visited = await completeAnchors(page, {
      target_timeline: { type: "natural", value: "October" },
      appearance_proxy_anchor_kind: { type: "choice", value: "current_bodyweight" },
      current_bodyweight: { type: "number", value: 185, unit: "lb" },
      current_waist: { type: "number", value: 34, unit: "in" },
    });

    expect(visited).toContain("appearance_proxy_anchor_kind");
    expect(visited).toContain("current_bodyweight");
    expect(visited.filter((item) => item === "appearance_proxy_anchor_kind").length).toBe(1);
    await waitForReview(page);
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("multi-goal intake shows heard goals, review lanes, and coherent committed goals", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "run a 1:45 half marathon but keep strength and get leaner",
      experienceLevel: "Intermediate",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    await expect(page.getByTestId("intake-heard-goals")).toBeVisible();
    expect(await page.locator("[data-testid='intake-heard-goal-row']").count()).toBeGreaterThanOrEqual(2);

    await completeAnchors(page, {
      target_timeline: { type: "natural", value: "October" },
      current_run_frequency: { type: "natural", value: "3 runs/week" },
      running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
      longest_recent_run: { type: "natural", value: "7 miles" },
      recent_pace_baseline: { type: "natural", value: "8:55 pace" },
      current_strength_baseline: { type: "strength_top_set", weight: 185, reps: 5 },
      target_weight_change: { type: "number", value: 12, unit: "lb" },
      appearance_proxy_anchor_kind: { type: "choice", value: "current_bodyweight" },
      current_bodyweight: { type: "number", value: 185, unit: "lb" },
    }, { maxSteps: 8 });

    const currentPhase = await getCurrentPhase(page);
    if (currentPhase === "secondary_goal") {
      await page.getByTestId("intake-secondary-option-skip").click();
      await expect.poll(() => getCurrentPhase(page)).toBe("review");
    }

    await expect(page.getByTestId("intake-review-lane-lead-goal")).toBeVisible();
    await expect.poll(() => page.locator("[data-testid='intake-review-goal-card']").count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("intake-tradeoff-statement")).toBeVisible();

    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);

    const cache = await readLocalCache(page);
    expect(getActiveNonResilienceGoals(cache).length).toBeGreaterThan(1);
  });

  test("promoting a background goal to lead reroutes intake without duplicating transcript copy", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "run a 1:45 half marathon",
      experienceLevel: "Intermediate",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    await completeAnchors(page, {
      target_timeline: { type: "natural", value: "October" },
      current_run_frequency: { type: "natural", value: "3 runs/week" },
      running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
      longest_recent_run: { type: "natural", value: "7 miles" },
      recent_pace_baseline: { type: "natural", value: "8:55 pace" },
    }, { maxSteps: 6 });

    await expect.poll(() => getCurrentPhase(page), { timeout: 20_000 }).toBe("secondary_goal");
    await page.getByTestId("intake-secondary-option-custom").click();
    await page.getByTestId("intake-secondary-custom-input").fill("get a six pack");
    await page.getByTestId("intake-secondary-add-custom").click();
    await page.getByTestId("intake-secondary-continue").click();

    await waitForReview(page);
    const confirmationStatusBefore = await getConfirmationStatus(page);
    expect(["proceed", "warn"]).toContain(confirmationStatusBefore);
    const promoteButtons = page.locator(
      "[data-testid='intake-review-lane-support-goals'] [data-testid^='intake-review-action-change-priority-'], " +
      "[data-testid='intake-review-lane-deferred-goals'] [data-testid^='intake-review-action-change-priority-']"
    );
    await expect(promoteButtons).toHaveCount(1);
    const promoteButton = promoteButtons.first();
    await expect(promoteButton).toBeVisible();

    const transcriptBefore = await getTranscriptEntries(page);
    await promoteButton.click();

    await expect.poll(() => getCurrentPhase(page), { timeout: 12_000 }).toBe("clarify");
    await expect.poll(() => getCurrentFieldId(page), { timeout: 12_000 }).toMatch(/appearance_proxy_anchor_kind|current_bodyweight|current_waist/);

    const transcriptAfter = await getTranscriptEntries(page);
    expect(transcriptAfter.length).toBe(transcriptBefore.length);
    await expectTranscriptKeysUnique(page);
  });

  test("editing the goal midstream clears stale running anchors and moves to the new goal", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "run a half marathon",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    await answerActiveAnchorFromMap(page, {
      current_run_frequency: { type: "natural", value: "3 runs/week" },
      target_timeline: { type: "natural", value: "next year" },
      running_endurance_anchor_kind: { type: "choice", value: "recent_pace_baseline" },
      recent_pace_baseline: { type: "natural", value: "9:10 pace" },
    });
    await expect.poll(() => getCurrentFieldId(page), { timeout: 12_000 }).not.toBe("");

    await page.getByTestId("intake-adjust-goal").click();
    await expect(page.getByTestId("intake-adjust-step")).toBeVisible();
    await page.getByTestId("intake-adjust-input").fill("Actually, I want to bench 225");
    await page.getByTestId("intake-adjust-submit").click();

    await expect(page.getByTestId("intake-structured-step")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => getCurrentFieldId(page), { timeout: 20_000 }).toMatch(/target_timeline|current_strength_baseline/);
    const nextField = await getCurrentFieldId(page);
    expect(nextField).not.toBe("running_endurance_anchor_kind");
    expect(nextField).not.toBe("current_run_frequency");
  });

  test("reload mid-intake safely restores the active anchor and does not revive commit state", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "run a half marathon",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    await answerActiveAnchorFromMap(page, {
      current_run_frequency: { type: "natural", value: "3 runs/week" },
      target_timeline: { type: "natural", value: "next year" },
      running_endurance_anchor_kind: { type: "choice", value: "recent_pace_baseline" },
      recent_pace_baseline: { type: "natural", value: "9:10 pace" },
    });
    await expect.poll(() => getCurrentFieldId(page), { timeout: 12_000 }).not.toBe("");

    const restoredField = await getCurrentFieldId(page);
    expect(restoredField).toBeTruthy();
    const beforeReloadSession = await readIntakeSession(page);
    expect(beforeReloadSession?.intakeMachine?.draft?.commitRequested).toBe(false);

    await page.reload();
    await enterLocalIntakeIfNeeded(page);
    await expect.poll(() => getCurrentFieldId(page), { timeout: 12_000 }).toBe(restoredField);
    await expectTranscriptKeysUnique(page);

    const restoredSession = await readIntakeSession(page);
    expect(restoredSession?.intakeMachine?.draft?.commitRequested).toBe(false);
  });

  test("late coach-voice phrasing cannot overwrite a newer anchor state or duplicate transcript", async ({ page }) => {
    await gotoIntakeInLocalMode(page, {
      clarifying_question_generation: async ({ body }) => ({
        delayMs: 2500,
        status: 200,
        body: {
          phrasing: {
            questionText: "On a normal week, how many runs are you getting in?",
            helperText: "This helps me size the running load around your real week.",
            reassuranceLine: "Coach note: a normal week is exactly what I want here.",
          },
          meta: {
            requestType: body?.requestType || "clarifying_question_generation",
            provider: "e2e-mock",
            model: "e2e-mock",
            latencyMs: 2500,
          },
        },
      }),
    });
    await completeIntroQuestionnaire(page, {
      goalText: "run a half marathon",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    await expect.poll(() => getCurrentFieldId(page), { timeout: 12_000 }).toBeTruthy();
    const firstField = await getCurrentFieldId(page);
    await answerActiveAnchorFromMap(page, {
      current_run_frequency: { type: "natural", value: "3 runs/week" },
      target_timeline: { type: "natural", value: "next year" },
      running_endurance_anchor_kind: { type: "choice", value: "recent_pace_baseline" },
      recent_pace_baseline: { type: "natural", value: "9:10 pace" },
    });

    const secondField = await getCurrentFieldId(page);
    expect(secondField).toBeTruthy();
    expect(secondField).not.toBe(firstField);
    await page.waitForTimeout(2800);
    await expect.poll(() => getCurrentFieldId(page)).toBe(secondField);
    await expectTranscriptKeysUnique(page);
  });

  test("AI unavailable still allows completion through deterministic structured controls", async ({ page }) => {
    await gotoIntakeInLocalMode(page, {
      default: async ({ requestType = "" }) => ({
        status: 503,
        body: {
          code: `e2e_unavailable_${requestType || "unknown"}`,
          message: "Unavailable in E2E fallback mode.",
        },
      }),
    });
    await completeIntroQuestionnaire(page, {
      goalText: "bench 225",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    await completeAnchors(page, {
      target_timeline: { type: "date_or_month", value: "2027-01" },
      current_strength_baseline: { type: "strength_top_set", weight: 185, reps: 5 },
    }, { maxSteps: 3 });

    await waitForReview(page);
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("confirm/build stays idempotent on rapid repeat interactions", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "bench 225",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    await completeAnchors(page, {
      target_timeline: { type: "natural", value: "next year" },
      current_strength_baseline: { type: "strength_top_set", weight: 185, reps: 5 },
    }, { maxSteps: 3 });

    await waitForReview(page);
    await confirmIntakeBuild(page, { rapidRepeat: true });
    await waitForPostOnboarding(page);

    const appEvents = await getAppEvents(page);
    const commitEvents = appEvents.filter((entry) => entry?.type === "trainer:intake-commit");
    const commitStartEvents = commitEvents.filter((entry) => entry?.detail?.phase === "start");
    const commitSuccessEvents = commitEvents.filter((entry) => entry?.detail?.phase === "success");
    expect(commitStartEvents.length).toBe(1);
    expect(commitSuccessEvents.length).toBe(1);
    expect(commitStartEvents[0]?.detail?.confirmationSnapshotId).toBeTruthy();
    expect(commitSuccessEvents[0]?.detail?.confirmationSnapshotId).toBe(commitStartEvents[0]?.detail?.confirmationSnapshotId);
    await expect.poll(() => readIntakeSession(page)).toBeNull();
  });

  test("extra natural-language facts do not contaminate another bound field and timeline phrases still clear correctly", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "run a half marathon",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    const phaseBefore = await getCurrentPhase(page);
    expect(phaseBefore).toBe("clarify");
    await expectNoSecondaryPromptYet(page);

    const currentField = await getCurrentFieldId(page);
    if (currentField === "current_run_frequency") {
      await answerActiveAnchorFromMap(page, {
        current_run_frequency: { type: "natural", value: "3 runs/week and my longest run is 8 miles" },
        target_timeline: { type: "natural", value: "next year" },
        running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
        longest_recent_run: { type: "natural", value: "8 miles" },
      });
      await expect.poll(() => getCurrentFieldId(page), { timeout: 12_000 }).toBe("target_timeline");
      await answerActiveAnchorFromMap(page, {
        target_timeline: { type: "natural", value: "next year" },
        running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
        longest_recent_run: { type: "natural", value: "8 miles" },
      });
    } else {
      await answerActiveAnchorFromMap(page, {
        target_timeline: { type: "natural", value: "next year" },
        current_run_frequency: { type: "natural", value: "3 runs/week and my longest run is 8 miles" },
        running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
        longest_recent_run: { type: "natural", value: "8 miles" },
      });
      await expect.poll(() => getCurrentFieldId(page), { timeout: 12_000 }).toBe("current_run_frequency");
      await answerActiveAnchorFromMap(page, {
        current_run_frequency: { type: "natural", value: "3 runs/week and my longest run is 8 miles" },
        running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
        longest_recent_run: { type: "natural", value: "8 miles" },
      });
    }

    const nextField = await getCurrentFieldId(page);
    expect(["running_endurance_anchor_kind", "longest_recent_run"]).toContain(nextField);
    await expectTranscriptKeysUnique(page);
  });

  test("abandoning intake leaves onboarding incomplete and does not corrupt planner state", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await expect(page.getByTestId("intake-question-input-goal-intent")).toBeVisible();
    await page.reload();
    if (await page.getByTestId("auth-gate").count()) {
      await expect(page.getByTestId("auth-gate")).toBeVisible();
    } else {
      await expect(page.getByTestId("intake-root")).toBeVisible();
    }

    const cache = await readLocalCache(page);
    expect(cache?.personalization?.profile?.onboardingComplete || false).toBe(false);
    await expect(page.getByTestId("today-tab")).toHaveCount(0);
  });
});
