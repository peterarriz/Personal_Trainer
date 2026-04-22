import {
  canExposeProtectedDiagnostics,
} from "../../services/internal-access-policy-service.js";

const SETTINGS_SURFACES = Object.freeze([
  { key: "account", label: "Account", helper: "Sign-in and backup" },
  { key: "profile", label: "Profile", helper: "Basics and units" },
  { key: "goals", label: "Goals", helper: "Priorities and timing" },
  { key: "baselines", label: "Plan inputs", helper: "Current inputs" },
  { key: "programs", label: "Plan layers", helper: "Named plan + style" },
  { key: "preferences", label: "Preferences", helper: "Defaults and reminders" },
  { key: "advanced", label: "Devices", helper: "Connections" },
]);

const FOCUS_TO_SURFACE = {
  advanced: "advanced",
  appearance: "preferences",
  baselines: "baselines",
  goals: "goals",
  metrics: "baselines",
  plan: "goals",
  preferences: "preferences",
  profile: "profile",
  programs: "programs",
  styles: "programs",
};

export { SETTINGS_SURFACES };

export const DELETE_DIAGNOSTICS_STALE_MS = 5 * 60 * 1000;

export const createEmptySettingsDeleteDiagnosticsState = () => ({
  loading: false,
  checked: false,
  checkedAt: 0,
  configured: null,
  message: "",
  detail: "",
  fix: "",
  missing: [],
  required: [],
});

export const shouldReuseDeleteDiagnosticsResult = ({
  diagnostics = null,
  now = Date.now(),
  staleMs = DELETE_DIAGNOSTICS_STALE_MS,
} = {}) => {
  if (!diagnostics?.checked) return false;
  const checkedAt = Number(diagnostics?.checkedAt || 0);
  if (!Number.isFinite(checkedAt) || checkedAt <= 0) return false;
  return (now - checkedAt) < Math.max(1000, Number(staleMs || DELETE_DIAGNOSTICS_STALE_MS));
};

export const resolveSettingsSurfaceFromFocus = (focus = "") => {
  const normalizedFocus = String(focus || "").trim().toLowerCase();
  return FOCUS_TO_SURFACE[normalizedFocus] || "account";
};

export const readSettingsDiagnosticsVisibility = ({
  debugMode = false,
  hostname = "",
  locationSearch = "",
  storedDiagnosticsFlag = "0",
} = {}) => canExposeProtectedDiagnostics({
  debugMode,
  hostname,
  locationSearch,
  storedDiagnosticsFlag,
});

const buildSettingsAccountIdentityState = (authEmail = "") => (
  authEmail
    ? {
      label: "Signed-in account",
      detail: authEmail,
    }
    : {
      label: "No account connected",
      detail: "This device is currently being used without a signed-in account.",
    }
);

const buildSettingsDeviceLifecycleState = ({ storageReason = "", syncStateModel = null } = {}) => {
  if (storageReason === "device_reset") {
    return {
      label: "Fresh on this device",
      detail: "Saved app data was cleared on this device. You can sign in or start fresh here.",
    };
  }
  if (storageReason === "signed_out" || storageReason === "not_signed_in") {
    return {
      label: "Saved on this device",
      detail: "Signing out pauses account sync, but it does not clear this device unless you reset it.",
    };
  }
  return {
    label: "Saved on this device",
    detail: syncStateModel?.assurance || "This browser keeps a local copy so FORMA stays usable when account sync has a temporary issue.",
  };
};

export const buildSettingsAccountStateModel = ({
  authEmail = "",
  storageReason = "",
  syncStateModel = null,
} = {}) => {
  const accountIdentityState = buildSettingsAccountIdentityState(authEmail);
  const accountSyncState = {
    label: syncStateModel?.headline || "Your account and this device are up to date",
    detail: syncStateModel?.detail || "Everything is saved.",
  };
  const deviceLifecycleState = buildSettingsDeviceLifecycleState({
    storageReason,
    syncStateModel,
  });

  return {
    accountIdentityState,
    accountSyncState,
    deviceLifecycleState,
    lifecycleSummaryCards: [
      { id: "identity", label: accountIdentityState.label, detail: accountIdentityState.detail },
      { id: "cloud", label: accountSyncState.label, detail: accountSyncState.detail },
      { id: "device", label: deviceLifecycleState.label, detail: deviceLifecycleState.detail },
    ],
  };
};

export const buildDeleteAccountHelpText = (deleteDiagnostics = null) => (
  deleteDiagnostics?.configured === true
    ? ""
    : "Full account deletion is not available here yet. You can still sign out or reset this device."
);
