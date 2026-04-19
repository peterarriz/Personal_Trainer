import React from "react";

import {
  SETTINGS_ACTION_ROW_STYLE,
  SETTINGS_BODY_STYLE,
  SETTINGS_PANEL_STYLE,
  SETTINGS_SECTION_HEADER_STYLE,
  SETTINGS_SECTION_INTRO_STYLE,
  SETTINGS_SECTION_STYLE,
  SETTINGS_SUBPANEL_STYLE,
  SETTINGS_TITLE_STYLE,
  buildSettingsPillStyle,
} from "./settings-ui.js";

const GOAL_REQUEST_OPTIONS = Object.freeze([
  { value: "refine_current_goal", label: "Refine current goal" },
  { value: "reprioritize_goal_stack", label: "Re-prioritize goals" },
  { value: "start_new_goal_arc", label: "Start new goal arc" },
]);

export function SettingsAdvancedSection({
  colors,
  showProtectedDiagnostics = false,
  showInternalSettingsTools = false,
  frictionDashboard = null,
  adaptiveDiagnostics = null,
  goalRequest = {},
  coachSetup = {},
  integrations = {},
}) {
  const resolvedGoalRequest = {
    mode: "refine_current_goal",
    intent: "",
    previewing: false,
    applying: false,
    preview: null,
    error: "",
    notice: "",
    onModeChange: () => {},
    onIntentChange: () => {},
    onPreview: () => {},
    onApply: () => {},
    ...goalRequest,
  };

  const resolvedCoachSetup = {
    memoryDraft: {},
    apiKey: "",
    onChangeMemoryField: () => {},
    onApiKeyChange: () => {},
    onSave: () => {},
    ...coachSetup,
  };

  const resolvedIntegrations = {
    apple: { state: "idle", label: "Not connected", summary: "Unavailable." },
    garmin: { state: "idle", label: "Not connected", summary: "Unavailable." },
    location: { state: "idle", label: "Not enabled", summary: "Unavailable." },
    garminBusy: "",
    checkMsg: "",
    garminMsg: "",
    locationMsg: "",
    importMsg: "",
    appleImportText: "",
    garminImportText: "",
    getTone: () => ({ color: "#dbe7f6", bg: "#0f172a" }),
    onRequestAppleHealth: () => {},
    onConnectGarmin: () => {},
    onRequestLocationAccess: () => {},
    onAppleImportTextChange: () => {},
    onGarminImportTextChange: () => {},
    onImportDeviceData: () => {},
    ...integrations,
  };

  const integrationCards = [
    ["Apple Health", resolvedIntegrations.apple],
    ["Garmin Connect", resolvedIntegrations.garmin],
    ["Location", resolvedIntegrations.location],
  ];
  const adaptiveDiagnosticsModel = {
    visible: false,
    cards: [],
    registryRows: [],
    commandHints: [],
    notes: [],
    ...adaptiveDiagnostics,
  };

  return (
    <section data-testid="settings-advanced-section" style={SETTINGS_SECTION_STYLE}>
      <div style={SETTINGS_SECTION_HEADER_STYLE}>
        <div className="sect-title" style={{ color:"#dbe7f6", marginBottom:0 }}>DEVICES</div>
        <div style={SETTINGS_SECTION_INTRO_STYLE}>
          Connect Apple Health, Garmin, and location here.
        </div>
      </div>
      {showProtectedDiagnostics && (
        <div data-testid="settings-friction-summary" style={SETTINGS_PANEL_STYLE}>
          <div style={{ display:"grid", gap:"0.12rem" }}>
            <div className="sect-title" style={{ color:"#dbe7f6", marginBottom:0 }}>Internal diagnostics</div>
            <div style={SETTINGS_BODY_STYLE}>
              Protected device diagnostics for local developer use only. Raw counters stay out of normal product surfaces.
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.35rem" }}>
            {(frictionDashboard?.cards || []).map((card) => (
              <div key={card.id} data-testid={`settings-friction-card-${card.id}`} style={{ border:"1px solid #20314a", borderRadius:12, background:"#0b1220", padding:"0.52rem 0.56rem", display:"grid", gap:"0.16rem" }}>
                <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>{card.title}</div>
                <div style={{ fontSize:"0.58rem", color:card.tone === "warn" ? "#f7d39a" : "#dbe7f6", lineHeight:1.4 }}>{card.headline}</div>
                <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>{card.detail}</div>
              </div>
            ))}
          </div>
          {(frictionDashboard?.sections || []).map((section) => (
            <div key={section.id} style={{ display:"grid", gap:"0.22rem" }}>
              <div style={{ fontSize:"0.47rem", color:"#64748b", letterSpacing:"0.08em" }}>{section.title}</div>
              {section.items.map((item) => (
                <div key={item} style={{ fontSize:"0.48rem", color:"#dbe7f6", lineHeight:1.5 }}>{item}</div>
              ))}
            </div>
          ))}
        </div>
      )}
      {showProtectedDiagnostics && adaptiveDiagnosticsModel.visible && (
        <details data-testid="settings-adaptive-diagnostics" style={SETTINGS_PANEL_STYLE}>
          <summary style={{ cursor:"pointer", fontSize:"0.55rem", color:"#dbe7f6" }}>Internal adaptive readiness</summary>
          <div style={{ display:"grid", gap:"0.35rem", marginTop:"0.45rem" }}>
            <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5 }}>
              Launch-safe adaptive status for trusted local review only. This stays hidden in consumer mode and should not be used as user-facing copy.
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.35rem" }}>
              {adaptiveDiagnosticsModel.cards.map((card) => (
                <div key={card.id} data-testid={`settings-adaptive-diagnostics-card-${card.id}`} style={{ border:"1px solid #20314a", borderRadius:12, background:"#0b1220", padding:"0.52rem 0.56rem", display:"grid", gap:"0.16rem" }}>
                  <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>{card.title}</div>
                  <div style={{ fontSize:"0.58rem", color:"#dbe7f6", lineHeight:1.4 }}>{card.headline}</div>
                  <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>{card.detail}</div>
                </div>
              ))}
            </div>
            {!!adaptiveDiagnosticsModel.registryRows?.length && (
              <div style={{ display:"grid", gap:"0.22rem" }}>
                <div style={{ fontSize:"0.47rem", color:"#64748b", letterSpacing:"0.08em" }}>Decision-point registry</div>
                {adaptiveDiagnosticsModel.registryRows.map((row) => (
                  <div key={row.id} data-testid={`settings-adaptive-diagnostics-row-${row.id}`} style={{ border:"1px solid #20314a", borderRadius:10, background:"#0f172a", padding:"0.5rem", display:"grid", gap:"0.14rem" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:"0.3rem", alignItems:"center", flexWrap:"wrap" }}>
                      <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{row.label}</div>
                      <span style={buildSettingsPillStyle({ color:"#dbe7f6", background:"#132033", borderColor:"#20314a" })}>
                        {row.enabled ? `${row.effectiveMode || "deterministic_only"}` : "disabled"}
                      </span>
                    </div>
                    <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>
                      Stage {row.stage || "approved_safe_lever"}. {row.ruleCount || 0} reviewed rule{row.ruleCount === 1 ? "" : "s"}. Owner {row.owner || "unknown"}.
                    </div>
                    {(row.latestActionId || row.latestFallbackReason) && (
                      <div style={{ fontSize:"0.47rem", color:"#cbd5e1", lineHeight:1.45 }}>
                        Latest plan trace: {row.latestActionId || "no action"}{row.latestFallbackReason ? `. ${row.latestFallbackReason}` : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!!adaptiveDiagnosticsModel.commandHints?.length && (
              <div style={{ display:"grid", gap:"0.22rem" }}>
                <div style={{ fontSize:"0.47rem", color:"#64748b", letterSpacing:"0.08em" }}>Operator commands</div>
                {adaptiveDiagnosticsModel.commandHints.map((entry) => (
                  <div key={entry.id} style={{ fontSize:"0.47rem", color:"#dbe7f6", lineHeight:1.5 }}>
                    {entry.label}: <code>{entry.command}</code>
                  </div>
                ))}
              </div>
            )}
            {!!adaptiveDiagnosticsModel.notes?.length && adaptiveDiagnosticsModel.notes.map((note) => (
              <div key={note} style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>{note}</div>
            ))}
          </div>
        </details>
      )}
      {showProtectedDiagnostics && showInternalSettingsTools && !adaptiveDiagnosticsModel.visible && (
        <div data-testid="settings-adaptive-diagnostics-disabled" style={{ ...SETTINGS_SUBPANEL_STYLE, borderStyle:"dashed" }}>
          Adaptive diagnostics stay off until the trusted local adaptive flag is enabled.
        </div>
      )}
      {showInternalSettingsTools && !showProtectedDiagnostics && (
        <div style={{ ...SETTINGS_SUBPANEL_STYLE, borderStyle:"dashed" }}>
          Internal diagnostics stay hidden unless protected diagnostics mode is enabled.
        </div>
      )}
      {showProtectedDiagnostics && (
        <details data-testid="settings-advanced-goal-request">
          <summary style={{ cursor:"pointer", fontSize:"0.55rem", color:"#dbe7f6" }}>Internal goal request tools</summary>
          <div style={{ display:"grid", gap:"0.35rem", marginTop:"0.45rem" }}>
            <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5 }}>
              The Goals surface is authoritative. Use this only when you want the app to interpret a plain-English goal change request experimentally.
            </div>
            <select value={resolvedGoalRequest.mode} onChange={(e) => resolvedGoalRequest.onModeChange(e.target.value)} style={{ fontSize:"0.54rem" }}>
              {GOAL_REQUEST_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input value={resolvedGoalRequest.intent} onChange={(e) => resolvedGoalRequest.onIntentChange(e.target.value)} placeholder="Optional plain-English goal request" />
            <div style={SETTINGS_ACTION_ROW_STYLE}>
              <button className="btn btn-primary" onClick={resolvedGoalRequest.onPreview} disabled={resolvedGoalRequest.previewing || resolvedGoalRequest.applying} style={{ fontSize:"0.5rem" }}>
                {resolvedGoalRequest.previewing ? "Previewing..." : "See change"}
              </button>
              <button className="btn" onClick={resolvedGoalRequest.onApply} disabled={resolvedGoalRequest.applying || !resolvedGoalRequest.preview?.orderedResolvedGoals?.length} style={{ fontSize:"0.5rem", color:colors.green, borderColor:colors.green + "35" }}>
                {resolvedGoalRequest.applying ? "Saving..." : "Use this order"}
              </button>
            </div>
            {(resolvedGoalRequest.error || resolvedGoalRequest.notice) && (
              <div style={{ fontSize:"0.48rem", color:resolvedGoalRequest.error ? colors.amber : colors.green, lineHeight:1.45 }}>
                {resolvedGoalRequest.error || resolvedGoalRequest.notice}
              </div>
            )}
            {resolvedGoalRequest.preview?.orderedResolvedGoals?.length > 0 && (
              <div style={{ border:"1px solid #22324a", borderRadius:10, background:"#0f172a", padding:"0.5rem" }}>
                {resolvedGoalRequest.preview.orderedResolvedGoals.map((goal) => (
                  <div key={goal.id || goal.name} style={{ fontSize:"0.52rem", color:"#dbe7f6", lineHeight:1.45 }}>
                    {goal.priority ? `${goal.priority}. ` : ""}{goal.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      {showProtectedDiagnostics && (
        <details open>
          <summary style={{ cursor:"pointer", fontSize:"0.55rem", color:"#dbe7f6" }}>Internal coach setup</summary>
          <div style={{ display:"grid", gap:"0.3rem", marginTop:"0.45rem" }}>
            <input value={resolvedCoachSetup.memoryDraft.failurePatterns || ""} onChange={(e) => resolvedCoachSetup.onChangeMemoryField("failurePatterns", e.target.value)} placeholder="Failure patterns" />
            <input value={resolvedCoachSetup.memoryDraft.commonBarriers || ""} onChange={(e) => resolvedCoachSetup.onChangeMemoryField("commonBarriers", e.target.value)} placeholder="Common barriers" />
            <input value={resolvedCoachSetup.memoryDraft.preferredFoodPatterns || ""} onChange={(e) => resolvedCoachSetup.onChangeMemoryField("preferredFoodPatterns", e.target.value)} placeholder="Food patterns" />
            <input value={resolvedCoachSetup.memoryDraft.simplicityVsVariety || ""} onChange={(e) => resolvedCoachSetup.onChangeMemoryField("simplicityVsVariety", e.target.value)} placeholder="Simplicity vs variety" />
            <details>
              <summary style={{ cursor:"pointer", fontSize:"0.5rem", color:"#8fa5c8" }}>Advanced AI provider key</summary>
              <div style={{ marginTop:"0.3rem", display:"grid", gap:"0.2rem" }}>
                <input value={resolvedCoachSetup.apiKey} onChange={(e) => resolvedCoachSetup.onApiKeyChange(e.target.value)} placeholder="Anthropic key (optional)" />
                <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>Hidden by default so Coach stays out of configuration mode.</div>
              </div>
            </details>
            <button className="btn" onClick={resolvedCoachSetup.onSave} style={{ width:"fit-content", fontSize:"0.5rem", color:colors.green, borderColor:colors.green + "35" }}>Save coach settings</button>
          </div>
        </details>
      )}

      <details open>
        <summary style={{ cursor:"pointer", fontSize:"0.55rem", color:"#dbe7f6" }}>Integrations</summary>
        <div style={{ display:"grid", gap:"0.35rem", marginTop:"0.45rem" }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.35rem" }}>
            {integrationCards.map(([label, state]) => {
              const tone = resolvedIntegrations.getTone(state.state);
              return (
                <div key={label} style={SETTINGS_SUBPANEL_STYLE}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:"0.3rem", alignItems:"center", flexWrap:"wrap" }}>
                    <div style={{ ...SETTINGS_TITLE_STYLE, fontSize:"0.52rem" }}>{label}</div>
                    <span style={buildSettingsPillStyle({ color:tone.color, background:tone.bg, borderColor:"transparent" })}>{state.label}</span>
                  </div>
                  <div style={{ ...SETTINGS_BODY_STYLE, fontSize:"0.47rem" }}>{state.summary}</div>
                </div>
              );
            })}
          </div>
          <div style={SETTINGS_ACTION_ROW_STYLE}>
            <button className="btn" onClick={resolvedIntegrations.onRequestAppleHealth} style={{ fontSize:"0.48rem", color:colors.blue, borderColor:colors.blue + "35" }}>Connect Apple Health</button>
            <button className="btn" onClick={resolvedIntegrations.onConnectGarmin} disabled={resolvedIntegrations.garminBusy !== ""} style={{ fontSize:"0.48rem", color:colors.green, borderColor:colors.green + "35" }}>
              {resolvedIntegrations.garminBusy === "connect" ? "Connecting..." : "Connect Garmin"}
            </button>
            <button className="btn" onClick={resolvedIntegrations.onRequestLocationAccess} style={{ fontSize:"0.48rem", color:colors.amber, borderColor:colors.amber + "35" }}>Request location</button>
          </div>
          {!!resolvedIntegrations.checkMsg && <div style={{ fontSize:"0.47rem", color:"#cbd5e1" }}>{resolvedIntegrations.checkMsg}</div>}
          {!!resolvedIntegrations.garminMsg && <div style={{ fontSize:"0.47rem", color:"#cbd5e1" }}>{resolvedIntegrations.garminMsg}</div>}
          {!!resolvedIntegrations.locationMsg && <div style={{ fontSize:"0.47rem", color:"#cbd5e1" }}>{resolvedIntegrations.locationMsg}</div>}
          {showProtectedDiagnostics && (
            <details>
              <summary style={{ cursor:"pointer", fontSize:"0.5rem", color:"#8fa5c8" }}>Manual imports</summary>
              <div style={{ display:"grid", gap:"0.3rem", marginTop:"0.35rem" }}>
                <textarea value={resolvedIntegrations.appleImportText} onChange={(e) => resolvedIntegrations.onAppleImportTextChange(e.target.value)} placeholder="Apple Health JSON import" style={{ minHeight:62, fontSize:"0.5rem" }} />
                <button className="btn" onClick={() => resolvedIntegrations.onImportDeviceData("apple")} style={{ width:"fit-content", fontSize:"0.47rem", color:colors.blue, borderColor:colors.blue + "35" }}>Import Apple JSON</button>
                <textarea value={resolvedIntegrations.garminImportText} onChange={(e) => resolvedIntegrations.onGarminImportTextChange(e.target.value)} placeholder="Garmin JSON import" style={{ minHeight:62, fontSize:"0.5rem" }} />
                <button className="btn" onClick={() => resolvedIntegrations.onImportDeviceData("garmin")} style={{ width:"fit-content", fontSize:"0.47rem", color:colors.green, borderColor:colors.green + "35" }}>Import Garmin JSON</button>
                {!!resolvedIntegrations.importMsg && <div style={{ fontSize:"0.47rem", color:"#cbd5e1" }}>{resolvedIntegrations.importMsg}</div>}
              </div>
            </details>
          )}
        </div>
      </details>
    </section>
  );
}

