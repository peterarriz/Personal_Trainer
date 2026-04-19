import { validateAdaptiveLearningEvent } from "../adaptive-learning-event-service.js";
import {
  hashString,
  sanitizeText,
  stableStringify,
  toArray,
} from "./shared.js";

const buildAnalysisActorId = (actorId = "") => `actor_${hashString(actorId || "unknown_actor")}`;

const normalizeSourceEnvelope = (source = null, parentMeta = {}) => {
  if (!source) return [];
  if (Array.isArray(source)) {
    return source.flatMap((entry, index) => normalizeSourceEnvelope(entry, {
      ...parentMeta,
      sourceIndex: parentMeta.sourceIndex ?? index,
    }));
  }
  if (source?.adaptiveLearning?.events) {
    return [{
      sourceId: sanitizeText(source?.sourceId || parentMeta.sourceId || "", 120),
      actorId: sanitizeText(source?.adaptiveLearning?.actorId || source?.actorId || parentMeta.actorId || "", 120),
      userId: sanitizeText(source?.adaptiveLearning?.userId || source?.userId || parentMeta.userId || "", 120),
      events: source.adaptiveLearning.events || [],
      pendingEventIds: source?.adaptiveLearning?.pendingEventIds || [],
      sourceType: sanitizeText(source?.sourceType || parentMeta.sourceType || "adaptive_snapshot", 80),
    }];
  }
  if (source?.data?.adaptiveLearning?.events) {
    return [{
      sourceId: sanitizeText(source?.id || source?.sourceId || parentMeta.sourceId || "", 120),
      actorId: sanitizeText(source?.data?.adaptiveLearning?.actorId || source?.actorId || parentMeta.actorId || "", 120),
      userId: sanitizeText(source?.data?.adaptiveLearning?.userId || source?.userId || parentMeta.userId || "", 120),
      events: source.data.adaptiveLearning.events || [],
      pendingEventIds: source?.data?.adaptiveLearning?.pendingEventIds || [],
      sourceType: sanitizeText(source?.sourceType || parentMeta.sourceType || "persisted_trainer_payload", 80),
    }];
  }
  if (source?.events) {
    return [{
      sourceId: sanitizeText(source?.sourceId || parentMeta.sourceId || "", 120),
      actorId: sanitizeText(source?.actorId || parentMeta.actorId || "", 120),
      userId: sanitizeText(source?.userId || parentMeta.userId || "", 120),
      events: source.events || [],
      pendingEventIds: source?.pendingEventIds || [],
      sourceType: sanitizeText(source?.sourceType || parentMeta.sourceType || "event_bundle", 80),
    }];
  }
  if (source?.rows || source?.records || source?.sources) {
    return toArray(source?.rows || source?.records || source?.sources).flatMap((entry, index) => normalizeSourceEnvelope(entry, {
      ...parentMeta,
      sourceIndex: parentMeta.sourceIndex ?? index,
      sourceId: sanitizeText(source?.sourceId || parentMeta.sourceId || "", 120),
      sourceType: sanitizeText(source?.sourceType || parentMeta.sourceType || "collection", 80),
    }));
  }
  return [];
};

export const extractAdaptiveLearningEvents = ({
  sources = [],
} = {}) => {
  const normalizedEvents = [];
  const discarded = [];
  const envelopes = normalizeSourceEnvelope(sources);
  envelopes.forEach((envelope, envelopeIndex) => {
    toArray(envelope?.events).forEach((rawEvent, eventIndex) => {
      try {
        const event = validateAdaptiveLearningEvent(rawEvent);
        const rawActorId = sanitizeText(event?.actorId || envelope?.actorId || "", 120) || `unknown_actor_${envelopeIndex}`;
        normalizedEvents.push({
          analysisActorId: buildAnalysisActorId(rawActorId),
          occurredAt: Number(event.occurredAt || 0) || 0,
          occurredDate: new Date(Number(event.occurredAt || 0) || 0).toISOString(),
          eventId: sanitizeText(event.eventId, 160),
          eventName: sanitizeText(event.eventName, 120),
          version: Number(event.version || 1) || 1,
          schemaVersion: sanitizeText(event.schemaVersion || "", 40),
          sourceId: sanitizeText(envelope?.sourceId || `source_${envelopeIndex + 1}`, 120),
          sourceType: sanitizeText(envelope?.sourceType || "adaptive_snapshot", 80),
          pendingInSource: toArray(envelope?.pendingEventIds).includes(event.eventId),
          actor: {
            analysisActorId: buildAnalysisActorId(rawActorId),
            hasCloudIdentity: Boolean(event?.userId || envelope?.userId),
          },
          payload: JSON.parse(stableStringify(event.payload || {})),
        });
      } catch (error) {
        discarded.push({
          sourceId: sanitizeText(envelope?.sourceId || `source_${envelopeIndex + 1}`, 120),
          sourceType: sanitizeText(envelope?.sourceType || "adaptive_snapshot", 80),
          eventIndex,
          reason: sanitizeText(error?.message || "invalid_event", 220),
        });
      }
    });
  });
  normalizedEvents.sort((left, right) => (
    Number(left?.occurredAt || 0) - Number(right?.occurredAt || 0)
    || String(left?.analysisActorId || "").localeCompare(String(right?.analysisActorId || ""))
    || String(left?.eventId || "").localeCompare(String(right?.eventId || ""))
  ));
  return {
    events: normalizedEvents,
    discarded,
    summary: {
      sourceCount: envelopes.length,
      actorCount: new Set(normalizedEvents.map((event) => event.analysisActorId)).size,
      eventCount: normalizedEvents.length,
      discardedCount: discarded.length,
    },
  };
};
