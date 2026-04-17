const {
  fetchJson,
  getBearerToken,
  getSupabaseConfig,
  getSupabaseUser,
  sendJson,
} = require("../_lib/garmin");
const { applyRateLimitHeaders, consumeRateLimit, getClientIp } = require("../_lib/security");

const DELETE_ACCOUNT_ENV_REQUIREMENTS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function getServiceRoleKey() {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE,
    process.env.SUPABASE_SERVICE_KEY,
  ];
  return candidates.find((value) => String(value || "").trim()) || "";
}

function getDeleteAccountConfigDiagnostics() {
  const { url, anonKey } = getSupabaseConfig();
  const serviceRoleKey = getServiceRoleKey();
  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!anonKey) missing.push("SUPABASE_ANON_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  const configured = missing.length === 0;
  const fix = configured
    ? ""
    : `Set ${missing.join(", ")} on the server deployment and redeploy before enabling permanent account deletion.`;

  return {
    configured,
    missing,
    url,
    anonKey,
    serviceRoleKey,
    required: DELETE_ACCOUNT_ENV_REQUIREMENTS,
    message: configured
      ? "Account deletion is configured for this deployment."
      : "Account deletion is not configured on this deployment yet.",
    detail: configured
      ? "The server can resolve the signed-in user and issue an admin delete."
      : "The deployment is missing one or more server-side Supabase settings required for auth-user deletion.",
    fix,
  };
}

function buildDeleteUnavailablePayload(diagnostics) {
  return {
    ok: false,
    code: "delete_account_not_configured",
    configured: false,
    message: diagnostics?.message || "Permanent account delete is not available on this deployment.",
    detail: diagnostics?.detail || "Permanent account delete needs additional server-side configuration.",
    fix: "",
    missing: [],
    required: [],
  };
}

module.exports = async (req, res) => {
  const clientIp = getClientIp(req);
  if (req.method === "GET") {
    try {
      const authToken = getBearerToken(req);
      if (!authToken) {
        return sendJson(res, 401, {
          ok: false,
          code: "auth_required",
          message: "You must be signed in before checking permanent delete availability.",
        });
      }
      const user = await getSupabaseUser(authToken);
      const rateLimit = consumeRateLimit({
        bucket: "delete_account_diagnostics",
        key: `${clientIp}:${user.id}`,
        limit: 20,
        windowMs: 15 * 60 * 1000,
      });
      applyRateLimitHeaders(res, rateLimit);
      if (!rateLimit.allowed) {
        return sendJson(res, 429, {
          ok: false,
          code: "rate_limited",
          message: "Delete-account diagnostics are temporarily rate limited.",
        });
      }
      const diagnostics = getDeleteAccountConfigDiagnostics();
      return sendJson(res, 200, {
        ok: true,
        code: diagnostics.configured ? "delete_account_configured" : "delete_account_not_configured",
        configured: diagnostics.configured,
        required: [],
        missing: [],
        message: diagnostics.configured
          ? "Permanent account delete is available for this signed-in account on this deployment."
          : "Permanent account delete is not available on this deployment.",
        detail: diagnostics.configured
          ? "The deployment can verify the signed-in account and perform the delete."
          : "This deployment does not currently support permanent account delete.",
        fix: "",
      });
    } catch {
      return sendJson(res, 503, {
        ok: false,
        code: "delete_account_diagnostics_failed",
        configured: false,
        message: "Permanent account delete could not be verified.",
        detail: "The deployment did not confirm delete support for this signed-in session.",
        fix: "",
        missing: [],
        required: [],
      });
    }
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, {
      message: "Method not allowed.",
    });
  }

  try {
    const diagnostics = getDeleteAccountConfigDiagnostics();
    const authToken = getBearerToken(req);
    if (!authToken) {
      return sendJson(res, 401, {
        message: "You must be signed in before deleting your account.",
      });
    }
    const user = await getSupabaseUser(authToken);
    const rateLimit = consumeRateLimit({
      bucket: "delete_account_submit",
      key: `${clientIp}:${user.id}`,
      limit: 3,
      windowMs: 60 * 60 * 1000,
    });
    applyRateLimitHeaders(res, rateLimit);
    if (!rateLimit.allowed) {
      return sendJson(res, 429, {
        ok: false,
        code: "rate_limited",
        message: "Delete-account requests are temporarily rate limited.",
      });
    }

    if (!diagnostics.configured) {
      return sendJson(res, 503, buildDeleteUnavailablePayload(diagnostics));
    }

    const { res: deleteRes, data, text } = await fetchJson(`${diagnostics.url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: "DELETE",
      headers: {
        apikey: diagnostics.serviceRoleKey,
        Authorization: `Bearer ${diagnostics.serviceRoleKey}`,
      },
    });

    if (!deleteRes.ok) {
      return sendJson(res, deleteRes.status || 500, {
        ok: false,
        code: "delete_account_failed",
        message: data?.msg || data?.message || "Supabase could not delete this account.",
        detail: text || "",
      });
    }

    return sendJson(res, 200, {
      ok: true,
      code: "delete_account_deleted",
      userId: user.id,
      message: "Account deleted.",
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      code: "delete_account_failed",
      message: error?.message || "Account deletion failed.",
      detail: "",
      fix: "",
    });
  }
};
