import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInjuryCapabilityProfile,
  buildInjuryRuleResult,
} from "../src/services/injury-planning-service.js";

test("ankle injury profile protects running while preserving upper-body work", () => {
  const profile = buildInjuryCapabilityProfile({
    level: "moderate_pain",
    area: "Ankle",
    notes: "Sprained ankle from basketball.",
  });

  assert.equal(profile.runningRestricted, true);
  assert.equal(profile.lowerBodyLoadingRestricted, true);
  assert.equal(profile.upperBodyPushRestricted, false);
  assert.equal(profile.preserveUpperBody, true);
  assert.match(profile.summaryLine, /Ankle moderate pain/i);
});

test("shoulder injury profile limits pressing and overhead work without blocking running", () => {
  const profile = buildInjuryCapabilityProfile({
    level: "moderate_pain",
    area: "Shoulder",
    notes: "Front of shoulder hurts on bench and overhead press.",
  });

  assert.equal(profile.upperBodyPushRestricted, true);
  assert.equal(profile.runningRestricted, false);
  assert.equal(profile.preserveLowerBody, true);
});

test("explicit structured limitations override text ambiguity", () => {
  const profile = buildInjuryCapabilityProfile({
    level: "mild_tightness",
    area: "Shoulder",
    limitations: ["upper_body_pull"],
    notes: "Mostly okay except rows and pull-ups.",
  });

  assert.equal(profile.upperBodyPullRestricted, true);
  assert.equal(profile.upperBodyPushRestricted, false);
  assert.equal(profile.runningRestricted, false);
});

test("ankle pain removes running but keeps bench and rows on a hybrid day", () => {
  const workout = {
    type: "run+strength",
    label: "Tempo + Strength",
    run: { t: "Tempo", d: "25 min" },
    prescribedExercises: [
      { ex: "Bench Press", sets: "4", reps: "6" },
      { ex: "Chest-Supported Row", sets: "4", reps: "8" },
      { ex: "Bulgarian Split Squat", sets: "3", reps: "8" },
      { ex: "Romanian Deadlift", sets: "3", reps: "8" },
    ],
  };

  const result = buildInjuryRuleResult(workout, {
    level: "moderate_pain",
    area: "Ankle",
    notes: "Rolled ankle yesterday.",
  });

  assert.equal(result.workout.injuryAdjusted, true);
  assert.equal(result.workout.label, "Upper-Body Maintenance");
  assert.equal(result.workout.run, null);
  assert.ok(result.workout.prescribedExercises.some((row) => /bench/i.test(row.ex)));
  assert.ok(result.workout.prescribedExercises.some((row) => /row/i.test(row.ex)));
  assert.ok(!result.workout.prescribedExercises.some((row) => /split squat|deadlift/i.test(row.ex)));
  assert.match(result.why, /Ankle moderate pain/i);
});
