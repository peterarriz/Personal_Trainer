import React, { useState } from "react";
import {
  SurfaceCard,
  SurfacePill,
} from "./SurfaceSystem.jsx";
import { ExerciseHowDisclosure } from "./ExerciseHowDisclosure.jsx";

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
  borderRadius: 18,
  fontSize: "0.68rem",
  fontWeight: 700,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  touchAction: "manipulation",
};

const LARGE_INPUT_STYLE = {
  minHeight: 56,
  borderRadius: 20,
  border: "1px solid color-mix(in srgb, var(--consumer-border-strong) 90%, rgba(255,255,255,0.05))",
  background: "linear-gradient(180deg, color-mix(in srgb, var(--consumer-subpanel) 96%, transparent) 0%, color-mix(in srgb, var(--consumer-panel) 94%, transparent) 100%)",
  color: "var(--consumer-text)",
  fontSize: "0.96rem",
  fontWeight: 700,
  textAlign: "center",
  padding: "0.65rem 0.7rem",
  width: "100%",
  fontVariantNumeric: "tabular-nums",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
};

const LOG_CONTROL_CARD_STYLE = {
  display: "grid",
  gap: "0.52rem",
  padding: "0.76rem",
  borderRadius: 20,
  background: "linear-gradient(180deg, color-mix(in srgb, var(--consumer-panel) 98%, transparent) 0%, color-mix(in srgb, var(--consumer-subpanel) 94%, transparent) 100%)",
  borderColor: "color-mix(in srgb, var(--consumer-border) 90%, rgba(255,255,255,0.04))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const LOG_CONTROL_LABEL_STYLE = {
  fontSize: "0.47rem",
  color: "var(--consumer-text-muted)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const LOG_CONTROL_HELPER_STYLE = {
  fontSize: "0.49rem",
  color: "var(--consumer-text-muted)",
  lineHeight: 1.5,
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
      style={LOG_CONTROL_CARD_STYLE}
    >
      <div style={{ display: "grid", gap: "0.16rem" }}>
        <div style={LOG_CONTROL_LABEL_STYLE}>
          {label}
        </div>
        {!!helper && (
          <div style={LOG_CONTROL_HELPER_STYLE}>
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
      <div style={{ fontSize: "0.58rem", color: "var(--consumer-text)", fontWeight: 700, lineHeight: 1.3 }}>
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
      style={LOG_CONTROL_CARD_STYLE}
    >
      <div style={{ display: "grid", gap: "0.16rem" }}>
        <div style={LOG_CONTROL_LABEL_STYLE}>
          Session feel
        </div>
        <div style={LOG_CONTROL_HELPER_STYLE}>
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
                borderRadius: 18,
                display: "grid",
                gap: "0.08rem",
                justifyItems: "center",
                alignContent: "center",
                textAlign: "center",
                padding: "0.4rem 0.3rem",
                touchAction: "manipulation",
                boxShadow: isActive ? "var(--shadow-1)" : "none",
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

export function LogChoiceStrip({
  label = "",
  helper = "",
  value = "",
  options = [],
  onChange = () => {},
  dataTestId = "",
  optionTestIdPrefix = "",
}) {
  return (
    <SurfaceCard
      data-testid={dataTestId || undefined}
      variant="subtle"
      style={LOG_CONTROL_CARD_STYLE}
    >
      <div style={{ display: "grid", gap: "0.16rem" }}>
        <div style={LOG_CONTROL_LABEL_STYLE}>
          {label}
        </div>
        {!!helper && (
          <div style={LOG_CONTROL_HELPER_STYLE}>
            {helper}
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))", gap: "0.35rem" }}>
        {(options || []).map((option) => {
          const isActive = String(value || "") === String(option?.key || "");
          return (
            <button
              key={option?.key || option?.label}
              type="button"
              data-testid={optionTestIdPrefix ? `${optionTestIdPrefix}${option?.key || ""}` : undefined}
              className={isActive ? "btn btn-primary" : "btn"}
              onClick={() => onChange(option?.key || "")}
              style={{
                minHeight: 50,
                borderRadius: 16,
                justifyContent: "center",
                fontSize: "0.48rem",
                fontWeight: 700,
                lineHeight: 1.2,
                padding: "0.42rem 0.35rem",
                touchAction: "manipulation",
              }}
            >
              {option?.label || option?.key || ""}
            </button>
          );
        })}
      </div>
    </SurfaceCard>
  );
}

export function LogCompletionSelector({
  value = "",
  options = [],
  onChange = () => {},
  helper = "",
  dataTestId = "log-completion-selector",
}) {
  return (
    <LogChoiceStrip
      label="Session outcome"
      helper={helper}
      value={value}
      options={options}
      onChange={onChange}
      dataTestId={dataTestId}
      optionTestIdPrefix="log-completion-"
    />
  );
}

export function StrengthExecutionCard({
  row = null,
  index = 0,
  onStepField = () => {},
  onChangeField = () => {},
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
        ...LOG_CONTROL_CARD_STYLE,
        gap: "0.58rem",
      }}
    >
      <div style={{ display: "grid", gap: "0.2rem" }}>
        <div style={{ fontSize: "0.64rem", color: "var(--consumer-text)", fontWeight: 700, lineHeight: 1.28 }}>
          {row?.exercise || row?.prescribedExercise || `Exercise ${index + 1}`}
        </div>
        <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-muted)", lineHeight: 1.5 }}>
          {row?.prescribedExercise
            ? `Planned ${row.prescribedSetsText || row.prescribedSets || ""} sets${row?.prescribedRepsText ? `, ${row.prescribedRepsText}` : ""}${row?.prescribedWeight ? `, ${row.prescribedWeight} lb` : row?.bodyweightOnly ? ", bodyweight" : ""}`
            : "Extra movement"}
        </div>
        <ExerciseHowDisclosure
          dataTestId={`log-strength-help-${index}`}
          label={row?.exercise || row?.prescribedExercise || ""}
        />
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
              borderRadius: 18,
              flex: "1 1 160px",
              justifyContent: "center",
              borderColor: "rgba(94, 234, 212, 0.22)",
              color: "var(--consumer-text)",
              background: "linear-gradient(180deg, rgba(15, 23, 42, 0.74) 0%, rgba(8, 14, 25, 0.92) 100%)",
            }}
          >
          +1 set
        </button>
      </div>

      <details
        data-testid={`log-strength-row-disclosure-${index}`}
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        style={{ borderTop: "1px solid var(--consumer-border)", paddingTop: "0.5rem" }}
      >
        <summary style={{ cursor: "pointer", fontSize: "0.5rem", color: "var(--consumer-text-muted)" }}>
          Swap or rename
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
