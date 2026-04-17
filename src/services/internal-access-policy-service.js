const TRUSTED_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const normalizeHostname = (value = "") => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/^\[|\]$/g, "");

export const isTrustedLocalOperatorHost = ({ hostname = "" } = {}) => {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  if (TRUSTED_LOCAL_HOSTS.has(normalized)) return true;
  return normalized.endsWith(".localhost");
};

export const canExposeInternalOperatorTools = ({
  debugMode = false,
  hostname = "",
} = {}) => Boolean(debugMode) && isTrustedLocalOperatorHost({ hostname });

export const canExposeProtectedDiagnostics = ({
  debugMode = false,
  hostname = "",
  locationSearch = "",
  storedDiagnosticsFlag = "0",
} = {}) => {
  if (!canExposeInternalOperatorTools({ debugMode, hostname })) return false;
  const storedFlagEnabled = String(storedDiagnosticsFlag || "0") === "1";
  try {
    const params = new URLSearchParams(String(locationSearch || ""));
    return params.get("diagnostics") === "1" || storedFlagEnabled;
  } catch {
    return storedFlagEnabled;
  }
};

export const canUseClientSuppliedAiKey = ({
  debugMode = false,
  hostname = "",
} = {}) => canExposeInternalOperatorTools({ debugMode, hostname });

