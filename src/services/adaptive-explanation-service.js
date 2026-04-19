import { normalizeStructuredProvenance, PROVENANCE_ACTORS } from "./provenance-service.js";

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

export const ADAPTIVE_EXPLANATION_CATEGORIES = Object.freeze({
  coreRuleBasedLogic: "core_rule_based_logic",
  adaptivePersonalization: "adaptive_personalization",
  userDrivenModification: "user_driven_modification",
  protectiveAdjustment: "protective_adjustment",
});

export const ADAPTIVE_EXPLANATION_SOURCE_LABELS = Object.freeze({
  [ADAPTIVE_EXPLANATION_CATEGORIES.coreRuleBasedLogic]: "Plan rule",
  [ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization]: "Based on your recent training",
  [ADAPTIVE_EXPLANATION_CATEGORIES.userDrivenModification]: "You changed this",
  [ADAPTIVE_EXPLANATION_CATEGORIES.protectiveAdjustment]: "Recovery-first change",
});

const gatherAdaptivePolicyTraces = (week = null) => (
  [
    ...(toArray(week?.adaptivePolicyTraces)),
    ...(toArray(week?.weeklyIntent?.adaptivePolicyTraces)),
    ...(toArray(week?.planWeek?.adaptivePolicyTraces)),
  ]
    .filter(Boolean)
    .filter((trace, index, traces) => (
      traces.findIndex((entry) => (
        String(entry?.decisionPointId || "") === String(trace?.decisionPointId || "")
        && String(entry?.chosenActionId || "") === String(trace?.chosenActionId || "")
        && String(entry?.shadowTopActionId || "") === String(trace?.shadowTopActionId || "")
      )) === index
    ))
);

const resolveChosenCandidate = (trace = null) => {
  const actionId = String(trace?.chosenActionId || "").trim() || String(trace?.shadowTopActionId || "").trim();
  if (!actionId) return null;
  return toArray(trace?.candidateScores).find((candidate) => String(candidate?.actionId || "").trim() === actionId) || null;
};

const buildConfidenceModel = (trace = null) => {
  const chosenCandidate = resolveChosenCandidate(trace);
  const confidenceScore = Number(chosenCandidate?.confidenceScore || 0) || 0;
  const sampleSize = Number(chosenCandidate?.sampleSize || 0) || 0;
  const confidenceBand = confidenceScore >= 85 && sampleSize >= 12
    ? "high"
    : confidenceScore >= 72 && sampleSize >= 8
    ? "medium"
    : confidenceScore > 0
    ? "low"
    : "none";
  return {
    confidenceScore,
    sampleSize,
    confidenceBand,
    cautionLine: confidenceBand === "low"
      ? "Still an early read, so the plan stays ready to settle back down if the signal changes."
      : confidenceBand === "medium"
      ? "We will keep watching completion and recovery before making bigger shifts."
      : "",
  };
};

const hasProtectiveSignal = ({
  changeSummary = null,
  decision = null,
  provenance = null,
} = {}) => {
  const text = [
    changeSummary?.headline,
    changeSummary?.detail,
    changeSummary?.surfaceLine,
    provenance?.summary,
    decision?.mode,
    decision?.modeLabel,
  ].map((value) => sanitizeText(value, 220).toLowerCase()).join(" ");
  return /recover|recovery|reduced|lighter|lighten|protect|pain|injury|strain|capped|controlled/.test(text)
    || ["recovery", "reduced_load"].includes(String(decision?.mode || "").trim().toLowerCase());
};

const hasUserDrivenSignal = ({ changeSummary = null, provenance = null } = {}) => {
  const firstActor = String(provenance?.events?.[0]?.actor || "").trim().toLowerCase();
  return changeSummary?.inputType === "training_preference"
    || firstActor === PROVENANCE_ACTORS.user;
};

const buildAdaptiveActionLine = ({ trace = null, confidence = null } = {}) => {
  const decisionPointId = String(trace?.decisionPointId || "").trim();
  const chosenActionId = String(trace?.chosenActionId || "").trim();
  const context = trace?.contextSnapshot || {};
  const lowerSchedule = String(context?.scheduleReliability || "").trim().toLowerCase();
  const timeCrunched = Boolean(context?.timeCrunched);
  const outdoorPreferred = Boolean(context?.outdoorPreferred);

  if (decisionPointId === "progression_aggressiveness_band") {
    if (chosenActionId === "conservative_band") {
      return timeCrunched || ["busy", "variable"].includes(lowerSchedule)
        ? "We kept progression steadier because your recent training holds up better when the ramp stays measured."
        : "We kept progression steadier because recent completion and recovery suggest the last ramp was enough.";
    }
    if (chosenActionId === "progressive_band") {
      return "We kept progression moving because recent completion and recovery have stayed stable enough to support it.";
    }
  }
  if (decisionPointId === "deload_timing_window" && chosenActionId === "pull_forward_deload") {
    return "We brought the easier week forward because recent completion and recovery suggest you will absorb the block better with an earlier reset.";
  }
  if (decisionPointId === "time_crunched_session_format_choice") {
    if (chosenActionId === "stacked_mixed_sessions") {
      return "We combined the work into one tighter session because you tend to follow through better when the day fits your available time.";
    }
    if (chosenActionId === "short_separate_sessions") {
      return "We split the work into shorter blocks because that has been easier to finish on busy weeks.";
    }
  }
  if (decisionPointId === "hybrid_session_format_choice") {
    if (chosenActionId === "favor_mixed_sessions") {
      return "We kept more of the run and lift work in one session because your hybrid weeks hold together better when the day stays simple.";
    }
    if (chosenActionId === "favor_short_split_sessions") {
      return "We kept the run and lift work in shorter separate blocks because that has been easier to repeat across busy hybrid weeks.";
    }
  }
  if (decisionPointId === "travel_substitution_set") {
    if (chosenActionId === "hotel_gym_substitutions") {
      return "We swapped in hotel-gym options so the session still fits travel days without losing its shape.";
    }
    if (chosenActionId === "outdoor_endurance_substitutions") {
      return outdoorPreferred
        ? "We shifted this toward outdoor work so the session still fits the setup you tend to use away from the gym."
        : "We shifted this toward outdoor work so the session stays doable while you are away from your normal setup.";
    }
    if (chosenActionId === "minimal_equipment_substitutions") {
      return "We simplified the session to minimal-equipment options so the day stays doable while you are traveling.";
    }
  }
  if (decisionPointId === "hybrid_run_lift_balance_template") {
    if (chosenActionId === "run_supportive_hybrid") {
      return "We kept the key run lane in place and lightened the lower-body lift load around it because you stay more consistent when both peaks do not stack together.";
    }
    if (chosenActionId === "strength_supportive_hybrid") {
      return "We kept the lift focus in place and softened the run load because you tend to finish more when both hard efforts do not peak together.";
    }
  }
  if (decisionPointId === "hybrid_deload_timing_window" && chosenActionId === "pull_forward_hybrid_deload") {
    return "We brought the easier week forward because your hybrid weeks hold together better when the run and lift load reset before both peaks stack up.";
  }
  return confidence?.confidenceBand === "low"
    ? "We used a lighter personalized nudge from your recent training, but it is still an early read."
    : "We kept this closer to the session shape you have been finishing well lately.";
};

const buildProtectiveLine = ({ trace = null, changeSummary = null } = {}) => {
  const chosenActionId = String(trace?.chosenActionId || "").trim();
  if (chosenActionId === "conservative_band") {
    return "We kept progression steadier because recent completion and recovery suggest pushing harder would cost more than it helps right now.";
  }
  if (chosenActionId === "pull_forward_deload") {
    return "We moved the easier week closer because recent completion and recovery suggest you need the reset sooner.";
  }
  const changeText = sanitizeText(changeSummary?.surfaceLine || changeSummary?.headline || "", 180);
  if (changeText) return changeText;
  return "We kept this lighter because recent completion or recovery suggests a simpler day will hold up better.";
};

const buildUserDrivenLine = ({ changeSummary = null, planningBasisLine = "" } = {}) => (
  sanitizeText(changeSummary?.surfaceLine || changeSummary?.headline || "", 180)
  || sanitizeText(planningBasisLine, 180)
  || "We kept this aligned with the training setup you chose."
);

const buildCoreRuleLine = ({ changeSummaryLine = "", planningBasisLine = "", provenanceLine = "", displayWhy = "" } = {}) => (
  sanitizeText(changeSummaryLine, 180)
  || sanitizeText(planningBasisLine, 180)
  || sanitizeText(provenanceLine, 180)
  || sanitizeText(displayWhy, 180)
  || "This follows your current block and top priorities."
);

const buildSourceLabel = (category = ADAPTIVE_EXPLANATION_CATEGORIES.coreRuleBasedLogic) => (
  ADAPTIVE_EXPLANATION_SOURCE_LABELS[category] || ADAPTIVE_EXPLANATION_SOURCE_LABELS[ADAPTIVE_EXPLANATION_CATEGORIES.coreRuleBasedLogic]
);

const sanitizeForUi = (value = "") => sanitizeText(value, 180);

export const buildAdaptivePrescriptionExplanation = ({
  week = null,
  provenance = null,
  decision = null,
  changeSummary = null,
  planningBasis = null,
  displayWhy = "",
  changeSummaryLine = "",
  planningBasisLine = "",
  provenanceLine = "",
} = {}) => {
  const normalizedProvenance = normalizeStructuredProvenance(provenance || null, { summary: provenanceLine || "" });
  const traces = gatherAdaptivePolicyTraces(week);
  const usedAdaptiveTrace = traces.find((trace) => trace?.usedAdaptiveChoice) || null;
  const shadowTrace = traces.find((trace) => trace?.fallbackReason === "shadow_mode") || null;
  const confidence = buildConfidenceModel(usedAdaptiveTrace || shadowTrace);

  let category = ADAPTIVE_EXPLANATION_CATEGORIES.coreRuleBasedLogic;
  if (hasProtectiveSignal({ changeSummary, decision, provenance: normalizedProvenance })) {
    category = ADAPTIVE_EXPLANATION_CATEGORIES.protectiveAdjustment;
  } else if (usedAdaptiveTrace || ["workout_log", "nutrition_log", "coach_action"].includes(String(changeSummary?.inputType || "").trim().toLowerCase())) {
    category = ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization;
  } else if (hasUserDrivenSignal({ changeSummary, provenance: normalizedProvenance })) {
    category = ADAPTIVE_EXPLANATION_CATEGORIES.userDrivenModification;
  }

  const userLine = sanitizeForUi(
    category === ADAPTIVE_EXPLANATION_CATEGORIES.userDrivenModification
      ? buildUserDrivenLine({ changeSummary, planningBasisLine })
      : category === ADAPTIVE_EXPLANATION_CATEGORIES.protectiveAdjustment
      ? buildProtectiveLine({ trace: usedAdaptiveTrace, changeSummary })
      : category === ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization
      ? buildAdaptiveActionLine({ trace: usedAdaptiveTrace || shadowTrace, confidence })
      : buildCoreRuleLine({ changeSummaryLine, planningBasisLine, provenanceLine, displayWhy })
  );

  const detailLine = sanitizeForUi(
    category === ADAPTIVE_EXPLANATION_CATEGORIES.userDrivenModification
      ? planningBasisLine || provenanceLine || ""
      : category === ADAPTIVE_EXPLANATION_CATEGORIES.protectiveAdjustment
      ? confidence.cautionLine || planningBasisLine || ""
      : category === ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization
      ? confidence.cautionLine || changeSummaryLine || planningBasisLine || ""
      : provenanceLine || ""
  );

  return {
    category,
    sourceLabel: buildSourceLabel(category),
    line: userLine,
    detailLine,
    internal: {
      category,
      sourceLabel: buildSourceLabel(category),
      planningBasisLine: sanitizeText(planningBasisLine, 220),
      changeSummaryLine: sanitizeText(changeSummaryLine, 220),
      provenanceLine: sanitizeText(provenanceLine, 220),
      displayWhy: sanitizeText(displayWhy, 220),
      adaptiveDecision: usedAdaptiveTrace
        ? {
          decisionPointId: sanitizeText(usedAdaptiveTrace?.decisionPointId || "", 80),
          chosenActionId: sanitizeText(usedAdaptiveTrace?.chosenActionId || "", 80),
          decisionMode: sanitizeText(usedAdaptiveTrace?.decisionMode || "", 40),
          fallbackReason: sanitizeText(usedAdaptiveTrace?.fallbackReason || "", 80),
          confidenceBand: confidence.confidenceBand,
          confidenceScore: confidence.confidenceScore,
          sampleSize: confidence.sampleSize,
        }
        : shadowTrace
        ? {
          decisionPointId: sanitizeText(shadowTrace?.decisionPointId || "", 80),
          chosenActionId: sanitizeText(shadowTrace?.shadowTopActionId || "", 80),
          decisionMode: sanitizeText(shadowTrace?.decisionMode || "", 40),
          fallbackReason: sanitizeText(shadowTrace?.fallbackReason || "", 80),
          confidenceBand: confidence.confidenceBand,
          confidenceScore: confidence.confidenceScore,
          sampleSize: confidence.sampleSize,
        }
        : null,
      provenanceActor: sanitizeText(normalizedProvenance?.events?.[0]?.actor || "", 40),
      changeInputType: sanitizeText(changeSummary?.inputType || "", 40),
      summaryPayload: {
        headline: sanitizeText(changeSummary?.headline || "", 180),
        preserved: sanitizeText(changeSummary?.preserved || "", 180),
        surfaceLine: sanitizeText(changeSummary?.surfaceLine || "", 220),
        planningBasisSummary: sanitizeText(planningBasis?.todayLine || planningBasis?.compromiseLine || "", 220),
      },
    },
  };
};

export const buildAdaptiveOutcomeExplanation = ({
  comparison = null,
  actualCheckin = null,
} = {}) => {
  const completionKind = String(comparison?.completionKind || "").trim().toLowerCase();
  const blocker = String(actualCheckin?.blocker || "").trim().toLowerCase();
  const sameSessionFamily = Boolean(comparison?.sameSessionFamily);

  if (blocker === "pain_injury") {
    return {
      category: ADAPTIVE_EXPLANATION_CATEGORIES.protectiveAdjustment,
      sourceLabel: buildSourceLabel(ADAPTIVE_EXPLANATION_CATEGORIES.protectiveAdjustment),
      line: "Pain changed the day, so the next step should protect recovery before load builds again.",
      detailLine: "Safety wins over forcing the original dose back in.",
      internal: {
        category: ADAPTIVE_EXPLANATION_CATEGORIES.protectiveAdjustment,
        blocker: sanitizeText(blocker, 40),
        completionKind: sanitizeText(completionKind, 40),
      },
    };
  }
  if (completionKind === "skipped") {
    return {
      category: ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization,
      sourceLabel: buildSourceLabel(ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization),
      line: "We will build from the work that actually landed instead of trying to force make-up volume back in.",
      detailLine: "Missed sessions matter most when they change what your body actually absorbed.",
      internal: {
        category: ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization,
        completionKind: sanitizeText(completionKind, 40),
      },
    };
  }
  if (completionKind === "modified") {
    const category = sameSessionFamily
      ? ADAPTIVE_EXPLANATION_CATEGORIES.userDrivenModification
      : ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization;
    return {
      category,
      sourceLabel: buildSourceLabel(category),
      line: sameSessionFamily
        ? "You kept the session intent but changed the dose, which is useful signal for the next progression step."
        : "The training direction changed, so the next step should follow what really happened instead of the original label.",
      detailLine: sameSessionFamily
        ? "This helps the next plan touch stay realistic without overreacting."
        : "The next few days should match the work that actually landed.",
      internal: {
        category,
        completionKind: sanitizeText(completionKind, 40),
        sameSessionFamily,
      },
    };
  }
  if (completionKind === "custom_session") {
    return {
      category: ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization,
      sourceLabel: buildSourceLabel(ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization),
      line: "A different session happened, so the next step should build from that real work instead of the original draft.",
      detailLine: "The plan stays more trustworthy when it follows what actually happened.",
      internal: {
        category: ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization,
        completionKind: sanitizeText(completionKind, 40),
      },
    };
  }
  if (completionKind === "as_prescribed" || completionKind === "recovery_day") {
    return {
      category: ADAPTIVE_EXPLANATION_CATEGORIES.coreRuleBasedLogic,
      sourceLabel: buildSourceLabel(ADAPTIVE_EXPLANATION_CATEGORIES.coreRuleBasedLogic),
      line: "The plan matched what you could actually do, so the next step can stay steady.",
      detailLine: "Clean follow-through gives the next prescription a stronger foundation.",
      internal: {
        category: ADAPTIVE_EXPLANATION_CATEGORIES.coreRuleBasedLogic,
        completionKind: sanitizeText(completionKind, 40),
      },
    };
  }
  return {
    category: ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization,
    sourceLabel: buildSourceLabel(ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization),
    line: "The next plan touch should follow the result that actually came back from this day.",
    detailLine: "",
    internal: {
      category: ADAPTIVE_EXPLANATION_CATEGORIES.adaptivePersonalization,
      completionKind: sanitizeText(completionKind, 40),
    },
  };
};
