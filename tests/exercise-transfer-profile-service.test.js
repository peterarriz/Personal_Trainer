const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildExerciseTransferProfile,
} = require("../src/services/exercise-transfer-profile-service.js");

test("incline db press maps to pressing support instead of disappearing into generic strength", () => {
  const profile = buildExerciseTransferProfile({ exerciseName: "Incline DB Press" });

  assert.equal(profile.primaryPattern, "upper_press_support");
  assert.ok(profile.supportDriverIds.includes("horizontal_press_strength"));
  assert.ok(profile.supportDriverIds.includes("anterior_delt_strength"));
});

test("lateral raises register as shoulder-support work", () => {
  const profile = buildExerciseTransferProfile({ exerciseName: "Lateral Raise" });

  assert.equal(profile.primaryPattern, "shoulder_isolation");
  assert.ok(profile.supportDriverIds.includes("anterior_delt_strength"));
});

test("calf raises and heel drops register as lower-leg durability support", () => {
  const calfProfile = buildExerciseTransferProfile({ exerciseName: "Standing Calf Raise" });
  const heelDropProfile = buildExerciseTransferProfile({ exerciseName: "Heel Drop" });

  assert.ok(calfProfile.supportDriverIds.includes("calf_soleus_capacity"));
  assert.ok(calfProfile.protectiveDriverIds.includes("lower_leg_tolerance"));
  assert.ok(heelDropProfile.protectiveDriverIds.includes("tendon_tolerance"));
});

test("rows and face pulls register as upper-back and scap support", () => {
  const rowProfile = buildExerciseTransferProfile({ exerciseName: "Chest-Supported Row" });
  const facePullProfile = buildExerciseTransferProfile({ exerciseName: "Face Pull" });

  assert.ok(rowProfile.supportDriverIds.includes("upper_back_stability"));
  assert.ok(rowProfile.supportDriverIds.includes("lat_strength"));
  assert.ok(facePullProfile.supportDriverIds.includes("scapular_control"));
});
