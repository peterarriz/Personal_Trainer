import { useEffect, useMemo, useState } from "react";

import {
  buildSettingsAccountStateModel,
  readSettingsDiagnosticsVisibility,
  resolveSettingsSurfaceFromFocus,
} from "./settings-surface-model.js";

export function useSettingsScreenState({
  focusSection = "",
  authEmail = "",
  debugMode = false,
  storageReason = "",
  syncStateModel = null,
  diagnosticsLocationSearch = "",
  storedDiagnosticsFlag = "0",
  onTrackFrictionEvent = () => {},
} = {}) {
  const [activeSettingsSurface, setActiveSettingsSurface] = useState(() => resolveSettingsSurfaceFromFocus(focusSection));

  useEffect(() => {
    onTrackFrictionEvent({
      flow: "settings",
      action: "surface_view",
      outcome: "viewed",
      props: {
        surface: activeSettingsSurface,
        signed_in: Boolean(authEmail),
      },
    });
  }, [activeSettingsSurface, authEmail, onTrackFrictionEvent]);

  useEffect(() => {
    if (!focusSection) return;
    setActiveSettingsSurface(resolveSettingsSurfaceFromFocus(focusSection));
  }, [focusSection]);

  const showProtectedDiagnostics = useMemo(() => readSettingsDiagnosticsVisibility({
    debugMode,
    locationSearch: diagnosticsLocationSearch,
    storedDiagnosticsFlag,
  }), [debugMode, diagnosticsLocationSearch, storedDiagnosticsFlag]);

  const accountStateModel = useMemo(() => buildSettingsAccountStateModel({
    authEmail,
    storageReason,
    syncStateModel,
  }), [authEmail, storageReason, syncStateModel]);

  return {
    activeSettingsSurface,
    setActiveSettingsSurface,
    lifecycleSummaryCards: accountStateModel.lifecycleSummaryCards,
    showProtectedDiagnostics,
  };
}
