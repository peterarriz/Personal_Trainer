const SAFE_HOST_PATTERNS = [
  /(^|\.)example\.supabase\.co$/i,
  /(^|\.)localhost$/i,
  /(^|\.)127\.0\.0\.1$/i,
  /(^|\.)0\.0\.0\.0$/i,
  /(^|\.)test$/i,
  /(^|\.)local$/i,
  /(^|\.)staging\./i,
];

const SUPABASE_ENV_KEYS = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VITE_SUPABASE_URL",
];

const looksLikeSafeSupabaseUrl = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return true;
  try {
    const url = new URL(text);
    return SAFE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname || ""));
  } catch (_) {
    return false;
  }
};

export const getSyntheticLabSafetyState = (env = process.env) => {
  const configuredUrls = SUPABASE_ENV_KEYS
    .map((key) => ({ key, value: String(env?.[key] || "").trim() }))
    .filter((entry) => entry.value);
  const unsafeUrls = configuredUrls.filter((entry) => !looksLikeSafeSupabaseUrl(entry.value));
  const overrideEnabled = String(env?.FORMA_ALLOW_UNSAFE_SYNTHETIC_LAB || "").trim() === "1";
  return {
    configuredUrls,
    unsafeUrls,
    overrideEnabled,
    blocked: unsafeUrls.length > 0 && !overrideEnabled,
  };
};

export const assertSyntheticLabSafeEnvironment = (env = process.env) => {
  const state = getSyntheticLabSafetyState(env);
  if (!state.blocked) return state;
  const configured = state.unsafeUrls.map((entry) => `${entry.key}=${entry.value}`).join(", ");
  throw new Error(
    `Synthetic athlete lab refused to run with production-looking Supabase URLs: ${configured}. ` +
    "Use local/staging URLs instead, or set FORMA_ALLOW_UNSAFE_SYNTHETIC_LAB=1 only for intentional troubleshooting."
  );
};

