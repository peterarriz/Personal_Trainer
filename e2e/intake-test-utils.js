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
    window.addEventListener("trainer:intake-commit", (event) => {
      try {
        window.__E2E_APP_EVENTS.push({
          type: "trainer:intake-commit",
          detail: event?.detail || null,
        });
      } catch {}
    });
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
        page.getByTestId("intake-question-step").isVisible().catch(() => false),
        page.getByTestId("intake-structured-step").isVisible().catch(() => false),
        page.getByTestId("intake-secondary-goal-step").isVisible().catch(() => false),
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
  }
  await expect(page.getByTestId("intake-root")).toBeVisible();
  await waitForIntakeSurface();
}

async function gotoIntakeInLocalMode(page, handlers = {}) {
  await installStorageInstrumentation(page);
  await installIntakeAiMocks(page, handlers);
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
  experienceLevel = "Intermediate",
  trainingDays = "3",
  sessionLength = "45 min",
  trainingLocation = "Gym",
  homeEquipment = [],
  homeEquipmentOther = "",
  injuryText = "",
  injuryImpact = "",
  skipInjury = true,
  coachingStyle = "Balanced coaching",
} = {}) {
  await expect(page.getByTestId("intake-question-input-goal-intent")).toBeVisible();
  await page.getByTestId("intake-question-input-goal-intent").fill(goalText);
  await page.getByTestId("intake-question-send").click();
  await page.getByTestId(`intake-question-option-experience-level-${toTestIdFragment(experienceLevel)}`).click();
  await page.getByTestId(`intake-question-option-training-days-${toTestIdFragment(trainingDays)}`).click();
  await page.getByTestId(`intake-question-option-session-length-${toTestIdFragment(sessionLength)}`).click();
  await page.getByTestId(`intake-question-option-training-location-${toTestIdFragment(trainingLocation)}`).click();

  if (trainingLocation === "Home" || trainingLocation === "Both") {
    for (const option of homeEquipment) {
      await page.getByTestId(`intake-question-option-home-equipment-${toTestIdFragment(option)}`).click();
    }
    if (homeEquipment.includes("Other") && homeEquipmentOther) {
      await page.getByTestId("intake-question-input-home-equipment-other").fill(homeEquipmentOther);
    }
    await page.getByTestId("intake-question-continue").click();
  }

  if (skipInjury) {
    await page.getByTestId("intake-question-skip").click();
  } else {
    await page.getByTestId("intake-question-input-injury-text").fill(injuryText);
    await page.getByTestId("intake-question-send").click();
    if (injuryImpact) {
      await page.getByTestId(`intake-question-option-injury-impact-${toTestIdFragment(injuryImpact)}`).click();
    }
  }

  await page.getByTestId(`intake-question-option-coaching-style-${toTestIdFragment(coachingStyle)}`).click();
  await expect(page.getByTestId("intake-structured-step")).toBeVisible({ timeout: 20_000 });
}

async function answerCurrentAnchor(page, response = {}) {
  const fieldId = await getCurrentFieldId(page);
  if (!fieldId) throw new Error("No active anchor field is visible.");
  const fieldFragment = toTestIdFragment(fieldId);

  if (response.type === "choice") {
    await page.getByTestId(`intake-anchor-choice-${fieldFragment}-${toTestIdFragment(response.value)}`).click();
  } else if (response.type === "natural") {
    await page.getByTestId("intake-anchor-natural-input").fill(response.value);
  } else if (response.type === "number") {
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
    const input = page.getByTestId(`intake-anchor-input-${fieldFragment}`);
    await input.fill(String(response.value));
  } else if (response.type === "strength_top_set") {
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

  await page.getByTestId("intake-save-detail").click();
}

async function completeAnchors(page, responsesByFieldId = {}, options = {}) {
  const visited = [];
  const maxSteps = Number(options.maxSteps || 12);
  for (let step = 0; step < maxSteps; step += 1) {
    const phase = await getCurrentPhase(page);
    if (phase !== "clarify") return visited;
    const fieldId = await getCurrentFieldId(page);
    if (!fieldId) return visited;
    const response = responsesByFieldId[fieldId];
    if (!response) {
      throw new Error(`Missing E2E response for anchor field: ${fieldId}`);
    }
    const before = JSON.stringify({
      phase,
      fieldId,
      messages: await page.locator("[data-testid='intake-message']").count(),
    });
    visited.push(fieldId);
    await answerCurrentAnchor(page, typeof response === "function" ? await response(page, fieldId) : response);
    await expect.poll(async () => JSON.stringify({
      phase: await getCurrentPhase(page),
      fieldId: await getCurrentFieldId(page),
      messages: await page.locator("[data-testid='intake-message']").count(),
    }), {
      timeout: 12_000,
    }).not.toBe(before);
  }
  throw new Error("Anchor completion exceeded the configured maxSteps.");
}

async function waitForReview(page) {
  const keepGoalButton = page.getByTestId("intake-keep-goal");
  const continueSecondaryGoalButton = page.getByTestId("intake-secondary-continue");
  await expect.poll(async () => {
    const phase = await getCurrentPhase(page);
    if (phase === "clarify" && await keepGoalButton.count() && await keepGoalButton.isVisible()) {
      await keepGoalButton.click();
      return "transitioning";
    }
    if (phase === "secondary_goal" && await continueSecondaryGoalButton.count() && await continueSecondaryGoalButton.isVisible()) {
      await continueSecondaryGoalButton.click();
      return "transitioning";
    }
    return phase;
  }, { timeout: 20_000 }).toBe("review");
  await expect(page.getByTestId("intake-review")).toBeVisible();
}

async function waitForPostOnboarding(page) {
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true", { timeout: 20_000 });
  await expect(page.getByTestId("app-tab-today")).toBeVisible();
  await page.getByTestId("app-tab-today").click();
  await expect(page.getByTestId("today-session-card")).toBeVisible();
}

async function confirmIntakeBuild(page, { rapidRepeat = false } = {}) {
  const confirmationStatus = await getConfirmationStatus(page);
  if (confirmationStatus === "warn" && await page.getByTestId("intake-warning-ack-checkbox").count()) {
    await page.getByTestId("intake-warning-ack-checkbox").check();
  }
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

async function getTranscriptEntries(page) {
  return page.locator("[data-testid='intake-message']").evaluateAll((nodes) => nodes.map((node) => ({
    key: node.getAttribute("data-message-key") || "",
    role: node.getAttribute("data-message-role") || "",
    text: node.textContent || "",
  })));
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
  completeIntroQuestionnaire,
  enterLocalIntakeIfNeeded,
  getAppEvents,
  getConfirmationStatus,
  getCurrentFieldId,
  getCurrentPhase,
  getCurrentQuestionKey,
  getCurrentStage,
  getStorageOps,
  getTranscriptEntries,
  gotoIntakeInLocalMode,
  readIntakeSession,
  readLocalCache,
  toTestIdFragment,
  waitForPostOnboarding,
  waitForReview,
};
