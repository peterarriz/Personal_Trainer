import React from "react";

const TONE_STYLES = {
  healthy: {
    border: "rgba(45,167,114,0.22)",
    bg: "rgba(45,167,114,0.08)",
    chipBg: "rgba(45,167,114,0.14)",
    chipText: "#d7f5e6",
    title: "#d7f5e6",
    body: "#c9f1db",
    support: "#9fd4b6",
  },
  success: {
    border: "rgba(45,167,114,0.26)",
    bg: "rgba(45,167,114,0.1)",
    chipBg: "rgba(45,167,114,0.16)",
    chipText: "#d7f5e6",
    title: "#d7f5e6",
    body: "#c9f1db",
    support: "#9fd4b6",
  },
  info: {
    border: "rgba(60,145,230,0.26)",
    bg: "rgba(60,145,230,0.09)",
    chipBg: "rgba(60,145,230,0.16)",
    chipText: "#d7e8fb",
    title: "#d7e8fb",
    body: "#c6dcf6",
    support: "#9fb7d8",
  },
  caution: {
    border: "rgba(201,122,43,0.28)",
    bg: "rgba(201,122,43,0.1)",
    chipBg: "rgba(201,122,43,0.18)",
    chipText: "#f6e0b6",
    title: "#f6e0b6",
    body: "#ecd29d",
    support: "#d8bf8d",
  },
  critical: {
    border: "rgba(216,93,120,0.28)",
    bg: "rgba(216,93,120,0.1)",
    chipBg: "rgba(216,93,120,0.18)",
    chipText: "#f5d4dd",
    title: "#f5d4dd",
    body: "#e9bfcb",
    support: "#d6a4b3",
  },
  neutral: {
    border: "var(--consumer-border-strong, #2b3d55)",
    bg: "rgba(13, 22, 34, 0.7)",
    chipBg: "#172131",
    chipText: "#dbe7f6",
    title: "#dbe7f6",
    body: "#bfd0e8",
    support: "#8fa5c8",
  },
};

const getToneStyle = (tone = "neutral") => TONE_STYLES[tone] || TONE_STYLES.neutral;

export function StateFeedbackBanner({
  model = null,
  dataTestId = "",
  compact = false,
  style = {},
}) {
  if (!model?.title && !model?.detail) return null;
  const toneStyle = getToneStyle(model.tone);
  const detail = compact ? (model.compactDetail || model.detail) : model.detail;
  return (
    <div
      data-testid={dataTestId || undefined}
      role="status"
      aria-live={model.liveMode || "polite"}
      style={{
        border: `1px solid ${toneStyle.border}`,
        borderRadius: compact ? 12 : 14,
        background: toneStyle.bg,
        padding: compact ? "0.48rem 0.56rem" : "0.62rem 0.68rem",
        display: "grid",
        gap: compact ? "0.18rem" : "0.24rem",
        ...style,
      }}
    >
      {(model.eyebrow || model.chipLabel) && (
        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
          {model.eyebrow && (
            <span style={{ fontSize: "0.44rem", color: "#7f93b2", letterSpacing: "0.1em" }}>
              {model.eyebrow}
            </span>
          )}
          {!!model.chipLabel && (
            <span
              style={{
                fontSize: "0.44rem",
                color: toneStyle.chipText,
                background: toneStyle.chipBg,
                border: `1px solid ${toneStyle.border}`,
                borderRadius: 999,
                padding: "0.12rem 0.36rem",
                letterSpacing: "0.06em",
              }}
            >
              {model.chipLabel}
            </span>
          )}
        </div>
      )}
      {!!model.title && (
        <div style={{ fontSize: compact ? "0.5rem" : "0.56rem", color: toneStyle.title, lineHeight: 1.45 }}>
          {model.title}
        </div>
      )}
      {!!detail && (
        <div style={{ fontSize: compact ? "0.47rem" : "0.49rem", color: toneStyle.body, lineHeight: 1.5 }}>
          {detail}
        </div>
      )}
      {!!model.support && (
        <div style={{ fontSize: compact ? "0.45rem" : "0.47rem", color: toneStyle.support, lineHeight: 1.5 }}>
          {model.support}
        </div>
      )}
    </div>
  );
}

export function StateFeedbackChip({
  model = null,
  dataTestId = "",
  style = {},
}) {
  const toneStyle = getToneStyle(model?.tone);
  const message = model?.compactMessage || model?.compactDetail || model?.title || model?.detail;
  if (!message || !model?.chipLabel) return null;
  return (
    <div
      data-testid={dataTestId || undefined}
      role="status"
      aria-live={model.liveMode || "polite"}
      style={{
        minHeight: "2.45rem",
        border: `1px solid ${toneStyle.border}`,
        borderRadius: 12,
        background: toneStyle.bg,
        padding: "0.42rem 0.56rem",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        alignItems: "center",
        gap: "0.4rem",
        ...style,
      }}
    >
      <span
        style={{
          fontSize: "0.44rem",
          color: toneStyle.chipText,
          background: toneStyle.chipBg,
          border: `1px solid ${toneStyle.border}`,
          borderRadius: 999,
          padding: "0.12rem 0.36rem",
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
        }}
      >
        {model.chipLabel}
      </span>
      <span
        style={{
          fontSize: "0.48rem",
          color: toneStyle.title,
          lineHeight: 1.45,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {message}
      </span>
    </div>
  );
}
