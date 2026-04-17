import {
  canExposeProtectedDiagnostics,
} from "../../services/internal-access-policy-service.js";

const SETTINGS_SURFACES = Object.freeze([
  { key: "account", label: "Account", helper: "Sign-in, backup, and reset" },
  { key: "profile", label: "Profile", helper: "Body, units, and athlete basics" },
  { key: "goals", label: "Goals", helper: "Edit priorities and timelines" },
  { key: "baselines", label: "Plan inputs", helper: "Needed now, nice to add, accuracy later" },
  { key: "programs", label: "Plan style", helper: "Adaptive, structured, and training bias" },
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
      label: "No cloud account active",
      detail: "This device is currently operating without a signed-in account.",
    }
);

const buildSettingsDeviceLifecycleState = ({ storageReason = "", syncStateModel = null } = {}) => {
  if (storageReason === "device_reset") {
    return {
      label: "Blank local start",
      detail: "Local runtime data was cleared on this device. The next step can be sign-in or a brand-new local session.",
    };
  }
  if (storageReason === "signed_out" || storageReason === "not_signed_in") {
    return {
      label: "Local cache available",
      detail: "Signing out pauses cloud sync but does not delete this device automatically unless you choose a device reset.",
    };
  }
  return {
    label: "Local resilience active",
    detail: syncStateModel?.assurance || "This browser keeps a local copy so the app can stay usable through transient cloud issues.",
  };
};

export const buildSettingsAccountStateModel = ({
  authEmail = "",
  storageReason = "",
  syncStateModel = null,
} = {}) => {
  const accountIdentityState = buildSettingsAccountIdentityState(authEmail);
  const accountSyncState = {
    label: syncStateModel?.headline || "Cloud and device are aligned",
    detail: syncStateModel?.detail || "Cloud data is up to date.",
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
    : "Permanent delete is not available here yet. You can still sign out or reset this device."
);
