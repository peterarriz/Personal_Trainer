const ENDPOINT_UNAVAILABLE_CACHE_KEY = "trainer_endpoint_unavailable_v1";
const LOCAL_APP_ROUTES_OVERRIDE_KEY = "trainer_local_api_routes";
const DEFAULT_ENDPOINT_UNAVAILABLE_TTL_MS = 60 * 60 * 1000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const normalizeText = (value = "", maxLength = 240) => String(value || "").trim().slice(0, maxLength);

const normalizeHostname = (value = "") => normalizeText(value, 160)
  .toLowerCase()
  .replace(/^\[|\]$/g, "");

const getStorage = (storageLike = null) => {
  if (storageLike && typeof storageLike.getItem === "function" && typeof storageLike.setItem === "function") {
    return storageLike;
  }
  try {
    if (typeof window !== "undefined" && window?.localStorage) return window.localStorage;
  } catch {}
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {}
  return null;
};

const readCacheMap = ({ storageLike = null } = {}) => {
  const storage = getStorage(storageLike);
  if (!storage) return {};
  try {
    const raw = storage.getItem(ENDPOINT_UNAVAILABLE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeCacheMap = (cacheMap = {}, { storageLike = null } = {}) => {
  const storage = getStorage(storageLike);
  if (!storage) return false;
  try {
    if (!cacheMap || !Object.keys(cacheMap).length) {
      storage.removeItem(ENDPOINT_UNAVAILABLE_CACHE_KEY);
      return true;
    }
    storage.setItem(ENDPOINT_UNAVAILABLE_CACHE_KEY, JSON.stringify(cacheMap));
    return true;
  } catch {
    return false;
  }
};

const sanitizeEndpointRecord = (record = null, { now = Date.now() } = {}) => {
  if (!record || typeof record !== "object") return null;
  const until = Number(record?.until || 0);
  if (!Number.isFinite(until) || until <= now) return null;
  return {
    endpoint: normalizeText(record?.endpoint || "", 200),
    status: Number.isFinite(Number(record?.status)) ? Number(record.status) : null,
    reason: normalizeText(record?.reason || "", 120),
    until,
  };
};

export const DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT = "/api/auth/delete-account";
export const DELETE_ACCOUNT_ENDPOINT_UNAVAILABLE_CODE = "delete_account_endpoint_unavailable";

export const isLikelyLocalAppRuntime = ({ hostname = "" } = {}) => {
  const resolvedHostname = normalizeHostname(
    hostname || (typeof window !== "undefined" ? window?.location?.hostname || "" : "")
  );
  if (!resolvedHostname) return false;
  if (LOCAL_HOSTS.has(resolvedHostname)) return true;
  return resolvedHostname.endsWith(".localhost");
};

export const shouldTreatSameOriginApiRoutesAsUnavailable = ({
  endpoint = "",
  hostname = "",
  storageLike = null,
} = {}) => {
  const normalizedEndpoint = normalizeText(endpoint, 200);
  if (!normalizedEndpoint.startsWith("/api/")) return false;
  if (!isLikelyLocalAppRuntime({ hostname })) return false;
  const storage = getStorage(storageLike);
  try {
    if (storage?.getItem?.(LOCAL_APP_ROUTES_OVERRIDE_KEY) === "1") return false;
  } catch {}
  return true;
};

export const getTemporarilyUnavailableEndpoint = ({
  endpoint = "",
  now = Date.now(),
  storageLike = null,
} = {}) => {
  const normalizedEndpoint = normalizeText(endpoint, 200);
  if (!normalizedEndpoint) return null;
  if (shouldTreatSameOriginApiRoutesAsUnavailable({ endpoint: normalizedEndpoint, storageLike })) {
    return {
      endpoint: normalizedEndpoint,
      status: null,
      reason: "local_runtime_missing_route",
      until: now + DEFAULT_ENDPOINT_UNAVAILABLE_TTL_MS,
      assumed: true,
    };
  }
  const cacheMap = readCacheMap({ storageLike });
  const cachedRecord = sanitizeEndpointRecord(cacheMap?.[normalizedEndpoint], { now });
  if (cachedRecord) return cachedRecord;
  if (cacheMap?.[normalizedEndpoint]) {
    const nextCacheMap = { ...cacheMap };
    delete nextCacheMap[normalizedEndpoint];
    writeCacheMap(nextCacheMap, { storageLike });
  }
  return null;
};

export const markEndpointTemporarilyUnavailable = ({
  endpoint = "",
  status = null,
  reason = "",
  ttlMs = DEFAULT_ENDPOINT_UNAVAILABLE_TTL_MS,
  now = Date.now(),
  storageLike = null,
} = {}) => {
  const normalizedEndpoint = normalizeText(endpoint, 200);
  if (!normalizedEndpoint) return null;
  const cacheMap = readCacheMap({ storageLike });
  const record = {
    endpoint: normalizedEndpoint,
    status: Number.isFinite(Number(status)) ? Number(status) : null,
    reason: normalizeText(reason || "endpoint_unavailable", 120) || "endpoint_unavailable",
    until: now + Math.max(60 * 1000, Number(ttlMs || DEFAULT_ENDPOINT_UNAVAILABLE_TTL_MS)),
  };
  writeCacheMap({
    ...cacheMap,
    [normalizedEndpoint]: record,
  }, { storageLike });
  return record;
};

export const clearTemporarilyUnavailableEndpoint = ({
  endpoint = "",
  storageLike = null,
} = {}) => {
  const normalizedEndpoint = normalizeText(endpoint, 200);
  if (!normalizedEndpoint) return false;
  const cacheMap = readCacheMap({ storageLike });
  if (!cacheMap?.[normalizedEndpoint]) return true;
  const nextCacheMap = { ...cacheMap };
  delete nextCacheMap[normalizedEndpoint];
  return writeCacheMap(nextCacheMap, { storageLike });
};

export const isMissingEndpointResponseStatus = (status) => {
  const normalizedStatus = Number(status || 0);
  return normalizedStatus === 404 || normalizedStatus === 405 || normalizedStatus === 501;
};

export const buildDeleteAccountEndpointUnavailableDiagnostics = ({
  status = null,
  reason = "",
  endpoint = DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT,
} = {}) => {
  const normalizedReason = normalizeText(reason, 120).toLowerCase();
  const localRuntime = normalizedReason === "local_runtime_missing_route";
  return {
    configured: false,
    code: DELETE_ACCOUNT_ENDPOINT_UNAVAILABLE_CODE,
    message: localRuntime
      ? "Permanent account delete is not available in this local build."
      : "Permanent account delete could not be verified in this runtime.",
    detail: localRuntime
      ? "This local app build does not expose the account delete route, so permanent delete stays blocked here."
      : `This runtime did not expose ${normalizeText(endpoint, 200) || DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT}, so permanent delete stays blocked here.`,
    fix: localRuntime
      ? "Use a deployed environment if you need permanent account deletion. Locally, sign out or reset this device instead."
      : "Retry in a deployment that serves account APIs, or keep using sign out or reset this device.",
    missing: [],
    required: [],
    status: Number.isFinite(Number(status)) ? Number(status) : null,
  };
};
