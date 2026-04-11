const {
  readJsonBody,
  runIntakeProviderGateway,
  sendJson,
} = require("../_lib/ai-provider-gateway");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      code: "method_not_allowed",
      message: "Use POST for intake AI requests.",
    });
  }

  try {
    const body = await readJsonBody(req);
    const statePacket = body?.statePacket || null;
    if (!statePacket || typeof statePacket !== "object") {
      return sendJson(res, 400, {
        code: "missing_state_packet",
        message: "A typed intake state packet is required.",
      });
    }

    const gatewayResult = await runIntakeProviderGateway({
      statePacket,
      requestType: body?.requestType || "goal_interpretation",
      requestedProvider: body?.provider || "",
      requestedModel: body?.model || "",
      fetchImpl: fetch,
    });

    if (!gatewayResult.ok) {
      return sendJson(res, 502, {
        code: gatewayResult?.meta?.failureReason || "provider_gateway_failed",
        message: "Server-side intake interpretation failed.",
        meta: gatewayResult.meta,
      });
    }

    return sendJson(res, 200, {
      interpretation: gatewayResult.interpretation,
      meta: gatewayResult.meta,
    });
  } catch (error) {
    return sendJson(res, 500, {
      code: "intake_gateway_unhandled_error",
      message: error?.message || "Unhandled intake provider gateway error.",
    });
  }
};
