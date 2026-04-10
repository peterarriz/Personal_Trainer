const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGoalReview,
  buildGoalReviewHistoryEntry,
  GOAL_REVIEW_DUE_STATES,
  GOAL_REVIEW_RECOMMENDATIONS,
} = require("../src/services/goal-review-service.js");

const baseGoal = ({
  id = "goal_1",
  name = "Run a half marathon in 1:45:00",
  category = "running",
  priority = 1,
  reviewCadence = "weekly",
  confidence = "high",
  unresolvedGaps = [],
  tradeoffs = [],
} = {}) => ({
  id,
  name,
  category,
  active: true,
  priority,
  resolvedGoal: {
    id,
    summary: name,
    planningCategory: category,
    reviewCadence,
    confidence,
    unresolvedGaps,
    tradeoffs,
  },
});

const baseCard = ({
  goalId = "goal_1",
  summary = "Run a half marathon in 1:45:00",
  planningPriority = 1,
  status = "on_track",
  trackingMode = "measurable",
  reviewCadence = "weekly",
  whatIsTracked = ["Half marathon time", "Run volume", "Workout progression"],
  nextReviewFocus = "Keep landing the key sessions.",
  statusSummary = "Actual training is supporting the event goal.",
  unresolvedGaps = [],
  tradeoffs = [],
} = {}) => ({
  goalId,
  summary,
  planningPriority,
  status,
  trackingMode,
  reviewCadence,
  whatIsTracked,
  nextReviewFocus,
  statusSummary,
  unresolvedGaps,
  tradeoffs,
});

test("goal review is due when no prior review exists and aligned goals recommend staying the course", () => {
  const review = buildGoalReview({
    goals: [baseGoal()],
    goalProgressTracking: { goalCards: [baseCard()] },
    currentProgramBlock: {
      goalAllocation: { prioritized: "Run a half marathon in 1:45:00", maintained: ["Keep lifting supportive"] },
      dominantEmphasis: { category: "running", label: "Race prep" },
    },
    now: new Date("2026-04-10T12:00:00Z"),
  });

  assert.equal(review.due.dueState, GOAL_REVIEW_DUE_STATES.dueNow);
  assert.equal(review.reviewItems[0].verdict, "yes");
  assert.equal(review.recommendation.recommendation, GOAL_REVIEW_RECOMMENDATIONS.keepCurrentGoal);
});

test("goal review recommends refining when the current proxies still need real data", () => {
  const review = buildGoalReview({
    goals: [baseGoal({
      id: "goal_appearance",
      name: "Look athletic again",
      category: "body_comp",
      confidence: "medium",
    })],
    goalProgressTracking: {
      goalCards: [baseCard({
        goalId: "goal_appearance",
        summary: "Look athletic again",
        status: "needs_data",
        trackingMode: "proxy",
        whatIsTracked: ["Waist circumference", "Consistency", "Photos"],
        nextReviewFocus: "Add waist circumference and consistency before the next weekly review.",
      })],
    },
    currentProgramBlock: {
      goalAllocation: { prioritized: "Look athletic again", maintained: ["Keep strength supportive"] },
      dominantEmphasis: { category: "body_comp", label: "Body comp push" },
    },
    now: new Date("2026-04-10T12:00:00Z"),
  });

  assert.equal(review.reviewItems[2].verdict, "review");
  assert.equal(review.recommendation.recommendation, GOAL_REVIEW_RECOMMENDATIONS.refineCurrentGoal);
});

test("goal review recommends reprioritizing when the block emphasis no longer matches the primary goal", () => {
  const review = buildGoalReview({
    goals: [
      baseGoal({ id: "goal_run", name: "Sub-1:50 half marathon", category: "running", priority: 1 }),
      baseGoal({ id: "goal_strength", name: "Maintain bench 225", category: "strength", priority: 2 }),
    ],
    goalProgressTracking: {
      goalCards: [
        baseCard({
          goalId: "goal_run",
          summary: "Sub-1:50 half marathon",
          status: "building",
          trackingMode: "measurable",
          statusSummary: "Progress is building but not clean enough yet.",
        }),
        baseCard({
          goalId: "goal_strength",
          summary: "Maintain bench 225",
          planningPriority: 2,
          status: "on_track",
          trackingMode: "measurable",
        }),
      ],
    },
    currentProgramBlock: {
      goalAllocation: { prioritized: "Maintain bench 225", maintained: ["Sub-1:50 half marathon"] },
      dominantEmphasis: { category: "strength", label: "Strength push" },
    },
    now: new Date("2026-04-10T12:00:00Z"),
  });

  assert.equal(review.reviewItems[3].verdict, "reprioritize");
  assert.equal(review.recommendation.recommendation, GOAL_REVIEW_RECOMMENDATIONS.reprioritizeGoalStack);
});

test("goal review history entries stay lightweight and explicit", () => {
  const entry = buildGoalReviewHistoryEntry({
    goalReview: {
      primaryGoalSummary: "Lose fat while keeping strength",
      due: { dueState: GOAL_REVIEW_DUE_STATES.dueNow, cadenceDays: 7 },
    },
    action: GOAL_REVIEW_RECOMMENDATIONS.refineCurrentGoal,
    note: "Tighten the proxy set before changing the whole arc.",
    now: new Date("2026-04-10T12:00:00Z"),
  });

  assert.equal(entry.effectiveDate, "2026-04-10");
  assert.equal(entry.recommendation, GOAL_REVIEW_RECOMMENDATIONS.refineCurrentGoal);
  assert.equal(entry.primaryGoalSummary, "Lose fat while keeping strength");
  assert.equal(entry.reviewCadenceDays, 7);
});
