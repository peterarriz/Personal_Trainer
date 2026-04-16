export const FRICTION_ANALYTICS_SCHEMA_VERSION = "2026-04-v1";
export const FRICTION_ANALYTICS_STORAGE_KEY = "trainer_friction_analytics_v1";
export const FRICTION_ANALYTICS_EVENT_NAME = "trainer:analytics";
export const FRICTION_ANALYTICS_MAX_EVENTS = 300;

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SENSITIVE_PROP_PATTERN = /(^|_)(text|note|message|prompt|content|input|utterance|raw|body|description|display|question|answer)s?$/i;

const safeNow = () => Date.now();

const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toSafeKey = (value = "", fallback = "unknown") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
};

const sanitizeStringValue = (value = "") => String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);

const sanitizePropValue = (value, key = "") => {
  if (value === null || value === undefined) return value;
  if (SENSITIVE_PROP_PATTERN.test(String(key || ""))) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePropValue(item, key))
      .filter((item) => item !== undefined)
      .slice(0, 12);
  }
  if (typeof value === "object") {
    return sanitizeAnalyticsProps(value);
  }
  if (typeof value === "string") return sanitizeStringValue(value);
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(2)) : undefined;
  if (typeof value === "boolean") return value;
  return undefined;
};

export const sanitizeAnalyticsProps = (props = {}) => Object.entries(props || {}).reduce((acc, [key, value]) => {
  if (SENSITIVE_PROP_PATTERN.test(String(key || ""))) return acc;
  const sanitizedValue = sanitizePropValue(value, key);
  if (sanitizedValue === undefined) return acc;
  acc[toSafeKey(key, "field")] = sanitizedValue;
  return acc;
}, {});

export const buildAnalyticsEvent = ({
  flow = "app",
  action = "interaction",
  outcome = "observed",
  props = {},
  ts = safeNow(),
  schemaVersion = FRICTION_ANALYTICS_SCHEMA_VERSION,
} = {}) => {
  const safeFlow = toSafeKey(flow, "app");
  const safeAction = toSafeKey(action, "interaction");
  const safeOutcome = toSafeKey(outcome, "observed");
  const safeTs = normalizeNumber(ts, safeNow());
  return {
    id: `${safeFlow}_${safeAction}_${safeOutcome}_${safeTs}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion,
    flow: safeFlow,
    action: safeAction,
    outcome: safeOutcome,
    name: `${safeFlow}.${safeAction}.${safeOutcome}`,
    ts: safeTs,
    props: sanitizeAnalyticsProps(props),
  };
};

const makeMemoryStorage = () => {
  let raw = "[]";
  return {
    getItem(key) {
      return key === FRICTION_ANALYTICS_STORAGE_KEY ? raw : null;
    },
    setItem(key, value) {
      if (key === FRICTION_ANALYTICS_STORAGE_KEY) raw = String(value || "[]");
    },
    removeItem(key) {
      if (key === FRICTION_ANALYTICS_STORAGE_KEY) raw = "[]";
    },
  };
};

const resolveStorage = (storageLike = null) => {
  if (storageLike?.getItem && storageLike?.setItem) return storageLike;
  if (typeof window !== "undefined" && window?.localStorage?.getItem) return window.localStorage;
  return makeMemoryStorage();
};

const readStoredEvents = ({ storage, storageKey = FRICTION_ANALYTICS_STORAGE_KEY } = {}) => {
  try {
    const raw = storage?.getItem?.(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStoredEvents = ({ storage, events = [], storageKey = FRICTION_ANALYTICS_STORAGE_KEY } = {}) => {
  try {
    storage?.setItem?.(storageKey, JSON.stringify(events));
  } catch {}
};

const countEvents = (events = [], matcher = () => true) => events.filter(matcher).length;

const averageDuration = (events = [], matcher = () => true) => {
  const durations = events
    .filter(matcher)
    .map((event) => normalizeNumber(event?.props?.duration_ms, null))
    .filter((value) => value !== null && value >= 0);
  if (!durations.length) return 0;
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
};

const withinWindow = (event = null, now = safeNow(), windowMs = DEFAULT_WINDOW_MS) => (
  normalizeNumber(event?.ts, 0) >= (now - windowMs)
);

const buildSummaryValueLine = (headline = "", detail = "") => ({
  headline: String(headline || "").trim() || "0",
  detail: String(detail || "").trim(),
});

export const summarizeAnalyticsEvents = ({
  events = [],
  now = safeNow(),
  windowMs = DEFAULT_WINDOW_MS,
} = {}) => {
  const filteredEvents = (events || []).filter((event) => withinWindow(event, now, windowMs));
  const match = (flow, action, outcome) => (event) => (
    (!flow || event?.flow === flow)
    && (!action || event?.action === action)
    && (!outcome || event?.outcome === outcome)
  );

  const auth = {
    signInRequested: countEvents(filteredEvents, match("auth", "sign_in", "requested")),
    signInFailures: countEvents(filteredEvents, match("auth", "sign_in", "error")),
    signUpRequested: countEvents(filteredEvents, match("auth", "sign_up", "requested")),
    signUpConfirmationNeeded: countEvents(filteredEvents, match("auth", "sign_up", "confirmation_required")),
    signOutCount: countEvents(filteredEvents, match("auth", "sign_out", "success")),
    avgSignOutMs: averageDuration(filteredEvents, match("auth", "sign_out", "success")),
    localContinueCount: countEvents(filteredEvents, match("auth", "continue_local_mode", "selected")),
    deleteBlockedCount: countEvents(filteredEvents, match("auth", "delete_account", "blocked")),
  };

  const intake = {
    stageViews: countEvents(filteredEvents, match("intake", "stage_view", "viewed")),
    continues: countEvents(filteredEvents, match("intake", "continue", "requested")),
    repeatedContinues: countEvents(filteredEvents, (event) => (
      event?.flow === "intake"
      && event?.action === "continue"
      && normalizeNumber(event?.props?.attempt_in_stage, 1) > 1
    )),
    stageAbandons: countEvents(filteredEvents, match("intake", "stage_exit", "abandoned")),
    stageRestores: countEvents(filteredEvents, match("intake", "session_restore", "restored")),
    completions: countEvents(filteredEvents, match("intake", "plan_build", "completed")),
    blockedContinues: countEvents(filteredEvents, match("intake", "continue", "blocked")),
  };

  const goals = {
    previewCount: countEvents(filteredEvents, (event) => event?.flow === "goals" && /preview/.test(String(event?.action || ""))),
    applyCount: countEvents(filteredEvents, (event) => event?.flow === "goals" && /apply/.test(String(event?.action || "")) && event?.outcome === "success"),
    archiveMoves: countEvents(filteredEvents, (event) => event?.flow === "goals" && event?.props?.change_type === "archive" && event?.outcome === "success"),
    restoreMoves: countEvents(filteredEvents, (event) => event?.flow === "goals" && event?.props?.change_type === "restore" && event?.outcome === "success"),
  };

  const logging = {
    workoutSaves: countEvents(filteredEvents, match("logging", "workout_log", "success")),
    workoutErrors: countEvents(filteredEvents, match("logging", "workout_log", "error")),
    dailyCheckins: countEvents(filteredEvents, match("logging", "daily_checkin", "success")),
    weeklyCheckins: countEvents(filteredEvents, match("logging", "weekly_checkin", "success")),
    nutritionSaves: countEvents(filteredEvents, match("logging", "nutrition_log", "success")),
    loggingErrors: countEvents(filteredEvents, (event) => event?.flow === "logging" && event?.outcome === "error"),
  };

  const coach = {
    surfaceViews: countEvents(filteredEvents, match("coach", "surface_view", "viewed")),
    previews: countEvents(filteredEvents, match("coach", "plan_preview", "requested")),
    accepted: countEvents(filteredEvents, match("coach", "plan_accept", "success")),
    advisoryQuestions: countEvents(filteredEvents, match("coach", "advisory_question", "success")),
    advisoryErrors: countEvents(filteredEvents, match("coach", "advisory_question", "error")),
  };

  const sync = {
    retries: countEvents(filteredEvents, match("sync", "rest_retry", "retry")),
    persistErrors: countEvents(filteredEvents, match("sync", "persist_all", "error")),
    persistSuccesses: countEvents(filteredEvents, match("sync", "persist_all", "success")),
    entityErrors: countEvents(filteredEvents, match("sync", "entity_sync", "error")),
    avgPersistMs: averageDuration(filteredEvents, match("sync", "persist_all", "success")),
  };

  const settings = {
    surfaceViews: countEvents(filteredEvents, match("settings", "surface_view", "viewed")),
    reloadCloudSuccess: countEvents(filteredEvents, match("settings", "reload_cloud", "success")),
    deleteDiagnosticsFailures: countEvents(filteredEvents, match("settings", "delete_diagnostics", "error")),
  };

  const cards = [
    {
      id: "intake",
      title: "Intake drag",
      tone: intake.repeatedContinues || intake.stageAbandons ? "warn" : "calm",
      ...buildSummaryValueLine(
        `${intake.repeatedContinues} repeat continues`,
        `${intake.stageRestores} restored sessions, ${intake.stageAbandons} abandoned stages, ${intake.completions} completions`
      ),
    },
    {
      id: "auth",
      title: "Auth friction",
      tone: auth.signInFailures || auth.deleteBlockedCount ? "warn" : "calm",
      ...buildSummaryValueLine(
        `${auth.signInFailures} sign-in failures`,
        `${auth.signUpConfirmationNeeded} confirmation-required signups, ${auth.deleteBlockedCount} blocked deletes, avg sign-out ${auth.avgSignOutMs} ms`
      ),
    },
    {
      id: "sync",
      title: "Sync resilience",
      tone: sync.retries || sync.persistErrors || sync.entityErrors ? "warn" : "calm",
      ...buildSummaryValueLine(
        sync.retries || sync.persistErrors || sync.entityErrors ? "Background sync needs review" : "Background sync looks calm",
        sync.retries || sync.persistErrors || sync.entityErrors
          ? "Recovery signals were recorded on this device. Use a protected diagnostics view before drawing conclusions from raw counts."
          : "No retry or persistence warnings were recorded in the current window."
      ),
    },
    {
      id: "actions",
      title: "Product usage",
      tone: logging.loggingErrors || coach.advisoryErrors ? "warn" : "calm",
      ...buildSummaryValueLine(
        `${logging.workoutSaves + logging.nutritionSaves + logging.weeklyCheckins} saved actions`,
        `${goals.previewCount} goal previews, ${goals.applyCount} goal applies, ${coach.advisoryQuestions} coach questions`
      ),
    },
  ];

  const keyFunnel = [
    `Auth attempts: ${auth.signInRequested + auth.signUpRequested}, failures: ${auth.signInFailures}, confirmation-required signups: ${auth.signUpConfirmationNeeded}.`,
    `Intake continues: ${intake.continues}, repeat continues: ${intake.repeatedContinues}, restored sessions: ${intake.stageRestores}, completed builds: ${intake.completions}.`,
    `Goal changes previewed/applied: ${goals.previewCount}/${goals.applyCount}.`,
    `Logging saves: workouts ${logging.workoutSaves}, daily check-ins ${logging.dailyCheckins}, weekly check-ins ${logging.weeklyCheckins}, nutrition ${logging.nutritionSaves}.`,
  ];

  const frictionSignals = [
    intake.repeatedContinues ? `${intake.repeatedContinues} intake continue clicks happened after the first click on the same stage.` : "No repeat-continue friction recorded in the current window.",
    auth.deleteBlockedCount ? `${auth.deleteBlockedCount} delete-account attempts were blocked by deployment support or diagnostics.` : "No delete-account configuration blockers were recorded.",
    sync.retries || sync.persistErrors || sync.entityErrors
      ? "Sync recovery signals were recorded. Review them in protected diagnostics before treating the raw counts as product-facing truth."
      : "No sync retries or sync failures were recorded in the current window.",
    goals.previewCount > goals.applyCount
      ? `${goals.previewCount - goals.applyCount} goal previews did not turn into applies yet.`
      : "Goal previews are converting cleanly into applies so far.",
  ];

  return {
    windowMs,
    eventCount: filteredEvents.length,
    lastEventAt: filteredEvents.length ? filteredEvents[filteredEvents.length - 1]?.ts || null : null,
    flows: { auth, intake, goals, logging, coach, sync, settings },
    cards,
    keyFunnel,
    frictionSignals,
  };
};

export const buildFrictionDashboardModel = ({
  events = [],
  now = safeNow(),
  windowMs = DEFAULT_WINDOW_MS,
} = {}) => {
  const summary = summarizeAnalyticsEvents({ events, now, windowMs });
  return {
    summary,
    header: {
      title: "Friction summary",
      detail: `Last ${Math.round(windowMs / 86400000)} days on this device`,
    },
    cards: summary.cards,
    sections: [
      {
        id: "funnel",
        title: "Key funnels",
        items: summary.keyFunnel,
      },
      {
        id: "friction",
        title: "Current friction signals",
        items: summary.frictionSignals,
      },
    ],
  };
};

export const createFrictionAnalytics = ({
  storageLike = null,
  storageKey = FRICTION_ANALYTICS_STORAGE_KEY,
  eventName = FRICTION_ANALYTICS_EVENT_NAME,
  maxEvents = FRICTION_ANALYTICS_MAX_EVENTS,
  now = safeNow,
  dispatch = null,
} = {}) => {
  const storage = resolveStorage(storageLike);
  const dispatchEvent = typeof dispatch === "function"
    ? dispatch
    : (detail) => {
        if (typeof window === "undefined" || typeof window.dispatchEvent !== "function" || typeof window.CustomEvent !== "function") return;
        window.dispatchEvent(new window.CustomEvent(eventName, { detail }));
      };

  const readEvents = () => readStoredEvents({ storage, storageKey });

  return {
    track(eventInput = {}) {
      const nextEvent = buildAnalyticsEvent({
        ...eventInput,
        ts: typeof eventInput?.ts === "number" ? eventInput.ts : now(),
      });
      const limit = Math.max(1, Number(maxEvents) || FRICTION_ANALYTICS_MAX_EVENTS);
      const nextEvents = [...readEvents(), nextEvent].slice(-limit);
      writeStoredEvents({ storage, storageKey, events: nextEvents });
      dispatchEvent(nextEvent);
      return nextEvent;
    },
    readEvents,
    clear() {
      try {
        storage?.removeItem?.(storageKey);
      } catch {}
    },
    buildSummary(options = {}) {
      return summarizeAnalyticsEvents({
        events: readEvents(),
        now: options?.now || now(),
        windowMs: options?.windowMs || DEFAULT_WINDOW_MS,
      });
    },
    buildDashboard(options = {}) {
      return buildFrictionDashboardModel({
        events: readEvents(),
        now: options?.now || now(),
        windowMs: options?.windowMs || DEFAULT_WINDOW_MS,
      });
    },
  };
};
