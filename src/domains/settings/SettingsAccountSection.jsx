import React from "react";
import { formatSyncDiagnosticTimestamp } from "../../services/sync-diagnostics-service.js";
import { StateFeedbackBanner } from "../../components/StateFeedbackPrimitives.jsx";
import {
  SETTINGS_BODY_STYLE,
  SETTINGS_LABEL_STYLE,
  SETTINGS_PANEL_STYLE,
  SETTINGS_SECTION_HEADER_STYLE,
  SETTINGS_SECTION_STYLE,
  SETTINGS_SUBPANEL_STYLE,
  SETTINGS_TITLE_STYLE,
} from "./settings-ui.js";

const ACCOUNT_PANEL_STYLE = {
  ...SETTINGS_SUBPANEL_STYLE,
  gap: "0.34rem",
};

const LIFECYCLE_CARD_STYLE = {
  ...SETTINGS_SUBPANEL_STYLE,
  padding: "0.58rem 0.62rem",
  gap: "0.18rem",
};

const neutralButtonStyle = {
  color: "var(--text-strong)",
  borderColor: "var(--border-strong)",
};

const brandButtonStyle = {
  color: "var(--brand-accent)",
  borderColor: "var(--cta-border)",
};

const warnButtonStyle = {
  color: "#f7d39a",
  borderColor: "rgba(201,122,43,0.32)",
};

const dangerButtonStyle = {
  color: "#f5b5c3",
  borderColor: "rgba(216,93,120,0.32)",
};

const resolveAccountActionStyles = (tone = "neutral") => {
  if (tone === "success") {
    return {
      borderColor: "rgba(45,167,114,0.34)",
      background: "rgba(45,167,114,0.12)",
      color: "#d7f5e6",
    };
  }
  if (tone === "warn") {
    return {
      borderColor: "rgba(201,122,43,0.34)",
      background: "rgba(201,122,43,0.12)",
      color: "#f9e6b4",
    };
  }
  return {
    borderColor: "var(--border)",
    background: "var(--surface-1)",
    color: "var(--text)",
  };
};

export function SettingsAccountSection({
  colors,
  authEmail = "",
  syncStateCallout = null,
  lifecycleSummaryCards = [],
  accountActionMessage = "",
  accountActionFeedbackModel = null,
  accountActionTone = "neutral",
  accountActionBusy = "",
  onReloadCloud = () => {},
  onLifecycleSignOut = () => {},
  onOpenAuthGate = () => {},
  resetDevice = {},
  deleteAccount = {},
  backupAndReset = {},
  historyReport = {},
  passwordReset = {},
  syncDiagnostics = null,
  showInternalSettingsTools = false,
  showProtectedDiagnostics = false,
}) {
  const resetDeviceUi = {
    open: false,
    confirm: "",
    onToggle: () => {},
    onConfirmChange: () => {},
    onSubmit: () => {},
    ...resetDevice,
  };
  const deleteAccountUi = {
    diagnostics: null,
    open: false,
    step: 1,
    confirm: "",
    helpText: "",
    onToggle: () => {},
    onRetryDiagnostics: () => {},
    onExportFirst: () => {},
    onConfirmChange: () => {},
    onSubmit: () => {},
    ...deleteAccount,
  };
  const backupUi = {
    message: "",
    code: "",
    onCodeChange: () => {},
    onReviewRestore: () => {},
    onExportData: () => {},
    onCopyBackup: () => {},
    onResetPlan: () => {},
    ...backupAndReset,
  };
  const historyReportUi = {
    message: "",
    markdown: "",
    onGenerate: () => {},
    onCopy: () => {},
    ...historyReport,
  };
  const passwordResetUi = {
    busy: false,
    message: "",
    onRequest: () => {},
    ...passwordReset,
  };
  const deleteDiagnostics = deleteAccountUi.diagnostics || {};
  const accountActionStyles = resolveAccountActionStyles(accountActionTone);
  const syncDiagnosticsModel = syncDiagnostics || {};
  const formatHttpStatus = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? `HTTP ${parsed}` : "No HTTP status";
  };
  const yesNo = (value) => (value ? "Yes" : "No");

  return (
    <section data-testid="settings-account-section" style={SETTINGS_SECTION_STYLE}>
      <div style={SETTINGS_SECTION_HEADER_STYLE}>
        <div className="sect-title" style={{ color:"var(--text-strong)", marginBottom:0 }}>Account & sync</div>
        <div style={SETTINGS_BODY_STYLE}>
          {authEmail
            ? `Signed in as ${authEmail}.`
            : "This device is not signed in."}
        </div>
      </div>
      {syncStateCallout}
      {accountActionFeedbackModel ? (
        <StateFeedbackBanner
          model={accountActionFeedbackModel}
          dataTestId="settings-account-action-message"
          compact
        />
      ) : !!accountActionMessage ? (
        <div
          data-testid="settings-account-action-message"
          style={{
            border: `1px solid ${accountActionStyles.borderColor}`,
            borderRadius: 12,
            background: accountActionStyles.background,
            color: accountActionStyles.color,
            padding: "0.55rem 0.62rem",
            fontSize: "0.49rem",
            lineHeight: 1.55,
          }}
        >
          {accountActionMessage}
        </div>
      ) : null}
      {authEmail ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.4rem" }}>
          <div style={ACCOUNT_PANEL_STYLE}>
            <div style={{ fontSize:"0.47rem", color:"var(--text-soft)", letterSpacing:"0.08em" }}>REFRESH ACCOUNT DATA</div>
            <div style={{ fontSize:"0.54rem", color:"var(--text-strong)", lineHeight:1.45 }}>Pull the latest saved version to this device.</div>
            <button className="btn" disabled={accountActionBusy !== ""} onClick={onReloadCloud} style={{ width:"fit-content", fontSize:"0.48rem", ...brandButtonStyle }}>
              {accountActionBusy === "reload" ? "Refreshing..." : "Refresh from account"}
            </button>
          </div>
          <div style={ACCOUNT_PANEL_STYLE}>
            <div style={{ fontSize:"0.47rem", color:"var(--text-soft)", letterSpacing:"0.08em" }}>SIGN OUT</div>
            <div style={{ fontSize:"0.54rem", color:"var(--text-strong)", lineHeight:1.45 }}>Sign out without deleting your account.</div>
            <button data-testid="settings-logout" className="btn" disabled={accountActionBusy !== ""} onClick={onLifecycleSignOut} style={{ width:"fit-content", fontSize:"0.48rem", ...neutralButtonStyle }}>
              {accountActionBusy === "logout" ? "Signing out..." : "Sign out"}
            </button>
          </div>
          <div data-testid="settings-password-reset-card" style={ACCOUNT_PANEL_STYLE}>
            <div style={{ fontSize:"0.47rem", color:"var(--text-soft)", letterSpacing:"0.08em" }}>PASSWORD</div>
            <div style={{ fontSize:"0.54rem", color:"var(--text-strong)", lineHeight:1.45 }}>Email a password reset link to your account.</div>
            <button
              data-testid="settings-send-password-reset"
              className="btn"
              disabled={passwordResetUi.busy || accountActionBusy !== ""}
              onClick={passwordResetUi.onRequest}
              style={{ width:"fit-content", fontSize:"0.48rem", ...brandButtonStyle }}
            >
              {passwordResetUi.busy ? "Sending..." : "Email reset link"}
            </button>
            {!!passwordResetUi.message && (
              <div data-testid="settings-password-reset-message" style={{ fontSize:"0.47rem", color:"var(--text-soft)", lineHeight:1.5 }}>
                {passwordResetUi.message}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display:"grid", gap:"0.35rem" }}>
          <div style={{ fontSize:"0.48rem", color:"var(--text-soft)", lineHeight:1.45 }}>
            Sign in when you want sync across devices.
          </div>
          <button
            data-testid="settings-open-auth-gate"
            className="btn"
            onClick={onOpenAuthGate}
            style={{ width:"fit-content", fontSize:"0.48rem", ...brandButtonStyle }}
          >
            Sign in to sync
          </button>
        </div>
      )}
      <details data-testid="settings-account-advanced" style={SETTINGS_PANEL_STYLE}>
        <summary style={{ cursor:"pointer", fontSize:"0.52rem", color:"var(--text-strong)", lineHeight:1.45 }}>
          Export, restore, reset, and delete
        </summary>
        <div style={{ fontSize:"0.48rem", color:"var(--text-soft)", lineHeight:1.5 }}>
          Open this for backup, restore, reset, or delete.
        </div>
        {authEmail && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.4rem" }}>
            <div style={{ border:"1px solid var(--border)", borderRadius:12, background:"var(--surface-2)", padding:"0.62rem", display:"grid", gap:"0.34rem" }}>
              <div style={{ fontSize:"0.47rem", color:"var(--text-soft)", letterSpacing:"0.08em" }}>RESET THIS DEVICE</div>
              <div style={{ fontSize:"0.54rem", color:"var(--text-strong)", lineHeight:1.45 }}>Clear this device without deleting your account.</div>
              <button
                data-testid="settings-reset-device"
                className="btn"
                disabled={accountActionBusy !== ""}
                onClick={resetDeviceUi.onToggle}
                style={{ width:"fit-content", fontSize:"0.48rem", ...neutralButtonStyle }}
              >
                Reset this device
              </button>
              {resetDeviceUi.open && (
                <div style={{ border:"1px solid var(--border)", borderRadius:10, padding:"0.48rem", display:"grid", gap:"0.28rem" }}>
                  <div style={{ fontSize:"0.49rem", color:"var(--text-strong)", lineHeight:1.5 }}>Type <b>RESET</b> to clear only this device. Your account will still be available on other devices.</div>
                  <input data-testid="settings-reset-device-confirm" value={resetDeviceUi.confirm} onChange={(e) => resetDeviceUi.onConfirmChange(e.target.value)} placeholder="RESET" />
                  <button
                    data-testid="settings-reset-device-submit"
                    className="btn"
                    disabled={resetDeviceUi.confirm !== "RESET" || accountActionBusy !== ""}
                    onClick={resetDeviceUi.onSubmit}
                    style={{ width:"fit-content", fontSize:"0.48rem", ...warnButtonStyle }}
                  >
                    {accountActionBusy === "reset_device" ? "Resetting..." : "Reset this device"}
                  </button>
                </div>
              )}
            </div>
            <div data-testid="settings-delete-account-card" style={{ border:"1px solid rgba(216,93,120,0.18)", borderRadius:12, background:"rgba(44,18,28,0.28)", padding:"0.62rem", display:"grid", gap:"0.34rem" }}>
              <div style={{ fontSize:"0.47rem", color:"#c8a4b3", letterSpacing:"0.08em" }}>DELETE ACCOUNT</div>
              <div style={{ fontSize:"0.54rem", color:"#f1d4dd", lineHeight:1.45 }}>Delete your account and remove this device's saved data.</div>
              <div data-testid="settings-delete-account-status" style={{ fontSize:"0.47rem", color:deleteDiagnostics.loading ? "var(--text-strong)" : deleteDiagnostics.configured === true ? "#c9f1db" : "#f7d39a", lineHeight:1.5 }}>
                {deleteDiagnostics.loading
                  ? "Checking whether full account deletion is available here..."
                  : deleteDiagnostics.checked
                  ? deleteDiagnostics.message
                  : "Delete support has not been checked yet."}
              </div>
              <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
                <button
                  data-testid="settings-delete-account"
                  className="btn"
                  disabled={accountActionBusy !== "" || deleteDiagnostics.loading || deleteDiagnostics.configured !== true}
                  onClick={deleteAccountUi.onToggle}
                  style={{ fontSize:"0.48rem", ...dangerButtonStyle }}
                >
                  Delete account
                </button>
                <button
                  data-testid="settings-delete-account-retry-diagnostics"
                  className="btn"
                  disabled={accountActionBusy !== "" || deleteDiagnostics.loading}
                  onClick={deleteAccountUi.onRetryDiagnostics}
                  style={{ fontSize:"0.48rem", ...neutralButtonStyle }}
                >
                  {deleteDiagnostics.loading ? "Checking..." : "Check again"}
                </button>
              </div>
              {deleteDiagnostics.checked && deleteDiagnostics.configured !== true && (
                <div data-testid="settings-delete-account-help" style={{ border:"1px solid rgba(216,93,120,0.18)", borderRadius:10, padding:"0.5rem", display:"grid", gap:"0.3rem" }}>
                  <div style={{ fontSize:"0.48rem", color:"#f1d4dd", lineHeight:1.5 }}>
                    {deleteAccountUi.helpText}
                  </div>
                  {showInternalSettingsTools && (
                    <details data-testid="settings-delete-account-diagnostics">
                      <summary style={{ cursor:"pointer", fontSize:"0.47rem", color:"#c8a4b3" }}>Internal details</summary>
                      <div style={{ marginTop:"0.3rem", display:"grid", gap:"0.24rem" }}>
                        <div style={{ fontSize:"0.47rem", color:"#c8a4b3", lineHeight:1.5 }}>
                          {deleteDiagnostics.detail || "This deployment cannot permanently delete auth identities yet."}
                        </div>
                        {deleteDiagnostics.missing.length > 0 && (
                          <div style={{ fontSize:"0.47rem", color:"#c8a4b3", lineHeight:1.5 }}>
                            Required env: <span data-testid="settings-delete-account-missing-envs">{deleteDiagnostics.missing.join(", ")}</span>
                          </div>
                        )}
                        {!!deleteDiagnostics.fix && (
                          <div style={{ fontSize:"0.47rem", color:"#f7d39a", lineHeight:1.5 }}>
                            To enable delete: {deleteDiagnostics.fix}
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              )}
              {deleteDiagnostics.configured === true && deleteAccountUi.open && (
                <div style={{ border:"1px solid rgba(216,93,120,0.18)", borderRadius:10, padding:"0.48rem", display:"grid", gap:"0.3rem" }}>
                  {deleteAccountUi.step === 1 ? (
                    <>
                      <div style={{ fontSize:"0.5rem", color:"#f1d4dd", lineHeight:1.45 }}>Export first if you may want this history later. Deleting removes the account itself, not just this device&apos;s copy.</div>
                      <button data-testid="settings-delete-account-export" className="btn" onClick={deleteAccountUi.onExportFirst} style={{ width:"fit-content", fontSize:"0.48rem", ...neutralButtonStyle }}>Export first, then continue</button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:"0.5rem", color:"#f1d4dd", lineHeight:1.45 }}>Type <b>DELETE</b> to permanently remove the account.</div>
                      <input data-testid="settings-delete-account-confirm" value={deleteAccountUi.confirm} onChange={(e) => deleteAccountUi.onConfirmChange(e.target.value)} placeholder="DELETE" />
                      <button data-testid="settings-delete-account-submit" className="btn" disabled={deleteAccountUi.confirm !== "DELETE" || accountActionBusy !== ""} onClick={deleteAccountUi.onSubmit} style={{ width:"fit-content", fontSize:"0.48rem", ...dangerButtonStyle }}>
                        {accountActionBusy === "delete_account" ? "Deleting..." : "Delete account"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <div style={{ border:"1px solid var(--border)", borderRadius:12, background:"var(--surface-1)", padding:"0.55rem 0.6rem", display:"grid", gap:"0.4rem" }}>
          <div style={{ display:"grid", gap:"0.14rem" }}>
            <div style={{ fontSize:"0.48rem", color:"var(--text-soft)", letterSpacing:"0.08em" }}>BACKUP AND RESET</div>
            <div style={{ fontSize:"0.5rem", color:"var(--text-soft)", lineHeight:1.5 }}>
              Export your data, keep a backup code, or reset your plan.
            </div>
          </div>
          <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
            <button className="btn" onClick={backupUi.onExportData} style={{ fontSize:"0.48rem", ...brandButtonStyle }}>Export data</button>
            <button className="btn" onClick={backupUi.onCopyBackup} style={{ fontSize:"0.48rem", ...neutralButtonStyle }}>Copy backup code</button>
            <button className="btn" onClick={backupUi.onResetPlan} style={{ fontSize:"0.48rem", color:"var(--text)", borderColor:"var(--border)" }}>Reset plan</button>
          </div>
          {!!backupUi.message && <div style={{ fontSize:"0.47rem", color:"var(--text)" }}>{backupUi.message}</div>}
          <textarea aria-label="Backup code to restore" value={backupUi.code} onChange={(e) => backupUi.onCodeChange(e.target.value)} placeholder="Paste backup code to restore" style={{ minHeight:62, fontSize:"max(16px, 0.5rem)" }} />
          <button className="btn" onClick={backupUi.onReviewRestore} style={{ width:"fit-content", fontSize:"0.47rem", ...brandButtonStyle }}>Review restore</button>
        </div>
        {showInternalSettingsTools && showProtectedDiagnostics && (
          <div data-testid="settings-reviewer-report-card" style={{ border:"1px solid var(--border)", borderRadius:12, background:"var(--surface-1)", padding:"0.55rem 0.6rem", display:"grid", gap:"0.4rem" }}>
            <div style={{ display:"grid", gap:"0.14rem" }}>
              <div style={{ fontSize:"0.48rem", color:"var(--text-soft)", letterSpacing:"0.08em" }}>PLAN HISTORY EXPORT</div>
              <div style={{ fontSize:"0.5rem", color:"var(--text-soft)", lineHeight:1.5 }}>
                Generate a markdown export with the original plan, latest plan, workout log, revision count, and week summaries.
              </div>
            </div>
            <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
              <button data-testid="settings-reviewer-report-generate" className="btn" onClick={historyReportUi.onGenerate} style={{ fontSize:"0.48rem", ...brandButtonStyle }}>
                Create history export
              </button>
              <button data-testid="settings-reviewer-report-copy" className="btn" onClick={historyReportUi.onCopy} style={{ fontSize:"0.48rem", ...neutralButtonStyle }}>
                Copy export
              </button>
            </div>
            {!!historyReportUi.message && (
              <div data-testid="settings-reviewer-report-status" style={{ fontSize:"0.47rem", color:"var(--text)", lineHeight:1.5 }}>
                {historyReportUi.message}
              </div>
            )}
            <textarea
              data-testid="settings-reviewer-report-textarea"
              value={historyReportUi.markdown}
              readOnly
              placeholder="Create a plan history export to review how your training changed over time."
              style={{ minHeight:160, fontSize:"max(16px, 0.5rem)", lineHeight:1.55 }}
            />
          </div>
        )}
        {showInternalSettingsTools && (
          <details data-testid="settings-sync-diagnostics" style={{ border:"1px solid var(--border)", borderRadius:12, background:"var(--surface-1)", padding:"0.55rem 0.6rem", display:"grid", gap:"0.4rem" }}>
            <summary style={{ cursor:"pointer", fontSize:"0.52rem", color:"var(--text-strong)", lineHeight:1.45 }}>
              Internal sync details
            </summary>
            <div style={{ fontSize:"0.48rem", color:"var(--text-soft)", lineHeight:1.5 }}>
              Exact sync evidence for trainer_data save/load, auth refresh, realtime reconnect, and local-cache authority. This is debug-only and intentionally stays out of normal product copy.
            </div>
            <div data-testid="settings-sync-diagnostics-last-attempt" style={{ fontSize:"0.48rem", color:"var(--text-strong)", lineHeight:1.55 }}>
              Last sync attempt: {formatSyncDiagnosticTimestamp(syncDiagnosticsModel?.lastSyncAttemptAt)} - {syncDiagnosticsModel?.lastSyncSource || "none"} - {syncDiagnosticsModel?.lastEndpoint || "no endpoint"} - {syncDiagnosticsModel?.lastMethod || "no method"}
            </div>
            <div data-testid="settings-sync-diagnostics-last-failure" style={{ fontSize:"0.48rem", color:"var(--text-strong)", lineHeight:1.55 }}>
              Last failing endpoint: {syncDiagnosticsModel?.lastFailingEndpoint || "none"} - {syncDiagnosticsModel?.lastFailingMethod || "no method"} - {formatHttpStatus(syncDiagnosticsModel?.lastHttpStatus)} - code {syncDiagnosticsModel?.lastSupabaseErrorCode || "none"} - retry eligible {yesNo(syncDiagnosticsModel?.retryEligible)} - pending local writes {yesNo(syncDiagnosticsModel?.pendingLocalWrites)}
            </div>
            <div data-testid="settings-sync-diagnostics-retry-reason" style={{ fontSize:"0.48rem", color:"var(--text-strong)", lineHeight:1.55 }}>
              Retry reason: {syncDiagnosticsModel?.retryReasonKey || "none"} - last error {syncDiagnosticsModel?.lastErrorMessage || "none"}
            </div>
            <div data-testid="settings-sync-diagnostics-last-write-success" style={{ fontSize:"0.48rem", color:"var(--text-strong)", lineHeight:1.55 }}>
              Last successful cloud write: {formatSyncDiagnosticTimestamp(syncDiagnosticsModel?.trainerDataSave?.lastSuccessAt)} - {syncDiagnosticsModel?.trainerDataSave?.lastEndpoint || "rest/v1/trainer_data"} - {formatHttpStatus(syncDiagnosticsModel?.trainerDataSave?.lastHttpStatus)}
            </div>
            <div data-testid="settings-sync-diagnostics-last-read-success" style={{ fontSize:"0.48rem", color:"var(--text-strong)", lineHeight:1.55 }}>
              Last successful cloud read: {formatSyncDiagnosticTimestamp(syncDiagnosticsModel?.trainerDataLoad?.lastSuccessAt)} - {syncDiagnosticsModel?.trainerDataLoad?.lastEndpoint || "rest/v1/trainer_data"} - {formatHttpStatus(syncDiagnosticsModel?.trainerDataLoad?.lastHttpStatus)}
            </div>
            <div data-testid="settings-sync-diagnostics-auth-refresh" style={{ fontSize:"0.48rem", color:"var(--text-strong)", lineHeight:1.55 }}>
              Auth refresh: {syncDiagnosticsModel?.authRefresh?.lastStatus || "idle"} at {formatSyncDiagnosticTimestamp(syncDiagnosticsModel?.authRefresh?.lastAttemptAt)} - {syncDiagnosticsModel?.authRefresh?.lastEndpoint || "auth/v1/token?grant_type=refresh_token"} - {formatHttpStatus(syncDiagnosticsModel?.authRefresh?.lastHttpStatus)} - code {syncDiagnosticsModel?.authRefresh?.lastSupabaseErrorCode || "none"}
            </div>
            <div data-testid="settings-sync-diagnostics-auth-state" style={{ fontSize:"0.48rem", color:"var(--text-strong)", lineHeight:1.55 }}>
              Auth state: session {yesNo(syncDiagnosticsModel?.authState?.hasSession)} - user {syncDiagnosticsModel?.authState?.userId || "none"} - email {syncDiagnosticsModel?.authState?.email || "none"} - refresh token {yesNo(syncDiagnosticsModel?.authState?.hasRefreshToken)} - expires {formatSyncDiagnosticTimestamp(syncDiagnosticsModel?.authState?.expiresAt)} - status {syncDiagnosticsModel?.authState?.lastEnsureStatus || "unknown"}
            </div>
            <div data-testid="settings-sync-diagnostics-client-config" style={{ fontSize:"0.48rem", color:"var(--text-strong)", lineHeight:1.55 }}>
              Client cloud config: url configured {yesNo(syncDiagnosticsModel?.clientConfig?.supabaseUrlConfigured)} from {syncDiagnosticsModel?.clientConfig?.supabaseUrlSource || "missing"} - host {syncDiagnosticsModel?.clientConfig?.supabaseUrlHost || "missing"} - anon key configured {yesNo(syncDiagnosticsModel?.clientConfig?.supabaseAnonKeyConfigured)} from {syncDiagnosticsModel?.clientConfig?.supabaseAnonKeySource || "missing"}
            </div>
            <div data-testid="settings-sync-diagnostics-client-config-error" style={{ fontSize:"0.47rem", color:"var(--text-soft)", lineHeight:1.55 }}>
              Client config error: {syncDiagnosticsModel?.clientConfig?.configError || "none"}
            </div>
            <div data-testid="settings-sync-diagnostics-realtime" style={{ fontSize:"0.48rem", color:"var(--text-strong)", lineHeight:1.55 }}>
              Realtime: status {syncDiagnosticsModel?.realtime?.lastStatus || "idle"} at {formatSyncDiagnosticTimestamp(syncDiagnosticsModel?.realtime?.lastStatusAt)} - reconnects {Number(syncDiagnosticsModel?.realtime?.reconnectAttempts || 0)} - last reason {syncDiagnosticsModel?.realtime?.lastReconnectReason || "none"} - last resync {syncDiagnosticsModel?.realtime?.lastResyncStatus || "idle"} at {formatSyncDiagnosticTimestamp(syncDiagnosticsModel?.realtime?.lastResyncAt)}
            </div>
            <div data-testid="settings-sync-diagnostics-local-cache" style={{ fontSize:"0.48rem", color:"var(--text-strong)", lineHeight:1.55 }}>
              Local cache: pending writes {yesNo(syncDiagnosticsModel?.localCache?.hasPendingWrites)} - last mutation {formatSyncDiagnosticTimestamp(syncDiagnosticsModel?.localCache?.lastLocalMutationTs)} - last cloud sync {formatSyncDiagnosticTimestamp(syncDiagnosticsModel?.localCache?.lastCloudSyncTs)} - authority {syncDiagnosticsModel?.localCache?.authorityDecision || "none"} at {formatSyncDiagnosticTimestamp(syncDiagnosticsModel?.localCache?.authorityAt)}
            </div>
            <div data-testid="settings-sync-diagnostics-local-cache-reason" style={{ fontSize:"0.47rem", color:"var(--text-soft)", lineHeight:1.55 }}>
              Authority reason: {syncDiagnosticsModel?.localCache?.authorityReason || "No cache arbitration recorded yet."}
            </div>
          </details>
        )}
      </details>
    </section>
  );
}
