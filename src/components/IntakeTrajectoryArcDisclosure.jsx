import React from "react";

const safeArray = (value) => (Array.isArray(value) ? value : []);

export function IntakeTrajectoryArcDisclosure({
  model = null,
  className = "",
  style = {},
}) {
  if (!model?.isReady) return null;

  return (
    <details
      data-testid="intake-plan-preview-arc"
      className={className}
      style={{
        borderRadius: 18,
        border: "1px solid rgba(111,148,198,0.14)",
        background: "rgba(8,14,25,0.58)",
        ...style,
      }}
    >
      <summary
        data-testid="intake-plan-preview-arc-summary"
        style={{
          listStyle: "none",
          cursor: "pointer",
          display: "grid",
          gap: "0.35rem",
          padding: "0.72rem 0.76rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: "0.44rem", color: "#8fa5c8", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {model.heading}
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "0.28rem 0.48rem",
              borderRadius: 999,
              fontSize: "0.42rem",
              color: "#dbe7f6",
              background: "rgba(111,148,198,0.12)",
              border: "1px solid rgba(111,148,198,0.2)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {model.modeLabel}
          </div>
        </div>
        <div style={{ fontSize: "0.56rem", color: "#f8fbff", lineHeight: 1.4, fontWeight: 700 }}>
          {model.summary}
        </div>
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          <div
            style={{
              padding: "0.28rem 0.45rem",
              borderRadius: 999,
              fontSize: "0.42rem",
              color: "#b9ecff",
              background: "rgba(0,194,255,0.12)",
              border: "1px solid rgba(0,194,255,0.24)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Current: {model.currentLabel}
          </div>
          {!!model.nextLabel && (
            <div
              style={{
                padding: "0.28rem 0.45rem",
                borderRadius: 999,
                fontSize: "0.42rem",
                color: "#9fe8c7",
                background: "rgba(39,245,154,0.12)",
                border: "1px solid rgba(39,245,154,0.24)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Next: {model.nextLabel}
            </div>
          )}
        </div>
      </summary>
      <div
        data-testid="intake-plan-preview-arc-body"
        style={{
          display: "grid",
          gap: "0.62rem",
          padding: "0 0.76rem 0.76rem",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(76px,1fr))", gap: "0.35rem" }}>
          {safeArray(model.phaseBlocks).map((block) => {
            const isCurrent = block.status === "current";
            const isNext = block.status === "next";
            const borderColor = isCurrent
              ? "rgba(0,194,255,0.24)"
              : isNext
              ? "rgba(39,245,154,0.24)"
              : "rgba(111,148,198,0.14)";
            const background = isCurrent
              ? "rgba(0,194,255,0.1)"
              : isNext
              ? "rgba(39,245,154,0.08)"
              : "rgba(8,14,25,0.72)";
            return (
              <div
                key={`${block.phaseKey}_${block.startWeek}`}
                style={{
                  display: "grid",
                  gap: "0.14rem",
                  padding: "0.55rem",
                  borderRadius: 14,
                  border: `1px solid ${borderColor}`,
                  background,
                }}
              >
                <div style={{ fontSize: "0.4rem", color: "#8fa5c8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {block.weeksLabel}
                </div>
                <div style={{ fontSize: "0.52rem", color: "#f8fbff", lineHeight: 1.35, fontWeight: isCurrent ? 700 : 600 }}>
                  {block.label}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "grid", gap: "0.42rem" }}>
          <div style={{ display: "grid", gap: "0.16rem" }}>
            <div style={{ fontSize: "0.44rem", color: "#8fa5c8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {model.openingLabel}
            </div>
            <div style={{ fontSize: "0.5rem", color: "#dbe7f6", lineHeight: 1.48 }}>
              {model.openingLine}
            </div>
          </div>
          <div style={{ display: "grid", gap: "0.16rem" }}>
            <div style={{ fontSize: "0.44rem", color: "#8fa5c8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {model.gateLabel}
            </div>
            <div style={{ fontSize: "0.5rem", color: "#dbe7f6", lineHeight: 1.48 }}>
              {model.gateLine}
            </div>
          </div>
        </div>

        {!!model.trustLine && (
          <div style={{ fontSize: "0.46rem", color: "#8fa5c8", lineHeight: 1.45 }}>
            {model.trustLine}
          </div>
        )}
      </div>
    </details>
  );
}

export default IntakeTrajectoryArcDisclosure;
