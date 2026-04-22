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
  const canRender = Boolean(
    model?.found
    || model?.demoSearchUrl
  );
  if (!canRender) return null;

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
        How to do it
      </summary>
      <div style={{ display: "grid", gap: "0.16rem", marginTop: "0.36rem" }}>
        {!!model?.whatItIs && (
          <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-soft)", lineHeight: 1.45 }}>
            {model.whatItIs}
          </div>
        )}
        {!!model?.howToDoIt && (
          <div style={{ fontSize: "0.48rem", color: "var(--consumer-text-muted)", lineHeight: 1.45 }}>
            Do it: {model.howToDoIt}
          </div>
        )}
        {!!model?.repCountsAs && (
          <div style={{ fontSize: "0.48rem", color: "var(--consumer-text-muted)", lineHeight: 1.45 }}>
            Rep guide: {model.repCountsAs}
          </div>
        )}
        {!!model?.setupNotes && (
          <div style={{ fontSize: "0.48rem", color: "var(--consumer-text-muted)", lineHeight: 1.45 }}>
            Setup: {model.setupNotes}
          </div>
        )}
        {!!model?.cautionNotes && (
          <div style={{ fontSize: "0.48rem", color: "var(--consumer-text-muted)", lineHeight: 1.45 }}>
            Watch for: {model.cautionNotes}
          </div>
        )}
        {!!model?.commonSubstitutions?.length && (
          <div style={{ fontSize: "0.48rem", color: "var(--consumer-text-muted)", lineHeight: 1.45 }}>
            Swap if needed: {model.commonSubstitutions.join(", ")}
          </div>
        )}
        {!!model?.demoSearchUrl && (
          <div>
            <a
              data-testid={dataTestId ? `${dataTestId}-link` : undefined}
              href={model.demoSearchUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: "0.48rem",
                color: "var(--accent-cyan, #67e8f9)",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Watch demo
            </a>
          </div>
        )}
      </div>
    </details>
  );
}

export default ExerciseHowDisclosure;
