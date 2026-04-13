const {
  fetchJson,
  getBearerToken,
  getSupabaseConfig,
  getSupabaseUser,
  sendJson,
} = require("../_lib/garmin");

function getServiceRoleKey() {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE,
    process.env.SUPABASE_SERVICE_KEY,
  ];
  return candidates.find((value) => String(value || "").trim()) || "";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { message: "Use POST to delete the signed-in account." });
  }

  try {
    const authToken = getBearerToken(req);
    if (!authToken) {
      return sendJson(res, 401, {
        message: "You must be signed in before deleting your account.",
      });
    }

    const { url, anonKey } = getSupabaseConfig();
    const serviceRoleKey = getServiceRoleKey();
    if (!url || !anonKey || !serviceRoleKey) {
      return sendJson(res, 503, {
        message: "Account deletion is not configured on this deployment yet.",
      });
    }

    const user = await getSupabaseUser(authToken);
    const { res: deleteRes, data, text } = await fetchJson(`${url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!deleteRes.ok) {
      return sendJson(res, deleteRes.status || 500, {
        message: data?.msg || data?.message || "Supabase could not delete this account.",
        detail: text || "",
      });
    }

    return sendJson(res, 200, {
      ok: true,
      userId: user.id,
      message: "Account deleted.",
    });
  } catch (error) {
    return sendJson(res, 500, {
      message: error?.message || "Account deletion failed.",
      detail: error?.detail || "",
    });
  }
};
