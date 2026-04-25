const { expect } = require("@playwright/test");

const LOCAL_CACHE_KEY = "trainer_local_cache_v4";
const AUTH_CACHE_KEY = "trainer_auth_session_v1";
const AUTH_RECOVERY_CACHE_KEY = "trainer_auth_recovery_v1";
const INTAKE_SESSION_STORAGE_KEY = "intake_session_v1";

const toTestIdFragment = (value = "") => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 80);

const normalizeText = (value = "") => String(value || "").trim().toLowerCase();
const normalizeExperienceLevelValue = (value = "") => {
  const normalized = normalizeText(value);
  if (normalized === "advanced") return "advanced";
  if (normalized === "beginner" || normalized === "brand new") return "beginner";
  return "intermediate";
};
const normalizeSessionLengthValue = (value = "") => {
  const normalized = normalizeText(value);
  if (normalized.startsWith("20")) return "20";
  if (normalized.startsWith("30")) return "30";
  if (normalized.startsWith("60")) return "60+";
  return "45";
};

const jsonResponse = ({ status = 200, body = {} } = {}) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const buildMeta = (requestType = "") => ({
  requestType,
  provider: "e2e-mock",
  model: "e2e-mock",
  latencyMs: 1,
});

const buildExtractionCandidate = ({
  field_id,
  confidence = 0.97,
  raw_text,
  parsed_value,
  evidenceText = "",
} = {}) => ({
  field_id,
  confidence,
  raw_text,
  parsed_value,
  evidence_spans: evidenceText
    ? [{ start: 0, end: String(evidenceText).length, text: evidenceText }]
    : [],
});

const parseExtractionCandidate = ({ fieldId = "", utterance = "" } = {}) => {
  const cleanUtterance = String(utterance || "").trim();
  const lowered = normalizeText(cleanUtterance);
  if (!fieldId || !cleanUtterance) return null;

  if (fieldId === "current_run_frequency") {
    const match = cleanUtterance.match(/(\d+(?:\.\d+)?)\s*(?:runs?|x)?(?:\s*\/\s*week|\s+per\s+week|\s+weekly)?/i);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) return null;
    return buildExtractionCandidate({
      field_id: fieldId,
      raw_text: cleanUtterance,
      parsed_value: { value, raw: cleanUtterance },
      evidenceText: match[0],
    });
  }

  if (fieldId === "target_timeline") {
    const raw = cleanUtterance;
    if (!raw) return null;
    return buildExtractionCandidate({
      field_id: fieldId,
      raw_text: raw,
      parsed_value: {
        value: raw,
        raw,
        mode: /^\d{4}-\d{2}-\d{2}$/.test(raw) ? "date" : "month",
      },
      evidenceText: raw,
    });
  }

  if (fieldId === "recent_pace_baseline") {
    return buildExtractionCandidate({
      field_id: fieldId,
      raw_text: cleanUtterance,
      parsed_value: cleanUtterance,
      evidenceText: cleanUtterance,
    });
  }

  if (fieldId === "longest_recent_run") {
    const milesMatch = cleanUtterance.match(/(\d+(?:\.\d+)?)\s*(?:miles?|mi)\b/i);
    if (milesMatch) {
      const value = Number(milesMatch[1]);
      return buildExtractionCandidate({
        field_id: fieldId,
        raw_text: cleanUtterance,
        parsed_value: { value, unit: "miles", raw: cleanUtterance },
        evidenceText: milesMatch[0],
      });
    }
    const minutesMatch = cleanUtterance.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/i);
    if (minutesMatch) {
      const value = Number(minutesMatch[1]);
      return buildExtractionCandidate({
        field_id: fieldId,
        raw_text: cleanUtterance,
        parsed_value: { value, unit: "minutes", raw: cleanUtterance },
        evidenceText: minutesMatch[0],
      });
    }
    return null;
  }

  if (fieldId === "current_strength_baseline") {
    const topSetMatch = cleanUtterance.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+)/i);
    if (topSetMatch) {
      const weight = Number(topSetMatch[1]);
      const reps = Number(topSetMatch[2]);
      return buildExtractionCandidate({
        field_id: fieldId,
        raw_text: cleanUtterance,
        parsed_value: { weight, reps, raw: cleanUtterance },
        evidenceText: topSetMatch[0],
      });
    }
    const maxMatch = cleanUtterance.match(/(\d+(?:\.\d+)?)\s*(?:single|estimated max|max)/i);
    if (maxMatch) {
      const weight = Number(maxMatch[1]);
      return buildExtractionCandidate({
        field_id: fieldId,
        raw_text: cleanUtterance,
        parsed_value: { weight, raw: cleanUtterance },
        evidenceText: maxMatch[0],
      });
    }
    return null;
  }

  if (fieldId === "current_bodyweight" || fieldId === "current_waist") {
    const numericMatch = cleanUtterance.match(/(\d+(?:\.\d+)?)/);
    if (!numericMatch) return null;
    const value = Number(numericMatch[1]);
    return buildExtractionCandidate({
      field_id: fieldId,
      raw_text: cleanUtterance,
      parsed_value: {
        value,
        unit: fieldId === "current_bodyweight" ? "lb" : "in",
        raw: cleanUtterance,
      },
      evidenceText: numericMatch[0],
    });
  }

  if (fieldId === "recent_swim_anchor") {
    const hasDistance = /(\d+(?:\.\d+)?)\s*(?:yd|yard|yards|m|meter|meters|metre|metres)\b/i.test(cleanUtterance);
    const hasDuration = /\b\d+:\d{2}(?::\d{2})?\b/.test(cleanUtterance) || /(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i.test(cleanUtterance);
    if (!hasDistance && !hasDuration) return null;
    return buildExtractionCandidate({
      field_id: fieldId,
      raw_text: cleanUtterance,
      parsed_value: cleanUtterance,
      evidenceText: cleanUtterance,
    });
  }

  if (fieldId === "target_weight_change") {
    const numericMatch = cleanUtterance.match(/([+-]?\d+(?:\.\d+)?)/);
    if (!numericMatch) return null;
    const value = Math.abs(Number(numericMatch[1]));
    if (!Number.isFinite(value) || value <= 0) return null;
    return buildExtractionCandidate({
      field_id: fieldId,
      raw_text: cleanUtterance,
      parsed_value: {
        value: -value,
        unit: "lb",
        raw: cleanUtterance,
      },
      evidenceText: numericMatch[0],
    });
  }

  if (fieldId === "running_endurance_anchor_kind") {
    const value = lowered.includes("pace") || lowered.includes("race")
      ? "recent_pace_baseline"
      : lowered.includes("long")
      ? "longest_recent_run"
      : "";
    if (!value) return null;
    return buildExtractionCandidate({
      field_id: fieldId,
      raw_text: cleanUtterance,
      parsed_value: { value, raw: cleanUtterance },
      evidenceText: cleanUtterance,
    });
  }

  if (fieldId === "appearance_proxy_anchor_kind") {
    const value = lowered.includes("waist")
      ? "current_waist"
      : lowered.includes("body")
      || lowered.includes("weight")
      || lowered.includes("scale")
      ? "current_bodyweight"
      : "";
    if (!value) return null;
    return buildExtractionCandidate({
      field_id: fieldId,
      raw_text: cleanUtterance,
      parsed_value: { value, raw: cleanUtterance },
      evidenceText: cleanUtterance,
    });
  }

  return null;
};

const defaultGoalInterpretationFailure = () => ({
  status: 503,
  body: {
    code: "e2e_goal_interpretation_unavailable",
    message: "Goal interpretation unavailable in deterministic E2E mode.",
  },
});

const defaultCoachVoiceFailure = () => ({
  status: 503,
  body: {
    code: "e2e_coach_voice_unavailable",
    message: "Coach voice unavailable in deterministic E2E mode.",
  },
});

const buildDefaultAiHandler = () => async ({ requestType = "", body = {} } = {}) => {
  if (requestType === "missing_field_extraction") {
    const missingFields = Array.isArray(body?.extractionRequest?.missingFields)
      ? body.extractionRequest.missingFields
      : [];
    const utterance = body?.extractionRequest?.utterance || "";
    const candidates = missingFields
      .map((field) => parseExtractionCandidate({
        fieldId: String(field?.field_id || ""),
        utterance,
      }))
      .filter(Boolean);
    return {
      status: 200,
      body: {
        extraction: { candidates },
        meta: buildMeta(requestType),
      },
    };
  }
  if (requestType === "clarifying_question_generation") return defaultCoachVoiceFailure();
  if (requestType === "goal_interpretation") return defaultGoalInterpretationFailure();
  return {
    status: 503,
    body: {
      code: "e2e_unknown_request_type",
      message: `Unhandled request type: ${requestType || "unknown"}`,
    },
  };
};

const resolveMockResult = async ({ handler, payload = {} } = {}) => {
  const result = typeof handler === "function"
    ? await handler(payload)
    : handler;
  return result && typeof result === "object" ? result : null;
};

async function installStorageInstrumentation(page) {
  await page.addInitScript(() => {
    window.__E2E_STORAGE_OPS = [];
    window.__E2E_APP_EVENTS = [];
    const pushEvent = (type) => (event) => {
      try {
        window.__E2E_APP_EVENTS.push({
          type,
          detail: event?.detail || null,
        });
      } catch {}
    };
    window.addEventListener("trainer:intake-commit", pushEvent("trainer:intake-commit"));
    window.addEventListener("trainer:analytics", pushEvent("trainer:analytics"));
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function setItemPatched(key, value) {
      try {
        window.__E2E_STORAGE_OPS.push({
          type: "set",
          key,
          area: this === window.localStorage ? "local" : this === window.sessionStorage ? "session" : "unknown",
          value,
        });
      } catch {}
      return originalSetItem.apply(this, arguments);
    };
    Storage.prototype.removeItem = function removeItemPatched(key) {
      try {
        window.__E2E_STORAGE_OPS.push({
          type: "remove",
          key,
          area: this === window.localStorage ? "local" : this === window.sessionStorage ? "session" : "unknown",
        });
      } catch {}
      return originalRemoveItem.apply(this, arguments);
    };
  });
}

async function installIntakeAiMocks(page, handlers = {}) {
  const fallbackHandler = buildDefaultAiHandler();
  await page.route("**/api/ai/intake", async (route) => {
    const request = route.request();
    let body = {};
    try {
      body = JSON.parse(request.postData() || "{}");
    } catch {}
    const requestType = String(body?.requestType || "");
    const handler = handlers[requestType] || handlers.default || fallbackHandler;
    const result = await resolveMockResult({
      handler,
      payload: { requestType, body, request },
    });
    if (result?.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, result.delayMs));
    }
    await route.fulfill(jsonResponse({
      status: result?.status || 200,
      body: result?.body || {},
    }));
  });
}

async function enterLocalIntakeIfNeeded(page) {
  const waitForIntakeSurface = async () => {
    await expect.poll(async () => {
      const visibleStates = await Promise.all([
        page.getByTestId("intake-goals-step").isVisible().catch(() => false),
        page.getByTestId("intake-interpretation-step").isVisible().catch(() => false),
        page.getByTestId("intake-clarify-step").isVisible().catch(() => false),
        page.getByTestId("intake-confirm-step").isVisible().catch(() => false),
        page.getByTestId("intake-review").isVisible().catch(() => false),
        page.getByTestId("intake-building").isVisible().catch(() => false),
      ]);
      return visibleStates.some(Boolean);
    }, { timeout: 12_000 }).toBe(true);
  };
  const intakeRoot = page.getByTestId("intake-root");
  if (await intakeRoot.count()) {
    await expect(intakeRoot).toBeVisible();
    await waitForIntakeSurface();
    return;
  }
  const authGate = page.getByTestId("auth-gate");
  if (await authGate.count()) {
    await expect(authGate).toBeVisible();
    await domClick(page.getByTestId("continue-local-mode"));
    await expect.poll(async () => {
      const intakeVisible = await page.getByTestId("intake-root").isVisible().catch(() => false);
      return intakeVisible ? "intake" : "";
    }, { timeout: 12_000 }).toBe("intake");
  }
  await expect(page.getByTestId("profile-setup-gate")).toHaveCount(0);
  await expect(page.getByTestId("intake-root")).toBeVisible();
  await waitForIntakeSurface();
}

async function domClick(locator) {
  await expect(locator).toBeVisible();
  await locator.evaluate((node) => node.click());
}

async function domDblClick(locator) {
  await expect(locator).toBeVisible();
  await locator.evaluate((node) => {
    node.click();
    node.click();
  });
}

async function domFill(locator, value) {
  await expect(locator).toBeVisible();
  await locator.evaluate((node, nextValue) => {
    if (!node) return;
    node.focus?.();
    const nextStringValue = String(nextValue ?? "");
    const prototype = node.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement?.prototype
      : node.tagName === "SELECT"
      ? window.HTMLSelectElement?.prototype
      : window.HTMLInputElement?.prototype;
    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;
    if (descriptor?.set) {
      descriptor.set.call(node, nextStringValue);
    } else {
      node.value = nextStringValue;
    }
    node.dispatchEvent(new InputEvent("input", { bubbles: true, data: nextStringValue, inputType: "insertText" }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function gotoIntakeInLocalMode(page, handlers = {}, {
  freshStart = false,
} = {}) {
  await installStorageInstrumentation(page);
  await installIntakeAiMocks(page, handlers);
  await page.addInitScript((storageKeys) => {
    try {
      if (storageKeys.freshStart) {
        window.localStorage.removeItem(storageKeys.localCacheKey);
        window.localStorage.removeItem(storageKeys.authCacheKey);
        window.localStorage.removeItem(storageKeys.authRecoveryCacheKey);
        window.sessionStorage.clear();
      }
      window.localStorage.setItem("trainer_debug", "1");
      if (!window.localStorage.getItem(storageKeys.localCacheKey)) {
        window.localStorage.setItem(storageKeys.localCacheKey, JSON.stringify({
          goals: [],
          personalization: null,
        }));
      }
    } catch {}
  }, {
    localCacheKey: LOCAL_CACHE_KEY,
    authCacheKey: AUTH_CACHE_KEY,
    authRecoveryCacheKey: AUTH_RECOVERY_CACHE_KEY,
    freshStart,
  });
  await page.goto("/");
  await enterLocalIntakeIfNeeded(page);
}

async function getIntakeRoot(page) {
  return page.getByTestId("intake-root");
}

async function getCurrentPhase(page) {
  return page.getByTestId("intake-root").getAttribute("data-intake-phase");
}

async function getCurrentStage(page) {
  return page.getByTestId("intake-root").getAttribute("data-intake-stage");
}

async function getCurrentFieldId(page) {
  return page.getByTestId("intake-root").getAttribute("data-current-field-id");
}

async function getCurrentQuestionKey(page) {
  return page.getByTestId("intake-root").getAttribute("data-current-question-key");
}

async function getConfirmationStatus(page) {
  return page.getByTestId("intake-root").getAttribute("data-confirmation-status");
}

async function completeIntroQuestionnaire(page, {
  goalText,
  additionalGoals = [],
  experienceLevel = "Intermediate",
  trainingDays = "3",
  sessionLength = "45 min",
  trainingLocation = "Gym",
  homeEquipment = [],
  homeEquipmentOther = "",
  injuryText = "",
  injuryImpact = "",
  coachingStyle = "Balanced coaching",
  stopAtInterpretation = false,
} = {}) {
  const experienceLevelValue = normalizeExperienceLevelValue(experienceLevel);
  const sessionLengthValue = normalizeSessionLengthValue(sessionLength);
  await expect(page.getByTestId("intake-goals-step")).toBeVisible();
  if (String(goalText || "").trim()) {
    if (await page.getByTestId("intake-goals-primary-input").count() === 0) {
      if (await page.getByTestId("intake-goal-type-custom").count() > 0) {
        await domClick(page.getByTestId("intake-goal-type-custom"));
      } else {
        await domClick(page.getByTestId("intake-goals-toggle-custom"));
      }
      await expect(page.getByTestId("intake-goals-primary-input")).toBeVisible();
    }
    await domFill(page.getByTestId("intake-goals-primary-input"), goalText);
    await domClick(page.getByTestId("intake-goals-add"));
    await commitPendingGoalSelection(page);
  } else {
    await domClick(page.getByTestId("intake-footer-foundation"));
    return;
  }

  for (const goal of additionalGoals) {
    if (await page.getByTestId("intake-goals-primary-input").count() === 0) {
      await domClick(page.getByTestId("intake-goals-toggle-custom"));
      await expect(page.getByTestId("intake-goals-primary-input")).toBeVisible();
    }
    await domFill(page.getByTestId("intake-goals-primary-input"), String(goal));
    const addGoalButton = page.getByTestId("intake-goals-add");
    await expect(addGoalButton).toBeEnabled();
    await domClick(addGoalButton);
    await commitPendingGoalSelection(page);
    await expect(page.getByTestId("intake-goals-primary-input")).toHaveValue("");
  }

  await domClick(page.getByTestId(`intake-goals-option-experience-level-${toTestIdFragment(experienceLevelValue)}`));
  await domClick(page.getByTestId(`intake-goals-option-training-days-${toTestIdFragment(trainingDays)}`));
  await domClick(page.getByTestId(`intake-goals-option-session-length-${toTestIdFragment(sessionLengthValue)}`));
  await domClick(page.getByTestId(`intake-goals-option-training-location-${toTestIdFragment(trainingLocation)}`));

  if (trainingLocation === "Home" || trainingLocation === "Both") {
    for (const option of homeEquipment) {
      await domClick(page.getByTestId(`intake-goals-option-home-equipment-${toTestIdFragment(option)}`));
    }
    if (homeEquipment.includes("Other") && homeEquipmentOther) {
      await domFill(page.getByTestId("intake-goals-input-home-equipment-other"), homeEquipmentOther);
    }
  }

  if (String(injuryText || "").trim()) {
    await domFill(page.getByTestId("intake-goals-input-injury-text"), injuryText);
  }
  if (injuryImpact) {
    await domClick(page.getByTestId(`intake-goals-option-injury-impact-${toTestIdFragment(injuryImpact)}`));
  }

  const coachingChip = page.getByTestId(`intake-goals-option-coaching-style-${toTestIdFragment(coachingStyle)}`);
  if (await coachingChip.count()) {
    await domClick(coachingChip);
  }
  await domClick(page.getByTestId("intake-footer-continue"));
  await expect.poll(async () => await getCurrentPhase(page), { timeout: 20_000 }).toMatch(/clarify|confirm|building|completed/);
  if (stopAtInterpretation) return;
  const phase = await getCurrentPhase(page);
  if (phase === "clarify") {
    await expect(page.getByTestId("intake-clarify-step")).toBeVisible();
  }
  if (phase === "confirm") {
    await expect(page.getByTestId("intake-confirm-step")).toBeVisible();
  }
  if (phase === "building") {
    await expect(page.getByTestId("intake-root")).toHaveAttribute("data-intake-phase", "building");
  }
}

async function fillPlanningRealityInputs(page, {
  experienceLevel = "Intermediate",
  trainingDays = "3",
  availableTrainingDays = [],
  sessionLength = "45 min",
  trainingLocation = "Gym",
  homeEquipment = [],
  homeEquipmentOther = "",
  injuryText = "",
  injuryImpact = "",
  coachingStyle = "",
} = {}) {
  const experienceLevelValue = normalizeExperienceLevelValue(experienceLevel);
  const sessionLengthValue = normalizeSessionLengthValue(sessionLength);
  const normalizedHomeEquipment = Array.isArray(homeEquipment) ? homeEquipment : [homeEquipment].filter(Boolean);
  const normalizedAvailableDays = Array.isArray(availableTrainingDays) ? availableTrainingDays : [availableTrainingDays].filter(Boolean);
  const resolvedHomeEquipment = (
    (trainingLocation === "Home" || trainingLocation === "Both") &&
    normalizedHomeEquipment.length === 0
  )
    ? ["Bodyweight only"]
    : normalizedHomeEquipment;
  await domClick(page.getByTestId(`intake-goals-option-experience-level-${toTestIdFragment(experienceLevelValue)}`));
  await domClick(page.getByTestId(`intake-goals-option-training-days-${toTestIdFragment(trainingDays)}`));
  await domClick(page.getByTestId(`intake-goals-option-session-length-${toTestIdFragment(sessionLengthValue)}`));
  await domClick(page.getByTestId(`intake-goals-option-training-location-${toTestIdFragment(trainingLocation)}`));

  if (normalizedAvailableDays.length || String(injuryText || "").trim() || injuryImpact || coachingStyle) {
    const optionalDetails = page.getByTestId("intake-optional-reality-details");
    if (await optionalDetails.count()) {
      const detailsOpen = await optionalDetails.evaluate((node) => Boolean(node.open)).catch(() => true);
      if (!detailsOpen) await domClick(page.getByTestId("intake-optional-reality-summary"));
    }
  }

  if (trainingLocation === "Home" || trainingLocation === "Both") {
    for (const option of resolvedHomeEquipment) {
      await domClick(page.getByTestId(`intake-goals-option-home-equipment-${toTestIdFragment(option)}`));
    }
    if (resolvedHomeEquipment.includes("Other") && homeEquipmentOther) {
      await domFill(page.getByTestId("intake-goals-input-home-equipment-other"), homeEquipmentOther);
    }
  }

  for (const day of normalizedAvailableDays) {
    await domClick(page.getByTestId(`intake-goals-option-available-days-${toTestIdFragment(day)}`));
  }

  if (String(injuryText || "").trim()) {
    await domFill(page.getByTestId("intake-goals-input-injury-text"), injuryText);
  }
  if (injuryImpact) {
    await domClick(page.getByTestId(`intake-goals-option-injury-impact-${toTestIdFragment(injuryImpact)}`));
  }
  if (coachingStyle) {
    const coachingChip = page.getByTestId(`intake-goals-option-coaching-style-${toTestIdFragment(coachingStyle)}`);
    if (await coachingChip.count()) await domClick(coachingChip);
  }
}

async function fillStarterMetricInputs(page, quickMetrics = {}) {
  const pickVisibleTarget = async (locator) => {
    const count = await locator.count();
    if (!count) return null;
    for (let index = count - 1; index >= 0; index -= 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
    return locator.first();
  };

  for (const [fieldKey, rawValue] of Object.entries(quickMetrics || {})) {
    if (rawValue == null || rawValue === "") continue;
    const choiceValue = typeof rawValue === "object" && rawValue !== null ? rawValue.value : rawValue;
    const choiceTarget = page.getByTestId(`intake-goal-metric-${fieldKey}-${toTestIdFragment(choiceValue)}`);
    const visibleChoiceTarget = await pickVisibleTarget(choiceTarget);
    if (visibleChoiceTarget) {
      await domClick(visibleChoiceTarget);
      continue;
    }
    const inputTarget = page.getByTestId(`intake-goal-metric-${toTestIdFragment(fieldKey)}`);
    const visibleInputTarget = await pickVisibleTarget(inputTarget);
    if (visibleInputTarget) {
      await domFill(visibleInputTarget, String(choiceValue));
    }
  }
}

async function commitPendingGoalSelection(page) {
  const commitButton = page.getByTestId("intake-goal-selection-commit");
  await expect(commitButton).toBeVisible();
  await expect(commitButton).toBeEnabled();
  await commitButton.click({ force: true });
  await expect.poll(async () => {
    const pendingDraftVisible = await page.getByTestId("intake-goal-selection-draft")
      .isVisible()
      .catch(() => false);
    return pendingDraftVisible ? "pending" : "saved";
  }, { timeout: 5_000 }).toBe("saved");
}

const GOAL_TYPE_ALIASES = Object.freeze({
  running: "endurance",
  swim: "endurance",
  fat_loss: "physique",
});

const TEMPLATE_ID_ALIASES = Object.freeze({
  run_first_5k: { templateId: "train_for_run_race", metricDefaults: { event_distance: "5k" } },
  run_faster_5k: { templateId: "train_for_run_race", metricDefaults: { event_distance: "5k" } },
  run_10k: { templateId: "train_for_run_race", metricDefaults: { event_distance: "10k" } },
  half_marathon: { templateId: "train_for_run_race", metricDefaults: { event_distance: "half_marathon" } },
  marathon: { templateId: "train_for_run_race", metricDefaults: { event_distance: "marathon" } },
  bench_225: { templateId: "improve_big_lifts", metricDefaults: { lift_focus: "bench", lift_target_weight: 225 } },
  open_water_swim: { templateId: "swim_better", metricDefaults: { goal_focus: "open_water" } },
  swim_faster_mile: { templateId: "swim_better", metricDefaults: { goal_focus: "endurance" } },
  lose_10_lb: { templateId: "lose_body_fat" },
  lose_20_lb: { templateId: "lose_body_fat" },
  tone_up: { templateId: "get_leaner" },
  look_athletic_again: { templateId: "get_leaner" },
});

function parseDistanceOrDurationQuickMetric(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return { parsedValue: "", parsedUnit: "" };
  const milesMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/i);
  if (milesMatch?.[1]) {
    return {
      parsedValue: String(milesMatch[1]).trim(),
      parsedUnit: "miles",
    };
  }
  const minutesMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i);
  if (minutesMatch?.[1]) {
    return {
      parsedValue: String(minutesMatch[1]).trim(),
      parsedUnit: "minutes",
    };
  }
  return { parsedValue: "", parsedUnit: "" };
}

function parseSwimAnchorQuickMetric(value = "") {
  const raw = String(value || "").trim();
  if (!raw) {
    return {
      distanceValue: "",
      distanceUnit: "",
      timeMinutes: "",
      timeSeconds: "",
    };
  }
  const distanceMatch = raw.match(/(\d+(?:\.\d+)?)\s*(yd|yard|yards|m|meter|meters|metre|metres)\b/i);
  const clockMatch = raw.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
  const minuteMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i);
  return {
    distanceValue: distanceMatch?.[1] ? String(distanceMatch[1]).trim() : "",
    distanceUnit: distanceMatch?.[2] && /yd|yard/i.test(distanceMatch[2]) ? "yd" : distanceMatch?.[2] ? "m" : "",
    timeMinutes: clockMatch?.[1]
      ? String(Number(clockMatch[1]))
      : minuteMatch?.[1]
      ? String(Number(minuteMatch[1]))
      : "",
    timeSeconds: clockMatch?.[2] ? String(clockMatch[2]).padStart(2, "0") : "",
  };
}

function normalizeLegacyQuickMetrics(templateId, quickMetrics = {}) {
  const next = { ...(quickMetrics || {}) };
  if (next.hybrid_priority === "endurance") next.hybrid_priority = "running";
  if (next.goal_focus === "balanced") {
    next.goal_focus = next.hybrid_priority === "strength" ? "strength" : "endurance";
  }
  if (next.longest_recent_run && !next.longest_recent_run_value && !next.longest_recent_run_unit) {
    const longestRun = parseDistanceOrDurationQuickMetric(next.longest_recent_run);
    next.longest_recent_run_value = next.longest_recent_run_value || longestRun.parsedValue;
    next.longest_recent_run_unit = next.longest_recent_run_unit || longestRun.parsedUnit;
  }
  if (next.recent_swim_anchor && !next.recent_swim_distance_value && !next.recent_swim_time_minutes) {
    const swimAnchor = parseSwimAnchorQuickMetric(next.recent_swim_anchor);
    next.recent_swim_distance_value = next.recent_swim_distance_value || swimAnchor.distanceValue;
    next.recent_swim_distance_unit = next.recent_swim_distance_unit || swimAnchor.distanceUnit || "yd";
    next.recent_swim_time_minutes = next.recent_swim_time_minutes || swimAnchor.timeMinutes;
    next.recent_swim_time_seconds = next.recent_swim_time_seconds || swimAnchor.timeSeconds;
  }
  if (next.current_strength_baseline && !next.current_strength_baseline_weight) {
    const baselineMatch = String(next.current_strength_baseline || "").match(/(\d+(?:\.\d+)?)\s*(?:x\s*(\d+))?/i);
    if (baselineMatch?.[1]) {
      next.current_strength_baseline_weight = next.current_strength_baseline_weight || String(baselineMatch[1]).trim();
      if (baselineMatch?.[2]) next.current_strength_baseline_reps = next.current_strength_baseline_reps || String(baselineMatch[2]).trim();
    }
  }
  if (!next.current_strength_baseline && next.current_strength_baseline_weight) {
    const reps = next.current_strength_baseline_reps ? ` x ${next.current_strength_baseline_reps}` : "";
    next.current_strength_baseline = `${next.current_strength_baseline_weight}${reps}`;
  }
  if (["train_for_run_race"].includes(templateId)) {
    next.event_distance = next.event_distance || "half_marathon";
    next.target_timeline = next.target_timeline || "October";
    next.current_run_frequency = next.current_run_frequency || "4";
    next.longest_recent_run_value = next.longest_recent_run_value || (next.event_distance === "marathon" ? "12" : next.event_distance === "half_marathon" ? "8" : "4");
    next.longest_recent_run_unit = next.longest_recent_run_unit || "miles";
  }
  if (["build_endurance", "conditioning_builder"].includes(templateId)) {
    next.primary_modality = next.primary_modality || "running";
    next.current_endurance_anchor = next.current_endurance_anchor || "30 min run";
  }
  if (["return_to_running", "restart_safely", "ease_back_in", "rebuild_routine", "conservative_return", "low_impact_restart"].includes(templateId)) {
    next.starting_capacity_anchor = next.starting_capacity_anchor || "10_easy_minutes";
    next.progression_posture = next.progression_posture || "protective";
  }
  if (["swim_better"].includes(templateId)) {
    next.goal_focus = next.goal_focus || "endurance";
    next.recent_swim_distance_value = next.recent_swim_distance_value || "1000";
    next.recent_swim_distance_unit = next.recent_swim_distance_unit || "yd";
    next.recent_swim_time_minutes = next.recent_swim_time_minutes || "22";
    next.recent_swim_time_seconds = next.recent_swim_time_seconds || "30";
    next.swim_access_reality = next.swim_access_reality || (next.goal_focus === "open_water" ? "open_water" : "pool");
  }
  if (["ride_stronger"].includes(templateId)) {
    next.primary_modality = next.primary_modality || "cycling";
    next.current_endurance_anchor = next.current_endurance_anchor || "45 min ride";
  }
  if (["triathlon_multisport"].includes(templateId)) {
    next.event_distance = next.event_distance || "sprint_triathlon";
    next.hybrid_priority = next.hybrid_priority || "balanced";
  }
  if (["get_stronger", "build_muscle", "train_with_limited_equipment", "maintain_strength"].includes(templateId)) {
    next.equipment_profile = next.equipment_profile || "full_gym";
    next.training_age = next.training_age || "intermediate";
    next.progression_posture = next.progression_posture || "standard";
  }
  if (["improve_big_lifts"].includes(templateId)) {
    next.lift_focus = next.lift_focus || "bench";
    next.lift_target_weight = next.lift_target_weight || "225";
    next.target_timeline = next.target_timeline || "12 weeks";
    next.current_strength_baseline_weight = next.current_strength_baseline_weight || "185";
    next.current_strength_baseline_reps = next.current_strength_baseline_reps || "5";
  }
  if (
    ["lose_body_fat", "get_leaner", "recomp", "cut_for_event", "keep_strength_while_cutting"].includes(templateId)
  ) {
    next.body_comp_tempo = next.body_comp_tempo || "steady";
    next.muscle_retention_priority = next.muscle_retention_priority || "high";
    next.cardio_preference = next.cardio_preference || "walks";
  }
  if (
    ["get_back_in_shape", "build_consistency", "feel_more_athletic", "improve_work_capacity", "healthy_routine_fitness"].includes(templateId)
  ) {
    next.starting_capacity_anchor = next.starting_capacity_anchor || "20_to_30_minutes";
    next.goal_focus = next.goal_focus || "consistency";
  }
  if (
    ["run_and_lift", "stronger_and_fitter", "aesthetic_plus_endurance", "sport_support", "tactical_fitness"].includes(templateId)
  ) {
    next.hybrid_priority = next.hybrid_priority || "balanced";
    next.equipment_profile = next.equipment_profile || "full_gym";
    next.current_run_frequency = next.current_run_frequency || "2";
    next.goal_focus = next.goal_focus || (next.hybrid_priority === "strength" ? "strength" : "endurance");
    next.current_strength_baseline_weight = next.current_strength_baseline_weight || "185";
    next.current_strength_baseline_reps = next.current_strength_baseline_reps || "5";
  }
  return next;
}

function inferStructuredIntakeAnchorResponses({
  goalType = "",
  templateId = "",
  quickMetrics = {},
  experienceLevel = "Intermediate",
  trainingDays = "3",
  sessionLength = "45 min",
  trainingLocation = "Gym",
  coachingStyle = "",
} = {}) {
  const normalizedGoalType = GOAL_TYPE_ALIASES[goalType] || goalType;
  const templateAlias = TEMPLATE_ID_ALIASES[templateId] || null;
  const normalizedTemplateId = templateAlias?.templateId || templateId;
  const normalizedQuickMetrics = normalizeLegacyQuickMetrics(normalizedTemplateId, {
    ...(templateAlias?.metricDefaults || {}),
    ...(quickMetrics || {}),
  });
  const normalizedExperienceLevel = normalizeExperienceLevelValue(experienceLevel);
  const normalizedTrainingDays = String(trainingDays || "").trim() || "3";
  const normalizedSessionLength = normalizeSessionLengthValue(sessionLength);
  const normalizedTrainingLocation = String(trainingLocation || "").trim();
  const normalizedCoachingStyle = String(coachingStyle || "").trim().toLowerCase();

  const resolveRunPace = () => {
    if (normalizedQuickMetrics.recent_pace_baseline) {
      return String(normalizedQuickMetrics.recent_pace_baseline);
    }
    if (normalizedQuickMetrics.event_distance === "marathon") {
      return normalizedExperienceLevel === "beginner" ? "10:15/mi" : normalizedExperienceLevel === "advanced" ? "7:45/mi" : "8:40/mi";
    }
    if (normalizedQuickMetrics.event_distance === "half_marathon") {
      return normalizedExperienceLevel === "beginner" ? "9:45/mi" : normalizedExperienceLevel === "advanced" ? "7:15/mi" : "8:25/mi";
    }
    if (normalizedQuickMetrics.event_distance === "10k") {
      return normalizedExperienceLevel === "beginner" ? "9:20/mi" : normalizedExperienceLevel === "advanced" ? "6:55/mi" : "8:05/mi";
    }
    return normalizedExperienceLevel === "beginner" ? "9:00/mi" : normalizedExperienceLevel === "advanced" ? "6:35/mi" : "7:50/mi";
  };

  const resolveBodyweight = () => {
    if (normalizedQuickMetrics.current_bodyweight) return Number(normalizedQuickMetrics.current_bodyweight);
    if (normalizedTemplateId === "lose_body_fat") return 228;
    if (normalizedTemplateId === "get_leaner") return 193;
    if (normalizedTemplateId === "recomp") return 198;
    if (normalizedGoalType === "physique") return 193;
    return normalizedExperienceLevel === "beginner" ? 205 : 185;
  };

  const resolveWaist = () => {
    if (normalizedQuickMetrics.current_waist) return Number(normalizedQuickMetrics.current_waist);
    if (normalizedTemplateId === "lose_body_fat") return 42;
    if (normalizedTemplateId === "get_leaner") return 36;
    if (normalizedTemplateId === "recomp") return 37;
    return normalizedExperienceLevel === "beginner" ? 39 : 34;
  };

  const resolveWeightChange = () => {
    if (normalizedQuickMetrics.target_weight_change) {
      const parsed = Number(String(normalizedQuickMetrics.target_weight_change).replace(/[^-\d.]/g, ""));
      if (Number.isFinite(parsed) && parsed !== 0) return Math.abs(parsed);
    }
    if (normalizedTemplateId === "lose_body_fat") return 28;
    if (normalizedTemplateId === "get_leaner") return 12;
    if (normalizedTemplateId === "recomp") return 8;
    return 10;
  };

  const resolveLongRun = () => {
    const value = normalizedQuickMetrics.longest_recent_run_value || "";
    const unit = normalizedQuickMetrics.longest_recent_run_unit || "";
    if (value && unit) return `${value} ${unit}`;
    if (normalizedTemplateId === "return_to_running") return "20 minutes";
    if (normalizedQuickMetrics.event_distance === "marathon") return "12 miles";
    if (normalizedQuickMetrics.event_distance === "half_marathon") return "8 miles";
    if (normalizedQuickMetrics.event_distance === "10k") return "5 miles";
    return normalizedExperienceLevel === "beginner" ? "3 miles" : "4 miles";
  };

  const resolveRunFrequency = () => {
    if (normalizedQuickMetrics.current_run_frequency) return String(normalizedQuickMetrics.current_run_frequency);
    if (normalizedTemplateId === "return_to_running") return "2";
    return /^2$|^3$|^4$|^5$|^6$/.test(normalizedTrainingDays)
      ? normalizedTrainingDays
      : normalizedExperienceLevel === "beginner"
      ? "2"
      : "3";
  };

  const resolveStrengthBaseline = () => {
    const weight = normalizedQuickMetrics.current_strength_baseline_weight
      || (normalizedExperienceLevel === "beginner" ? "135" : normalizedExperienceLevel === "advanced" ? "225" : "185");
    const reps = normalizedQuickMetrics.current_strength_baseline_reps || (normalizedTemplateId === "improve_big_lifts" ? "5" : "5");
    return {
      type: "strength_top_set",
      weight: Number(weight),
      reps: Number(reps),
    };
  };

  const resolveSwimAnchor = () => {
    const distanceValue = normalizedQuickMetrics.recent_swim_distance_value || "1000";
    const distanceUnit = normalizedQuickMetrics.recent_swim_distance_unit || "yd";
    const timeMinutes = normalizedQuickMetrics.recent_swim_time_minutes || "22";
    const timeSeconds = normalizedQuickMetrics.recent_swim_time_seconds || "30";
    return `${distanceValue} ${distanceUnit} in ${timeMinutes}:${String(timeSeconds).padStart(2, "0")}`;
  };

  const resolveSwimAccessReality = () => {
    if (normalizedQuickMetrics.swim_access_reality) return String(normalizedQuickMetrics.swim_access_reality);
    if (normalizedQuickMetrics.goal_focus === "open_water") return "open_water";
    if (normalizedTrainingLocation === "Both") return "pool";
    return "pool";
  };

  const resolveStartingCapacity = () => {
    if (normalizedQuickMetrics.starting_capacity_anchor) {
      return String(normalizedQuickMetrics.starting_capacity_anchor);
    }
    if (normalizedExperienceLevel === "beginner" || normalizedSessionLength === "20" || normalizedCoachingStyle.includes("consistent")) {
      return "10_easy_minutes";
    }
    return "20_to_30_minutes";
  };

  const resolveTimeline = () => {
    if (normalizedQuickMetrics.target_timeline) return String(normalizedQuickMetrics.target_timeline);
    if (normalizedTemplateId === "improve_big_lifts") return "12 weeks";
    if (normalizedTemplateId === "lose_body_fat" || normalizedTemplateId === "get_leaner" || normalizedTemplateId === "recomp") {
      return "late summer";
    }
    return "October";
  };

  const responsesByFieldId = {
    target_timeline: { type: "natural", value: resolveTimeline() },
    current_run_frequency: { type: "natural", value: `${resolveRunFrequency()} runs/week` },
    running_endurance_anchor_kind: {
      type: "choice",
      value: normalizedQuickMetrics.recent_pace_baseline && !normalizedQuickMetrics.longest_recent_run_value
        ? "recent_pace_baseline"
        : "longest_recent_run",
    },
    longest_recent_run: { type: "natural", value: resolveLongRun() },
    recent_pace_baseline: { type: "natural", value: resolveRunPace() },
    current_strength_baseline: resolveStrengthBaseline(),
    target_weight_change: { type: "number", value: resolveWeightChange(), unit: "lb" },
    appearance_proxy_anchor_kind: {
      type: "choice",
      value: normalizedQuickMetrics.appearance_proxy_anchor_kind
        || (normalizedQuickMetrics.current_waist
        ? "current_waist"
        : "current_bodyweight"),
    },
    current_bodyweight: { type: "number", value: resolveBodyweight(), unit: "lb" },
    current_waist: { type: "number", value: resolveWaist(), unit: "in" },
    recent_swim_anchor: { type: "natural", value: resolveSwimAnchor() },
    swim_access_reality: { type: "choice", value: resolveSwimAccessReality() },
    starting_capacity_anchor: { type: "choice", value: resolveStartingCapacity() },
  };

  return responsesByFieldId;
}

async function completeGoalLibraryIntakeStep(page, {
  goalType = "running",
  templateId = "",
  quickMetrics = {},
  stopAtReview = false,
  ...planningOverrides
} = {}) {
  const normalizedGoalType = GOAL_TYPE_ALIASES[goalType] || goalType;
  const templateAlias = TEMPLATE_ID_ALIASES[templateId] || null;
  const normalizedTemplateId = templateAlias?.templateId || templateId;
  const normalizedQuickMetrics = normalizeLegacyQuickMetrics(normalizedTemplateId, {
    ...(templateAlias?.metricDefaults || {}),
    ...(quickMetrics || {}),
  });
  await expect(page.getByTestId("intake-goals-step")).toBeVisible();
  await domClick(page.getByTestId(`intake-goal-type-${normalizedGoalType}`));
  if (normalizedTemplateId) {
    await domClick(page.getByTestId(`intake-featured-goal-${normalizedTemplateId}`));
    await expect(page.getByTestId("intake-goal-selection-draft")).toBeVisible();
    await fillStarterMetricInputs(page, normalizedQuickMetrics);
    await commitPendingGoalSelection(page);
  }
  await fillStarterMetricInputs(page, normalizedQuickMetrics);
  await fillPlanningRealityInputs(page, planningOverrides);
  const continueButton = page.getByTestId("intake-footer-continue");
  await expect(continueButton).toBeEnabled();
  await domClick(continueButton);
  let phaseState = "";
  await expect.poll(async () => {
    const phase = await getCurrentPhase(page);
    if (/clarify|confirm|building/.test(String(phase || ""))) {
      phaseState = phase;
      return phase;
    }
    const onboardingComplete = await page.getByTestId("app-root").getAttribute("data-onboarding-complete").catch(() => "");
    const todayVisible = await page.getByTestId("today-session-card").isVisible().catch(() => false);
    if (onboardingComplete === "true" || todayVisible) {
      phaseState = "completed";
      return "completed";
    }
    phaseState = phase || "pending";
    return phaseState;
  }, { timeout: 20_000 }).toMatch(/clarify|confirm|building|completed/);
  if (stopAtReview) return phaseState;
  let phase = phaseState || await getCurrentPhase(page);
  if (phase === "building") {
    await expect.poll(async () => {
      const onboardingComplete = await page.getByTestId("app-root").getAttribute("data-onboarding-complete").catch(() => "");
      const todayVisible = await page.getByTestId("today-session-card").isVisible().catch(() => false);
      return onboardingComplete === "true" || todayVisible ? "completed" : "building";
    }, { timeout: 30_000 }).toBe("completed");
    phase = "completed";
  }
  if (phase === "clarify") {
    await expect(page.getByTestId("intake-clarify-step")).toBeVisible();
  }
  if (phase === "confirm") {
    await expect(page.getByTestId("intake-confirm-step")).toBeVisible();
  }
  if (phase === "completed") {
    await expect(page.getByTestId("today-session-card")).toBeVisible();
  }
  return phase;
}

async function completeStructuredIntakeOnOneScreen(page, {
  goalType = "running",
  templateId = "",
  quickMetrics = {},
  ...planningOverrides
} = {}) {
  const normalizedGoalType = GOAL_TYPE_ALIASES[goalType] || goalType;
  const templateAlias = TEMPLATE_ID_ALIASES[templateId] || null;
  const normalizedTemplateId = templateAlias?.templateId || templateId;
  const normalizedQuickMetrics = normalizeLegacyQuickMetrics(normalizedTemplateId, {
    ...(templateAlias?.metricDefaults || {}),
    ...(quickMetrics || {}),
  });
  const anchorResponses = inferStructuredIntakeAnchorResponses({
    goalType: normalizedGoalType,
    templateId: normalizedTemplateId,
    quickMetrics: normalizedQuickMetrics,
    ...planningOverrides,
  });

  await expect(page.getByTestId("intake-goals-step")).toBeVisible();
  await domClick(page.getByTestId(`intake-goal-type-${normalizedGoalType}`));
  if (normalizedTemplateId) {
    await domClick(page.getByTestId(`intake-featured-goal-${normalizedTemplateId}`));
    await expect(page.getByTestId("intake-goal-selection-draft")).toBeVisible();
    await fillStarterMetricInputs(page, normalizedQuickMetrics);
    await commitPendingGoalSelection(page);
  }
  await fillStarterMetricInputs(page, normalizedQuickMetrics);
  await fillPlanningRealityInputs(page, planningOverrides);
  const continueButton = page.getByTestId("intake-footer-continue");
  await expect(continueButton).toBeEnabled();
  await domClick(continueButton);
  await expect.poll(async () => {
    const currentPhase = await getCurrentPhase(page);
    if (["clarify", "confirm", "building"].includes(String(currentPhase || ""))) return currentPhase;
    const onboardingComplete = await page.getByTestId("app-root").getAttribute("data-onboarding-complete").catch(() => "");
    const todayVisible = await page.getByTestId("today-session-card").isVisible().catch(() => false);
    return onboardingComplete === "true" || todayVisible ? "completed" : currentPhase || "pending";
  }, {
    timeout: 20_000,
  }).toMatch(/clarify|confirm|building|completed/);
  const resolvedPhase = await getCurrentPhase(page);
  if (resolvedPhase === "clarify") {
    await completeAnchors(page, anchorResponses, { maxSteps: 12 });
  }
  const reviewVisible = await page.getByTestId("intake-confirm-step").isVisible().catch(() => false);
  const buildingVisible = await page.getByTestId("intake-building").isVisible().catch(() => false);
  if (!reviewVisible && !buildingVisible) {
    await waitForReview(page);
  } else if (reviewVisible) {
    await waitForReview(page);
  }
  const confirmButtonVisible = await page.getByTestId("intake-confirm-build").isVisible().catch(() => false);
  const confirmationStatus = confirmButtonVisible ? await getConfirmationStatus(page) : "";
  if (confirmButtonVisible && ["proceed", "warn"].includes(String(confirmationStatus || ""))) {
    await confirmIntakeBuild(page);
  }
  await waitForPostOnboarding(page);
}

const MONTH_NUMBER_BY_NAME = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  sept: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function normalizeNativeTimelineInput(rawValue, inputType = "month") {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  if (inputType === "month" && /^\d{4}-\d{2}$/.test(raw)) return raw;
  if (inputType === "date" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const now = new Date();
  const lower = raw.toLowerCase();
  const explicitYearMatch = lower.match(/\b(20\d{2})\b/);
  const monthNameMatch = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/);
  const dayMatch = lower.match(/\b([0-2]?\d|3[0-1])\b/);
  const inferredYear = explicitYearMatch
    ? explicitYearMatch[1]
    : lower.includes("next year")
    ? String(now.getFullYear() + 1)
    : String(now.getFullYear());
  const inferredMonth = monthNameMatch
    ? MONTH_NUMBER_BY_NAME[monthNameMatch[1]]
    : String(now.getMonth() + 1).padStart(2, "0");

  if (inputType === "date") {
    const inferredDay = dayMatch ? String(dayMatch[1]).padStart(2, "0") : "01";
    return `${inferredYear}-${inferredMonth}-${inferredDay}`;
  }
  return `${inferredYear}-${inferredMonth}`;
}

function normalizeNumericInput(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  const numericMatch = raw.match(/-?\d+(?:\.\d+)?/);
  return numericMatch ? numericMatch[0] : raw;
}

async function answerCurrentAnchor(page, response = {}) {
  const fieldId = await getCurrentFieldId(page);
  if (!fieldId) throw new Error("No active anchor field is visible.");
  return fillAnchorResponse(page, fieldId, response);
}

async function fillAnchorResponse(page, fieldId, response = {}) {
  const fieldFragment = toTestIdFragment(fieldId);

  if (response.type === "choice") {
    await domClick(page.getByTestId(`intake-anchor-choice-${fieldFragment}-${toTestIdFragment(response.value)}`));
  } else if (response.type === "natural") {
    const naturalToggle = page.getByTestId("intake-anchor-toggle-natural");
    const naturalInput = page.getByTestId("intake-anchor-natural-input");
    if (await naturalToggle.isVisible({ timeout: 1500 }).catch(() => false)) {
      await domClick(naturalToggle);
      await expect(naturalInput).toBeVisible();
      await domFill(naturalInput, response.value);
    } else {
      const structuredInput = page.getByTestId(`intake-anchor-input-${fieldFragment}`);
      await expect(structuredInput).toBeVisible();
      const nativeInputType = await structuredInput.evaluate((node) => (node && node.type) || "");
      if (nativeInputType === "month" || nativeInputType === "date") {
        await domFill(structuredInput, normalizeNativeTimelineInput(response.value, nativeInputType));
      } else if (nativeInputType === "number") {
        await domFill(structuredInput, normalizeNumericInput(response.value));
      } else {
        await domFill(structuredInput, String(response.value));
      }
    }
  } else if (response.type === "number") {
    const structuredToggle = page.getByTestId("intake-anchor-toggle-structured");
    if (await structuredToggle.isVisible({ timeout: 1500 }).catch(() => false)) {
      await domClick(structuredToggle);
    }
    await domFill(page.getByTestId(`intake-anchor-input-${fieldFragment}`), String(response.value));
    if (response.unit) {
      const unitButton = page.getByTestId(`intake-anchor-unit-${fieldFragment}-${toTestIdFragment(response.unit)}`);
      if (await unitButton.count()) {
        await domClick(unitButton);
      }
    }
  } else if (response.type === "text") {
    await domFill(page.getByTestId(`intake-anchor-input-${fieldFragment}`), String(response.value));
  } else if (response.type === "date_or_month") {
    const structuredToggle = page.getByTestId("intake-anchor-toggle-structured");
    if (await structuredToggle.isVisible({ timeout: 1500 }).catch(() => false)) {
      await domClick(structuredToggle);
    }
    const input = page.getByTestId(`intake-anchor-input-${fieldFragment}`);
    await domFill(input, String(response.value));
  } else if (response.type === "strength_top_set") {
    const structuredToggle = page.getByTestId("intake-anchor-toggle-structured");
    if (await structuredToggle.isVisible({ timeout: 1500 }).catch(() => false)) {
      await domClick(structuredToggle);
    }
    if (response.mode === "estimated_max") {
      await domClick(page.getByTestId(`intake-anchor-mode-${fieldFragment}-estimated-max`));
    }
    await domFill(page.getByTestId(`intake-anchor-input-${fieldFragment}-weight`), String(response.weight));
    if (response.mode !== "estimated_max") {
      await domFill(page.getByTestId(`intake-anchor-input-${fieldFragment}-reps`), String(response.reps));
    }
  } else {
    throw new Error(`Unsupported anchor response type for ${fieldId}: ${response.type || "unknown"}`);
  }
}

async function getVisibleAnchorFieldIds(page) {
  return page.locator('[data-testid="intake-anchor-card"], [data-testid="intake-anchor-card-active"]').evaluateAll((nodes) => (
    nodes
      .map((node) => node.getAttribute("data-field-id") || "")
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
}

async function getReviewRefreshPending(page) {
  return page.getByTestId("intake-root").getAttribute("data-review-refresh-pending").catch(() => "");
}

async function completeAnchors(page, responsesByFieldId = {}, options = {}) {
  const visited = [];
  const maxSteps = Number(options.maxSteps || 12);
  for (let step = 0; step < maxSteps; step += 1) {
    const phase = await getCurrentPhase(page);
    if (phase !== "clarify") return visited;
    const visibleFieldIds = await getVisibleAnchorFieldIds(page);
    if (!visibleFieldIds.length) {
      const reviewRefreshPending = await getReviewRefreshPending(page);
      if (reviewRefreshPending === "true") {
        await expect.poll(async () => await getReviewRefreshPending(page), {
          timeout: 12_000,
        }).toBe("false");
        continue;
      }
      const reviewVisible = await page.getByTestId("intake-confirm-step").isVisible().catch(() => false);
      if (reviewVisible) return visited;
      await expect.poll(async () => {
        const nextVisibleFieldIds = await getVisibleAnchorFieldIds(page);
        if (nextVisibleFieldIds.length > 0) return `anchors:${nextVisibleFieldIds.join(",")}`;
        const nextReviewRefreshPending = await getReviewRefreshPending(page);
        if (nextReviewRefreshPending === "true") return "refreshing";
        const nextReviewVisible = await page.getByTestId("intake-confirm-step").isVisible().catch(() => false);
        return nextReviewVisible ? "review" : "pending";
      }, {
        timeout: 12_000,
      }).not.toBe("pending");
      continue;
    }
    const before = JSON.stringify({
      phase,
      fieldIds: visibleFieldIds,
      reviewRefreshPending: await getReviewRefreshPending(page),
      confirmationStatus: await getConfirmationStatus(page),
    });
    for (const fieldId of visibleFieldIds) {
      const response = responsesByFieldId[fieldId];
      if (!response) {
        throw new Error(`Missing E2E response for anchor field: ${fieldId}`);
      }
      if (!visited.includes(fieldId)) visited.push(fieldId);
      await fillAnchorResponse(page, fieldId, typeof response === "function" ? await response(page, fieldId) : response);
    }
    await domClick(page.getByTestId("intake-footer-continue"));
    await expect.poll(async () => JSON.stringify({
      phase: await getCurrentPhase(page),
      fieldIds: await getVisibleAnchorFieldIds(page),
      reviewRefreshPending: await getReviewRefreshPending(page),
      confirmationStatus: await getConfirmationStatus(page),
    }), {
      timeout: 12_000,
    }).not.toBe(before);
  }
  throw new Error("Anchor completion exceeded the configured maxSteps.");
}

async function waitForReview(page) {
  await expect.poll(async () => {
    const visibleAnchors = await getVisibleAnchorFieldIds(page);
    if (visibleAnchors.length > 0) return `anchors:${visibleAnchors.join(",")}`;
    const reviewRefreshPending = await getReviewRefreshPending(page);
    if (reviewRefreshPending === "true") return "refreshing";
    const reviewVisible = await page.getByTestId("intake-confirm-step").isVisible().catch(() => false);
    const confirmationStatus = await getConfirmationStatus(page);
    if (!reviewVisible) return "pending";
    if (confirmationStatus === "block" || confirmationStatus === "incomplete") {
      const guidedRecoveryVisible = await page.getByTestId("intake-go-next-detail").isVisible().catch(() => false);
      const confirmationMessageVisible = await page.getByTestId("intake-confirmation-message").isVisible().catch(() => false);
      return guidedRecoveryVisible || confirmationMessageVisible ? `review:${confirmationStatus}` : "pending";
    }
    const buildButtonVisible = await page.getByTestId("intake-confirm-build").isVisible().catch(() => false);
    const buildButtonEnabled = buildButtonVisible
      ? await page.getByTestId("intake-confirm-build").isEnabled().catch(() => false)
      : false;
    return buildButtonVisible && buildButtonEnabled ? `review:${confirmationStatus}` : "pending";
  }, { timeout: 20_000 }).toMatch(/^review:/);
  await expect(page.getByTestId("intake-confirm-step")).toBeVisible();
  await expect(page.getByTestId("intake-review")).toBeVisible();
}

async function waitForPostOnboarding(page) {
  await expect.poll(async () => {
    const appEvents = await getAppEvents(page);
    const commitEvents = appEvents.filter((entry) => entry?.type === "trainer:intake-commit");
    const latestCommitEvent = commitEvents.length ? commitEvents[commitEvents.length - 1] : null;
    const commitPhase = latestCommitEvent?.detail?.phase || "";
    if (commitPhase === "failure") {
      return `failure:${latestCommitEvent?.detail?.message || "unknown"}`;
    }
    const onboardingComplete = await page.getByTestId("app-root").getAttribute("data-onboarding-complete").catch(() => "");
    if (onboardingComplete === "true") return "success";
    const todayVisible = await page.getByTestId("today-session-card").isVisible().catch(() => false);
    if (todayVisible) return "success";
    if (commitPhase === "success") return "success";
    if (commitPhase === "start") return "building";
    return "pending";
  }, {
    timeout: 75_000,
    message: "Expected onboarding to finish after confirming the intake stack.",
  }).toBe("success");
  const todayCard = page.getByTestId("today-session-card");
  if (await todayCard.isVisible().catch(() => false)) return;
  await expect(page.getByTestId("app-tab-today")).toBeVisible();
  await domClick(page.getByTestId("app-tab-today"));
  await expect(page.getByTestId("today-session-card")).toBeVisible();
}

async function dismissAppleHealthPromptIfVisible(page) {
  await page.getByRole("button", { name: "Skip for now" }).click({ force: true, timeout: 1_000 }).catch(() => {});
}

async function confirmIntakeBuild(page, { rapidRepeat = false } = {}) {
  const confirmationStatus = await getConfirmationStatus(page);
  if (confirmationStatus === "block" || confirmationStatus === "incomplete") {
    const message = await page.getByTestId("intake-confirmation-message").textContent().catch(() => "");
    throw new Error(`Cannot confirm intake from ${confirmationStatus}: ${String(message || "").trim()}`);
  }
  const confirmButton = page.getByTestId("intake-confirm-build");
  await expect(confirmButton).toBeEnabled();
  if (rapidRepeat) {
    await domDblClick(confirmButton);
    return;
  }
  await domClick(confirmButton);
}

async function getStorageOps(page) {
  return page.evaluate(() => Array.isArray(window.__E2E_STORAGE_OPS) ? window.__E2E_STORAGE_OPS : []).catch(() => []);
}

async function getAppEvents(page) {
  return page.evaluate(() => Array.isArray(window.__E2E_APP_EVENTS) ? window.__E2E_APP_EVENTS : []).catch(() => []);
}

async function readLocalCache(page) {
  return page.evaluate((key) => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, LOCAL_CACHE_KEY).catch(() => null);
}

async function readIntakeSession(page) {
  return page.evaluate((key) => {
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, INTAKE_SESSION_STORAGE_KEY).catch(() => null);
}

module.exports = {
  INTAKE_SESSION_STORAGE_KEY,
  LOCAL_CACHE_KEY,
  answerCurrentAnchor,
  commitPendingGoalSelection,
  confirmIntakeBuild,
  completeAnchors,
  completeGoalLibraryIntakeStep,
  completeIntroQuestionnaire,
  completeStructuredIntakeOnOneScreen,
  dismissAppleHealthPromptIfVisible,
  domClick,
  domDblClick,
  domFill,
  enterLocalIntakeIfNeeded,
  fillPlanningRealityInputs,
  fillStarterMetricInputs,
  getAppEvents,
  getConfirmationStatus,
  getCurrentFieldId,
  getCurrentPhase,
  getCurrentQuestionKey,
  getCurrentStage,
  getStorageOps,
  gotoIntakeInLocalMode,
  installIntakeAiMocks,
  readIntakeSession,
  readLocalCache,
  toTestIdFragment,
  waitForPostOnboarding,
  waitForReview,
};
