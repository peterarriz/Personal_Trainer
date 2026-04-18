import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlanEvolutionExport,
  buildPlanEvolutionExportEntry,
  buildPlanEvolutionWeekSummary,
  inferPlanEvolutionChangeDrivers,
  renderPlanEvolutionExportMarkdown,
} from "../src/services/audits/plan-evolution-export-service.js";

test("plan evolution export entry keeps the core trust fields and inferred change drivers", () => {
  const review = {
    dateKey: "2026-04-16",
    originalPrescription: { label: "Tempo Run" },
    latestPrescription: { label: "Tempo Run (Capped)" },
    actualLog: {
      type: "Tempo Run",
      notes: "Stopped early after warmup felt flat.",
      actualSession: { status: "completed_modified", sessionLabel: "Tempo Run" },
    },
    actualCheckin: {
      status: "completed_modified",
      note: "Stopped early after warmup felt flat.",
    },
    actualNutrition: {
      deviationKind: "under_fueled",
      note: "Skipped the pre-run carbs.",
      loggedAt: 1712664000000,
    },
    revisions: [{}, {}],
    provenanceSummary: "Bench anchor changed after a baseline review.",
    story: {
      nextEffect: "Keep the next exposure capped until fueling and the new baseline stabilize.",
    },
  };

  const entry = buildPlanEvolutionExportEntry(review);

  assert.equal(entry.dateKey, "2026-04-16");
  assert.equal(entry.sourceLabel, "Current plan history");
  assert.equal(entry.originalPrescription, "Tempo Run");
  assert.equal(entry.latestPrescription, "Tempo Run (Capped)");
  assert.equal(entry.revisedPrescription, "Tempo Run (Capped)");
  assert.equal(entry.actualWorkout, "Tempo Run");
  assert.equal(entry.actualNutrition, "Skipped the pre-run carbs.");
  assert.equal(entry.actualLog, "Workout: Tempo Run | Nutrition: Skipped the pre-run carbs.");
  assert.equal(entry.revisionCount, 2);
  assert.match(entry.whyChanged, /next exposure capped/i);
  assert.deepEqual(
    entry.changeDrivers.sort(),
    ["baseline_edit", "nutrition_log", "workout_log"].sort(),
  );
});

test("week summary export keeps planned, actual, and next-effect context for reviewers", () => {
  const summary = buildPlanEvolutionWeekSummary({
    weekKey: "8",
    label: "BUILD - Week 8",
    startDate: "2026-04-06",
    endDate: "2026-04-12",
    reportSource: "Archived plan: Spring build",
    story: {
      classificationLabel: "Partial",
      plannedSummary: "Planned 4 sessions around half-marathon quality.",
      actualSummary: "Logged 3 of 4 planned sessions.",
      whatMattered: "Travel compressed the week more than the original draft.",
      nextEffect: "Start the next week from the work that landed.",
    },
  });

  assert.equal(summary.label, "BUILD - Week 8");
  assert.equal(summary.sourceLabel, "Archived plan: Spring build");
  assert.equal(summary.dateRange, "2026-04-06 to 2026-04-12");
  assert.equal(summary.status, "Partial");
  assert.match(summary.plannedSummary, /Planned 4 sessions/i);
  assert.match(summary.actualSummary, /Logged 3 of 4 planned sessions/i);
  assert.match(summary.whatMattered, /Travel compressed the week/i);
  assert.match(summary.nextEffect, /Start the next week/i);
});

test("actual log omits nutrition when no real nutrition entry was saved", () => {
  const entry = buildPlanEvolutionExportEntry({
    dateKey: "2026-04-17",
    originalPrescription: { label: "Active Recovery" },
    latestPrescription: { label: "Active Recovery" },
    story: {
      actualSummary: { label: "Skipped" },
    },
    nutritionComparison: {
      summary: "Food has not been logged yet.",
    },
    revisions: [{}],
  });

  assert.equal(entry.actualNutrition, "No nutrition log");
  assert.equal(entry.actualLog, "Workout: Skipped");
});

test("driver inference catches preference-driven revisions even without workout or nutrition actuals", () => {
  const drivers = inferPlanEvolutionChangeDrivers({
    dateKey: "2026-04-18",
    currentRevision: {
      reason: "training_preferences_changed",
      provenanceSummary: "Environment preference changed to hotel-only access.",
    },
    provenance: {
      summary: "Preference update applied.",
      events: [
        {
          summary: "Preference update applied.",
          sourceInputs: ["personalization.settings.trainingPreferences", "environmentConfig.presets"],
        },
      ],
    },
  });

  assert.deepEqual(drivers, ["preferences"]);
});

test("markdown export renders a reviewer-friendly plan evolution report", () => {
  const report = buildPlanEvolutionExport({
    title: "QA Plan Evolution Report",
    generatedAt: "2026-04-16T12:00:00.000Z",
    reviews: [
      {
        dateKey: "2026-04-16",
        originalPrescription: { label: "Tempo Run" },
        latestPrescription: { label: "Tempo Run (Capped)" },
        actualLog: { type: "Tempo Run", actualSession: { sessionLabel: "Tempo Run" } },
        actualCheckin: { status: "completed_modified" },
        actualNutrition: { note: "Skipped the pre-run carbs.", loggedAt: 1712664000000 },
        revisions: [{}, {}],
        provenanceSummary: "Bench anchor changed after a baseline review.",
        story: { nextEffect: "Keep the next exposure capped." },
      },
    ],
    weekSummaries: [
      {
        weekKey: "8",
        label: "BUILD - Week 8",
        startDate: "2026-04-06",
        endDate: "2026-04-12",
        story: {
          classificationLabel: "Partial",
          plannedSummary: "Planned 4 sessions around half-marathon quality.",
          actualSummary: "Logged 3 of 4 planned sessions.",
          whatMattered: "Travel compressed the week more than the original draft.",
          nextEffect: "Start the next week from the work that landed.",
        },
      },
    ],
  });

  const markdown = renderPlanEvolutionExportMarkdown(report);

  assert.match(markdown, /^# QA Plan Evolution Report/m);
  assert.match(markdown, /## Week Summaries/);
  assert.match(markdown, /### BUILD - Week 8/);
  assert.match(markdown, /Planned summary: Planned 4 sessions around half-marathon quality\./);
  assert.match(markdown, /## Day-Level Plan Evolution/);
  assert.match(markdown, /### 2026-04-16/);
  assert.match(markdown, /Original prescription: Tempo Run/);
  assert.match(markdown, /Latest prescription: Tempo Run \(Capped\)/);
  assert.match(markdown, /Actual log: Workout: Tempo Run \| Nutrition: Skipped the pre-run carbs\./);
  assert.match(markdown, /Change drivers:/);
  assert.match(markdown, /Workout log/);
  assert.match(markdown, /Nutrition log/);
  assert.match(markdown, /Baseline edit/);
});

test("markdown export still renders a week-only report when no day reviews are available", () => {
  const markdown = renderPlanEvolutionExportMarkdown(buildPlanEvolutionExport({
    title: "Week Only Report",
    generatedAt: "2026-04-16T12:00:00.000Z",
    reviews: [],
    weekSummaries: [
      {
        label: "BASE - Week 1",
        startDate: "2026-01-05",
        endDate: "2026-01-11",
        story: {
          plannedSummary: "Planned 3 sessions around consistency.",
          actualSummary: "Logged 3 of 3 planned sessions.",
          whatMattered: "Consistency mattered most.",
          nextEffect: "Keep the next week on its normal path.",
        },
      },
    ],
  }));

  assert.match(markdown, /## Week Summaries/);
  assert.match(markdown, /### BASE - Week 1/);
  assert.match(markdown, /## Day-Level Plan Evolution/);
  assert.match(markdown, /No saved day reviews were available for export\./);
});
