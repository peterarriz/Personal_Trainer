const crypto = require("crypto");

const SB_ROW = "trainer_v1";
const COOKIE_MAX_AGE = 15 * 60;
const GARMIN_SCOPE_LABELS = [
  "Activity Data",
  "Daily Summaries",
  "Sleep",
  "Heart Rate",
  "Body Battery",
  "Stress",
];

function getEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function getRequestOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function getSupabaseConfig() {
  const url = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  return { url, anonKey };
}

function getGarminConfig(req) {
  const origin = getRequestOrigin(req);
  const callbackUrl = getEnv("GARMIN_REDIRECT_URI") || `${origin}/auth/garmin/callback`;
  return {
    origin,
    callbackUrl,
    clientId: getEnv("GARMIN_CONSUMER_KEY", "GARMIN_CLIENT_ID"),
    clientSecret: getEnv("GARMIN_CONSUMER_SECRET", "GARMIN_CLIENT_SECRET"),
    authorizeUrl: getEnv("GARMIN_OAUTH_AUTHORIZE_URL"),
    tokenUrl: getEnv("GARMIN_OAUTH_TOKEN_URL"),
    revokeUrl: getEnv("GARMIN_OAUTH_REVOKE_URL"),
    scopes: getEnv("GARMIN_OAUTH_SCOPES"),
    activitiesUrl: getEnv("GARMIN_API_ACTIVITIES_URL"),
    dailySummariesUrl: getEnv("GARMIN_API_DAILY_SUMMARIES_URL"),
    profileUrl: getEnv("GARMIN_API_PROFILE_URL"),
  };
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  return raw.split(/;\s*/).reduce((acc, pair) => {
    const idx = pair.indexOf("=");
    if (idx <= 0) return acc;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}

function setCookies(res, cookies) {
  res.setHeader("Set-Cookie", cookies);
}

function baseCookie(req) {
  return {
    path: "/",
    httpOnly: true,
    secure: String(req.headers["x-forwarded-proto"] || "https") === "https",
    sameSite: "Lax",
  };
}

function setGarminFlowCookies(res, req, payload) {
  const cookieBase = baseCookie(req);
  const cookies = [
    serializeCookie("pt_garmin_state", payload.state, { ...cookieBase, maxAge: COOKIE_MAX_AGE }),
    serializeCookie("pt_garmin_verifier", payload.codeVerifier, { ...cookieBase, maxAge: COOKIE_MAX_AGE }),
    serializeCookie("pt_garmin_auth", payload.authToken, { ...cookieBase, maxAge: COOKIE_MAX_AGE }),
    serializeCookie("pt_garmin_return", payload.returnTo, { ...cookieBase, maxAge: COOKIE_MAX_AGE }),
  ];
  setCookies(res, cookies);
}

function clearGarminFlowCookies(res, req) {
  const cookieBase = baseCookie(req);
  setCookies(res, [
    serializeCookie("pt_garmin_state", "", { ...cookieBase, maxAge: 0 }),
    serializeCookie("pt_garmin_verifier", "", { ...cookieBase, maxAge: 0 }),
    serializeCookie("pt_garmin_auth", "", { ...cookieBase, maxAge: 0 }),
    serializeCookie("pt_garmin_return", "", { ...cookieBase, maxAge: 0 }),
  ]);
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text ? { raw: text } : null;
  }
  return { res, data, text };
}

async function getSupabaseUser(userAccessToken) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    const err = new Error("Supabase server config is missing.");
    err.fix = "Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel.";
    throw err;
  }
  const { res, data, text } = await fetchJson(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${userAccessToken}`,
    },
  });
  if (!res.ok || !data?.id) {
    const err = new Error("Your session expired before Garmin could finish connecting.");
    err.fix = "Sign in again, then retry Garmin Connect from Settings.";
    err.detail = text;
    throw err;
  }
  return data;
}

async function loadTrainerData(userAccessToken, userId) {
  const { url, anonKey } = getSupabaseConfig();
  const query = `${url}/rest/v1/trainer_data?user_id=eq.${encodeURIComponent(userId)}`;
  const { res, data, text } = await fetchJson(query, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${userAccessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const err = new Error("Unable to load your Supabase training record.");
    err.fix = "Confirm the trainer_data table and RLS policies are set up for this signed-in user.";
    err.detail = text;
    throw err;
  }
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return row?.data || {};
}

async function saveTrainerData(userAccessToken, userId, data) {
  const { url, anonKey } = getSupabaseConfig();
  const body = {
    id: `${SB_ROW}_${userId}`,
    user_id: userId,
    data,
    updated_at: new Date().toISOString(),
  };
  const { res, text } = await fetchJson(`${url}/rest/v1/trainer_data`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${userAccessToken}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error("Unable to save Garmin credentials to Supabase.");
    err.fix = "Check that trainer_data accepts authenticated upserts for this user.";
    err.detail = text;
    throw err;
  }
}

function getEncryptionKey() {
  const seed = getEnv("GARMIN_TOKEN_ENCRYPTION_KEY") || getEnv("GARMIN_CONSUMER_SECRET", "GARMIN_CLIENT_SECRET");
  if (!seed) {
    const err = new Error("Missing Garmin encryption secret.");
    err.fix = "Set GARMIN_TOKEN_ENCRYPTION_KEY in Vercel. If omitted, GARMIN_CONSUMER_SECRET must be present.";
    throw err;
  }
  return crypto.createHash("sha256").update(seed).digest();
}

function encryptPayload(payload) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const value = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    value: value.toString("base64"),
    updatedAt: Date.now(),
  };
}

function decryptPayload(payload) {
  if (!payload?.iv || !payload?.tag || !payload?.value) {
    const err = new Error("No Garmin token is stored for this account.");
    err.fix = "Connect Garmin again from Settings.";
    throw err;
  }
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.value, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted);
}

function buildReturnUrl(req, status, message, fix = "") {
  const cookies = parseCookies(req);
  const origin = cookies.pt_garmin_return || getRequestOrigin(req);
  const next = new URL("/", origin);
  next.searchParams.set("tab", "settings");
  next.searchParams.set("garmin_status", status);
  if (message) next.searchParams.set("garmin_message", message);
  if (fix) next.searchParams.set("garmin_fix", fix);
  return next.toString();
}

function redirectToApp(res, req, status, message, fix = "") {
  clearGarminFlowCookies(res, req);
  res.writeHead(302, { Location: buildReturnUrl(req, status, message, fix) });
  res.end();
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendHtml(res, status, { title, message, fix = "", ctaHref = "/", ctaLabel = "Return to app" }) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin:0; font-family: ui-sans-serif, system-ui, sans-serif; background:#0a0f18; color:#dbe7f6; display:grid; place-items:center; min-height:100vh; padding:24px; }
    .card { width:min(520px, 100%); background:#101827; border:1px solid #243752; border-radius:18px; padding:24px; }
    h1 { font-size:1.1rem; margin:0 0 10px; color:#f8fafc; }
    p { line-height:1.6; font-size:0.95rem; color:#bfd0ea; margin:0 0 12px; }
    .fix { color:#facc15; }
    a { display:inline-block; margin-top:10px; color:#0ea5e9; text-decoration:none; font-weight:600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${fix ? `<p class="fix">${escapeHtml(fix)}</p>` : ""}
    <a href="${escapeHtml(ctaHref)}">${escapeHtml(ctaLabel)}</a>
  </div>
</body>
</html>`);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureGarminSetup(req) {
  const config = getGarminConfig(req);
  if (!config.clientId || !config.clientSecret) {
    const err = new Error("Garmin credentials are not configured on the server.");
    err.fix = "Add GARMIN_CONSUMER_KEY and GARMIN_CONSUMER_SECRET in Vercel.";
    throw err;
  }
  if (!config.authorizeUrl || !config.tokenUrl) {
    const err = new Error("Garmin OAuth endpoints are missing.");
    err.fix = "Add GARMIN_OAUTH_AUTHORIZE_URL and GARMIN_OAUTH_TOKEN_URL from the Garmin developer docs shown after approval.";
    throw err;
  }
  return config;
}

function tokenBundleFromResponse(data) {
  const expiresIn = Number(data?.expires_in || 0);
  return {
    accessToken: data?.access_token || "",
    refreshToken: data?.refresh_token || "",
    tokenType: data?.token_type || "Bearer",
    scope: data?.scope || "",
    expiresAt: expiresIn > 0 ? Date.now() + (expiresIn * 1000) : 0,
    obtainedAt: Date.now(),
    raw: {
      access_token: data?.access_token || "",
      refresh_token: data?.refresh_token || "",
      token_type: data?.token_type || "Bearer",
      scope: data?.scope || "",
      expires_in: expiresIn || 0,
    },
  };
}

function toBase64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generatePkcePair() {
  const codeVerifier = toBase64Url(crypto.randomBytes(48));
  const codeChallenge = toBase64Url(crypto.createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

async function exchangeCodeForToken(config, code, codeVerifier = "") {
  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const { res, data, text } = await fetchJson(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.callbackUrl,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }).toString(),
  });
  if (!res.ok || !data?.access_token) {
    const err = new Error(data?.error_description || data?.message || "Garmin rejected the authorization code exchange.");
    err.fix = text && /redirect/i.test(text)
      ? `Set the Garmin portal redirect URI to exactly ${config.callbackUrl} and redeploy if your Vercel domain changed.`
      : "Open Garmin in the developer portal, verify the approved redirect URI and client credentials, then reconnect.";
    err.detail = text;
    throw err;
  }
  return tokenBundleFromResponse(data);
}

async function refreshAccessTokenIfNeeded(config, tokenBundle) {
  const expiresAt = Number(tokenBundle?.expiresAt || 0);
  const refreshToken = String(tokenBundle?.refreshToken || "");
  if (!refreshToken || !expiresAt || expiresAt - Date.now() > 60000) return tokenBundle;
  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const { res, data, text } = await fetchJson(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!res.ok || !data?.access_token) {
    const err = new Error(data?.error_description || "Garmin refresh token exchange failed.");
    err.fix = "Disconnect Garmin, then reconnect to refresh the authorization.";
    err.detail = text;
    throw err;
  }
  const next = tokenBundleFromResponse(data);
  if (!next.refreshToken) next.refreshToken = refreshToken;
  return next;
}

function resolveTemplateUrl(template, origin) {
  if (!template) return "";
  if (/^https?:\/\//i.test(template)) return template;
  return `${origin}${template.startsWith("/") ? "" : "/"}${template}`;
}

function applyUrlTokens(template) {
  const today = new Date();
  const endDate = today.toISOString().split("T")[0];
  const startDate = new Date(today.getTime() - (6 * 24 * 60 * 60 * 1000)).toISOString().split("T")[0];
  return String(template || "")
    .replace(/\{today\}/g, endDate)
    .replace(/\{startDate\}/g, startDate)
    .replace(/\{endDate\}/g, endDate);
}

function normalizeActivities(payload) {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.activities)
    ? payload.activities
    : Array.isArray(payload?.data)
    ? payload.data
    : [];
  return items.slice(0, 120).map((item) => ({
    id: item?.id || item?.activityId || item?.summaryId || "",
    startTime: item?.startTime || item?.startTimeLocal || item?.startDate || "",
    type: item?.type || item?.activityType || item?.sport || "",
    sport: item?.sport || item?.activityType || "",
    distanceMiles: Number(item?.distanceMiles ?? item?.distance ?? 0) || 0,
    durationSeconds: Number(item?.durationSeconds ?? item?.duration ?? 0) || 0,
    avgHr: Number(item?.avgHr ?? item?.averageHeartRate ?? 0) || null,
    maxHr: Number(item?.maxHr ?? item?.maxHeartRate ?? 0) || null,
    calories: Number(item?.calories ?? 0) || null,
    cadence: Number(item?.cadence ?? item?.averageRunCadence ?? 0) || null,
    paceSeconds: Number(item?.paceSeconds ?? item?.averagePaceSeconds ?? 0) || null,
    device: item?.deviceName || item?.device || item?.sourceDevice || "",
    source: "garmin",
  }));
}

function normalizeSummaries(payload) {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.dailySummaries)
    ? payload.dailySummaries
    : Array.isArray(payload?.data)
    ? payload.data
    : [];
  return items.reduce((acc, item) => {
    const key = String(item?.date || item?.calendarDate || item?.summaryDate || "").slice(0, 10);
    if (!key) return acc;
    acc[key] = {
      steps: Number(item?.steps ?? item?.stepCount ?? 0) || 0,
      sleepScore: Number(item?.sleepScore ?? item?.sleep?.score ?? 0) || null,
      stressScore: Number(item?.stressScore ?? item?.stress ?? 0) || null,
      bodyBattery: Number(item?.bodyBattery ?? item?.bodyBatteryScore ?? 0) || null,
      trainingReadinessScore: Number(item?.trainingReadinessScore ?? item?.readiness ?? 0) || null,
      restingHeartRate: Number(item?.restingHeartRate ?? item?.restingHr ?? 0) || null,
    };
    return acc;
  }, {});
}

async function fetchGarminDataset(config, tokenBundle, template) {
  if (!template) return null;
  const url = applyUrlTokens(resolveTemplateUrl(template, config.origin));
  const { res, data, text } = await fetchJson(url, {
    headers: {
      Authorization: `${tokenBundle.tokenType || "Bearer"} ${tokenBundle.accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const err = new Error(data?.error_description || data?.message || `Garmin API request failed (${res.status}).`);
    err.fix = res.status === 401
      ? "Garmin authorization expired. Disconnect Garmin, then reconnect."
      : `Check the Garmin API URL configured for ${template}.`;
    err.status = res.status;
    err.detail = text;
    throw err;
  }
  return data;
}

async function syncGarminData(config, tokenBundle, existingGarmin = {}) {
  const nextToken = await refreshAccessTokenIfNeeded(config, tokenBundle);
  const [profilePayload, activitiesPayload, summariesPayload] = await Promise.all([
    fetchGarminDataset(config, nextToken, config.profileUrl),
    fetchGarminDataset(config, nextToken, config.activitiesUrl),
    fetchGarminDataset(config, nextToken, config.dailySummariesUrl),
  ]);
  const activities = normalizeActivities(activitiesPayload || existingGarmin.activities || []);
  const dailySummaries = normalizeSummaries(summariesPayload || existingGarmin.dailySummaries || {});
  const todayKey = new Date().toISOString().split("T")[0];
  const todaySummary = dailySummaries[todayKey] || {};
  const profile = profilePayload || {};
  const derivedDeviceName =
    profile?.deviceName ||
    profile?.displayName ||
    profile?.fullName ||
    activities.find((item) => item?.device)?.device ||
    existingGarmin.deviceName ||
    "Garmin account";
  return {
    tokenBundle: nextToken,
    garmin: {
      ...existingGarmin,
      status: "connected",
      deviceName: derivedDeviceName,
      permissionsGranted: GARMIN_SCOPE_LABELS,
      activities,
      dailySummaries,
      trainingReadinessScore: Number(todaySummary?.trainingReadinessScore ?? existingGarmin?.trainingReadinessScore ?? 0) || null,
      lastSyncAt: Date.now(),
      lastApiStatus: "ok",
      lastApiErrorAt: 0,
      lastErrorMessage: "",
      lastErrorFix: "",
    },
  };
}

async function persistGarminState({ userAccessToken, userId, existingData, garminPatch, tokenBundle, clearAuth = false }) {
  const nextData = {
    ...existingData,
    personalization: {
      ...(existingData?.personalization || {}),
      connectedDevices: {
        ...(existingData?.personalization?.connectedDevices || {}),
        garmin: garminPatch,
      },
    },
  };
  if (clearAuth) delete nextData.garminAuth;
  else if (tokenBundle) nextData.garminAuth = encryptPayload(tokenBundle);
  await saveTrainerData(userAccessToken, userId, nextData);
  return nextData;
}

function randomState() {
  return crypto.randomBytes(24).toString("hex");
}

module.exports = {
  GARMIN_SCOPE_LABELS,
  buildReturnUrl,
  clearGarminFlowCookies,
  decryptPayload,
  ensureGarminSetup,
  exchangeCodeForToken,
  generatePkcePair,
  getBearerToken,
  getGarminConfig,
  getRequestOrigin,
  getSupabaseUser,
  loadTrainerData,
  parseCookies,
  persistGarminState,
  randomState,
  redirectToApp,
  refreshAccessTokenIfNeeded,
  sendHtml,
  sendJson,
  setGarminFlowCookies,
  syncGarminData,
};
