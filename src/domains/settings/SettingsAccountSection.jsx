import React from "react";

const ACCOUNT_PANEL_STYLE = {
  border: "1px solid #243752",
  borderRadius: 12,
  background: "#0f172a",
  padding: "0.62rem",
  display: "grid",
  gap: "0.34rem",
};

const LIFECYCLE_CARD_STYLE = {
  border: "1px solid #243752",
  borderRadius: 12,
  background: "#0f172a",
  padding: "0.58rem 0.62rem",
  display: "grid",
  gap: "0.18rem",
};

const resolveAccountActionStyles = (tone = "neutral") => {
  if (tone === "success") {
    return {
      borderColor: `${"#2da772"}55`,
      background: `${"#2da772"}12`,
      color: "#d7f5e6",
    };
  }
  if (tone === "warn") {
    return {
      borderColor: `${"#c97a2b"}55`,
      background: `${"#c97a2b"}12`,
      color: "#f9e6b4",
    };
  }
  return {
    borderColor: "#243752",
    background: "#0f172a",
    color: "#dbe7f6",
  };
};

export function SettingsAccountSection({
  colors,
  authEmail = "",
  syncStateCallout = null,
  lifecycleSummaryCards = [],
  accountActionMessage = "",
  accountActionTone = "neutral",
  accountActionBusy = "",
  onReloadCloud = () => {},
  onLifecycleSignOut = () => {},
  onOpenAuthGate = () => {},
  resetDevice = {},
  deleteAccount = {},
  backupAndReset = {},
  showInternalSettingsTools = false,
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
  const deleteDiagnostics = deleteAccountUi.diagnostics || {};
  const accountActionStyles = resolveAccountActionStyles(accountActionTone);

  return (
    <section data-testid="settings-account-section" style={{ borderTop:"1px solid #233851", paddingTop:"0.75rem", display:"grid", gap:"0.45rem" }}>
      <div style={{ display:"grid", gap:"0.14rem" }}>
        <div className="sect-title" style={{ color:"#dbe7f6", marginBottom:0 }}>Account & sync</div>
        <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>
          {authEmail
            ? `Signed in as ${authEmail}.`
            : "You are currently using this device without a signed-in cloud account."}
        </div>
      </div>
      {syncStateCallout}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.38rem" }}>
        {lifecycleSummaryCards.map((card) => (
          <div key={card.id} style={LIFECYCLE_CARD_STYLE}>
            <div style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>{card.id.toUpperCase()}</div>
            <div style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.45 }}>{card.label}</div>
            <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.5 }}>{card.detail}</div>
          </div>
        ))}
      </div>
      {!!accountActionMessage && (
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
      )}
      {authEmail ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.4rem" }}>
          <div style={ACCOUNT_PANEL_STYLE}>
            <div style={{ fontSize:"0.47rem", color:"#64748b", letterSpacing:"0.08em" }}>CLOUD COPY</div>
            <div style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.45 }}>Reload the signed-in cloud record onto this device.</div>
            <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.5 }}>Use this when you want to re-pull synced state, not when you want to sign out or clear the device.</div>
            <button className="btn" disabled={accountActionBusy !== ""} onClick={onReloadCloud} style={{ width:"fit-content", fontSize:"0.48rem", color:colors.blue, borderColor:colors.blue + "35" }}>
              {accountActionBusy === "reload" ? "Reloading..." : "Reload cloud data"}
            </button>
          </div>
          <div style={ACCOUNT_PANEL_STYLE}>
            <div style={{ fontSize:"0.47rem", color:"#64748b", letterSpacing:"0.08em" }}>LEAVE THIS DEVICE</div>
            <div style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.45 }}>Sign out fast without deleting the cloud account.</div>
            <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.5 }}>This signs out immediately and keeps this browser in local mode unless you choose a device reset.</div>
            <button data-testid="settings-logout" className="btn" disabled={accountActionBusy !== ""} onClick={onLifecycleSignOut} style={{ width:"fit-content", fontSize:"0.48rem", color:"#dbe7f6", borderColor:"#324761" }}>
              {accountActionBusy === "logout" ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display:"grid", gap:"0.35rem" }}>
          <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.45 }}>
            Local mode is active on this device. Open sign-in only when you want cloud sync, device handoff, or permanent account controls. Recovery and reset tools stay tucked under the advanced panel below.
          </div>
          <button
            data-testid="settings-open-auth-gate"
            className="btn"
            onClick={onOpenAuthGate}
            style={{ width:"fit-content", fontSize:"0.48rem", color:colors.blue, borderColor:colors.blue + "35" }}
          >
            Sign in to cloud account
          </button>
        </div>
      )}
      <details data-testid="settings-account-advanced" style={{ border:"1px solid #243752", borderRadius:12, background:"#0f172a", padding:"0.55rem 0.6rem", display:"grid", gap:"0.45rem" }}>
        <summary style={{ cursor:"pointer", fontSize:"0.52rem", color:"#dbe7f6", lineHeight:1.45 }}>
          Advanced recovery and destructive actions
        </summary>
        <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.5 }}>
          Open this only when you want export, restore, reset this device, or permanently delete the signed-in account.
        </div>
        {authEmail && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.4rem" }}>
            <div style={{ border:"1px solid #2b3d55", borderRadius:12, background:"#0b1220", padding:"0.62rem", display:"grid", gap:"0.34rem" }}>
              <div style={{ fontSize:"0.47rem", color:"#64748b", letterSpacing:"0.08em" }}>LOCAL-ONLY RESET</div>
              <div style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.45 }}>Clear this device without deleting the cloud account.</div>
              <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.5 }}>This wipes the local cache, signs this browser out, and sends you back to a blank auth gate. Your cloud account still exists.</div>
              <button
                data-testid="settings-reset-device"
                className="btn"
                disabled={accountActionBusy !== ""}
                onClick={resetDeviceUi.onToggle}
                style={{ width:"fit-content", fontSize:"0.48rem", color:"#dbe7f6", borderColor:"#324761" }}
              >
                Reset this device
              </button>
              {resetDeviceUi.open && (
                <div style={{ border:"1px solid #243752", borderRadius:10, padding:"0.48rem", display:"grid", gap:"0.28rem" }}>
                  <div style={{ fontSize:"0.49rem", color:"#dbe7f6", lineHeight:1.5 }}>Type <b>RESET</b> to clear only this device. The cloud account will still be available on other devices.</div>
                  <input data-testid="settings-reset-device-confirm" value={resetDeviceUi.confirm} onChange={(e) => resetDeviceUi.onConfirmChange(e.target.value)} placeholder="RESET" />
                  <button
                    data-testid="settings-reset-device-submit"
                    className="btn"
                    disabled={resetDeviceUi.confirm !== "RESET" || accountActionBusy !== ""}
                    onClick={resetDeviceUi.onSubmit}
                    style={{ width:"fit-content", fontSize:"0.48rem", color:colors.amber, borderColor:colors.amber + "35" }}
                  >
                    {accountActionBusy === "reset_device" ? "Resetting..." : "Confirm device reset"}
                  </button>
                </div>
              )}
            </div>
            <div data-testid="settings-delete-account-card" style={{ border:"1px solid #3b2a39", borderRadius:12, background:"#120f16", padding:"0.62rem", display:"grid", gap:"0.34rem" }}>
              <div style={{ fontSize:"0.47rem", color:"#7f5f73", letterSpacing:"0.08em" }}>PERMANENT DELETE</div>
              <div style={{ fontSize:"0.54rem", color:"#f1d4dd", lineHeight:1.45 }}>Delete the auth identity and remove local account data.</div>
              <div style={{ fontSize:"0.47rem", color:"#c8a4b3", lineHeight:1.5 }}>This is the only action that should make the same email behave like a fresh signup again. It needs server-side delete support on the deployment.</div>
              <div data-testid="settings-delete-account-status" style={{ fontSize:"0.47rem", color:deleteDiagnostics.loading ? "#dbe7f6" : deleteDiagnostics.configured === true ? "#c9f1db" : "#f7d39a", lineHeight:1.5 }}>
                {deleteDiagnostics.loading
                  ? "Checking whether permanent delete is configured on this deployment..."
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
                  style={{ fontSize:"0.48rem", color:colors.red, borderColor:colors.red + "35" }}
                >
                  Delete account
                </button>
                <button
                  data-testid="settings-delete-account-retry-diagnostics"
                  className="btn"
                  disabled={accountActionBusy !== "" || deleteDiagnostics.loading}
                  onClick={deleteAccountUi.onRetryDiagnostics}
                  style={{ fontSize:"0.48rem", color:"#dbe7f6", borderColor:"#324761" }}
                >
                  {deleteDiagnostics.loading ? "Checking..." : "Check again"}
                </button>
              </div>
              {deleteDiagnostics.checked && deleteDiagnostics.configured !== true && (
                <div data-testid="settings-delete-account-help" style={{ border:"1px solid #4a3946", borderRadius:10, padding:"0.5rem", display:"grid", gap:"0.3rem" }}>
                  <div style={{ fontSize:"0.48rem", color:"#f1d4dd", lineHeight:1.5 }}>
                    {deleteAccountUi.helpText}
                  </div>
                  {showInternalSettingsTools && (
                    <details data-testid="settings-delete-account-diagnostics">
                      <summary style={{ cursor:"pointer", fontSize:"0.47rem", color:"#c8a4b3" }}>Developer diagnostics</summary>
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
                <div style={{ border:"1px solid #4a3946", borderRadius:10, padding:"0.48rem", display:"grid", gap:"0.3rem" }}>
                  {deleteAccountUi.step === 1 ? (
                    <>
                      <div style={{ fontSize:"0.5rem", color:"#f1d4dd", lineHeight:1.45 }}>Export first if you may need this history later. Permanent delete removes the account itself, not just this device&apos;s copy.</div>
                      <button data-testid="settings-delete-account-export" className="btn" onClick={deleteAccountUi.onExportFirst} style={{ width:"fit-content", fontSize:"0.48rem" }}>Export first, then continue</button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:"0.5rem", color:"#f1d4dd", lineHeight:1.45 }}>Type <b>DELETE</b> to permanently remove the account.</div>
                      <input data-testid="settings-delete-account-confirm" value={deleteAccountUi.confirm} onChange={(e) => deleteAccountUi.onConfirmChange(e.target.value)} placeholder="DELETE" />
                      <button data-testid="settings-delete-account-submit" className="btn" disabled={deleteAccountUi.confirm !== "DELETE" || accountActionBusy !== ""} onClick={deleteAccountUi.onSubmit} style={{ width:"fit-content", fontSize:"0.48rem", color:colors.red, borderColor:colors.red + "35" }}>
                        {accountActionBusy === "delete_account" ? "Deleting..." : "Confirm delete account"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <div style={{ border:"1px solid #243752", borderRadius:12, background:"#0f172a", padding:"0.55rem 0.6rem", display:"grid", gap:"0.4rem" }}>
          <div style={{ display:"grid", gap:"0.14rem" }}>
            <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>BACKUP AND RESET</div>
            <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>
              Export before destructive changes. Keep a backup code if you want an offline restore path, and use plan reset only when you want to rebuild training without changing the account itself.
            </div>
          </div>
          <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
            <button className="btn" onClick={backupUi.onExportData} style={{ fontSize:"0.48rem", color:colors.blue, borderColor:colors.blue + "35" }}>Export data</button>
            <button className="btn" onClick={backupUi.onCopyBackup} style={{ fontSize:"0.48rem", color:"#dbe7f6" }}>Copy backup code</button>
            <button className="btn" onClick={backupUi.onResetPlan} style={{ fontSize:"0.48rem", color:"#9fb2d2", borderColor:"#324761" }}>Reset plan</button>
          </div>
          {!!backupUi.message && <div style={{ fontSize:"0.47rem", color:"#cbd5e1" }}>{backupUi.message}</div>}
          <textarea value={backupUi.code} onChange={(e) => backupUi.onCodeChange(e.target.value)} placeholder="Paste backup code to restore" style={{ minHeight:62, fontSize:"0.5rem" }} />
          <button className="btn" onClick={backupUi.onReviewRestore} style={{ width:"fit-content", fontSize:"0.47rem", color:colors.green, borderColor:colors.green + "35" }}>Review restore</button>
        </div>
      </details>
    </section>
  );
}
