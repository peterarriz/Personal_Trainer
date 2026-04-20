import React from "react";
import {
  SurfaceActions,
  SurfaceCard,
  SurfaceDisclosure,
  SurfaceHeading,
  SurfacePill,
} from "./SurfaceSystem.jsx";
import { buildCoachPreviewCommitCardModel } from "../services/coach-preview-commit-card-spec.js";

export function CoachPreviewCommitCard({
  job = "adjust_week",
  previewLabel = "",
  displaySource = "",
  recommendation = "",
  consequenceLead = "",
  consequenceBody = "",
  consequenceChips = [],
  why = "",
  commitScopeLine = "",
  auditLine = "",
  detailsLines = [],
  commitLabel = "",
  keepLabel = "",
  onCommit = null,
  onKeep = null,
  commitDisabled = false,
  keepDisabled = false,
  commitLoading = false,
  commitLoadingLabel = "Committing...",
  accentColor = "",
  testId = "",
  commitTestId = "",
  keepTestId = "",
}) {
  const model = buildCoachPreviewCommitCardModel({
    job,
    previewLabel,
    displaySource,
    recommendation,
    consequenceLead,
    consequenceBody,
    consequenceChips,
    why,
    commitScopeLine,
    auditLine,
    detailsLines,
    commitLabel,
    keepLabel,
  });

  return (
    <SurfaceCard
      data-testid={testId || undefined}
      variant="strong"
      accentColor={accentColor}
      style={{ display: "grid", gap: "0.6rem" }}
    >
      <SurfaceHeading
        eyebrow={model.previewLabel}
        title={model.recommendation}
        supporting={model.displaySource}
        titleSize="hero"
      />

      {model.showConsequence && (
        <div
          style={{
            display: "grid",
            gap: "0.35rem",
            padding: "0.72rem 0.78rem",
            borderRadius: 18,
            border: "1px solid var(--consumer-border-strong)",
            background: "var(--consumer-subpanel)",
          }}
        >
          <div style={{ fontSize: "0.46rem", color: "var(--consumer-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {model.consequenceLabel}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--consumer-text)", lineHeight: 1.28, fontWeight: 800 }}>
            {model.consequenceLead}
          </div>
          {!!model.consequenceBody && (
            <div style={{ fontSize: "0.5rem", color: "var(--consumer-text-soft)", lineHeight: 1.5 }}>
              {model.consequenceBody}
            </div>
          )}
          {!!model.consequenceChips.length && (
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
              {model.consequenceChips.map((chip) => (
                <SurfacePill key={chip} strong>
                  {chip}
                </SurfacePill>
              ))}
            </div>
          )}
        </div>
      )}

      {!!model.why && (
        <div style={{ display: "grid", gap: "0.24rem" }}>
          <div style={{ fontSize: "0.44rem", color: "var(--consumer-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {model.whyLabel}
          </div>
          <div style={{ fontSize: "0.5rem", color: "var(--consumer-text-soft)", lineHeight: 1.5 }}>
            {model.why}
          </div>
        </div>
      )}

      {!!model.detailsLines.length && (
        <SurfaceDisclosure summary="More detail">
          <div style={{ display: "grid", gap: "0.28rem" }}>
            {model.detailsLines.map((line, index) => (
              <div key={`${index}_${line}`} style={{ fontSize: "0.49rem", color: "var(--consumer-text-soft)", lineHeight: 1.45 }}>
                + {line}
              </div>
            ))}
          </div>
        </SurfaceDisclosure>
      )}

      <div
        style={{
          display: "grid",
          gap: "0.34rem",
          paddingTop: "0.15rem",
          borderTop: "1px solid var(--consumer-border)",
        }}
      >
        <div style={{ fontSize: "0.46rem", color: "var(--consumer-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Commit
        </div>
        {!!model.commitScopeLine && (
          <div style={{ fontSize: "0.54rem", color: "var(--consumer-text)", lineHeight: 1.45, fontWeight: 700 }}>
            {model.commitScopeLine}
          </div>
        )}
        {!!model.auditLine && (
          <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-muted)", lineHeight: 1.45 }}>
            {model.auditLine}
          </div>
        )}
        <SurfaceActions>
          {!!onCommit && (
            <button
              type="button"
              className="btn btn-primary"
              data-testid={commitTestId || undefined}
              onClick={onCommit}
              disabled={commitDisabled}
              style={{ fontSize: "0.53rem", opacity: commitDisabled ? 0.55 : 1 }}
            >
              {commitLoading ? commitLoadingLabel : model.commitLabel}
            </button>
          )}
          {!!onKeep && (
            <button
              type="button"
              className="btn"
              data-testid={keepTestId || undefined}
              onClick={onKeep}
              disabled={keepDisabled}
            >
              {model.keepLabel}
            </button>
          )}
        </SurfaceActions>
      </div>
    </SurfaceCard>
  );
}

export default CoachPreviewCommitCard;
