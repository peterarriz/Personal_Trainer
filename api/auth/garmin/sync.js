const {
  ensureGarminSetup,
  getBearerToken,
  getSupabaseUser,
  loadTrainerData,
  persistGarminState,
  sendJson,
  syncGarminData,
} = require("../../_lib/garmin");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { message: "Use POST to sync Garmin." });
  }

  try {
    const config = ensureGarminSetup(req);
    if (!config.activitiesUrl && !config.dailySummariesUrl && !config.profileUrl) {
      return sendJson(res, 500, {
        message: "Garmin OAuth is configured, but no Garmin data endpoints are set for Sync now.",
        fix: "Add GARMIN_API_ACTIVITIES_URL, GARMIN_API_DAILY_SUMMARIES_URL, and optionally GARMIN_API_PROFILE_URL from the approved Garmin integration docs in Vercel.",
      });
    }
    const authToken = getBearerToken(req);
    if (!authToken) {
      return sendJson(res, 401, {
        message: "You must be signed in before syncing Garmin.",
        fix: "Sign back into FORMA, then tap Sync now again.",
      });
    }

    const user = await getSupabaseUser(authToken);
    const existingData = await loadTrainerData(authToken, user.id);
    const garminAuth = existingData?.garminAuth;
    if (!garminAuth) {
      return sendJson(res, 400, {
        message: "No Garmin authorization is stored for this account.",
        fix: "Tap Connect Garmin first, finish the Garmin approval screen, then retry Sync now.",
      });
    }

    const { decryptPayload } = require("../../_lib/garmin");
    const tokenBundle = decryptPayload(garminAuth);
    const currentGarmin = existingData?.personalization?.connectedDevices?.garmin || {};
    const synced = await syncGarminData(config, tokenBundle, currentGarmin);

    await persistGarminState({
      userAccessToken: authToken,
      userId: user.id,
      existingData,
      garminPatch: synced.garmin,
      tokenBundle: synced.tokenBundle,
    });

    return sendJson(res, 200, {
      message: `Garmin synced at ${new Date(synced.garmin.lastSyncAt).toLocaleString()}.`,
      garmin: synced.garmin,
    });
  } catch (error) {
    return sendJson(res, 500, {
      message: error?.message || "Garmin sync failed.",
      fix: error?.fix || "Verify the Garmin API URLs and reconnect Garmin if the token expired.",
      detail: error?.detail || "",
    });
  }
};
