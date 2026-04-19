const freezeRecord = (record = {}) => Object.freeze({ ...(record || {}) });

const toRegexSource = (source, flags = "i") => freezeRecord({ source, flags });

const toVisibleCountBudget = (testId, maxVisible, minVisible = 0) => freezeRecord({
  testId,
  maxVisible,
  minVisible,
});

const toSurfaceContract = ({
  id,
  label,
  tabTestId,
  rootTestId,
  primaryActionTestId,
  labelTestId,
  reasonTestId,
  reasonDisclosureTestId = "",
  visibleWordBudget,
  actionLayerTestIds = [],
  collapsedDisclosureTestIds = [],
  visibleCountBudgets = [],
} = {}) => freezeRecord({
  id,
  label,
  tabTestId,
  rootTestId,
  primaryActionTestId,
  labelTestId,
  reasonTestId,
  reasonDisclosureTestId,
  visibleWordBudget,
  actionLayerTestIds: Object.freeze([...(actionLayerTestIds || [])]),
  collapsedDisclosureTestIds: Object.freeze([...(collapsedDisclosureTestIds || [])]),
  visibleCountBudgets: Object.freeze([...(visibleCountBudgets || [])]),
  primaryButtonBudget: freezeRecord({
    className: "btn btn-primary",
    maxVisible: 1,
    minVisible: 1,
  }),
});

const CONSUMER_SURFACE_BANNED_REGEX_SOURCES = Object.freeze([
  toRegexSource("limited data"),
  toRegexSource("adapted week"),
  toRegexSource("audit mode"),
  toRegexSource("reviewer report"),
  toRegexSource("planning engine"),
  toRegexSource("developer diagnostics"),
  toRegexSource("staff diagnostics"),
  toRegexSource("\\\\bbackbone\\\\b"),
  toRegexSource("\\\\bstrict mode\\\\b"),
  toRegexSource("\\\\bcurrent basis\\\\b"),
  toRegexSource("\\\\bactive layers\\\\b"),
  toRegexSource("\\\\bclear active basis\\\\b"),
  toRegexSource("\\\\btransparent basis\\\\b"),
]);

const SURFACE_CLARITY_CONTRACT = Object.freeze({
  today: toSurfaceContract({
    id: "today",
    label: "Today",
    tabTestId: "app-tab-today",
    rootTestId: "today-tab",
    primaryActionTestId: "today-primary-cta",
    labelTestId: "today-canonical-session-label",
    reasonTestId: "today-change-summary",
    reasonDisclosureTestId: "today-why-changed",
    visibleWordBudget: 120,
    actionLayerTestIds: ["today-primary-cta", "today-secondary-cta", "today-save-log"],
    collapsedDisclosureTestIds: ["today-session-plan"],
    visibleCountBudgets: [
      toVisibleCountBudget("planned-session-plan", 0),
    ],
  }),
  program: toSurfaceContract({
    id: "program",
    label: "Program",
    tabTestId: "app-tab-program",
    rootTestId: "program-tab",
    primaryActionTestId: "program-primary-cta",
    labelTestId: "program-canonical-session-label",
    reasonTestId: "program-change-summary",
    visibleWordBudget: 165,
    actionLayerTestIds: ["program-primary-cta", "program-secondary-cta"],
    visibleCountBudgets: [
      toVisibleCountBudget("program-current-day-highlight", 0),
      toVisibleCountBudget("planned-session-plan", 0),
    ],
  }),
  log: toSurfaceContract({
    id: "log",
    label: "Log",
    tabTestId: "app-tab-log",
    rootTestId: "log-tab",
    primaryActionTestId: "log-save-quick",
    labelTestId: "log-canonical-session-label",
    reasonTestId: "log-canonical-reason",
    visibleWordBudget: 150,
    actionLayerTestIds: ["log-save-quick", "log-save-detailed", "log-complete-prescribed"],
    collapsedDisclosureTestIds: [
      "log-advanced-fields",
      "log-day-review-disclosure",
      "log-recent-history-disclosure",
    ],
    visibleCountBudgets: [
      toVisibleCountBudget("planned-session-plan", 1, 1),
    ],
  }),
  coach: toSurfaceContract({
    id: "coach",
    label: "Coach",
    tabTestId: "app-tab-coach",
    rootTestId: "coach-tab",
    primaryActionTestId: "coach-preview-adjust-today",
    labelTestId: "coach-canonical-session-label",
    reasonTestId: "coach-canonical-reason",
    visibleWordBudget: 165,
    actionLayerTestIds: ["coach-preview-adjust-today", "coach-ask-send", "coach-preview-accept"],
    collapsedDisclosureTestIds: [
      "coach-week-options-disclosure",
      "coach-recent-questions-disclosure",
    ],
    visibleCountBudgets: [
      toVisibleCountBudget("planned-session-plan", 0),
    ],
  }),
});

const getSurfaceClarityContract = (surfaceId = "") => (
  SURFACE_CLARITY_CONTRACT[String(surfaceId || "").trim().toLowerCase()] || null
);

module.exports = {
  CONSUMER_SURFACE_BANNED_REGEX_SOURCES,
  SURFACE_CLARITY_CONTRACT,
  getSurfaceClarityContract,
};
