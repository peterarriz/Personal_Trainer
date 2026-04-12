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
    const requestType = body?.requestType || "goal_interpretation";
    if (!statePacket || typeof statePacket !== "object") {
      return sendJson(res, 400, {
        code: "missing_state_packet",
        message: "A typed intake state packet is required.",
      });
    }
    if (requestType === "missing_field_extraction") {
      const extractionRequest = body?.extractionRequest || {};
      if (!String(extractionRequest?.utterance || "").trim()) {
        return sendJson(res, 400, {
          code: "missing_extraction_utterance",
          message: "A user utterance is required for intake field extraction.",
        });
      }
      if (!Array.isArray(extractionRequest?.missingFields || extractionRequest?.missing_fields) || !(extractionRequest?.missingFields || extractionRequest?.missing_fields)?.length) {
        return sendJson(res, 400, {
          code: "missing_extraction_fields",
          message: "At least one eligible missing field is required for intake field extraction.",
        });
      }
    }

    const gatewayResult = await runIntakeProviderGateway({
      statePacket,
      requestType,
      extractionRequest: body?.extractionRequest || null,
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

    return sendJson(res, 200, requestType === "missing_field_extraction"
      ? {
          extraction: gatewayResult.extraction,
          meta: gatewayResult.meta,
        }
      : {
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
