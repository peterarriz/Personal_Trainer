import React from "react";
import {
  SurfaceCard,
  SurfaceDisclosure,
  SurfaceHeading,
  SurfaceMetaRow,
  SurfacePill,
  SurfaceQuietPanel,
} from "./SurfaceSystem.jsx";
import { IntakeTrajectoryArcDisclosure } from "./IntakeTrajectoryArcDisclosure.jsx";

const sanitizeText = (value = "", maxLength = 220) => String(value || "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maxLength);

const toArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

const buildTone = (tone = "") => {
  if (tone === "quality") {
    return {
      color: "#9fe8c7",
      background: "rgba(39,245,154,0.12)",
      borderColor: "rgba(39,245,154,0.24)",
    };
  }
  if (tone === "strength") {
    return {
      color: "#b9ecff",
      background: "rgba(0,194,255,0.12)",
      borderColor: "rgba(0,194,255,0.24)",
    };
  }
  if (tone === "hybrid") {
    return {
      color: "#ffd9a8",
      background: "rgba(255,138,0,0.12)",
      borderColor: "rgba(255,138,0,0.24)",
    };
  }
  if (tone === "rest") {
    return {
      color: "#dbe7f6",
      background: "rgba(111,148,198,0.12)",
      borderColor: "rgba(111,148,198,0.2)",
    };
  }
  return {
    color: "#dbe7f6",
    background: "rgba(111,148,198,0.12)",
    borderColor: "rgba(111,148,198,0.2)",
  };
};

const buildPhaseSupport = (phase = "") => {
  if (phase === "goals") {
    return "Choose the goal and the week-one realities. The draft updates in place.";
  }
  if (phase === "clarify" || phase === "confirm") {
    return "The draft, what we will track, and what still needs clarity stay visible while you tighten the first plan.";
  }
  if (phase === "building") {
    return "This draft is turning into your first real week now.";
  }
  return "The setup updates in place as you move through it.";
};

const buildSummarySections = (summaryRail = null) => [
  {
    key: "what-you-said",
    label: "What you said",
    items: toArray(summaryRail?.yourWords),
  },
  {
    key: "optimize-first",
    label: "What we'll optimize first",
    items: toArray(summaryRail?.interpretedGoals).map((goal) => sanitizeText(
      `${goal?.priorityLabel ? `${goal.priorityLabel}: ` : ""}${goal?.summary || ""}${goal?.goalTypeLabel ? ` • ${goal.goalTypeLabel}` : ""}${goal?.timingLabel ? ` • ${goal.timingLabel}` : ""}`,
      220
    )).filter(Boolean),
  },
  {
    key: "track-first",
    label: "What we'll track",
    items: toArray(summaryRail?.trackingItems),
  },
  {
    key: "still-open",
    label: "What still needs clarity",
    items: toArray(summaryRail?.fuzzyItems),
  },
].map((section) => ({
  ...section,
  items: section.items.length ? section.items : ["Not set yet."],
}));

export function IntakeSummaryRail({
  summaryRail = null,
  previewModel = null,
  phase = "goals",
  confirmationStatusLabel = "",
}) {
  const sections = buildSummarySections(summaryRail);
  const tradeoffItems = toArray(summaryRail?.tradeoffItems).filter(Boolean);
  const previewReady = Boolean(previewModel?.isReady);

  return (
    <SurfaceCard
      data-testid="intake-summary-rail"
      variant="subtle"
      style={{
        display: "grid",
        gap: "0.8rem",
        borderRadius: 24,
        padding: "0.95rem",
        background: "rgba(8,14,25,0.76)",
        border: "1px solid rgba(111,148,198,0.16)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.24)",
        position: "sticky",
        top: "1rem",
      }}
    >
      <SurfaceHeading
        eyebrow="Live summary"
        title="What your first week is built on"
        supporting={buildPhaseSupport(phase)}
        eyebrowColor="#8fa5c8"
        titleColor="#f8fbff"
        supportingColor="#8fa5c8"
      />

      <SurfaceMetaRow>
        <SurfacePill style={{ color: "#dbe7f6", background: "rgba(111,148,198,0.12)", borderColor: "rgba(111,148,198,0.2)" }}>
          {phase === "goals" ? "Draft only" : "Ready to confirm"}
        </SurfacePill>
        {!!confirmationStatusLabel && (
          <SurfacePill style={{ color: "#b9ecff", background: "rgba(0,194,255,0.12)", borderColor: "rgba(0,194,255,0.24)" }}>
            {confirmationStatusLabel}
          </SurfacePill>
        )}
        <SurfacePill style={{ color: previewReady ? "#9fe8c7" : "#8fa5c8", background: previewReady ? "rgba(39,245,154,0.12)" : "rgba(111,148,198,0.12)", borderColor: previewReady ? "rgba(39,245,154,0.24)" : "rgba(111,148,198,0.2)" }}>
          {previewReady ? "Preview ready" : "Preview soon"}
        </SurfacePill>
      </SurfaceMetaRow>

      <SurfaceQuietPanel
        data-testid="intake-plan-preview"
        style={{
          display: "grid",
          gap: "0.65rem",
          padding: "0.8rem",
          borderRadius: 20,
          border: "1px solid rgba(111,148,198,0.14)",
          background: "rgba(4,10,18,0.52)",
        }}
      >
        <SurfaceHeading
          eyebrow="Plan shape"
          title="Week 1 preview"
          supporting={previewReady ? previewModel.heading : "Shows up as soon as the goal and week-one realities are clear."}
          eyebrowColor="#8fa5c8"
          titleColor="#f8fbff"
          supportingColor="#dbe7f6"
        />
        {previewReady ? (
          <>
            {!!previewModel?.trajectoryLine && (
              <div style={{ fontSize: "0.52rem", color: "#8fa5c8", lineHeight: 1.5 }}>
                {previewModel.trajectoryLine}
              </div>
            )}
            {!!previewModel?.nextMilestoneLine && (
              <div data-testid="intake-plan-preview-milestone" style={{ fontSize: "0.52rem", color: "#8fa5c8", lineHeight: 1.5 }}>
                {previewModel.nextMilestoneLine}
              </div>
            )}
            <div style={{ display: "grid", gap: "0.6rem" }}>
              {toArray(previewModel?.weeks).map((week, index) => (
                <div
                  key={week?.key || index}
                  data-testid={`intake-plan-preview-week-${index + 1}`}
                  style={{
                    display: "grid",
                    gap: "0.42rem",
                    padding: "0.75rem",
                    borderRadius: 18,
                    border: "1px solid rgba(111,148,198,0.14)",
                    background: "rgba(8,14,25,0.74)",
                  }}
                >
                  <div style={{ display: "grid", gap: "0.16rem" }}>
                    <div style={{ fontSize: "0.46rem", color: "#8fa5c8", letterSpacing: "0.12em" }}>{week?.label || `Week ${index + 1}`}</div>
                    <div style={{ fontSize: "0.58rem", color: "#f8fbff", lineHeight: 1.45 }}>{week?.headline || "Draft week"}</div>
                    {!!week?.summary && (
                      <div style={{ fontSize: "0.5rem", color: "#dbe7f6", lineHeight: 1.45 }}>{week.summary}</div>
                    )}
                    {!!week?.milestone && (
                      <div style={{ fontSize: "0.48rem", color: "#8fa5c8", lineHeight: 1.45 }}>{week.milestone}</div>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(72px,1fr))", gap: "0.35rem" }}>
                    {toArray(week?.cells).map((cell, cellIndex) => {
                      const tone = buildTone(cell?.tone || "");
                      return (
                        <div
                          key={`${week?.key || index}_${cell?.dayLabel || cellIndex}`}
                          style={{
                            display: "grid",
                            gap: "0.1rem",
                            minWidth: 0,
                            padding: "0.45rem",
                            borderRadius: 14,
                            border: `1px solid ${tone.borderColor}`,
                            background: tone.background,
                          }}
                        >
                          <div style={{ fontSize: "0.42rem", color: tone.color, letterSpacing: "0.08em" }}>{cell?.dayLabel || ""}</div>
                          <div style={{ fontSize: "0.48rem", color: "#f8fbff", lineHeight: 1.3 }}>{cell?.title || "Session"}</div>
                          <div style={{ fontSize: "0.42rem", color: "#8fa5c8", lineHeight: 1.35 }}>{cell?.detail || ""}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <IntakeTrajectoryArcDisclosure model={previewModel?.arcDisclosure} />
            {!!previewModel?.arcLine && (
              <div style={{ fontSize: "0.48rem", color: "#8fa5c8", lineHeight: 1.45 }}>
                {previewModel.arcLine}
              </div>
            )}
          </>
        ) : (
          <div
            data-testid="intake-plan-preview-empty"
            style={{ fontSize: "0.52rem", color: "#8fa5c8", lineHeight: 1.5 }}
          >
            {previewModel?.placeholderLine || "Pick the goal and a few real-world details to see the draft plan shape."}
          </div>
        )}
      </SurfaceQuietPanel>

      <div style={{ display: "grid", gap: "0.6rem" }}>
        {sections.map((section) => (
          <div key={section.key} data-testid={`intake-summary-section-${section.key}`} style={{ display: "grid", gap: "0.28rem" }}>
            <div style={{ fontSize: "0.46rem", color: "#8fa5c8", letterSpacing: "0.12em" }}>{section.label}</div>
            <div style={{ display: "grid", gap: "0.22rem" }}>
              {section.items.slice(0, 4).map((item, index) => (
                <div key={`${section.key}_${index}_${item}`} style={{ fontSize: "0.52rem", color: "#dbe7f6", lineHeight: 1.48 }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {tradeoffItems.length ? (
        <SurfaceDisclosure summary="Balancing notes">
          <div style={{ display: "grid", gap: "0.28rem" }}>
            {tradeoffItems.map((item, index) => (
              <div key={`${index}_${item}`} style={{ fontSize: "0.52rem", color: "#dbe7f6", lineHeight: 1.48 }}>
                {sanitizeText(item, 220)}
              </div>
            ))}
          </div>
        </SurfaceDisclosure>
      ) : null}
    </SurfaceCard>
  );
}

export default IntakeSummaryRail;
