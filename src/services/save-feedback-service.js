import {
  SYNC_STATE_IDS,
} from "./sync-state-service.js";

export const SAVE_FEEDBACK_PHASES = Object.freeze({
  idle: "idle",
  saving: "saving",
  saved: "saved",
  error: "error",
});

export const SAVE_FEEDBACK_TONES = Object.freeze({
  info: "info",
  success: "success",
  caution: "caution",
  critical: "critical",
});

const sanitizeCopy = (value = "", maxLen = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLen);

const joinSavedTitle = (savedAtLabel = "") => {
  const stamp = sanitizeCopy(savedAtLabel, 32);
  return stamp ? `Saved ${stamp}` : "Saved";
};

const buildSavedStateFromSync = ({
  syncState = null,
  savedAtLabel = "",
  successMessage = "",
} = {}) => {
  const stateId = String(syncState?.id || SYNC_STATE_IDS.synced).trim();
  const reasonKey = String(syncState?.reasonKey || "").trim();
  const title = joinSavedTitle(savedAtLabel);
  const detail = sanitizeCopy(successMessage || "", 220);
  const defaultSavedDetail = detail || "Everything is up to date.";

  if (stateId === SYNC_STATE_IDS.retrying) {
    return {
      tone: SAVE_FEEDBACK_TONES.caution,
      chipLabel: "Saved here",
      title,
      detail: detail || "We are still sending this to your account.",
      support: "You do not need to enter it again.",
    };
  }

  if (stateId === SYNC_STATE_IDS.staleCloud) {
    return {
      tone: SAVE_FEEDBACK_TONES.caution,
      chipLabel: "Saved here",
      title,
      detail: detail || "Other devices may still be a step behind for a moment.",
      support: "Keep using this device while the account copy catches up.",
    };
  }

  if (stateId === SYNC_STATE_IDS.offlineLocal) {
    const offlineSupport = reasonKey === "browser_offline" || reasonKey === "browser_offline_with_cache"
      ? "It will sync after you reconnect."
      : reasonKey === "signed_out" || reasonKey === "session_expired"
      ? "Sign in again when you want this on your other devices."
      : reasonKey === "setup_incomplete_local"
      ? "Finish setup when you want syncing to begin."
      : "This device keeps the latest copy for now.";
    return {
      tone: SAVE_FEEDBACK_TONES.caution,
      chipLabel: reasonKey === "browser_offline" || reasonKey === "browser_offline_with_cache" ? "Saved offline" : "Saved here",
      title,
      detail: detail || "This save is secure on this device.",
      support: offlineSupport,
    };
  }

  if (stateId === SYNC_STATE_IDS.conflictNeedsResolution) {
    return {
      tone: SAVE_FEEDBACK_TONES.critical,
      chipLabel: "Saved here",
      title,
      detail: detail || "This device kept the latest copy while account data needs review.",
      support: syncState?.nextStep || "Open Settings before you replace this device with cloud data.",
    };
  }

  if (stateId === SYNC_STATE_IDS.fatalError) {
    return {
      tone: SAVE_FEEDBACK_TONES.critical,
      chipLabel: "Saved here",
      title,
      detail: detail || "This save stayed on this device because account sync is unavailable.",
      support: syncState?.nextStep || "Keep using this device locally for now.",
    };
  }

  if (stateId === SYNC_STATE_IDS.syncing || stateId === SYNC_STATE_IDS.loading) {
    return {
      tone: SAVE_FEEDBACK_TONES.info,
      chipLabel: "Saved",
      title,
      detail: detail || "The account copy is still updating.",
      support: "This usually finishes on its own.",
    };
  }

  return {
    tone: SAVE_FEEDBACK_TONES.success,
    chipLabel: "Saved",
    title,
    detail: defaultSavedDetail,
    support: "",
  };
};

export const buildSaveFeedbackModel = ({
  phase = SAVE_FEEDBACK_PHASES.idle,
  syncState = null,
  savedAtLabel = "",
  successMessage = "",
  savingMessage = "",
  errorMessage = "",
} = {}) => {
  const normalizedPhase = String(phase || SAVE_FEEDBACK_PHASES.idle).trim();

  if (normalizedPhase === SAVE_FEEDBACK_PHASES.idle) {
    return {
      show: false,
      phase: normalizedPhase,
      tone: SAVE_FEEDBACK_TONES.info,
      chipLabel: "",
      title: "",
      detail: "",
      support: "",
      liveMode: "off",
    };
  }

  if (normalizedPhase === SAVE_FEEDBACK_PHASES.saving) {
    return {
      show: true,
      phase: normalizedPhase,
      tone: SAVE_FEEDBACK_TONES.info,
      chipLabel: "Saving",
      title: "Saving your changes",
      detail: sanitizeCopy(savingMessage || "This should only take a moment.", 220),
      support: "",
      liveMode: "polite",
    };
  }

  if (normalizedPhase === SAVE_FEEDBACK_PHASES.error) {
    return {
      show: true,
      phase: normalizedPhase,
      tone: SAVE_FEEDBACK_TONES.critical,
      chipLabel: "Not saved",
      title: "Save did not finish",
      detail: sanitizeCopy(errorMessage || "Try again in a moment.", 220),
      support: "",
      liveMode: "assertive",
    };
  }

  const savedState = buildSavedStateFromSync({
    syncState,
    savedAtLabel,
    successMessage,
  });
  return {
    show: true,
    phase: SAVE_FEEDBACK_PHASES.saved,
    liveMode: "polite",
    ...savedState,
  };
};
