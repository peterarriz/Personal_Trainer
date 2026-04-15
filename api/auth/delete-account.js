const {
  fetchJson,
  getBearerToken,
  getSupabaseConfig,
  getSupabaseUser,
  sendJson,
} = require("../_lib/garmin");

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
    message: diagnostics?.message || "Account deletion is not configured on this deployment yet.",
    detail: diagnostics?.detail || "Permanent account deletion needs server-side Supabase configuration.",
    fix: diagnostics?.fix || "Set SUPABASE_SERVICE_ROLE_KEY on the server deployment and redeploy.",
    missing: Array.isArray(diagnostics?.missing) ? diagnostics.missing : [],
    required: Array.isArray(diagnostics?.required) ? diagnostics.required : DELETE_ACCOUNT_ENV_REQUIREMENTS,
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const diagnostics = getDeleteAccountConfigDiagnostics();
    return sendJson(res, 200, {
      ok: true,
      code: diagnostics.configured ? "delete_account_configured" : "delete_account_not_configured",
      configured: diagnostics.configured,
      required: diagnostics.required,
      missing: diagnostics.missing,
      message: diagnostics.message,
      detail: diagnostics.detail,
      fix: diagnostics.fix,
    });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, {
      message: "Use GET to inspect delete-account support or POST to delete the signed-in account.",
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

    if (!diagnostics.configured) {
      return sendJson(res, 503, buildDeleteUnavailablePayload(diagnostics));
    }

    const user = await getSupabaseUser(authToken);
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
      detail: error?.detail || "",
      fix: error?.fix || "",
    });
  }
};
