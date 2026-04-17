const { expect } = require("@playwright/test");

const LOCAL_CACHE_KEY = "trainer_local_cache_v4";
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
    await page.getByTestId("continue-local-mode").click();
    await expect.poll(async () => {
      const intakeVisible = await page.getByTestId("intake-root").isVisible().catch(() => false);
      return intakeVisible ? "intake" : "";
    }, { timeout: 12_000 }).toBe("intake");
  }
  await expect(page.getByTestId("profile-setup-gate")).toHaveCount(0);
  await expect(page.getByTestId("intake-root")).toBeVisible();
  await waitForIntakeSurface();
}

async function gotoIntakeInLocalMode(page, handlers = {}) {
  await installStorageInstrumentation(page);
  await installIntakeAiMocks(page, handlers);
  await page.addInitScript((localCacheKey) => {
    try {
      if (!window.localStorage.getItem(localCacheKey)) {
        window.localStorage.setItem(localCacheKey, JSON.stringify({
          goals: [],
          personalization: null,
        }));
      }
    } catch {}
  }, LOCAL_CACHE_KEY);
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
        await page.getByTestId("intake-goal-type-custom").click();
      } else {
        await page.getByTestId("intake-goals-toggle-custom").click();
      }
      await expect(page.getByTestId("intake-goals-primary-input")).toBeVisible();
    }
    await page.getByTestId("intake-goals-primary-input").fill(goalText);
  } else {
    await page.getByTestId("intake-footer-foundation").click();
    return;
  }

  for (const goal of additionalGoals) {
    await page.getByTestId("intake-goals-secondary-input").fill(String(goal));
    const addGoalButton = page.getByTestId("intake-goals-add");
    await expect(addGoalButton).toBeEnabled();
    await addGoalButton.click();
    await expect(page.getByTestId("intake-goals-secondary-input")).toHaveValue("");
  }

  await page.getByTestId(`intake-goals-option-experience-level-${toTestIdFragment(experienceLevelValue)}`).click();
  await page.getByTestId(`intake-goals-option-training-days-${toTestIdFragment(trainingDays)}`).click();
  await page.getByTestId(`intake-goals-option-session-length-${toTestIdFragment(sessionLengthValue)}`).click();
  await page.getByTestId(`intake-goals-option-training-location-${toTestIdFragment(trainingLocation)}`).click();

  if (trainingLocation === "Home" || trainingLocation === "Both") {
    for (const option of homeEquipment) {
      await page.getByTestId(`intake-goals-option-home-equipment-${toTestIdFragment(option)}`).click();
    }
    if (homeEquipment.includes("Other") && homeEquipmentOther) {
      await page.getByTestId("intake-goals-input-home-equipment-other").fill(homeEquipmentOther);
    }
  }

  if (String(injuryText || "").trim()) {
    await page.getByTestId("intake-goals-input-injury-text").fill(injuryText);
  }
  if (injuryImpact) {
    await page.getByTestId(`intake-goals-option-injury-impact-${toTestIdFragment(injuryImpact)}`).click();
  }

  const coachingChip = page.getByTestId(`intake-goals-option-coaching-style-${toTestIdFragment(coachingStyle)}`);
  if (await coachingChip.count()) {
    await coachingChip.click();
  }
  await page.getByTestId("intake-footer-continue").click();
  await expect.poll(async () => await getCurrentPhase(page), { timeout: 20_000 }).toMatch(/clarify|confirm/);
  if (stopAtInterpretation) return;
  const phase = await getCurrentPhase(page);
  if (phase === "clarify") {
    await expect(page.getByTestId("intake-clarify-step")).toBeVisible();
  }
  if (phase === "confirm") {
    await expect(page.getByTestId("intake-confirm-step")).toBeVisible();
  }
}

async function fillPlanningRealityInputs(page, {
  experienceLevel = "Intermediate",
  trainingDays = "3",
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
  await page.getByTestId(`intake-goals-option-experience-level-${toTestIdFragment(experienceLevelValue)}`).click();
  await page.getByTestId(`intake-goals-option-training-days-${toTestIdFragment(trainingDays)}`).click();
  await page.getByTestId(`intake-goals-option-session-length-${toTestIdFragment(sessionLengthValue)}`).click();
  await page.getByTestId(`intake-goals-option-training-location-${toTestIdFragment(trainingLocation)}`).click();

  if (trainingLocation === "Home" || trainingLocation === "Both") {
    for (const option of homeEquipment) {
      await page.getByTestId(`intake-goals-option-home-equipment-${toTestIdFragment(option)}`).click();
    }
    if (homeEquipment.includes("Other") && homeEquipmentOther) {
      await page.getByTestId("intake-goals-input-home-equipment-other").fill(homeEquipmentOther);
    }
  }

  if (String(injuryText || "").trim()) {
    await page.getByTestId("intake-goals-input-injury-text").fill(injuryText);
  }
  if (injuryImpact) {
    await page.getByTestId(`intake-goals-option-injury-impact-${toTestIdFragment(injuryImpact)}`).click();
  }
  if (coachingStyle) {
    const coachingChip = page.getByTestId(`intake-goals-option-coaching-style-${toTestIdFragment(coachingStyle)}`);
    if (await coachingChip.count()) await coachingChip.click();
  }
}

async function fillStarterMetricInputs(page, quickMetrics = {}) {
  for (const [fieldKey, rawValue] of Object.entries(quickMetrics || {})) {
    if (rawValue == null || rawValue === "") continue;
    const choiceValue = typeof rawValue === "object" && rawValue !== null ? rawValue.value : rawValue;
    const choiceTarget = page.getByTestId(`intake-goal-metric-${fieldKey}-${toTestIdFragment(choiceValue)}`);
    if (await choiceTarget.count()) {
      await choiceTarget.click();
      continue;
    }
    const inputTarget = page.getByTestId(`intake-goal-metric-${toTestIdFragment(fieldKey)}`);
    if (await inputTarget.count()) {
      await inputTarget.fill(String(choiceValue));
    }
  }
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
  bench_225: { templateId: "improve_big_lifts", metricDefaults: { lift_focus: "bench" } },
  open_water_swim: { templateId: "swim_better", metricDefaults: { goal_focus: "open_water" } },
  swim_faster_mile: { templateId: "swim_better", metricDefaults: { goal_focus: "endurance" } },
  lose_10_lb: { templateId: "lose_body_fat" },
  lose_20_lb: { templateId: "lose_body_fat" },
  tone_up: { templateId: "get_leaner" },
  look_athletic_again: { templateId: "get_leaner" },
});

function normalizeLegacyQuickMetrics(templateId, quickMetrics = {}) {
  const next = { ...(quickMetrics || {}) };
  if (!next.current_strength_baseline && next.current_strength_baseline_weight) {
    const reps = next.current_strength_baseline_reps ? ` x ${next.current_strength_baseline_reps}` : "";
    next.current_strength_baseline = `${next.current_strength_baseline_weight}${reps}`;
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
    next.goal_focus = next.goal_focus || "consistency";
  }
  return next;
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
  await page.getByTestId(`intake-goal-type-${normalizedGoalType}`).click();
  if (normalizedTemplateId) {
    await page.getByTestId(`intake-featured-goal-${normalizedTemplateId}`).click();
  }
  await fillStarterMetricInputs(page, normalizedQuickMetrics);
  await fillPlanningRealityInputs(page, planningOverrides);
  await page.getByTestId("intake-footer-continue").click();
  await expect.poll(async () => await getCurrentPhase(page), { timeout: 20_000 }).toMatch(/clarify|confirm/);
  if (stopAtReview) return;
  const phase = await getCurrentPhase(page);
  if (phase === "clarify") {
    await expect(page.getByTestId("intake-clarify-step")).toBeVisible();
  }
  if (phase === "confirm") {
    await expect(page.getByTestId("intake-confirm-step")).toBeVisible();
  }
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
    await page.getByTestId(`intake-anchor-choice-${fieldFragment}-${toTestIdFragment(response.value)}`).click();
  } else if (response.type === "natural") {
    const naturalToggle = page.getByTestId("intake-anchor-toggle-natural");
    const naturalInput = page.getByTestId("intake-anchor-natural-input");
    if (await naturalToggle.isVisible({ timeout: 1500 }).catch(() => false)) {
      await naturalToggle.click();
      await expect(naturalInput).toBeVisible();
      await naturalInput.fill(response.value);
    } else {
      const structuredInput = page.getByTestId(`intake-anchor-input-${fieldFragment}`);
      await expect(structuredInput).toBeVisible();
      const nativeInputType = await structuredInput.evaluate((node) => node?.type || "");
      if (nativeInputType === "month" || nativeInputType === "date") {
        await structuredInput.fill(normalizeNativeTimelineInput(response.value, nativeInputType));
      } else if (nativeInputType === "number") {
        await structuredInput.fill(normalizeNumericInput(response.value));
      } else {
        await structuredInput.fill(String(response.value));
      }
    }
  } else if (response.type === "number") {
    const structuredToggle = page.getByTestId("intake-anchor-toggle-structured");
    if (await structuredToggle.isVisible({ timeout: 1500 }).catch(() => false)) {
      await structuredToggle.click();
    }
    await page.getByTestId(`intake-anchor-input-${fieldFragment}`).fill(String(response.value));
    if (response.unit) {
      const unitButton = page.getByTestId(`intake-anchor-unit-${fieldFragment}-${toTestIdFragment(response.unit)}`);
      if (await unitButton.count()) {
        await unitButton.click();
      }
    }
  } else if (response.type === "text") {
    await page.getByTestId(`intake-anchor-input-${fieldFragment}`).fill(String(response.value));
  } else if (response.type === "date_or_month") {
    const structuredToggle = page.getByTestId("intake-anchor-toggle-structured");
    if (await structuredToggle.isVisible({ timeout: 1500 }).catch(() => false)) {
      await structuredToggle.click();
    }
    const input = page.getByTestId(`intake-anchor-input-${fieldFragment}`);
    await input.fill(String(response.value));
  } else if (response.type === "strength_top_set") {
    const structuredToggle = page.getByTestId("intake-anchor-toggle-structured");
    if (await structuredToggle.isVisible({ timeout: 1500 }).catch(() => false)) {
      await structuredToggle.click();
    }
    if (response.mode === "estimated_max") {
      await page.getByTestId(`intake-anchor-mode-${fieldFragment}-estimated-max`).click();
    }
    await page.getByTestId(`intake-anchor-input-${fieldFragment}-weight`).fill(String(response.weight));
    if (response.mode !== "estimated_max") {
      await page.getByTestId(`intake-anchor-input-${fieldFragment}-reps`).fill(String(response.reps));
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
    await page.getByTestId("intake-footer-continue").click();
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
  await expect(page.getByTestId("app-tab-today")).toBeVisible();
  await page.getByTestId("app-tab-today").click();
  await expect(page.getByTestId("today-session-card")).toBeVisible();
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
    await confirmButton.dblclick();
    return;
  }
  await confirmButton.click();
}

async function getStorageOps(page) {
  return page.evaluate(() => Array.isArray(window.__E2E_STORAGE_OPS) ? window.__E2E_STORAGE_OPS : []);
}

async function getAppEvents(page) {
  return page.evaluate(() => Array.isArray(window.__E2E_APP_EVENTS) ? window.__E2E_APP_EVENTS : []);
}

async function readLocalCache(page) {
  return page.evaluate((key) => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, LOCAL_CACHE_KEY);
}

async function readIntakeSession(page) {
  return page.evaluate((key) => {
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, INTAKE_SESSION_STORAGE_KEY);
}

module.exports = {
  INTAKE_SESSION_STORAGE_KEY,
  LOCAL_CACHE_KEY,
  answerCurrentAnchor,
  confirmIntakeBuild,
  completeAnchors,
  completeGoalLibraryIntakeStep,
  completeIntroQuestionnaire,
  enterLocalIntakeIfNeeded,
  getAppEvents,
  getConfirmationStatus,
  getCurrentFieldId,
  getCurrentPhase,
  getCurrentQuestionKey,
  getCurrentStage,
  getStorageOps,
  gotoIntakeInLocalMode,
  readIntakeSession,
  readLocalCache,
  toTestIdFragment,
  waitForPostOnboarding,
  waitForReview,
};
