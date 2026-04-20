import React, { useId, useMemo, useState } from "react";
import { buildAdaptationMomentModel } from "../services/adaptation-moment-spec.js";

const joinClassNames = (...parts) => parts.flat().filter(Boolean).join(" ");

const TONE_STYLES = Object.freeze({
  amber: {
    color: "#915b09",
    borderColor: "rgba(217, 119, 6, 0.24)",
    background: "rgba(255, 247, 237, 0.96)",
    panelBackground: "rgba(255, 250, 242, 0.98)",
    iconBackground: "rgba(251, 191, 36, 0.16)",
  },
  sage: {
    color: "#436252",
    borderColor: "rgba(86, 132, 112, 0.24)",
    background: "rgba(244, 249, 246, 0.96)",
    panelBackground: "rgba(248, 252, 249, 0.98)",
    iconBackground: "rgba(86, 132, 112, 0.14)",
  },
  slate: {
    color: "#425569",
    borderColor: "rgba(100, 116, 139, 0.24)",
    background: "rgba(247, 249, 252, 0.96)",
    panelBackground: "rgba(250, 252, 255, 0.98)",
    iconBackground: "rgba(100, 116, 139, 0.12)",
  },
  emerald: {
    color: "#17603f",
    borderColor: "rgba(34, 197, 94, 0.2)",
    background: "rgba(241, 252, 245, 0.96)",
    panelBackground: "rgba(246, 254, 248, 0.98)",
    iconBackground: "rgba(34, 197, 94, 0.14)",
  },
  blue: {
    color: "#1f4f7b",
    borderColor: "rgba(59, 130, 246, 0.22)",
    background: "rgba(243, 248, 255, 0.96)",
    panelBackground: "rgba(247, 250, 255, 0.98)",
    iconBackground: "rgba(59, 130, 246, 0.14)",
  },
  teal: {
    color: "#125d5d",
    borderColor: "rgba(20, 184, 166, 0.22)",
    background: "rgba(240, 251, 250, 0.96)",
    panelBackground: "rgba(246, 254, 253, 0.98)",
    iconBackground: "rgba(20, 184, 166, 0.14)",
  },
  crimson: {
    color: "#8e2f2f",
    borderColor: "rgba(239, 68, 68, 0.2)",
    background: "rgba(255, 245, 245, 0.96)",
    panelBackground: "rgba(255, 249, 249, 0.98)",
    iconBackground: "rgba(239, 68, 68, 0.14)",
  },
});

const IconPath = ({ kind = "reduced_load", color = "#425569" }) => {
  const shared = {
    fill: "none",
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  if (kind === "protect") {
    return (
      <path
        {...shared}
        d="M12 3.4 18.4 5.8v5.4c0 4.2-2.4 7.1-6.4 9.4-4-2.3-6.4-5.2-6.4-9.4V5.8L12 3.4Z"
      />
    );
  }

  if (kind === "drift_downgrade") {
    return (
      <>
        <path {...shared} d="M4.5 7h6.5v4.2H4.5z" />
        <path {...shared} d="M11 11.2h6.5v4.2H11z" />
        <path {...shared} d="M4.8 17h6.2" />
      </>
    );
  }

  if (kind === "coach_accepted") {
    return (
      <>
        <circle {...shared} cx="12" cy="12" r="8.2" />
        <path {...shared} d="m8.3 12.2 2.2 2.4 5.2-5.4" />
      </>
    );
  }

  if (kind === "user_edit") {
    return (
      <>
        <path {...shared} d="M6 7.5h12" />
        <circle {...shared} cx="9" cy="7.5" r="1.8" />
        <path {...shared} d="M6 12h12" />
        <circle {...shared} cx="14.6" cy="12" r="1.8" />
        <path {...shared} d="M6 16.5h12" />
        <circle {...shared} cx="11.2" cy="16.5" r="1.8" />
      </>
    );
  }

  if (kind === "carry_forward") {
    return (
      <>
        <path {...shared} d="M6.2 8.4h8.9" />
        <path {...shared} d="m12.2 5.6 3 2.8-3 2.8" />
        <path {...shared} d="M17.2 8.4v4.4c0 2.7-2.1 4.8-4.8 4.8H7.8" />
      </>
    );
  }

  if (kind === "progression") {
    return (
      <>
        <path {...shared} d="M5.3 16.8h3.8v-3.3h3.8v-3.3h3.8V6.7" />
        <path {...shared} d="m14.7 6.7 1.9-1.9 1.9 1.9" />
      </>
    );
  }

  return (
    <>
      <path {...shared} d="M5.5 16.6h4v-3.3h4v-3.3h4" />
      <path {...shared} d="M17.5 6.7h-4v3.3h-4v3.3h-4" />
    </>
  );
};

export function AdaptationMoment({
  kind = "reduced_load",
  sourceLabel = "",
  why = "",
  rationale = "",
  detailLines = [],
  preservedLine = "",
  impactLine = "",
  defaultExpanded = false,
  expanded = null,
  onExpandedChange = null,
  summaryTestId = "",
  detailsTestId = "",
  className = "",
  style = {},
}) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(Boolean(defaultExpanded));
  const resolvedExpanded = typeof expanded === "boolean" ? expanded : uncontrolledExpanded;
  const panelId = useId();
  const model = useMemo(() => buildAdaptationMomentModel({
    kind,
    sourceLabel,
    why,
    rationale,
    detailLines,
    preservedLine,
    impactLine,
  }), [kind, sourceLabel, why, rationale, detailLines, preservedLine, impactLine]);
  const tone = TONE_STYLES[model.tone] || TONE_STYLES.slate;

  const handleToggle = () => {
    const nextExpanded = !resolvedExpanded;
    if (typeof expanded !== "boolean") setUncontrolledExpanded(nextExpanded);
    if (typeof onExpandedChange === "function") onExpandedChange(nextExpanded);
  };

  return (
    <div
      className={joinClassNames("adaptation-moment", className)}
      style={{
        display: "grid",
        gap: resolvedExpanded ? "0.55rem" : 0,
        borderRadius: 24,
        border: `1px solid ${tone.borderColor}`,
        background: resolvedExpanded ? tone.panelBackground : tone.background,
        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
        overflow: "hidden",
        ...style,
      }}
    >
      <button
        type="button"
        data-testid={summaryTestId || undefined}
        aria-expanded={resolvedExpanded}
        aria-controls={panelId}
        onClick={handleToggle}
        style={{
          appearance: "none",
          width: "100%",
          border: 0,
          background: "transparent",
          padding: "0.78rem 0.88rem",
          display: "grid",
          gridTemplateColumns: "auto minmax(0, 1fr) auto",
          gap: "0.7rem",
          alignItems: "center",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background: tone.iconBackground,
            color: tone.color,
            flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" role="presentation">
            <IconPath kind={model.icon} color={tone.color} />
          </svg>
        </span>
        <span style={{ display: "grid", gap: "0.22rem", minWidth: 0 }}>
          {!!model.sourceLabel && (
            <span
              style={{
                fontSize: "0.42rem",
                lineHeight: 1.2,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: tone.color,
                fontWeight: 800,
              }}
            >
              {model.sourceLabel}
            </span>
          )}
          <span
            style={{
              fontSize: "0.56rem",
              lineHeight: 1.45,
              color: "var(--consumer-text, #16202b)",
              fontWeight: 600,
            }}
          >
            {model.why}
          </span>
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--consumer-text-muted, #5f6b7b)",
            fontSize: "0.46rem",
            lineHeight: 1,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {resolvedExpanded ? "Less" : "Why"}
          <svg viewBox="0 0 24 24" width="14" height="14" role="presentation" style={{ transform: resolvedExpanded ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }}>
            <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {resolvedExpanded && (
        <div
          id={panelId}
          data-testid={detailsTestId || undefined}
          style={{
            display: "grid",
            gap: "0.42rem",
            padding: "0 0.88rem 0.82rem 3.42rem",
            marginTop: "-0.08rem",
          }}
        >
          {model.detailLines.map((line, index) => (
            <div
              key={`${line}-${index}`}
              style={{
                fontSize: "0.48rem",
                lineHeight: 1.5,
                color: index === 0 ? "var(--consumer-text, #16202b)" : "var(--consumer-text-soft, #465362)",
              }}
            >
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdaptationMoment;
