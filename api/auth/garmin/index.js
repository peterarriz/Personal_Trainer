const {
  ensureGarminSetup,
  generatePkcePair,
  getBearerToken,
  getRequestOrigin,
  getSupabaseUser,
  randomState,
  sendJson,
  setGarminFlowCookies,
} = require("../../_lib/garmin");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { message: "Use POST to start Garmin Connect." });
  }

  try {
    const config = ensureGarminSetup(req);
    const authToken = getBearerToken(req);
    if (!authToken) {
      return sendJson(res, 401, {
        message: "You must be signed in before connecting Garmin.",
        fix: "Sign back into Personal Trainer, then retry Garmin Connect from Settings.",
      });
    }

    await getSupabaseUser(authToken);
    const state = randomState();
    const pkce = generatePkcePair();
    const authorizeUrl = new URL(config.authorizeUrl);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", config.clientId);
    authorizeUrl.searchParams.set("redirect_uri", config.callbackUrl);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", pkce.codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    if (config.scopes) authorizeUrl.searchParams.set("scope", config.scopes);

    setGarminFlowCookies(res, req, {
      state,
      codeVerifier: pkce.codeVerifier,
      authToken,
      returnTo: getRequestOrigin(req),
    });

    return sendJson(res, 200, {
      authorizeUrl: authorizeUrl.toString(),
      callbackUrl: config.callbackUrl,
      message: "Redirecting to Garmin authorization.",
    });
  } catch (error) {
    return sendJson(res, 500, {
      message: error?.message || "Garmin setup failed before redirect.",
      fix: error?.fix || "Confirm the Garmin developer app is configured in Vercel.",
      detail: error?.detail || "",
    });
  }
};
