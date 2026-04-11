import { resolveActualStatus } from "../modules-checkins.js";

export const CALIBRATION_STATES = Object.freeze({
  calibration: "calibration",
  active: "active",
});

export const CALIBRATION_MIN_HISTORY_COUNT = 3;

const COUNTABLE_STATUSES = new Set([
  "completed_as_planned",
  "completed_modified",
  "partial_completed",
  "skipped",
]);

const hasMeaningfulWorkoutSignal = (logEntry = {}) => (
  Number(logEntry?.miles || 0) > 0
  || String(logEntry?.type || "").trim().length > 0
  || (Array.isArray(logEntry?.strengthPerformance) && logEntry.strengthPerformance.length > 0)
);

export const countMeaningfulHistoryEntries = ({ logs = {}, dailyCheckins = {} } = {}) => (
  Array.from(new Set([...(Object.keys(logs || {})), ...(Object.keys(dailyCheckins || {}))]))
    .filter((dateKey) => {
      const logEntry = logs?.[dateKey] || {};
      const dailyCheckin = dailyCheckins?.[dateKey] || {};
      const status = resolveActualStatus({ dateKey, dailyCheckin, logEntry });
      return COUNTABLE_STATUSES.has(status) || hasMeaningfulWorkoutSignal(logEntry);
    })
    .length
);

export const deriveCalibrationState = ({
  logs = {},
  dailyCheckins = {},
  minHistoryCount = CALIBRATION_MIN_HISTORY_COUNT,
} = {}) => {
  const historyCount = countMeaningfulHistoryEntries({ logs, dailyCheckins });
  const isCalibration = historyCount < Math.max(1, Number(minHistoryCount || CALIBRATION_MIN_HISTORY_COUNT));
  return {
    state: isCalibration ? CALIBRATION_STATES.calibration : CALIBRATION_STATES.active,
    isCalibration,
    historyCount,
    minHistoryCount: Math.max(1, Number(minHistoryCount || CALIBRATION_MIN_HISTORY_COUNT)),
  };
};
