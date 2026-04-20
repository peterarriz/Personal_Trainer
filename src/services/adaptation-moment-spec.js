const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const uniqueStrings = (items = [], maxLength = 220) => {
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

export const collapseToSentence = (value = "", maxLength = 180) => {
  const normalized = sanitizeText(value, Math.max(maxLength * 2, 220));
  if (!normalized) return "";
  const sentenceMatch = normalized.match(/^(.+?[.!?])(?:\s|$)/);
  return sanitizeText(sentenceMatch ? sentenceMatch[1] : normalized, maxLength);
};

export const ADAPTATION_MOMENT_SOURCE_LABELS = Object.freeze({
  planRule: "Plan rule",
  recentTraining: "Based on your recent training",
  userChanged: "You changed this",
  recoveryFirst: "Recovery-first change",
});

export const ADAPTATION_MOMENT_KIND_SPECS = Object.freeze({
  reduced_load: Object.freeze({
    label: "Reduced load",
    icon: "reduced_load",
    tone: "amber",
    sourceLabel: ADAPTATION_MOMENT_SOURCE_LABELS.recentTraining,
    useWhen: "The session still happens, but the dose, density, or intensity comes down.",
    collapsedRule: "Name what stayed, name what came down, and tie it to protecting the rest of the week.",
    detailRule: "Expanded rationale should explain the lighter prescription, the current signal behind it, and what part of the week still stays intact.",
    exampleWhy: "The session stays in place, but the load comes down so you can keep the week moving without forcing it.",
    exampleDetails: [
      "What changed: shorter work blocks and a lower cap on hard effort.",
      "Why now: recent completion and recovery say the original dose would ask for too much today.",
      "What stays protected: the rhythm of the week and the next key session.",
    ],
  }),
  protect: Object.freeze({
    label: "Protect",
    icon: "protect",
    tone: "sage",
    sourceLabel: ADAPTATION_MOMENT_SOURCE_LABELS.recoveryFirst,
    useWhen: "The plan is actively protecting recovery, pain sensitivity, or accumulated fatigue.",
    collapsedRule: "Lead with protection as an intentional coaching decision, not as damage control or a scolding note.",
    detailRule: "Expanded rationale should name the signal being respected, the risk being avoided, and the important work this protects next.",
    exampleWhy: "Today is lighter because recovery needs to catch up before the next meaningful push.",
    exampleDetails: [
      "What changed: the sharpest work was pulled back or swapped out.",
      "Why now: pain, fatigue, or poor recovery is loud enough that forcing the full version would cost more than it gives back.",
      "What stays protected: the next useful training exposure and the wider block.",
    ],
  }),
  drift_downgrade: Object.freeze({
    label: "Simplified fit",
    icon: "drift_downgrade",
    tone: "slate",
    sourceLabel: ADAPTATION_MOMENT_SOURCE_LABELS.recentTraining,
    useWhen: "The next stretch of the plan has to simplify because recent execution drifted away from the written version.",
    collapsedRule: "Describe the simplification calmly. Explain that the plan is meeting reality rather than pretending strict execution is still true.",
    detailRule: "Expanded rationale should cover what drifted, how the next week or block is being simplified, and what standard earns a tighter fit again.",
    exampleWhy: "The next stretch gets simpler because recent execution moved too far from the written version to keep pretending it still fits cleanly.",
    exampleDetails: [
      "What changed: the week or block is running in a simpler fit instead of the stricter written version.",
      "Why now: missed key work, repeated modifications, or low completion changed what the plan can honestly ask for.",
      "What earns next: a steadier week of completion and cleaner support work brings the stronger version back into play.",
    ],
  }),
  coach_accepted: Object.freeze({
    label: "Coach change",
    icon: "coach_accepted",
    tone: "emerald",
    sourceLabel: ADAPTATION_MOMENT_SOURCE_LABELS.userChanged,
    useWhen: "The user accepted a Coach recommendation that materially changed today or the current week.",
    collapsedRule: "Acknowledge the choice and the resulting plan change in one clean sentence. Do not show audit jargon or proposal wording.",
    detailRule: "Expanded rationale should show the accepted move, why it was the better call, and how long its effect lasts.",
    exampleWhy: "You accepted a cleaner change, so the plan now follows that call instead of the original version.",
    exampleDetails: [
      "What changed: the accepted Coach move is now the live version of the day or week.",
      "Why now: the accepted change fit the current constraint better than the original setup.",
      "How long it lasts: the effect should be scoped clearly to today, this week, or the next planned touchpoint.",
    ],
  }),
  user_edit: Object.freeze({
    label: "User change",
    icon: "user_edit",
    tone: "blue",
    sourceLabel: ADAPTATION_MOMENT_SOURCE_LABELS.userChanged,
    useWhen: "A direct user edit to goals, equipment, availability, or setup caused the adaptation.",
    collapsedRule: "Treat the change as user-led and factual. Reflect the new reality without sounding like the app overruled the athlete.",
    detailRule: "Expanded rationale should name the user change, the direct plan effect, and what stayed stable despite the edit.",
    exampleWhy: "The plan shifted because you changed the setup it has to work inside.",
    exampleDetails: [
      "What changed: schedule, equipment, goal emphasis, or another plan-driving input moved.",
      "Why it matters: the plan has to match the setup you actually have, not the one it started from.",
      "What stayed stable: the main goal direction or weekly rhythm wherever possible.",
    ],
  }),
  carry_forward: Object.freeze({
    label: "Carry forward",
    icon: "carry_forward",
    tone: "teal",
    sourceLabel: ADAPTATION_MOMENT_SOURCE_LABELS.planRule,
    useWhen: "A missed or displaced key session is carried forward instead of being chased immediately.",
    collapsedRule: "Name what moved and why it moved. Make it clear that not every missed session deserves instant repayment.",
    detailRule: "Expanded rationale should explain what was moved, what was intentionally not doubled up, and where the carried work lands next.",
    exampleWhy: "The missed key work moves forward instead of getting piled on top of everything else.",
    exampleDetails: [
      "What changed: the key session lands later in the week or in the next workable slot.",
      "Why now: forcing it immediately would turn the week into catch-up instead of training.",
      "What stayed protected: recovery spacing and the higher-priority work already in place.",
    ],
  }),
  progression: Object.freeze({
    label: "Earned push",
    icon: "progression",
    tone: "crimson",
    sourceLabel: ADAPTATION_MOMENT_SOURCE_LABELS.recentTraining,
    useWhen: "Recent consistency and recovery justify a small progression.",
    collapsedRule: "Frame the progression as earned and measured. Avoid hype, celebration, or gamified language.",
    detailRule: "Expanded rationale should identify the evidence behind the progression, the exact push being added, and the guardrail that keeps it honest.",
    exampleWhy: "Recent work has held well enough to earn a slightly stronger push here.",
    exampleDetails: [
      "What changed: one notch more duration, density, or load showed up in the plan.",
      "Why now: the last stretch of training held together without obvious recovery fallout.",
      "Guardrail: the progression stays small enough to reverse quickly if the signal softens.",
    ],
  }),
});

export const ADAPTATION_MOMENT_PLACEMENT_SPECS = Object.freeze({
  today: Object.freeze({
    placement: "Directly under the Today hero support and above the visible session breakdown.",
    defaultState: "Collapsed by default. Expand inline without opening a second disclosure.",
    replaces: "Replaces the fragmented Why this changed block, reduced-load note, and extra adaptation detail lines.",
    rule: "Render only one adaptation moment for the current day. If multiple reasons exist, summarize them into the strongest coaching reason and keep the rest in the expanded body.",
  }),
  program: Object.freeze({
    placement: "Inside the Program hero, directly below the current-week headline and above the trajectory header.",
    defaultState: "Expanded by default when the whole week or block changed. Otherwise collapsed.",
    replaces: "Replaces the standalone program-change-summary line and absorbs drift-downgrade copy into one reusable pattern.",
    rule: "Program only uses the component for changes that affect the week or block. One-off day swaps stay in Today or Log.",
  }),
  log: Object.freeze({
    placement: "Immediately below the planned-session summary and above the editable actuals or set controls.",
    defaultState: "Collapsed by default, with one tap to show the full rationale before logging.",
    replaces: "Replaces repeated explanation fragments near the session summary, log hero, and reduced-load reminders.",
    rule: "Log should mirror the same reason the athlete saw in Today. It can add logging context in the expanded body, but it should not invent a second story.",
  }),
  coach: Object.freeze({
    placement: "Inside the top quiet panel under the canonical session label, before mode cards or accepted-change history.",
    defaultState: "Collapsed while previewing. Expanded after acceptance when the user needs the full rationale for the live change.",
    replaces: "Replaces the separate Latest change pill plus the extra accepted-change detail line.",
    rule: "Coach previews can keep their own recommendation card copy, but the shared adaptation moment becomes the single source of truth once a change is live.",
  }),
});

const resolveKindSpec = (kind = "") => ADAPTATION_MOMENT_KIND_SPECS[sanitizeText(kind, 60).toLowerCase()] || ADAPTATION_MOMENT_KIND_SPECS.reduced_load;

export const buildAdaptationMomentModel = ({
  kind = "reduced_load",
  sourceLabel = "",
  why = "",
  rationale = "",
  detailLines = [],
  preservedLine = "",
  impactLine = "",
} = {}) => {
  const spec = resolveKindSpec(kind);
  const normalizedWhy = collapseToSentence(why || spec.exampleWhy, 180);
  const providedDetailLines = uniqueStrings([
    rationale,
    ...(Array.isArray(detailLines) ? detailLines : []),
    preservedLine,
    impactLine,
  ], 220);
  const normalizedDetailLines = uniqueStrings([
    ...(providedDetailLines.length ? providedDetailLines : (Array.isArray(spec.exampleDetails) ? spec.exampleDetails : [])),
  ], 220);

  return {
    kind: sanitizeText(kind, 60).toLowerCase() || "reduced_load",
    label: spec.label,
    icon: spec.icon,
    tone: spec.tone,
    sourceLabel: sanitizeText(sourceLabel || spec.sourceLabel || "", 80),
    why: normalizedWhy,
    detailLines: normalizedDetailLines,
    useWhen: spec.useWhen,
    collapsedRule: spec.collapsedRule,
    detailRule: spec.detailRule,
  };
};
