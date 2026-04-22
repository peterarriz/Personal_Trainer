import React from "react";

const joinClassNames = (...parts) => parts.flat().filter(Boolean).join(" ");

const toAccentTone = (accentColor = "") => ({
  borderColor: accentColor ? `${accentColor}30` : "var(--consumer-border-strong)",
  glow: accentColor ? `${accentColor}12` : "rgba(255,255,255,0.06)",
});

export function SurfaceStack({
  children,
  gap = "0.75rem",
  className = "",
  style = {},
  ...rest
}) {
  return (
    <div
      className={joinClassNames("surface-stack", className)}
      style={{ gap, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export const SurfaceHero = React.forwardRef(function SurfaceHero({
  children,
  accentColor = "",
  className = "",
  style = {},
  variant = "default",
  ...rest
}, ref) {
  const tone = toAccentTone(accentColor);
  return (
    <div
      ref={ref}
      className={joinClassNames(
        "card",
        "card-strong",
        "card-hero",
        "surface-hero",
        variant === "action" ? "surface-hero-action" : "",
        className
      )}
      style={{
        borderColor: tone.borderColor,
        boxShadow: `var(--shadow-2), inset 0 1px 0 ${tone.glow}`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
});

export function SurfaceHeroHeader({
  children,
  className = "",
  style = {},
  ...rest
}) {
  return (
    <div
      className={joinClassNames("surface-hero-header", className)}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SurfaceHeroCopy({
  children,
  className = "",
  style = {},
  ...rest
}) {
  return (
    <div
      className={joinClassNames("surface-hero-copy", className)}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SurfaceHeading({
  eyebrow = "",
  title = "",
  supporting = "",
  eyebrowColor = "",
  titleColor = "",
  supportingColor = "",
  titleTestId = "",
  eyebrowTestId = "",
  supportingTestId = "",
  titleSize = "default",
  className = "",
  style = {},
}) {
  return (
    <div className={joinClassNames("surface-heading", className)} style={style}>
      {!!eyebrow && (
        <div
          data-testid={eyebrowTestId || undefined}
          className="surface-eyebrow"
          style={eyebrowColor ? { color: eyebrowColor } : undefined}
        >
          {eyebrow}
        </div>
      )}
      {!!title && (
        <div
          data-testid={titleTestId || undefined}
          className={joinClassNames(
            "surface-title",
            titleSize === "hero" ? "surface-title-hero" : ""
          )}
          style={titleColor ? { color: titleColor } : undefined}
        >
          {title}
        </div>
      )}
      {!!supporting && (
        <div
          data-testid={supportingTestId || undefined}
          className="surface-support"
          style={supportingColor ? { color: supportingColor } : undefined}
        >
          {supporting}
        </div>
      )}
    </div>
  );
}

export function SurfaceMetaRow({
  children,
  className = "",
  style = {},
  ...rest
}) {
  return (
    <div
      className={joinClassNames("surface-meta-row", className)}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SurfaceActions({
  children,
  className = "",
  style = {},
  ...rest
}) {
  return (
    <div
      className={joinClassNames("surface-actions", className)}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SurfaceQuietPanel({
  children,
  className = "",
  style = {},
  ...rest
}) {
  return (
    <div
      className={joinClassNames("surface-quiet-panel", className)}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

export const SurfaceCard = React.forwardRef(function SurfaceCard({
  children,
  accentColor = "",
  className = "",
  style = {},
  variant = "default",
  ...rest
}, ref) {
  const tone = toAccentTone(accentColor);
  const variantClassName =
    variant === "action"
      ? "card-action surface-card-action"
      : variant === "elevated"
      ? "card-elevated surface-card-elevated"
      : variant === "subtle"
      ? "card-subtle surface-card-subtle"
      : variant === "strong"
      ? "card-strong surface-card-strong"
      : "surface-card-default";
  return (
    <div
      ref={ref}
      className={joinClassNames("card", "surface-card", variantClassName, className)}
      style={{
        borderColor: accentColor ? tone.borderColor : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
});

export const SurfaceDisclosure = React.forwardRef(function SurfaceDisclosure({
  summary,
  children,
  className = "",
  style = {},
  summaryTestId = "",
  ...rest
}, ref) {
  return (
    <details
      ref={ref}
      className={joinClassNames("card", "card-subtle", "surface-disclosure", className)}
      style={style}
      {...rest}
    >
      <summary data-testid={summaryTestId || undefined}>{summary}</summary>
      <div className="surface-disclosure-body">{children}</div>
    </details>
  );
});

export function SurfacePill({
  children,
  className = "",
  style = {},
  strong = false,
  ...rest
}) {
  return (
    <span
      className={joinClassNames("ui-pill", strong ? "ui-pill-strong" : "", className)}
      style={style}
      {...rest}
    >
      {children}
    </span>
  );
}

export function SurfaceRecommendationCard({
  testId = "",
  headlineTestId = "",
  recommendation = "",
  why = "",
  likelyEffect = "",
  diffLines = [],
  actionSectionLabel = "Accept",
  actionLabel = "Accept change",
  actionTestId = "",
  onAction = null,
  actionDisabled = false,
  actionLoadingState = false,
  actionLoadingLabel = "Working...",
  emptyRecommendation = "No recommendation is ready yet.",
  emptyWhy = "Coach is waiting on a clearer signal.",
  emptyLikelyEffect = "Nothing changes right now.",
  accentColor = "",
}) {
  const tone = toAccentTone(accentColor);
  const visibleDiffs = (Array.isArray(diffLines) ? diffLines : [])
    .filter(Boolean)
    .filter((line) => line !== likelyEffect)
    .slice(0, 3);
  return (
    <div
      data-testid={testId || undefined}
      className="surface-recommendation-card"
      style={{
        borderColor: tone.borderColor,
        boxShadow: `inset 0 1px 0 ${tone.glow}`,
      }}
    >
      <div className="surface-recommendation-part">
        <div className="surface-recommendation-label">Recommendation</div>
        <div
          data-testid={headlineTestId || undefined}
          className="surface-recommendation-headline"
        >
          {recommendation || emptyRecommendation}
        </div>
      </div>
      <div className="surface-recommendation-part">
        <div className="surface-recommendation-label">Why</div>
        <div className="surface-recommendation-copy">{why || emptyWhy}</div>
      </div>
      <div className="surface-recommendation-part">
        <div className="surface-recommendation-label">Likely effect</div>
        <div className="surface-recommendation-copy">
          {likelyEffect || emptyLikelyEffect}
        </div>
      </div>
      <div className="surface-recommendation-part">
        <div className="surface-recommendation-label">{actionSectionLabel}</div>
        {!!onAction ? (
          <SurfaceActions>
            <button
              type="button"
              className="btn btn-primary"
              data-testid={actionTestId || undefined}
              onClick={onAction}
              disabled={actionDisabled}
              style={{ fontSize: "0.53rem", opacity: actionDisabled ? 0.55 : 1 }}
            >
              {actionLoadingState ? actionLoadingLabel : actionLabel}
            </button>
          </SurfaceActions>
        ) : (
          <div className="surface-recommendation-copy">
            No change suggested right now.
          </div>
        )}
      </div>
      {!!visibleDiffs.length && (
        <details
          data-testid={testId ? `${testId}-details` : undefined}
          className="surface-recommendation-disclosure"
        >
          <summary>More detail</summary>
          <div className="surface-recommendation-detail-list">
            {visibleDiffs.map((line, index) => (
              <div key={`${index}_${line}`} className="surface-recommendation-diff">
                + {line}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
