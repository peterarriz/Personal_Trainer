import React from "react";
import {
  SurfaceMetaRow,
  SurfacePill,
} from "./SurfaceSystem.jsx";

const TRUST_TONES = Object.freeze({
  explicit: { color: "#2da772", background: "rgba(45, 167, 114, 0.12)", borderColor: "rgba(45, 167, 114, 0.24)" },
  inferred: { color: "#8fa5c8", background: "rgba(95, 111, 133, 0.18)", borderColor: "rgba(95, 111, 133, 0.28)" },
  plan: { color: "#dbe7f6", background: "rgba(30, 41, 59, 0.7)", borderColor: "rgba(71, 85, 105, 0.72)" },
  status: { color: "#3c91e6", background: "rgba(60, 145, 230, 0.12)", borderColor: "rgba(60, 145, 230, 0.24)" },
  forecast: { color: "#6e63d9", background: "rgba(110, 99, 217, 0.12)", borderColor: "rgba(110, 99, 217, 0.24)" },
});

const resolveTone = (sourceKind = "plan") => TRUST_TONES[String(sourceKind || "").trim().toLowerCase()] || TRUST_TONES.plan;

export function CompactTrustRow({
  model = null,
  dataTestId = "",
  style = {},
}) {
  const chips = Array.isArray(model?.chips) ? model.chips.filter((chip) => chip?.label) : [];
  if (!chips.length) return null;

  return (
    <SurfaceMetaRow data-testid={dataTestId || undefined} style={{ gap: "0.28rem", ...style }}>
      {chips.map((chip, index) => (
        <SurfacePill key={chip.key || `${chip.label}_${index}`} style={resolveTone(chip.sourceKind)}>
          {chip.label}
        </SurfacePill>
      ))}
    </SurfaceMetaRow>
  );
}
