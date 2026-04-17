const { fetchJson, getSupabaseConfig, sendJson } = require("../_lib/garmin");
const { applyRateLimitHeaders, consumeRateLimit, getClientIp } = require("../_lib/security");

const FORGOT_PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const FORGOT_PASSWORD_LIMIT = 5;

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      code: "method_not_allowed",
      message: "Use POST for password reset requests.",
    });
  }

  const clientIp = getClientIp(req);
  const rateLimit = consumeRateLimit({
    bucket: "forgot_password",
    key: clientIp,
    limit: FORGOT_PASSWORD_LIMIT,
    windowMs: FORGOT_PASSWORD_WINDOW_MS,
  });
  applyRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) {
    return sendJson(res, 429, {
      ok: false,
      code: "rate_limited",
      message: "Password reset is temporarily rate limited.",
      detail: "Wait a few minutes before requesting another reset link.",
    });
  }

  try {
    const body = await readJsonBody(req);
    const email = String(body?.email || "").trim().toLowerCase();
    const redirectTo = String(body?.redirect_to || "").trim();
    if (!email) {
      return sendJson(res, 400, {
        ok: false,
        code: "missing_email",
        message: "An email address is required.",
      });
    }

    const { url, anonKey } = getSupabaseConfig();
    if (!url || !anonKey) {
      return sendJson(res, 503, {
        ok: false,
        code: "auth_provider_unavailable",
        message: "Password reset is unavailable on this deployment.",
      });
    }

    const payload = { email };
    if (redirectTo) payload.redirect_to = redirectTo;
    const { res: upstreamRes, data, text } = await fetchJson(`${url}/auth/v1/recover`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!upstreamRes.ok) {
      return sendJson(res, upstreamRes.status || 502, {
        ok: false,
        code: String(data?.code || data?.error_code || "forgot_password_failed"),
        message: data?.msg || data?.message || "Password reset request failed.",
        detail: String(text || "").slice(0, 240),
      });
    }

    return sendJson(res, 202, {
      ok: true,
      code: "password_reset_requested",
      message: "If that email can receive recovery mail, a reset link will arrive shortly.",
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      code: "forgot_password_unhandled_error",
      message: error?.message || "Password reset request failed.",
    });
  }
};
