import {
  canExposeProtectedDiagnostics,
} from "../../services/internal-access-policy-service.js";

const SETTINGS_SURFACES = Object.freeze([
  { key: "account", label: "Account", helper: "Sign-in, backup, and reset" },
  { key: "profile", label: "Profile", helper: "Body, units, and athlete basics" },
  { key: "goals", label: "Goals", helper: "Edit priorities and timelines" },
  { key: "baselines", label: "Plan inputs", helper: "Current essentials, nice-to-add details, better accuracy later" },
  { key: "programs", label: "Plan style", helper: "Built-for-you plan, named plans, and training feel" },
  { key: "preferences", label: "Preferences", helper: "Defaults, appearance, and reminder status" },
  { key: "advanced", label: "Devices", helper: "Apple Health, Garmin, and location" },
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

export const createEmptySettingsDeleteDiagnosticsState = () => ({
  loading: false,
  checked: false,
  configured: null,
  message: "",
  detail: "",
  fix: "",
  missing: [],
  required: [],
});

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
