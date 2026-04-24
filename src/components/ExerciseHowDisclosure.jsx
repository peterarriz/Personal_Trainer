import React from "react";
import { getMovementExplanation } from "../services/movement-explanation-service.js";

const sanitizeLabel = (value = "") => String(value || "").replace(/\s+/g, " ").trim();
const isGenericPlaceholder = (value = "") => /^exercise\s+\d+$/i.test(sanitizeLabel(value));

export function ExerciseHowDisclosure({
  label = "",
  query = "",
  dataTestId = "",
}) {
  const resolvedLabel = sanitizeLabel(query || label);
  if (!resolvedLabel || isGenericPlaceholder(resolvedLabel)) return null;

  const model = getMovementExplanation(resolvedLabel);
  const guideRows = [
    { label: "What it trains", value: model?.whatItIs || "" },
    { label: "Setup", value: model?.setupNotes || "" },
    { label: "Do it", value: model?.howToDoIt || "" },
    { label: "Rep guide", value: model?.repCountsAs || "" },
    { label: "Watch for", value: model?.cautionNotes || "" },
  ].filter((row) => row.value);
  const hasGuideContent = Boolean(guideRows.length || model?.commonSubstitutions?.length);
  if (!hasGuideContent) return null;

  return (
    <details
      data-testid={dataTestId || undefined}
      style={{
        marginTop: "0.12rem",
        borderTop: "1px solid color-mix(in srgb, var(--consumer-border) 72%, transparent)",
        paddingTop: "0.38rem",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontSize: "0.45rem",
          color: "var(--consumer-text-muted)",
          lineHeight: 1.35,
          listStyle: "none",
        }}
      >
        Movement guide
      </summary>
      <div style={{ display: "grid", gap: "0.28rem", marginTop: "0.36rem" }}>
        {model?.found && model?.canonicalLabel && model.canonicalLabel !== resolvedLabel && (
          <div style={{ fontSize: "0.45rem", color: "var(--consumer-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {model.canonicalLabel}
          </div>
        )}
        {guideRows.map((row) => (
          <div key={row.label} style={{ display: "grid", gap: "0.08rem" }}>
            <div style={{ fontSize: "0.42rem", color: "var(--consumer-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {row.label}
            </div>
            <div style={{ fontSize: row.label === "What it trains" ? "0.49rem" : "0.48rem", color: row.label === "What it trains" ? "var(--consumer-text-soft)" : "var(--consumer-text-muted)", lineHeight: 1.45 }}>
              {row.value}
            </div>
          </div>
        ))}
        {!!model?.commonSubstitutions?.length && (
          <div style={{ display: "grid", gap: "0.08rem" }}>
            <div style={{ fontSize: "0.42rem", color: "var(--consumer-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Swap if needed
            </div>
            <div style={{ fontSize: "0.48rem", color: "var(--consumer-text-muted)", lineHeight: 1.45 }}>
              {model.commonSubstitutions.join(", ")}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

export default ExerciseHowDisclosure;
