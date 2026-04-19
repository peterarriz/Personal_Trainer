import React from "react";
import {
  SurfaceHeading,
  SurfaceMetaRow,
  SurfacePill,
} from "./SurfaceSystem.jsx";

const buildDefaultPillTone = (accentColor = "") => ({
  color: accentColor || "var(--consumer-text-muted)",
  background: accentColor ? `${accentColor}12` : "var(--consumer-subpanel)",
  borderColor: accentColor ? `${accentColor}24` : "var(--consumer-border-strong)",
});

export function SessionSummaryBlock({
  model = null,
  accentColor = "",
  eyebrow = "",
  eyebrowColor = "",
  titleTestId = "",
  rationaleTestId = "",
  contextTestId = "",
  titleSize = "default",
  showSupport = true,
  showRationale = true,
  showContext = false,
  extraPills = [],
  style = {},
}) {
  if (!model) return null;

  const defaultTone = buildDefaultPillTone(accentColor);
  const modelPills = (Array.isArray(model.metaItems) ? model.metaItems : []).map((label, index) => ({
    key: `default_${index}_${label}`,
    label,
    style: defaultTone,
  }));
  const allPills = [...modelPills, ...(Array.isArray(extraPills) ? extraPills : [])].filter((pill) => pill?.label);

  return (
    <div style={{ display: "grid", gap: "0.42rem", ...style }}>
      <SurfaceHeading
        eyebrow={eyebrow || model.explanationSourceLabel || ""}
        title={model.title}
        supporting={showSupport ? model.supportLine : ""}
        eyebrowColor={
          eyebrowColor
          || (eyebrow
            ? accentColor || "var(--consumer-text-muted)"
            : model.explanationSourceLabel
            ? "var(--consumer-text-muted)"
            : accentColor || "var(--consumer-text-muted)")
        }
        titleSize={titleSize}
        titleTestId={titleTestId || undefined}
      />
      {!!allPills.length && (
        <SurfaceMetaRow>
          {allPills.map((pill) => (
            <SurfacePill key={pill.key} style={pill.style || defaultTone}>
              {pill.label}
            </SurfacePill>
          ))}
        </SurfaceMetaRow>
      )}
      {showRationale && !!model.rationaleLine && (
        <div
          data-testid={rationaleTestId || undefined}
          style={{ fontSize: "0.56rem", color: "var(--consumer-text)", lineHeight: 1.48, overflowWrap: "anywhere" }}
        >
          {model.rationaleLine}
        </div>
      )}
      {showContext && !!model.programContextLine && (
        <div
          data-testid={contextTestId || undefined}
          style={{ fontSize: "0.5rem", color: "var(--consumer-text-soft)", lineHeight: 1.45, overflowWrap: "anywhere" }}
        >
          {model.programContextLine}
        </div>
      )}
      {!!model.specialLine && (
        <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-muted)", lineHeight: 1.45, overflowWrap: "anywhere" }}>
          {model.specialLine}
        </div>
      )}
    </div>
  );
}
