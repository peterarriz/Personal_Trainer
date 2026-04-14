const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyHydrationQuickAdd,
  mergeActualNutritionLogUpdate,
  normalizeActualNutritionLog,
} = require("../src/modules-nutrition.js");

test("hydration quick add preserves ounces above the target while capping visual progress", () => {
  assert.deepEqual(
    applyHydrationQuickAdd({
      currentOz: 96,
      targetOz: 100,
      incrementOz: 12,
    }),
    {
      hydrationOz: 108,
      hydrationTargetOz: 100,
      hydrationPct: 100,
    }
  );
});

test("hydration quick add does not produce NaN when no target is stored", () => {
  assert.deepEqual(
    applyHydrationQuickAdd({
      currentOz: 24,
      targetOz: 0,
      incrementOz: 12,
    }),
    {
      hydrationOz: 36,
      hydrationTargetOz: 0,
      hydrationPct: 0,
    }
  );
});

test("hydration merge keeps an explicit quick-add update over older nested actuals", () => {
  const previousLog = normalizeActualNutritionLog({
    dateKey: "2026-04-13",
    feedback: {
      status: "on_track",
      hydrationOz: 0,
      hydrationTargetOz: 111,
      actualNutrition: {
        quickStatus: "on_track",
        hydration: { oz: 0, targetOz: 111 },
      },
    },
  });

  const merged = mergeActualNutritionLogUpdate({
    dateKey: "2026-04-13",
    previousLog,
    feedback: {
      status: "on_track",
      hydrationOz: 12,
      hydrationTargetOz: 111,
    },
  });

  assert.equal(merged.hydrationOz, 12);
  assert.equal(merged.hydration.oz, 12);
  assert.equal(merged.hydrationTargetOz, 111);
});
