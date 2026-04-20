const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const uniqueStrings = (items = [], maxLength = 180) => {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => sanitizeText(item, maxLength))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const COACH_PREVIEW_COMMIT_JOBS = Object.freeze({
  adjustToday: "adjust_today",
  adjustWeek: "adjust_week",
  askCoach: "ask_coach",
});

export const COACH_PREVIEW_COMMIT_CARD_RULES = Object.freeze({
  hierarchy: [
    "Recommendation headline stays first, but it no longer carries the main analytical weight by itself.",
    "Consequence leads the body. Prefer a numeric delta plus a preserved anchor, for example: Volume -12%, long run stays.",
    "Why drops into a quieter support register. It should justify the call, not fight the consequence for attention.",
    "Commit closes the card. The CTA should read like a deliberate plan change, not a generic accept button.",
  ],
  consequenceLeadRule: "Format the lead as delta first, preserved anchor second. Use commas, not long sentences.",
  consequenceToneRule: "Use direct outcome language. Avoid advisory hedging once the preview is deterministic and ready to commit.",
  whyToneRule: "Why stays one calm sentence in a lower visual register.",
  commitRule: "Primary CTA uses Commit language and names the scope when possible: today, this week, suggested change.",
  trustRule: "Keep the trust line close to Commit: nothing changes until this version is committed.",
  consequenceOptionalRule: "Consequence is optional only when the preview has no honest numeric delta, no preserved anchor worth surfacing, and the outcome is already fully legible in the headline without inventing extra specificity.",
});

export const COACH_PREVIEW_COMMIT_CARD_EXAMPLES = Object.freeze({
  [COACH_PREVIEW_COMMIT_JOBS.adjustToday]: Object.freeze({
    job: COACH_PREVIEW_COMMIT_JOBS.adjustToday,
    previewLabel: "Preview",
    displaySource: "Adjust today",
    recommendation: "Swap the full session for a recovery-first version",
    consequenceLead: "Duration -15 min, impact lower",
    consequenceBody: "Warm-up stays, sharp work comes out, and tomorrow holds as written.",
    consequenceChips: ["Today only", "Tomorrow unchanged"],
    why: "Sleep and soreness are suppressing quality more than the extra volume would help.",
    commitScopeLine: "This replaces the live plan for today only.",
    commitLabel: "Commit today's change",
    keepLabel: "Keep current plan",
    auditLine: "Nothing changes until you commit this version.",
    detailsLines: [
      "Tempo work drops out and the session becomes a lighter aerobic plus mobility slot.",
      "Tomorrow does not move.",
    ],
    numericDeltaKnown: true,
    preservedAnchorKnown: true,
  }),
  [COACH_PREVIEW_COMMIT_JOBS.adjustWeek]: Object.freeze({
    job: COACH_PREVIEW_COMMIT_JOBS.adjustWeek,
    previewLabel: "Preview",
    displaySource: "Adjust this week",
    recommendation: "Reduce this week's volume",
    consequenceLead: "Volume -12%, long run stays",
    consequenceBody: "The week gets smaller without changing the direction of the block.",
    consequenceChips: ["Week 6 only", "Strength stays"],
    why: "The cleanest win right now is protecting completions instead of forcing the full load.",
    commitScopeLine: "This replaces the live plan for the current week only.",
    commitLabel: "Commit weekly change",
    keepLabel: "Keep current plan",
    auditLine: "Nothing changes until you commit this version.",
    detailsLines: [
      "Nonessential accessory work trims back first.",
      "The long run stays in place, but the total week lands lighter.",
    ],
    numericDeltaKnown: true,
    preservedAnchorKnown: true,
  }),
  [COACH_PREVIEW_COMMIT_JOBS.askCoach]: Object.freeze({
    job: COACH_PREVIEW_COMMIT_JOBS.askCoach,
    previewLabel: "Preview",
    displaySource: "Ask coach",
    recommendation: "Add one small strength progression next week",
    consequenceLead: "Bench +1 top set, run quality stays",
    consequenceBody: "The suggested change nudges the strength lane without asking the endurance side to pay for it.",
    consequenceChips: ["Next 2 weeks", "Recovery unchanged"],
    why: "The last stretch supports a nudge, but the endurance lane still has to stay clean.",
    commitScopeLine: "This makes the suggested change live for the next planned stretch.",
    commitLabel: "Commit suggested change",
    keepLabel: "Keep current plan",
    auditLine: "Nothing changes until you commit this version.",
    detailsLines: [
      "The extra set lands on the bench top work only.",
      "Run quality and long-run structure stay untouched.",
    ],
    numericDeltaKnown: true,
    preservedAnchorKnown: true,
  }),
});

export const shouldShowCoachPreviewConsequence = ({
  deterministicActionReady = true,
  consequenceLead = "",
  consequenceChips = [],
  numericDeltaKnown = false,
  preservedAnchorKnown = false,
  materiallyDistinctOutcome = true,
} = {}) => {
  if (!deterministicActionReady) return false;
  if (sanitizeText(consequenceLead, 180)) return true;
  if (uniqueStrings(consequenceChips, 80).length > 0) return true;
  if (numericDeltaKnown || preservedAnchorKnown) return true;
  if (!materiallyDistinctOutcome) return false;
  return false;
};

export const buildCoachPreviewCommitCardModel = ({
  job = COACH_PREVIEW_COMMIT_JOBS.adjustWeek,
  previewLabel = "",
  displaySource = "",
  recommendation = "",
  consequenceLead = "",
  consequenceBody = "",
  consequenceChips = [],
  why = "",
  commitScopeLine = "",
  commitLabel = "",
  keepLabel = "",
  auditLine = "",
  detailsLines = [],
  numericDeltaKnown = false,
  preservedAnchorKnown = false,
  materiallyDistinctOutcome = true,
  deterministicActionReady = true,
} = {}) => {
  const example = COACH_PREVIEW_COMMIT_CARD_EXAMPLES[job] || COACH_PREVIEW_COMMIT_CARD_EXAMPLES[COACH_PREVIEW_COMMIT_JOBS.adjustWeek];
  const resolvedConsequenceLead = sanitizeText(consequenceLead || example.consequenceLead || "", 180);
  const resolvedConsequenceChips = uniqueStrings(
    Array.isArray(consequenceChips) && consequenceChips.length ? consequenceChips : example.consequenceChips,
    80
  );
  const showConsequence = shouldShowCoachPreviewConsequence({
    deterministicActionReady,
    consequenceLead: resolvedConsequenceLead,
    consequenceChips: resolvedConsequenceChips,
    numericDeltaKnown: Boolean(numericDeltaKnown || example.numericDeltaKnown),
    preservedAnchorKnown: Boolean(preservedAnchorKnown || example.preservedAnchorKnown),
    materiallyDistinctOutcome,
  });

  return {
    job,
    previewLabel: sanitizeText(previewLabel || example.previewLabel || "Preview", 40),
    displaySource: sanitizeText(displaySource || example.displaySource || "", 80),
    recommendation: sanitizeText(recommendation || example.recommendation || "", 180),
    showConsequence,
    consequenceLabel: "What changes",
    consequenceLead: resolvedConsequenceLead,
    consequenceBody: sanitizeText(consequenceBody || example.consequenceBody || "", 220),
    consequenceChips: resolvedConsequenceChips,
    whyLabel: "Why this is the call",
    why: sanitizeText(why || example.why || "", 220),
    commitLabel: sanitizeText(commitLabel || example.commitLabel || "Commit this change", 80),
    keepLabel: sanitizeText(keepLabel || example.keepLabel || "Keep current plan", 60),
    commitScopeLine: sanitizeText(commitScopeLine || example.commitScopeLine || "", 180),
    auditLine: sanitizeText(auditLine || example.auditLine || "", 180),
    detailsLines: uniqueStrings(
      Array.isArray(detailsLines) && detailsLines.length ? detailsLines : example.detailsLines,
      220
    ).slice(0, 3),
  };
};
