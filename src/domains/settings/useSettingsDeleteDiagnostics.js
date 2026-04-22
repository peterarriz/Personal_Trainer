import { useCallback, useEffect, useRef, useState } from "react";

import {
  createEmptySettingsDeleteDiagnosticsState,
  shouldReuseDeleteDiagnosticsResult,
} from "./settings-surface-model.js";
import {
  buildDeleteAccountEndpointUnavailableDiagnostics,
  DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT,
  getTemporarilyUnavailableEndpoint,
  isMissingEndpointResponseStatus,
  markEndpointTemporarilyUnavailable,
} from "../../services/runtime-endpoint-availability-service.js";

const buildDeleteDiagnosticsState = (payload = {}) => ({
  loading: false,
  checked: true,
  checkedAt: Number(payload?.checkedAt || Date.now()),
  configured: Boolean(payload?.configured),
  message: String(payload?.message || (payload?.configured ? "Account deletion is configured for this deployment." : "Account deletion could not be verified.")),
  detail: String(payload?.detail || ""),
  fix: String(payload?.fix || ""),
  missing: Array.isArray(payload?.missing) ? payload.missing : [],
  required: Array.isArray(payload?.required) ? payload.required : [],
});

export function useSettingsDeleteDiagnostics({
  activeSettingsSurface = "account",
  authEmail = "",
  authAccessToken = "",
  onTrackFrictionEvent = () => {},
} = {}) {
  const [deleteDiagnostics, setDeleteDiagnostics] = useState(createEmptySettingsDeleteDiagnosticsState);
  const deleteDiagnosticsRef = useRef(deleteDiagnostics);
  const inFlightRequestRef = useRef(null);
  const lastSettledRequestKeyRef = useRef("");

  useEffect(() => {
    deleteDiagnosticsRef.current = deleteDiagnostics;
  }, [deleteDiagnostics]);

  const refreshDeleteDiagnostics = useCallback(async ({ force = false } = {}) => {
    if (!authEmail || !authAccessToken) {
      const emptyState = createEmptySettingsDeleteDiagnosticsState();
      inFlightRequestRef.current = null;
      lastSettledRequestKeyRef.current = "";
      setDeleteDiagnostics(emptyState);
      return { ok: false, diagnostics: emptyState };
    }

    const requestKey = `${String(authEmail || "").trim().toLowerCase()}::${String(authAccessToken || "").slice(0, 24)}`;
    if (!force && inFlightRequestRef.current?.key === requestKey && inFlightRequestRef.current?.promise) {
      return inFlightRequestRef.current.promise;
    }
    if (
      !force
      && lastSettledRequestKeyRef.current === requestKey
      && shouldReuseDeleteDiagnosticsResult({ diagnostics: deleteDiagnosticsRef.current })
    ) {
      return {
        ok: true,
        diagnostics: deleteDiagnosticsRef.current,
        reused: true,
      };
    }

    const startedAt = Date.now();
    const requestPromise = (async () => {
      setDeleteDiagnostics((current) => ({ ...current, loading: true }));
      try {
        const unavailableEndpoint = getTemporarilyUnavailableEndpoint({
          endpoint: DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT,
        });
        if (unavailableEndpoint) {
          const next = buildDeleteDiagnosticsState(
            buildDeleteAccountEndpointUnavailableDiagnostics({
              status: unavailableEndpoint?.status,
              reason: unavailableEndpoint?.reason,
            })
          );
          lastSettledRequestKeyRef.current = requestKey;
          setDeleteDiagnostics(next);
          onTrackFrictionEvent({
            flow: "settings",
            action: "delete_diagnostics",
            outcome: "blocked",
            props: {
              duration_ms: Date.now() - startedAt,
              missing_count: 0,
            },
          });
          return { ok: true, diagnostics: next, skipped: true };
        }

        const res = await fetch(DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${authAccessToken}`,
          },
        });
        const data = await res.json().catch(() => ({}));
        if (isMissingEndpointResponseStatus(res?.status)) {
          markEndpointTemporarilyUnavailable({
            endpoint: DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT,
            status: res?.status,
            reason: String(data?.code || data?.message || "endpoint_unavailable"),
          });
          const next = buildDeleteDiagnosticsState(
            buildDeleteAccountEndpointUnavailableDiagnostics({
              status: res?.status,
              reason: String(data?.code || data?.message || "endpoint_unavailable"),
            })
          );
          lastSettledRequestKeyRef.current = requestKey;
          setDeleteDiagnostics(next);
          onTrackFrictionEvent({
            flow: "settings",
            action: "delete_diagnostics",
            outcome: "blocked",
            props: {
              duration_ms: Date.now() - startedAt,
              missing_count: 0,
            },
          });
          return { ok: true, diagnostics: next, skipped: true };
        }
        const next = buildDeleteDiagnosticsState({
          ...data,
          checkedAt: Date.now(),
        });
        lastSettledRequestKeyRef.current = requestKey;
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
          checkedAt: Date.now(),
          configured: false,
          message: "Delete-account diagnostics could not be loaded.",
          detail: "The deployment did not confirm permanent delete support, so the delete flow stays blocked until diagnostics succeed.",
          fix: `Retry the diagnostics check. If it keeps failing, inspect the server deployment and the ${DELETE_ACCOUNT_DIAGNOSTICS_ENDPOINT} route.`,
          missing: [],
          required: [],
        };
        lastSettledRequestKeyRef.current = requestKey;
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
    })();
    inFlightRequestRef.current = {
      key: requestKey,
      promise: requestPromise,
    };
    try {
      return await requestPromise;
    } finally {
      if (inFlightRequestRef.current?.promise === requestPromise) {
        inFlightRequestRef.current = null;
      }
    }
  }, [authAccessToken, authEmail, onTrackFrictionEvent]);

  useEffect(() => {
    if (activeSettingsSurface !== "account" || !authEmail || !authAccessToken) {
      if (!authEmail || !authAccessToken) {
        inFlightRequestRef.current = null;
        lastSettledRequestKeyRef.current = "";
        setDeleteDiagnostics(createEmptySettingsDeleteDiagnosticsState());
      }
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
  }, [activeSettingsSurface, authAccessToken, authEmail, refreshDeleteDiagnostics]);

  return {
    deleteDiagnostics,
    refreshDeleteDiagnostics,
  };
}
