import { useEffect, useState } from "react";

import { createEmptySettingsDeleteDiagnosticsState } from "./settings-surface-model.js";

export function useSettingsDeleteDiagnostics({
  activeSettingsSurface = "account",
  authEmail = "",
  authAccessToken = "",
  onTrackFrictionEvent = () => {},
} = {}) {
  const [deleteDiagnostics, setDeleteDiagnostics] = useState(createEmptySettingsDeleteDiagnosticsState);

  const refreshDeleteDiagnostics = async () => {
    if (!authEmail || !authAccessToken) {
      const emptyState = createEmptySettingsDeleteDiagnosticsState();
      setDeleteDiagnostics(emptyState);
      return { ok: false, diagnostics: emptyState };
    }

    const startedAt = Date.now();
    setDeleteDiagnostics((current) => ({ ...current, loading: true }));
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${authAccessToken}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      const next = {
        loading: false,
        checked: true,
        configured: Boolean(data?.configured),
        message: String(data?.message || (data?.configured ? "Account deletion is configured for this deployment." : "Account deletion could not be verified.")),
        detail: String(data?.detail || ""),
        fix: String(data?.fix || ""),
        missing: Array.isArray(data?.missing) ? data.missing : [],
        required: Array.isArray(data?.required) ? data.required : [],
      };
      setDeleteDiagnostics(next);
      onTrackFrictionEvent({
        flow: "settings",
        action: "delete_diagnostics",
        outcome: next.configured ? "success" : "blocked",
        props: {
          duration_ms: Date.now() - startedAt,
          missing_count: next.missing.length,
        },
      });
      return { ok: true, diagnostics: next };
    } catch (error) {
      const next = {
        loading: false,
        checked: true,
        configured: false,
        message: "Delete-account diagnostics could not be loaded.",
        detail: "The deployment did not confirm permanent delete support, so the delete flow stays blocked until diagnostics succeed.",
        fix: "Retry the diagnostics check. If it keeps failing, inspect the server deployment and the /api/auth/delete-account route.",
        missing: [],
        required: [],
      };
      setDeleteDiagnostics(next);
      onTrackFrictionEvent({
        flow: "settings",
        action: "delete_diagnostics",
        outcome: "error",
        props: {
          duration_ms: Date.now() - startedAt,
          error_code: String(error?.message || "diagnostics_failed").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
        },
      });
      return { ok: false, error, diagnostics: next };
    }
  };

  useEffect(() => {
    if (activeSettingsSurface !== "account" || !authEmail || !authAccessToken) {
      if (!authEmail || !authAccessToken) setDeleteDiagnostics(createEmptySettingsDeleteDiagnosticsState());
      return;
    }
    let active = true;
    (async () => {
      const result = await refreshDeleteDiagnostics();
      if (!active || !result?.diagnostics) return;
    })();
    return () => {
      active = false;
    };
  }, [activeSettingsSurface, authAccessToken, authEmail, onTrackFrictionEvent]);

  return {
    deleteDiagnostics,
    refreshDeleteDiagnostics,
  };
}
