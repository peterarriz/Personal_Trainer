const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CALIBRATION_MIN_HISTORY_COUNT,
  CALIBRATION_STATES,
  countMeaningfulHistoryEntries,
  deriveCalibrationState,
} = require("../src/services/calibration-state-service.js");

test("deriveCalibrationState keeps brand-new users in calibration with zero history", () => {
  const result = deriveCalibrationState({
    logs: {},
    dailyCheckins: {},
  });

  assert.equal(result.state, CALIBRATION_STATES.calibration);
  assert.equal(result.isCalibration, true);
  assert.equal(result.historyCount, 0);
  assert.equal(result.minHistoryCount, CALIBRATION_MIN_HISTORY_COUNT);
});

test("deriveCalibrationState stays neutral below the history threshold", () => {
  const result = deriveCalibrationState({
    logs: {
      "2026-04-01": { type: "easy run", checkin: { status: "completed_as_planned" } },
      "2026-04-03": { checkin: { status: "skipped" } },
    },
    dailyCheckins: {},
  });

  assert.equal(result.isCalibration, true);
  assert.equal(result.historyCount, 2);
});

test("deriveCalibrationState exits calibration once enough meaningful history exists", () => {
  const result = deriveCalibrationState({
    logs: {
      "2026-04-01": { type: "easy run", checkin: { status: "completed_as_planned" } },
      "2026-04-03": { type: "strength", checkin: { status: "completed_modified" } },
    },
    dailyCheckins: {
      "2026-04-05": { status: "skipped" },
    },
  });

  assert.equal(result.state, CALIBRATION_STATES.active);
  assert.equal(result.isCalibration, false);
  assert.equal(result.historyCount, 3);
});

test("countMeaningfulHistoryEntries ignores empty placeholder rows and avoids double counting shared dates", () => {
  const count = countMeaningfulHistoryEntries({
    logs: {
      "2026-04-01": { type: "easy run", checkin: { status: "completed_as_planned" } },
      "2026-04-02": {},
    },
    dailyCheckins: {
      "2026-04-01": { status: "completed_as_planned" },
      "2026-04-03": { status: "skipped" },
    },
  });

  assert.equal(count, 2);
});
