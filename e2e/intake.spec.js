const { test, expect } = require("@playwright/test");
const {
  answerCurrentAnchor,
  commitPendingGoalSelection,
  confirmIntakeBuild,
  completeAnchors,
  completeIntroQuestionnaire,
  enterLocalIntakeIfNeeded,
  getAppEvents,
  getConfirmationStatus,
  getCurrentFieldId,
  getCurrentPhase,
  gotoIntakeInLocalMode,
  readIntakeSession,
  readLocalCache,
  waitForPostOnboarding,
  waitForReview,
} = require("./intake-test-utils.js");

const expectNoFakeTranscript = async (page) => {
  await expect(page.getByTestId("intake-transcript")).toHaveCount(0);
};

const expectStructuredSetupCopy = async (page) => {
  await expect(page.getByTestId("intake-shell-title")).toContainText(/intake|getting started/i);
  await expect(page.getByTestId("intake-shell-subtitle")).toContainText(/saves as you go/i);
};

const expectNoFauxChatCopy = async (page) => {
  await expect(page.getByText("Coach", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Proposal only until you confirm.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Guided", { exact: true })).toHaveCount(0);
  await expect(page.getByText("In your words", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/custom fallback/i)).toHaveCount(0);
};

const expectSummaryRail = async (page) => {
  await expect(page.getByTestId("intake-summary-rail")).toBeVisible();
  await expect(page.getByTestId("intake-summary-section-what-you-said")).toBeVisible();
  await expect(page.getByTestId("intake-summary-section-optimize-first")).toBeVisible();
  await expect(page.getByTestId("intake-summary-section-track-first")).toBeVisible();
  await expect(page.getByTestId("intake-summary-section-still-open")).toBeVisible();
};

const expectPlanPreview = async (page) => {
  await expect(page.getByTestId("intake-plan-preview")).toBeVisible();
  await expect(page.getByTestId("intake-plan-preview-week-1")).toBeVisible();
};

const expectNoLaneTheater = async (page) => {
  await expect(page.getByText("Leading now", { exact: true })).toHaveCount(0);
  await expect(page.getByText("We will maintain", { exact: true })).toHaveCount(0);
  await expect(page.getByText("We will support in the background", { exact: true })).toHaveCount(0);
  await expect(page.getByText("We are deferring", { exact: true })).toHaveCount(0);
};

const expectPostIntakeReadyState = async (page) => {
  await expect(page.getByTestId("post-intake-ready-card")).toBeVisible();
  await expect(page.getByTestId("post-intake-ready-headline")).toContainText("ready");
  await expect(page.getByTestId("post-intake-ready-first-action")).toBeVisible();
  await expect(page.getByTestId("post-intake-ready-week-shape")).toBeVisible();
  await expect(page.getByTestId("post-intake-ready-roadmap")).toBeVisible();
  await expect(page.getByTestId("post-intake-ready-adapts")).toBeVisible();
  await expect(page.getByTestId("post-intake-ready-checklist")).toBeVisible();
};

const readGoalCardSummaries = async (page, cardTestId) => (
  page
    .getByTestId(cardTestId)
    .locator("[data-testid='intake-goal-card-summary']")
    .evaluateAll((nodes) => nodes.map((node) => String(node.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean))
);

const expectReviewText = async (page, pattern) => {
  await expect(page.getByTestId("intake-review")).toContainText(pattern);
};

const expectGoalSummariesToInclude = async (page, expectedPatterns = [], cardTestId = "intake-confirm-goal-card") => {
  const summaries = await readGoalCardSummaries(page, cardTestId);
  const combined = summaries.join(" ");
  for (const pattern of expectedPatterns) {
    expect(combined).toMatch(pattern);
  }
};

const answerActiveAnchorFromMap = async (page, responsesByFieldId = {}) => {
  const fieldId = await getCurrentFieldId(page);
  if (!fieldId || !responsesByFieldId[fieldId]) {
    throw new Error(`No mapped E2E response for current field: ${fieldId || "none"}`);
  }
  await answerCurrentAnchor(page, responsesByFieldId[fieldId]);
};

test.describe("intake onboarding e2e", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1120 });
  });

  test("foundation plan can skip intake and still build a full starter week", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await expect(page.getByTestId("intake-goals-step")).toBeVisible();
    await expect(page.getByTestId("intake-footer-foundation")).toBeEnabled();

    await page.getByTestId("intake-footer-foundation").click();
    await waitForPostOnboarding(page);

    const cache = await readLocalCache(page);
    expect(cache?.personalization?.profile?.onboardingComplete).toBe(true);

    await expect(page.getByTestId("today-canonical-session-label")).not.toHaveText(/^\s*$/);
    await page.getByRole("button", { name: "Skip for now" }).click({ force: true, timeout: 1_000 }).catch(() => {});

    await page.getByTestId("app-tab-program").click();
    await expect(page.getByTestId("program-tab")).toBeVisible();
    await expect(page.getByTestId("program-this-week")).toBeVisible();
    const sessionRows = page.getByTestId("program-this-week").locator("[data-testid^='program-this-week-session-item-']");
    expect(await sessionRows.count()).toBeGreaterThan(1);
  });

  test("exact running goal goes straight into clarify and builds deterministically", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await expectStructuredSetupCopy(page);
    await completeIntroQuestionnaire(page, {
      goalText: "run a 1:45 half marathon",
      experienceLevel: "Intermediate",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      coachingStyle: "Balanced coaching",
      stopAtInterpretation: true,
    });

    await expect.poll(() => getCurrentPhase(page), { timeout: 20_000 }).toBe("clarify");
    await expect(page.locator("[data-testid='intake-confirm-goal-card']")).toHaveCount(1);
    await expect(page.getByTestId("intake-goal-card-priority")).toHaveText(["Priority 1"]);
    await expectSummaryRail(page);
    await expectPlanPreview(page);
    await expectNoFakeTranscript(page);
    await expectNoFauxChatCopy(page);
    await expect(page.getByTestId("profile-setup-gate")).toHaveCount(0);
    await expect(page.getByTestId("intake-anchor-sheet")).toBeVisible();
    await expect(page.locator("[data-testid='intake-anchor-card'], [data-testid='intake-anchor-card-active']")).toHaveCount(3);
    const visitedFields = await completeAnchors(page, {
      target_timeline: { type: "natural", value: "October" },
      current_run_frequency: { type: "natural", value: "3 runs/week" },
      running_endurance_anchor_kind: { type: "choice", value: "longest_recent_run" },
      longest_recent_run: { type: "natural", value: "7 miles" },
      recent_pace_baseline: { type: "natural", value: "8:55 pace" },
    });

    expect(visitedFields).toContain("current_run_frequency");
    expect(visitedFields).toContain("target_timeline");
    await waitForReview(page);

    const confirmationStatus = await getConfirmationStatus(page);
    expect(["proceed", "warn"]).toContain(confirmationStatus);
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);

    const cache = await readLocalCache(page);
    expect(cache?.personalization?.profile?.onboardingComplete).toBe(true);
    expect(cache?.personalization?.profile?.weekOneReadyDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect.poll(() => readIntakeSession(page)).toBeNull();
    await expectPostIntakeReadyState(page);
  });

  test("vague appearance goal shows proxies and a first 30-day win before any clarification", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "I want to look athletic again",
      experienceLevel: "Intermediate",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      stopAtInterpretation: true,
    });

    await expect.poll(() => getCurrentPhase(page), { timeout: 20_000 }).toBe("clarify");
    await expectSummaryRail(page);
    await expectPlanPreview(page);
    await expectNoFakeTranscript(page);
    await expect(page.getByTestId("intake-goal-card-priority")).toHaveText(["Priority 1"]);
    await expect(page.locator("[data-testid='intake-confirm-goal-card']").first()).toContainText(/waist|bodyweight|block direction|planning focus/i);
    await expectReviewText(page, /waist|bodyweight|30/i);

    const visitedFields = await completeAnchors(page, {
      appearance_proxy_anchor_kind: { type: "choice", value: "current_bodyweight" },
      current_bodyweight: { type: "number", value: 185, unit: "lb" },
      current_waist: { type: "number", value: 34, unit: "in" },
      target_timeline: { type: "natural", value: "late summer" },
    }, { maxSteps: 6 });

    expect(visitedFields).toContain("appearance_proxy_anchor_kind");
    await waitForReview(page);
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("preset-first intake can stack multiple goals without forcing custom text", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await expect(page.getByTestId("intake-goals-step")).toBeVisible();

    await page.getByTestId("intake-goal-type-strength").click();
    await page.getByTestId("intake-featured-goal-improve_big_lifts").click();
    await expect(page.getByTestId("intake-selected-goals")).not.toContainText(/improve a big lift/i);
    await expect(page.getByTestId("intake-goal-selection-draft")).toContainText(/improve a big lift/i);
    await commitPendingGoalSelection(page);
    await expect(page.getByTestId("intake-goal-metric-lift-target-weight")).toHaveAttribute("placeholder", "Type your target load");
    await expect(page.getByTestId("intake-goal-metric-lift-target-reps")).toHaveAttribute("placeholder", "Type target reps");
    const goalLibraryVisible = await page.getByTestId("intake-goal-library-grid").isVisible().catch(() => false);
    if (!goalLibraryVisible) {
      await page.getByTestId("intake-goal-library-toggle").click();
    }
    await page.getByTestId("intake-goal-category-physique").click();
    await page.getByTestId("intake-goal-template-get_leaner").click();
    await expect(page.getByTestId("intake-selected-goals")).not.toContainText("Get leaner");
    await expect(page.getByTestId("intake-goal-selection-draft")).toContainText("Get leaner");
    await expect(page.getByTestId("intake-goal-selection-commit")).toContainText(/add as another goal/i);
    await commitPendingGoalSelection(page);

    await expect(page.getByTestId("intake-selected-goals")).toContainText(/improve a big lift/i);
    await expect(page.getByTestId("intake-selected-goals")).toContainText("Get leaner");

    await page.getByTestId("intake-goals-option-experience-level-intermediate").click();
    await page.getByTestId("intake-goals-option-training-days-4").click();
    await page.getByTestId("intake-goals-option-session-length-45").click();
    await page.getByTestId("intake-goals-option-training-location-gym").click();
    const coachingChip = page.getByTestId("intake-goals-option-coaching-style-balanced-coaching");
    if (await coachingChip.count()) {
      await coachingChip.click();
    }
    await page.getByTestId("intake-footer-continue").click();

    await expect.poll(() => getCurrentPhase(page), { timeout: 20_000 }).toBe("clarify");
    await expect(page.locator("[data-testid='intake-confirm-goal-card']")).toHaveCount(2);
    await expect(page.getByTestId("intake-goal-card-priority")).toHaveText(["Priority 1", "Priority 2"]);
    await expectSummaryRail(page);
    await expectPlanPreview(page);
    await expectNoFakeTranscript(page);
  });

  test("swim goals gather the swim anchor inline before build", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "swim a mile in open water",
      experienceLevel: "Intermediate",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    await expect.poll(() => getCurrentFieldId(page), { timeout: 20_000 }).toBe("recent_swim_anchor");
    const visitedFields = await completeAnchors(page, {
      recent_swim_anchor: { type: "natural", value: "1000 yd in 22:30" },
      swim_access_reality: { type: "choice", value: "open_water" },
    }, { maxSteps: 4 });

    expect(visitedFields).toContain("recent_swim_anchor");
    expect(visitedFields).toContain("swim_access_reality");
    await waitForReview(page);
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("re-entry goals gather safe starting capacity inline before build", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "get back in shape",
      experienceLevel: "Beginner",
      trainingDays: "3",
      sessionLength: "30 min",
      trainingLocation: "Gym",
    });

    await expect.poll(() => getCurrentFieldId(page), { timeout: 20_000 }).toBe("starting_capacity_anchor");
    const visitedFields = await completeAnchors(page, {
      starting_capacity_anchor: { type: "choice", value: "10_easy_minutes" },
    }, { maxSteps: 3 });

    expect(visitedFields).toContain("starting_capacity_anchor");
    await waitForReview(page);
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("appearance goals can defer a proxy for now without getting kicked to Settings", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "I want to look athletic again",
      experienceLevel: "Intermediate",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    await expect.poll(() => getCurrentFieldId(page), { timeout: 20_000 }).toBe("appearance_proxy_anchor_kind");
    const visitedFields = await completeAnchors(page, {
      appearance_proxy_anchor_kind: { type: "choice", value: "skip_for_now" },
    }, { maxSteps: 3 });

    expect(visitedFields).toContain("appearance_proxy_anchor_kind");
    await waitForReview(page);
    await expectReviewText(page, /look athletic|appearance|bodyweight|waist/i);
    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("hybrid goal keeps both bench and leaning-out visible before build", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "Bench 225 and get leaner by summer",
      experienceLevel: "Intermediate",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      stopAtInterpretation: true,
    });

    await expect.poll(() => getCurrentPhase(page), { timeout: 20_000 }).toBe("clarify");
    await expectSummaryRail(page);
    await expectPlanPreview(page);
    await expectNoFakeTranscript(page);
    await expect(page.locator("[data-testid='intake-confirm-goal-card']")).toHaveCount(2);
    await expect(page.getByTestId("intake-goal-card-priority")).toHaveText(["Priority 1", "Priority 2"]);
    await expect(page.getByTestId("intake-review")).toBeVisible();
    await expectReviewText(page, /bench|lean|body/i);

    await completeAnchors(page, {
      target_timeline: { type: "natural", value: "July" },
      current_strength_baseline: { type: "strength_top_set", weight: 185, reps: 5 },
      target_weight_change: { type: "number", value: 12, unit: "lb" },
      appearance_proxy_anchor_kind: { type: "choice", value: "current_bodyweight" },
      current_bodyweight: { type: "number", value: 185, unit: "lb" },
      current_waist: { type: "number", value: 34, unit: "in" },
    }, { maxSteps: 8 });

    await waitForReview(page);
    await expect(page.getByTestId("intake-confirm-step")).toBeVisible();
    await expectNoLaneTheater(page);
    await expect(page.getByTestId("intake-goal-card-priority")).toHaveText(["Priority 1", "Priority 2"]);
    await expect(page.getByTestId("intake-tradeoff-statement")).toContainText(/Priority 1 is/i);
  });

  test("ambitious targets use a milestone chooser instead of warning-checkbox friction", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "bench 225 by July",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    await completeAnchors(page, {
      target_timeline: { type: "date_or_month", value: "2026-07" },
      current_strength_baseline: { type: "strength_top_set", weight: 185, reps: 5 },
    }, { maxSteps: 3 });

    await waitForReview(page);
    await expect(page.getByTestId("intake-warning-ack-checkbox")).toHaveCount(0);
    await expect(page.getByTestId("intake-target-shape")).toBeVisible();
    await expect(page.getByTestId("intake-target-shape-headline")).toContainText("Target is ambitious");
    await expect(page.getByTestId("intake-target-path-keep_full_target")).toBeVisible();
    await expect(page.getByTestId("intake-target-path-milestone_first")).toBeVisible();

    await page.getByTestId("intake-target-path-milestone_first").click();
    await expect(page.getByTestId("intake-target-shape-long-term")).toContainText("Bench press 225 lb");
    await expect(page.getByTestId("intake-confirm-goal-card").filter({ hasText: /Build bench press toward/i })).toBeVisible();

    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("unsafe targets block build until a smaller milestone is selected", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "bench 225 in 6 weeks",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
    });

    await completeAnchors(page, {
      target_timeline: { type: "date_or_month", value: "2026-05" },
      current_strength_baseline: { type: "strength_top_set", weight: 135, reps: 3 },
    }, { maxSteps: 3 });

    await waitForReview(page);
    await expect.poll(() => getConfirmationStatus(page)).toBe("block");
    await expect(page.getByTestId("intake-warning-ack-checkbox")).toHaveCount(0);
    await expect(page.getByTestId("intake-target-shape-headline")).toContainText("Start with a smaller milestone");
    await expect(page.getByTestId("intake-target-path-keep_full_target")).toHaveCount(0);
    await page.getByTestId("intake-target-path-milestone_first").click();

    await expect(page.getByTestId("intake-target-shape-long-term")).toContainText("Bench press 225 lb");
    await expect(page.getByTestId("intake-confirm-goal-card").filter({ hasText: /Build bench press toward/i })).toBeVisible();
    await expect.poll(() => getConfirmationStatus(page)).not.toBe("block");

    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("multi-goal onboarding shows the full ordered stack without hidden presets", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "run a 1:45 half marathon",
      additionalGoals: ["bench 225", "get leaner by summer", "keep shoulders healthy"],
      experienceLevel: "Intermediate",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      stopAtInterpretation: true,
    });

    await expect.poll(() => getCurrentPhase(page), { timeout: 20_000 }).toBe("clarify");
    await expectSummaryRail(page);
    await expectPlanPreview(page);
    await expectNoFakeTranscript(page);
    await expect(page.locator("[data-testid='intake-confirm-goal-card']")).toHaveCount(4);
    await expect(page.getByTestId("intake-goal-card-priority")).toHaveText(["Priority 1", "Priority 2", "Priority 3", "Priority 4"]);
    await expect(page.getByTestId("intake-confirm-additional-goals")).toBeVisible();
    await expectGoalSummariesToInclude(page, [/run|half marathon/i, /bench/i, /lean|body/i, /shoulder|general fitness/i]);
  });

  test("details screen keeps extra goals visible and lets the user reorder directly", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "run a 1:45 half marathon",
      additionalGoals: ["bench 225", "get leaner by summer", "keep shoulders healthy"],
      experienceLevel: "Intermediate",
      trainingDays: "4",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      stopAtInterpretation: true,
    });

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
      current_waist: { type: "number", value: 34, unit: "in" },
    }, { maxSteps: 12 });

    await waitForReview(page);
    await expectNoLaneTheater(page);
    await expect(page.getByText("Priority 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Priority 2", { exact: true })).toBeVisible();
    await expect(page.getByText("Priority 3", { exact: true })).toBeVisible();
    await expect(page.getByTestId("intake-confirm-additional-goals")).toBeVisible();

    const before = await readGoalCardSummaries(page, "intake-confirm-goal-card");
    expect(before.length).toBeGreaterThan(3);
    const benchCard = page.getByTestId("intake-confirm-goal-card").filter({ hasText: /Bench press 225 lb/i });
    const runCard = page.getByTestId("intake-confirm-goal-card").filter({ hasText: /run|half marathon/i }).first();

    await expectGoalSummariesToInclude(page, [/run|half marathon/i, /bench/i, /lean|body/i, /shoulder|general fitness/i]);
    await expect(benchCard.getByTestId("intake-goal-card-priority")).toHaveText(/Priority [34]/);
    await expect(runCard.getByTestId("intake-goal-card-priority")).toHaveText("Priority 1");
    await expect(benchCard.getByRole("button", { name: "Move earlier" })).toBeVisible();

    await confirmIntakeBuild(page);
    await waitForPostOnboarding(page);
  });

  test("editing the interpretation reroutes the flow through the corrected goal stack", async ({ page }) => {
    await gotoIntakeInLocalMode(page);
    await completeIntroQuestionnaire(page, {
      goalText: "run a half marathon",
      trainingDays: "3",
      sessionLength: "45 min",
      trainingLocation: "Gym",
      stopAtInterpretation: true,
    });

    await page.locator("[data-testid^='intake-goal-edit-']").first().click();
    await expect(page.getByTestId("intake-adjust-step")).toBeVisible();
    await page.getByTestId("intake-adjust-input").fill("Actually, I want to bench 225");
    await page.getByTestId("intake-footer-continue").click();

    await expect.poll(() => getCurrentPhase(page), { timeout: 20_000 }).toMatch(/clarify|confirm/);
    await expectReviewText(page, /bench|225/i);
    await expect.poll(() => getCurrentFieldId(page), { timeout: 20_000 }).toMatch(/target_timeline|current_strength_baseline/);
    const nextField = await getCurrentFieldId(page);
    expect(nextField).not.toBe("running_endurance_anchor_kind");
    expect(nextField).not.toBe("current_run_frequency");
  });

  test("reload mid-intake safely restores the active clarify field and never revives commit state", async ({ page }) => {
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
    const beforeReloadSession = await readIntakeSession(page);
    expect(beforeReloadSession?.intakeMachine?.draft?.commitRequested).toBe(false);

    await page.reload();
    await enterLocalIntakeIfNeeded(page);
    await expect.poll(() => getCurrentFieldId(page), { timeout: 12_000 }).toBe(restoredField);
    await expectNoFakeTranscript(page);

    const restoredSession = await readIntakeSession(page);
    expect(restoredSession?.intakeMachine?.draft?.commitRequested).toBe(false);
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

  test("confirm and build stays idempotent on rapid repeat interactions", async ({ page }) => {
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
});
