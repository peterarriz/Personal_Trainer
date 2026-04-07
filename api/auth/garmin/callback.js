const {
  GARMIN_SCOPE_LABELS,
  ensureGarminSetup,
  exchangeCodeForToken,
  getSupabaseUser,
  loadTrainerData,
  parseCookies,
  persistGarminState,
  redirectToApp,
  sendHtml,
  syncGarminData,
} = require("../../_lib/garmin");

module.exports = async (req, res) => {
  const params = new URL(req.url, "https://callback.local").searchParams;

  try {
    const cookies = parseCookies(req);
    const config = ensureGarminSetup(req);

    if (params.get("error")) {
      const reason = params.get("error_description") || params.get("error");
      const fix = /redirect/i.test(reason)
        ? `Set the Garmin developer portal redirect URI to exactly ${config.callbackUrl}.`
        : "Retry the Garmin authorization flow from Settings after confirming your Garmin app approval.";
      return redirectToApp(res, req, "error", `Garmin authorization failed: ${reason}`, fix);
    }

    if (!params.get("code")) {
      return redirectToApp(res, req, "error", "Garmin did not return an authorization code.", "Retry Garmin Connect from Settings.");
    }

    if (!cookies.pt_garmin_state || params.get("state") !== cookies.pt_garmin_state) {
      return redirectToApp(res, req, "error", "Garmin callback state check failed.", "Retry Garmin Connect from Settings. If the problem persists, clear cookies for this site and try again.");
    }

    if (!cookies.pt_garmin_auth) {
      return redirectToApp(res, req, "error", "Your app session expired before Garmin could finish connecting.", "Sign in again, then reconnect Garmin from Settings.");
    }
    if (!cookies.pt_garmin_verifier) {
      return redirectToApp(res, req, "error", "Garmin callback is missing the PKCE verifier.", "Retry Garmin Connect from Settings. If this persists, clear cookies for this site and try again.");
    }

    const user = await getSupabaseUser(cookies.pt_garmin_auth);
    const existingData = await loadTrainerData(cookies.pt_garmin_auth, user.id);
    const tokenBundle = await exchangeCodeForToken(config, params.get("code"), cookies.pt_garmin_verifier);
    const currentGarmin = existingData?.personalization?.connectedDevices?.garmin || {};

    let nextGarmin = {
      ...currentGarmin,
      status: "connected",
      deviceName: currentGarmin.deviceName || "Garmin account",
      oauthTokenRef: "encrypted_supabase_row",
      permissionsGranted: GARMIN_SCOPE_LABELS,
      connectedAt: currentGarmin.connectedAt || Date.now(),
      lastApiStatus: "ok",
      lastApiErrorAt: 0,
      lastErrorMessage: "",
      lastErrorFix: "",
    };
    let nextTokenBundle = tokenBundle;
    let successMessage = "Garmin connected.";

    try {
      if (config.activitiesUrl || config.dailySummariesUrl || config.profileUrl) {
        const synced = await syncGarminData(config, tokenBundle, nextGarmin);
        nextGarmin = { ...nextGarmin, ...synced.garmin };
        nextTokenBundle = synced.tokenBundle;
        successMessage = `Garmin connected. Last sync ${new Date(nextGarmin.lastSyncAt).toLocaleString()}.`;
      }
    } catch (syncError) {
      nextGarmin = {
        ...nextGarmin,
        lastApiStatus: syncError?.status === 401 ? "reauth_required" : "sync_pending",
        lastApiErrorAt: Date.now(),
        lastErrorMessage: syncError?.message || "Initial Garmin sync could not complete.",
        lastErrorFix: syncError?.fix || "Use Sync now in Settings after confirming the Garmin API endpoints.",
      };
      successMessage = "Garmin connected, but the initial sync needs attention in Settings.";
    }

    await persistGarminState({
      userAccessToken: cookies.pt_garmin_auth,
      userId: user.id,
      existingData,
      garminPatch: nextGarmin,
      tokenBundle: nextTokenBundle,
    });

    return redirectToApp(res, req, "connected", successMessage, nextGarmin.lastErrorFix || "");
  } catch (error) {
    if (req.headers.accept && String(req.headers.accept).includes("text/html")) {
      return sendHtml(res, 500, {
        title: "Garmin connection failed",
        message: error?.message || "Garmin callback failed before the app could recover.",
        fix: error?.fix || "Retry Garmin Connect from Settings after checking the Garmin app configuration.",
        ctaHref: "/?tab=settings",
        ctaLabel: "Return to Settings",
      });
    }
    return redirectToApp(
      res,
      req,
      "error",
      error?.message || "Garmin callback failed before the app could recover.",
      error?.fix || "Retry Garmin Connect from Settings after checking the Garmin app configuration."
    );
  }
};
