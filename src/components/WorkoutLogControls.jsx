import React, { useState } from "react";
import {
  SurfaceCard,
  SurfaceMetaRow,
  SurfacePill,
} from "./SurfaceSystem.jsx";

const clampNumber = (value, min = 0, max = null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  const lowerBound = Number.isFinite(Number(min)) ? Number(min) : 0;
  const bounded = Math.max(lowerBound, numeric);
  if (Number.isFinite(Number(max))) {
    return Math.min(Number(max), bounded);
  }
  return bounded;
};

const normalizeInputValue = (value = "", precision = 0) => {
  if (value === "" || value === null || value === undefined) return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value || "").trim();
  if (precision > 0) return String(Number(numeric.toFixed(precision)));
  return String(Math.round(numeric));
};

const formatDisplayValue = (value = "", suffix = "") => {
  const normalized = normalizeInputValue(value);
  if (!normalized) return "--";
  return suffix ? `${normalized} ${suffix}` : normalized;
};

const LARGE_BUTTON_STYLE = {
  minHeight: 52,
  minWidth: 52,
  borderRadius: 16,
  fontSize: "0.72rem",
  fontWeight: 700,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  touchAction: "manipulation",
};

const LARGE_INPUT_STYLE = {
  minHeight: 56,
  borderRadius: 18,
  border: "1px solid var(--consumer-border-strong)",
  background: "var(--consumer-subpanel)",
  color: "var(--consumer-text)",
  fontSize: "1rem",
  fontWeight: 700,
  textAlign: "center",
  padding: "0.65rem 0.7rem",
  width: "100%",
  fontVariantNumeric: "tabular-nums",
};

export function LogValueStepper({
  label = "",
  value = "",
  suffix = "",
  helper = "",
  decrementAmount = 1,
  incrementAmount = 1,
  min = 0,
  max = null,
  precision = 0,
  onStep = () => {},
  onChange = () => {},
  dataTestId = "",
  inputTestId = "",
  inputMode = "numeric",
}) {
  const handleDirectChange = (nextValue) => {
    const raw = String(nextValue || "").trim();
    if (!raw) {
      onChange("");
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      onChange(raw);
      return;
    }
    const bounded = clampNumber(parsed, min, max);
    onChange(normalizeInputValue(bounded, precision));
  };

  return (
    <SurfaceCard
      data-testid={dataTestId || undefined}
      variant="subtle"
      style={{
        display: "grid",
        gap: "0.45rem",
        padding: "0.65rem",
        borderRadius: 18,
        background: "var(--consumer-panel)",
        borderColor: "var(--consumer-border)",
      }}
    >
      <div style={{ display: "grid", gap: "0.16rem" }}>
        <div style={{ fontSize: "0.48rem", color: "var(--consumer-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {label}
        </div>
        {!!helper && (
          <div style={{ fontSize: "0.48rem", color: "var(--consumer-text-muted)", lineHeight: 1.45 }}>
            {helper}
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr) 52px", gap: "0.4rem", alignItems: "stretch" }}>
        <button
          type="button"
          className="btn"
          onClick={() => onStep(-Math.abs(Number(decrementAmount) || 1))}
          style={LARGE_BUTTON_STYLE}
        >
          -{Math.abs(Number(decrementAmount) || 1)}
        </button>
        <input
          data-testid={inputTestId || undefined}
          type="text"
          inputMode={inputMode}
          value={normalizeInputValue(value, precision)}
          onChange={(event) => handleDirectChange(event.target.value)}
          style={LARGE_INPUT_STYLE}
          aria-label={label}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onStep(Math.abs(Number(incrementAmount) || 1))}
          style={LARGE_BUTTON_STYLE}
        >
          +{Math.abs(Number(incrementAmount) || 1)}
        </button>
      </div>
      <div style={{ fontSize: "0.56rem", color: "var(--consumer-text)", fontWeight: 700, lineHeight: 1.3 }}>
        {formatDisplayValue(value, suffix)}
      </div>
    </SurfaceCard>
  );
}

export function LogFeelStrip({
  value = "3",
  labels = {},
  onChange = () => {},
  dataTestId = "log-feel-strip",
}) {
  return (
    <SurfaceCard
      data-testid={dataTestId}
      role="group"
      aria-label="How the session felt"
      variant="subtle"
      style={{
        display: "grid",
        gap: "0.5rem",
        padding: "0.7rem",
        borderRadius: 18,
        background: "var(--consumer-panel)",
        borderColor: "var(--consumer-border)",
      }}
    >
      <div style={{ display: "grid", gap: "0.16rem" }}>
        <div style={{ fontSize: "0.48rem", color: "var(--consumer-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Session feel
        </div>
        <div style={{ fontSize: "0.48rem", color: "var(--consumer-text-muted)", lineHeight: 1.45 }}>
          One tap and go.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "0.35rem" }}>
        {[1, 2, 3, 4, 5].map((option) => {
          const optionKey = String(option);
          const isActive = String(value || "3") === optionKey;
          return (
            <button
              key={optionKey}
              type="button"
              data-testid={`log-feel-chip-${optionKey}`}
              className={isActive ? "btn btn-primary" : "btn"}
              onClick={() => onChange(optionKey)}
              style={{
                minHeight: 56,
                borderRadius: 16,
                display: "grid",
                gap: "0.08rem",
                justifyItems: "center",
                alignContent: "center",
                textAlign: "center",
                padding: "0.4rem 0.3rem",
                touchAction: "manipulation",
              }}
            >
              <span style={{ fontSize: "0.7rem", fontWeight: 800, lineHeight: 1 }}>{optionKey}</span>
              <span style={{ fontSize: "0.42rem", lineHeight: 1.2 }}>{labels?.[optionKey]?.title || optionKey}</span>
            </button>
          );
        })}
      </div>
    </SurfaceCard>
  );
}

export function RestTimerStrip({
  timer = null,
  onClear = () => {},
  onAddThirty = () => {},
}) {
  if (!timer?.active) return null;
  return (
    <SurfaceCard
      data-testid="log-rest-timer"
      variant="action"
      style={{
        display: "grid",
        gap: "0.45rem",
        padding: "0.7rem",
        borderRadius: 18,
        background: "rgba(9, 16, 27, 0.86)",
        borderColor: "rgba(255, 201, 119, 0.26)",
      }}
    >
      <div style={{ display: "grid", gap: "0.18rem" }}>
        <div style={{ fontSize: "0.48rem", color: "var(--consumer-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Rest timer
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--consumer-text)", fontWeight: 700, lineHeight: 1.25 }}>
          {timer.label || "Current set"}
        </div>
      </div>
      <SurfaceMetaRow>
        <SurfacePill strong style={{ background: "rgba(255, 201, 119, 0.12)", borderColor: "rgba(255, 201, 119, 0.26)", color: "#ffd7a6" }}>
          {timer.display}
        </SurfacePill>
      </SurfaceMetaRow>
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={onAddThirty} style={{ minHeight: 48, borderRadius: 14 }}>
          +30 sec
        </button>
        <button type="button" className="btn" onClick={onClear} style={{ minHeight: 48, borderRadius: 14 }}>
          Clear
        </button>
      </div>
    </SurfaceCard>
  );
}

export function StrengthExecutionCard({
  row = null,
  index = 0,
  onStepField = () => {},
  onChangeField = () => {},
  onStartRest = () => {},
  onUsePlannedExercise = () => {},
  bandTensionLevels = [],
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const plannedSets = Math.max(0, Number(row?.prescribedSets || 0) || 0);
  const actualSets = Math.max(0, Number(row?.actualSets || 0) || 0);
  const isWeighted = !row?.bodyweightOnly && row?.mode !== "band";
  const progressLine = plannedSets
    ? `${actualSets} of ${plannedSets} sets logged`
    : `${actualSets} sets logged`;

  return (
    <SurfaceCard
      data-testid={`log-strength-execution-card-${index}`}
      variant="subtle"
      style={{
        display: "grid",
        gap: "0.55rem",
        padding: "0.75rem",
        borderRadius: 20,
        background: "var(--consumer-panel)",
        borderColor: "var(--consumer-border)",
      }}
    >
      <div style={{ display: "grid", gap: "0.2rem" }}>
        <div style={{ fontSize: "0.62rem", color: "var(--consumer-text)", fontWeight: 700, lineHeight: 1.3 }}>
          {row?.exercise || row?.prescribedExercise || `Exercise ${index + 1}`}
        </div>
        <div style={{ fontSize: "0.48rem", color: "var(--consumer-text-muted)", lineHeight: 1.45 }}>
          {row?.prescribedExercise
            ? `Planned ${row.prescribedSetsText || row.prescribedSets || ""} sets${row?.prescribedRepsText ? `, ${row.prescribedRepsText}` : ""}${row?.prescribedWeight ? `, ${row.prescribedWeight} lb` : row?.bodyweightOnly ? ", bodyweight" : ""}`
            : "Extra movement"}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
        <SurfacePill strong>{progressLine}</SurfacePill>
        {row?.isSubstituted && (
          <SurfacePill style={{ color: "#ffd7a6", background: "rgba(255, 201, 119, 0.12)", borderColor: "rgba(255, 201, 119, 0.26)" }}>
            Substitution
          </SurfacePill>
        )}
      </div>

      <div style={{ display: "grid", gap: "0.45rem", gridTemplateColumns: isWeighted ? "1fr 1fr 1fr" : "1fr 1fr" }}>
        <LogValueStepper
          dataTestId={`log-strength-row-sets-${index}-stepper`}
          inputTestId={`log-strength-row-sets-${index}`}
          label="Sets done"
          value={row?.actualSets || ""}
          decrementAmount={1}
          incrementAmount={1}
          onStep={(delta) => onStepField(index, "actualSets", delta, { min: 0, max: Math.max(plannedSets || 0, 12), precision: 0 })}
          onChange={(nextValue) => onChangeField(index, "actualSets", nextValue)}
        />
        <LogValueStepper
          dataTestId={`log-strength-row-reps-${index}-stepper`}
          inputTestId={`log-strength-row-reps-${index}`}
          label="Reps"
          value={row?.actualReps || ""}
          decrementAmount={1}
          incrementAmount={1}
          onStep={(delta) => onStepField(index, "actualReps", delta, { min: 0, max: 30, precision: 0 })}
          onChange={(nextValue) => onChangeField(index, "actualReps", nextValue)}
        />
        {isWeighted && (
          <LogValueStepper
            dataTestId={`log-strength-row-weight-${index}-stepper`}
            inputTestId={`log-strength-row-weight-${index}`}
            label="Weight"
            value={row?.actualWeight || ""}
            suffix="lb"
            decrementAmount={5}
            incrementAmount={5}
            onStep={(delta) => onStepField(index, "actualWeight", delta, { min: 0, max: 999, precision: 0 })}
            onChange={(nextValue) => onChangeField(index, "actualWeight", nextValue)}
          />
        )}
      </div>

      {!isWeighted && (
        <div style={{ fontSize: "0.5rem", color: "var(--consumer-text-muted)", lineHeight: 1.45 }}>
          {row?.mode === "band"
            ? `Band tension: ${row?.bandTension || bandTensionLevels[0] || "Light"}`
            : "Bodyweight movement"}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid={`log-strength-complete-set-${index}`}
          className="btn"
          onClick={() => onStepField(index, "actualSets", 1, { min: 0, max: Math.max(plannedSets || 0, 12), precision: 0 })}
          style={{
            minHeight: 50,
            borderRadius: 16,
            flex: "1 1 160px",
            justifyContent: "center",
            borderColor: "rgba(94, 234, 212, 0.28)",
            color: "var(--consumer-text)",
            background: "rgba(15, 23, 42, 0.72)",
          }}
        >
          +1 set
        </button>
        <button
          type="button"
          data-testid={`log-rest-start-${index}`}
          className="btn"
          onClick={() => onStartRest(row, index)}
          style={{ minHeight: 50, borderRadius: 16, flex: "1 1 120px", justifyContent: "center" }}
        >
          Rest 90s
        </button>
      </div>

      <details
        data-testid={`log-strength-row-disclosure-${index}`}
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        style={{ borderTop: "1px solid var(--consumer-border)", paddingTop: "0.5rem" }}
      >
        <summary style={{ cursor: "pointer", fontSize: "0.5rem", color: "var(--consumer-text-muted)" }}>
          Exercise details
        </summary>
        <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.45rem" }}>
          <input
            data-testid={`log-strength-row-exercise-${index}`}
            aria-label={`Exercise ${index + 1} name`}
            value={row?.exercise || ""}
            onChange={(event) => onChangeField(index, "exercise", event.target.value)}
            placeholder="Exercise"
            style={LARGE_INPUT_STYLE}
          />
          {row?.mode === "band" && (
            <select
              aria-label={`Exercise ${index + 1} band tension`}
              value={row?.bandTension || ""}
              onChange={(event) => onChangeField(index, "bandTension", event.target.value)}
              style={LARGE_INPUT_STYLE}
            >
              <option value="">Band</option>
              {bandTensionLevels.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          )}
          {!!row?.canResetToPrescribed && (
            <button
              type="button"
              className="btn"
              onClick={() => onUsePlannedExercise(index)}
              style={{ minHeight: 48, borderRadius: 14, width: "fit-content" }}
            >
              Use planned
            </button>
          )}
        </div>
      </details>
    </SurfaceCard>
  );
}
