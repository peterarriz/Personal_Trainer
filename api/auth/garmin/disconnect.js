const {
  getBearerToken,
  getSupabaseUser,
  loadTrainerData,
  persistGarminState,
  sendJson,
} = require("../../_lib/garmin");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { message: "Use POST to disconnect Garmin." });
  }

  try {
    const authToken = getBearerToken(req);
    if (!authToken) {
      return sendJson(res, 401, {
        message: "You must be signed in before disconnecting Garmin.",
        fix: "Sign back into Personal Trainer, then retry Disconnect.",
      });
    }

    const user = await getSupabaseUser(authToken);
    const existingData = await loadTrainerData(authToken, user.id);
    const nextGarmin = {
      ...(existingData?.personalization?.connectedDevices?.garmin || {}),
      status: "not_connected",
      deviceName: "",
      oauthTokenRef: "",
      permissionsGranted: [],
      connectedAt: 0,
      activities: [],
      dailySummaries: {},
      trainingReadinessScore: null,
      lastSyncAt: 0,
      lastApiStatus: "disconnected",
      lastApiErrorAt: 0,
      lastErrorMessage: "",
      lastErrorFix: "",
    };

    await persistGarminState({
      userAccessToken: authToken,
      userId: user.id,
      existingData,
      garminPatch: nextGarmin,
      clearAuth: true,
    });

    return sendJson(res, 200, {
      message: "Garmin disconnected and the stored token was removed from Supabase.",
    });
  } catch (error) {
    return sendJson(res, 500, {
      message: error?.message || "Garmin disconnect failed.",
      fix: error?.fix || "Retry disconnect after signing in again.",
      detail: error?.detail || "",
    });
  }
};
