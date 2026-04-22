const DEFAULT_INVALIDATION_RESULT = Object.freeze({
  ok: false,
  skipped: true,
  stale: true,
  reason: "persist_queue_invalidated",
});

const cloneInvalidationResult = (result = DEFAULT_INVALIDATION_RESULT) => ({
  ...DEFAULT_INVALIDATION_RESULT,
  ...(result && typeof result === "object" ? result : {}),
});

export const createPersistQueueController = ({ execute } = {}) => {
  const state = {
    activePromise: null,
    activeKey: "",
    activeOwnerId: "",
    queuedEntry: null,
    flushing: false,
  };

  const runFlushLoop = async () => {
    if (state.flushing) return state.activePromise || state.queuedEntry?.promise || null;
    state.flushing = true;
    try {
      while (state.queuedEntry) {
        const entry = state.queuedEntry;
        state.queuedEntry = null;
        state.activeKey = String(entry.key || "");
        state.activeOwnerId = String(entry.ownerId || "");
        const activePromise = Promise.resolve().then(() => execute(entry.request));
        state.activePromise = activePromise;
        try {
          const result = await activePromise;
          entry.resolve(result);
        } catch (error) {
          entry.reject(error);
        } finally {
          if (state.activePromise === activePromise) {
            state.activePromise = null;
            state.activeKey = "";
            state.activeOwnerId = "";
          }
        }
      }
    } finally {
      state.flushing = false;
    }
    return null;
  };

  const enqueue = ({ key = "", ownerId = "", request = null } = {}) => {
    const normalizedKey = String(key || "");
    const normalizedOwnerId = String(ownerId || "");
    if (
      state.activePromise
      && normalizedKey
      && normalizedKey === state.activeKey
      && normalizedOwnerId === state.activeOwnerId
    ) {
      return state.activePromise;
    }
    if (
      state.queuedEntry
      && normalizedKey
      && normalizedKey === state.queuedEntry.key
      && normalizedOwnerId === state.queuedEntry.ownerId
    ) {
      return state.queuedEntry.promise;
    }
    if (!state.queuedEntry) {
      let resolveEntry = null;
      let rejectEntry = null;
      const promise = new Promise((resolve, reject) => {
        resolveEntry = resolve;
        rejectEntry = reject;
      });
      state.queuedEntry = {
        key: normalizedKey,
        ownerId: normalizedOwnerId,
        request,
        promise,
        resolve: resolveEntry,
        reject: rejectEntry,
      };
    } else {
      state.queuedEntry.key = normalizedKey;
      state.queuedEntry.ownerId = normalizedOwnerId;
      state.queuedEntry.request = request;
    }
    const queuedPromise = state.queuedEntry.promise;
    if (!state.flushing) {
      void runFlushLoop();
    }
    return queuedPromise;
  };

  const invalidateQueued = (result = DEFAULT_INVALIDATION_RESULT) => {
    if (!state.queuedEntry) return false;
    const queuedEntry = state.queuedEntry;
    state.queuedEntry = null;
    queuedEntry.resolve(cloneInvalidationResult(result));
    return true;
  };

  const getState = () => ({
    hasActivePersist: Boolean(state.activePromise),
    activeKey: state.activeKey,
    activeOwnerId: state.activeOwnerId,
    hasQueuedPersist: Boolean(state.queuedEntry),
    queuedKey: state.queuedEntry?.key || "",
    queuedOwnerId: state.queuedEntry?.ownerId || "",
    flushing: state.flushing,
  });

  return {
    enqueue,
    getState,
    invalidateQueued,
  };
};
