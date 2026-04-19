import {
  ADAPTIVE_LEARNING_EVENT_SCHEMA_VERSION,
  createAdaptiveLearningEvent,
  sanitizeAdaptiveLearningIdentity,
  validateAdaptiveLearningEvent,
} from "./adaptive-learning-event-service.js";

export const ADAPTIVE_LEARNING_STORE_MODEL = "adaptive_learning_store_v1";
export const ADAPTIVE_LEARNING_STORAGE_KEY = "trainer_adaptive_learning_v1";
export const ADAPTIVE_LEARNING_MAX_EVENTS = 6000;

const clone = (value = null) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toFiniteInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const hashString = (value = "") => {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const resolveStorage = (storageLike = null) => {
  if (storageLike?.getItem && storageLike?.setItem) return storageLike;
  if (typeof window !== "undefined" && window?.localStorage?.getItem) return window.localStorage;
  let raw = "null";
  return {
    getItem(key) {
      return key === ADAPTIVE_LEARNING_STORAGE_KEY ? raw : null;
    },
    setItem(key, value) {
      if (key === ADAPTIVE_LEARNING_STORAGE_KEY) raw = String(value || "null");
    },
    removeItem(key) {
      if (key === ADAPTIVE_LEARNING_STORAGE_KEY) raw = "null";
    },
  };
};

const buildLocalActorId = () => `local_actor_${hashString(`${Date.now()}_${Math.random().toString(36).slice(2, 10)}`)}`;

const createEmptySnapshot = ({ actorId = "" } = {}) => ({
  model: ADAPTIVE_LEARNING_STORE_MODEL,
  schemaVersion: ADAPTIVE_LEARNING_EVENT_SCHEMA_VERSION,
  actorId: sanitizeText(actorId || buildLocalActorId(), 120),
  userId: "",
  seq: 0,
  events: [],
  pendingEventIds: [],
  pendingServerEventIds: [],
  lastLocalWriteAt: 0,
  lastCloudReadAt: 0,
  lastCloudWriteAt: 0,
  lastReplayAt: 0,
  lastServerIngestAt: 0,
  lastServerIngestErrorAt: 0,
  lastServerIngestErrorCode: "",
});

const sanitizeEventArray = (events = []) => {
  const seen = new Set();
  return toArray(events)
    .map((event) => {
      try {
        return validateAdaptiveLearningEvent(event);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => Number(a?.occurredAt || 0) - Number(b?.occurredAt || 0))
    .filter((event) => {
      if (!event?.eventId || seen.has(event.eventId)) return false;
      seen.add(event.eventId);
      return true;
    })
    .slice(-ADAPTIVE_LEARNING_MAX_EVENTS);
};

export const sanitizeAdaptiveLearningSnapshotForPersistence = (snapshot = null) => {
  if (!snapshot || typeof snapshot !== "object") {
    return createEmptySnapshot({});
  }
  const safeEvents = sanitizeEventArray(snapshot.events || []);
  const validEventIds = new Set(safeEvents.map((event) => event.eventId));
  const pendingEventIds = toArray(snapshot.pendingEventIds)
    .map((eventId) => sanitizeText(eventId, 160))
    .filter((eventId) => eventId && validEventIds.has(eventId));
  const pendingServerEventIds = toArray(snapshot.pendingServerEventIds)
    .map((eventId) => sanitizeText(eventId, 160))
    .filter((eventId) => eventId && validEventIds.has(eventId));
  return {
    model: ADAPTIVE_LEARNING_STORE_MODEL,
    schemaVersion: ADAPTIVE_LEARNING_EVENT_SCHEMA_VERSION,
    actorId: sanitizeText(snapshot.actorId || buildLocalActorId(), 120),
    userId: sanitizeText(snapshot.userId || "", 120),
    seq: Math.max(0, toFiniteInteger(snapshot.seq, safeEvents.length)),
    events: safeEvents,
    pendingEventIds,
    pendingServerEventIds,
    lastLocalWriteAt: Math.max(0, toFiniteInteger(snapshot.lastLocalWriteAt, 0)),
    lastCloudReadAt: Math.max(0, toFiniteInteger(snapshot.lastCloudReadAt, 0)),
    lastCloudWriteAt: Math.max(0, toFiniteInteger(snapshot.lastCloudWriteAt, 0)),
    lastReplayAt: Math.max(0, toFiniteInteger(snapshot.lastReplayAt, 0)),
    lastServerIngestAt: Math.max(0, toFiniteInteger(snapshot.lastServerIngestAt, 0)),
    lastServerIngestErrorAt: Math.max(0, toFiniteInteger(snapshot.lastServerIngestErrorAt, 0)),
    lastServerIngestErrorCode: sanitizeText(snapshot.lastServerIngestErrorCode || "", 80),
  };
};

const readStoredSnapshot = ({ storage, storageKey = ADAPTIVE_LEARNING_STORAGE_KEY } = {}) => {
  try {
    const raw = storage?.getItem?.(storageKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const writeStoredSnapshot = ({ storage, snapshot, storageKey = ADAPTIVE_LEARNING_STORAGE_KEY } = {}) => {
  try {
    storage?.setItem?.(storageKey, JSON.stringify(snapshot));
  } catch {}
};

const removeStoredSnapshot = ({ storage, storageKey = ADAPTIVE_LEARNING_STORAGE_KEY } = {}) => {
  try {
    storage?.removeItem?.(storageKey);
  } catch {}
};

const buildEventMergeKey = (event = null) => {
  const eventName = sanitizeText(event?.eventName || "", 120);
  const dedupeKey = sanitizeText(event?.dedupeKey || "", 220);
  if (eventName && dedupeKey) return `${eventName}__${dedupeKey}`;
  return sanitizeText(event?.eventId || "", 160);
};

const shouldPreferIncomingEvent = ({
  currentEntry = null,
  incoming = null,
  source = "import",
  incomingPendingIds = new Set(),
} = {}) => {
  const current = currentEntry?.event || null;
  if (!current) return true;
  if (!incoming) return false;
  if (source === "cloud") {
    const currentCloudSynced = currentEntry?.origin === "incoming"
      && current?.eventId
      && !incomingPendingIds.has(current.eventId);
    const incomingCloudSynced = incoming?.eventId && !incomingPendingIds.has(incoming.eventId);
    if (currentCloudSynced !== incomingCloudSynced) return Boolean(incomingCloudSynced);
  }
  return Number(incoming?.occurredAt || 0) >= Number(current?.occurredAt || 0);
};

const resolveMergedPendingEventIds = ({
  mergedEvents = [],
  baseEvents = [],
  basePendingIds = [],
  incomingEvents = [],
  incomingPendingIds = [],
  source = "import",
} = {}) => {
  const mergedEventIds = new Set(mergedEvents.map((event) => event?.eventId).filter(Boolean));
  const mergedEventIdByKey = new Map(
    mergedEvents.map((event) => [buildEventMergeKey(event), event?.eventId]).filter((entry) => entry[0] && entry[1])
  );
  const incomingPendingIdSet = new Set(
    toArray(incomingPendingIds).map((eventId) => sanitizeText(eventId, 160)).filter(Boolean)
  );
  const pendingKeys = new Set();
  const registerPendingKeys = (events = [], pendingIds = []) => {
    const pendingIdSet = new Set(toArray(pendingIds).map((eventId) => sanitizeText(eventId, 160)).filter(Boolean));
    toArray(events).forEach((event) => {
      if (!pendingIdSet.has(event?.eventId)) return;
      const mergeKey = buildEventMergeKey(event);
      if (mergeKey) pendingKeys.add(mergeKey);
    });
  };
  registerPendingKeys(baseEvents, basePendingIds);
  if (source !== "cloud") registerPendingKeys(incomingEvents, incomingPendingIds);
  if (source === "cloud") {
    toArray(incomingEvents)
      .filter((event) => event?.eventId && !incomingPendingIdSet.has(event.eventId))
      .map((event) => buildEventMergeKey(event))
      .filter(Boolean)
      .forEach((mergeKey) => pendingKeys.delete(mergeKey));
  }
  return [...pendingKeys]
    .map((mergeKey) => mergedEventIdByKey.get(mergeKey))
    .filter((eventId) => eventId && mergedEventIds.has(eventId));
};

const mergeSnapshots = ({
  baseSnapshot = null,
  importedSnapshot = null,
  source = "import",
  at = Date.now(),
} = {}) => {
  const base = sanitizeAdaptiveLearningSnapshotForPersistence(baseSnapshot || createEmptySnapshot({}));
  const incoming = sanitizeAdaptiveLearningSnapshotForPersistence(importedSnapshot || createEmptySnapshot({ actorId: base.actorId }));
  const incomingPendingIds = new Set(incoming.pendingEventIds || []);
  const mergedEventsMap = new Map();
  (base.events || []).forEach((event) => {
    const mergeKey = buildEventMergeKey(event);
    if (!mergeKey) return;
    mergedEventsMap.set(mergeKey, { event, origin: "base" });
  });
  (incoming.events || []).forEach((event) => {
    const mergeKey = buildEventMergeKey(event);
    if (!mergeKey) return;
    const currentEntry = mergedEventsMap.get(mergeKey);
    if (shouldPreferIncomingEvent({
      currentEntry,
      incoming: event,
      source,
      incomingPendingIds,
    })) {
      mergedEventsMap.set(mergeKey, { event, origin: "incoming" });
    }
  });
  const mergedEvents = [...mergedEventsMap.values()]
    .map((entry) => entry?.event)
    .filter(Boolean)
    .sort((a, b) => Number(a?.occurredAt || 0) - Number(b?.occurredAt || 0))
    .slice(-ADAPTIVE_LEARNING_MAX_EVENTS);
  const mergedActorId = sanitizeText(base.actorId || incoming.actorId || buildLocalActorId(), 120);
  return {
    model: ADAPTIVE_LEARNING_STORE_MODEL,
    schemaVersion: ADAPTIVE_LEARNING_EVENT_SCHEMA_VERSION,
    actorId: mergedActorId,
    userId: sanitizeText(base.userId || incoming.userId || "", 120),
    seq: Math.max(
      mergedEvents.length,
      Math.max(0, toFiniteInteger(base.seq, 0)),
      Math.max(0, toFiniteInteger(incoming.seq, 0)),
    ),
    events: mergedEvents,
    pendingEventIds: resolveMergedPendingEventIds({
      mergedEvents,
      baseEvents: base.events || [],
      basePendingIds: base.pendingEventIds || [],
      incomingEvents: incoming.events || [],
      incomingPendingIds: incoming.pendingEventIds || [],
      source,
    }),
    pendingServerEventIds: resolveMergedPendingEventIds({
      mergedEvents,
      baseEvents: base.events || [],
      basePendingIds: base.pendingServerEventIds || [],
      incomingEvents: incoming.events || [],
      incomingPendingIds: incoming.pendingServerEventIds || [],
      source,
    }),
    lastLocalWriteAt: Math.max(toFiniteInteger(base.lastLocalWriteAt, 0), toFiniteInteger(incoming.lastLocalWriteAt, 0)),
    lastCloudReadAt: source === "cloud"
      ? Math.max(at, toFiniteInteger(base.lastCloudReadAt, 0), toFiniteInteger(incoming.lastCloudReadAt, 0))
      : Math.max(toFiniteInteger(base.lastCloudReadAt, 0), toFiniteInteger(incoming.lastCloudReadAt, 0)),
    lastCloudWriteAt: Math.max(toFiniteInteger(base.lastCloudWriteAt, 0), toFiniteInteger(incoming.lastCloudWriteAt, 0)),
    lastReplayAt: source === "cloud"
      ? Math.max(at, toFiniteInteger(base.lastReplayAt, 0), toFiniteInteger(incoming.lastReplayAt, 0))
      : Math.max(toFiniteInteger(base.lastReplayAt, 0), toFiniteInteger(incoming.lastReplayAt, 0)),
    lastServerIngestAt: Math.max(toFiniteInteger(base.lastServerIngestAt, 0), toFiniteInteger(incoming.lastServerIngestAt, 0)),
    lastServerIngestErrorAt: Math.max(toFiniteInteger(base.lastServerIngestErrorAt, 0), toFiniteInteger(incoming.lastServerIngestErrorAt, 0)),
    lastServerIngestErrorCode: sanitizeText(
      incoming.lastServerIngestErrorCode || base.lastServerIngestErrorCode || "",
      80
    ),
  };
};

export const createAdaptiveLearningStore = ({
  storageLike = null,
  storageKey = ADAPTIVE_LEARNING_STORAGE_KEY,
  now = () => Date.now(),
} = {}) => {
  const storage = resolveStorage(storageLike);
  let snapshot = sanitizeAdaptiveLearningSnapshotForPersistence(
    readStoredSnapshot({ storage, storageKey }) || createEmptySnapshot({})
  );

  const persistSnapshot = () => {
    writeStoredSnapshot({ storage, storageKey, snapshot });
    return snapshot;
  };

  const getSnapshot = () => clone(snapshot);

  const setUserIdentity = ({ userId = "", localActorId = "" } = {}) => {
    const identity = sanitizeAdaptiveLearningIdentity({
      actorId: sanitizeText(userId || snapshot.actorId || localActorId, 120),
      userId,
      localActorId: localActorId || snapshot.actorId,
    });
    snapshot = {
      ...snapshot,
      actorId: identity.localActorId || snapshot.actorId,
      userId: identity.userId || snapshot.userId,
    };
    persistSnapshot();
    return clone(snapshot);
  };

  const clear = () => {
    snapshot = createEmptySnapshot({});
    removeStoredSnapshot({ storage, storageKey });
    persistSnapshot();
    return clone(snapshot);
  };

  const recordEvent = ({
    eventName = "",
    payload = {},
    actorId = "",
    userId = "",
    localActorId = "",
    occurredAt = now(),
    dedupeKey = "",
  } = {}) => {
    const identity = sanitizeAdaptiveLearningIdentity({
      actorId: actorId || userId || snapshot.userId || snapshot.actorId,
      userId: userId || snapshot.userId,
      localActorId: localActorId || snapshot.actorId,
    });
    const nextEvent = createAdaptiveLearningEvent({
      eventName,
      actorId: identity.actorId,
      userId: identity.userId,
      localActorId: identity.localActorId,
      occurredAt,
      payload,
      dedupeKey,
      sequence: snapshot.seq + 1,
    });
    if ((snapshot.events || []).some((event) => event?.eventId === nextEvent.eventId)) {
      return nextEvent;
    }
    const nextEvents = [...(snapshot.events || []), nextEvent].slice(-ADAPTIVE_LEARNING_MAX_EVENTS);
    snapshot = sanitizeAdaptiveLearningSnapshotForPersistence({
      ...snapshot,
      actorId: identity.localActorId || snapshot.actorId,
      userId: identity.userId || snapshot.userId,
      seq: Math.max(snapshot.seq + 1, nextEvents.length),
      events: nextEvents,
      pendingEventIds: Array.from(new Set([...(snapshot.pendingEventIds || []), nextEvent.eventId])),
      pendingServerEventIds: Array.from(new Set([...(snapshot.pendingServerEventIds || []), nextEvent.eventId])),
      lastLocalWriteAt: toFiniteInteger(occurredAt, now()),
    });
    persistSnapshot();
    return nextEvent;
  };

  const recordEvents = (events = []) => toArray(events).map((entry) => recordEvent(entry)).filter(Boolean);

  const buildPersistenceSnapshot = () => sanitizeAdaptiveLearningSnapshotForPersistence(snapshot);

  const importPersistedSnapshot = ({
    persistedSnapshot = null,
    source = "cloud",
    at = now(),
  } = {}) => {
    snapshot = mergeSnapshots({
      baseSnapshot: snapshot,
      importedSnapshot: persistedSnapshot,
      source,
      at,
    });
    persistSnapshot();
    return clone(snapshot);
  };

  const markEventsSynced = ({
    eventIds = [],
    at = now(),
  } = {}) => {
    const syncedIds = new Set(toArray(eventIds).map((eventId) => sanitizeText(eventId, 160)).filter(Boolean));
    snapshot = sanitizeAdaptiveLearningSnapshotForPersistence({
      ...snapshot,
      pendingEventIds: (snapshot.pendingEventIds || []).filter((eventId) => !syncedIds.has(eventId)),
      lastCloudWriteAt: Math.max(toFiniteInteger(snapshot.lastCloudWriteAt, 0), toFiniteInteger(at, now())),
      lastReplayAt: Math.max(toFiniteInteger(snapshot.lastReplayAt, 0), toFiniteInteger(at, now())),
    });
    persistSnapshot();
    return clone(snapshot);
  };

  const markEventsIngested = ({
    eventIds = [],
    at = now(),
  } = {}) => {
    const ingestedIds = new Set(toArray(eventIds).map((eventId) => sanitizeText(eventId, 160)).filter(Boolean));
    snapshot = sanitizeAdaptiveLearningSnapshotForPersistence({
      ...snapshot,
      pendingServerEventIds: (snapshot.pendingServerEventIds || []).filter((eventId) => !ingestedIds.has(eventId)),
      lastServerIngestAt: Math.max(toFiniteInteger(snapshot.lastServerIngestAt, 0), toFiniteInteger(at, now())),
      lastServerIngestErrorAt: 0,
      lastServerIngestErrorCode: "",
    });
    persistSnapshot();
    return clone(snapshot);
  };

  const markServerIngestFailed = ({
    at = now(),
    errorCode = "",
  } = {}) => {
    snapshot = sanitizeAdaptiveLearningSnapshotForPersistence({
      ...snapshot,
      lastServerIngestErrorAt: Math.max(toFiniteInteger(snapshot.lastServerIngestErrorAt, 0), toFiniteInteger(at, now())),
      lastServerIngestErrorCode: sanitizeText(errorCode || "", 80),
    });
    persistSnapshot();
    return clone(snapshot);
  };

  const getPendingEvents = () => {
    const pendingIds = new Set(snapshot.pendingEventIds || []);
    return (snapshot.events || []).filter((event) => pendingIds.has(event?.eventId));
  };

  const getPendingServerEvents = () => {
    const pendingIds = new Set(snapshot.pendingServerEventIds || []);
    return (snapshot.events || []).filter((event) => pendingIds.has(event?.eventId));
  };

  return {
    getSnapshot,
    getPendingEvents,
    getPendingServerEvents,
    buildPersistenceSnapshot,
    importPersistedSnapshot,
    markEventsSynced,
    markEventsIngested,
    markServerIngestFailed,
    recordEvent,
    recordEvents,
    setUserIdentity,
    clear,
  };
};
