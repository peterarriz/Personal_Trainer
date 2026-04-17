import React from "react";

import { SettingsFieldRow } from "./SettingsFieldRow.jsx";

export function SettingsPreferencesSection({
  colors,
  trainingPrefs = {},
  appearance = {},
  notifications = {},
  showEnvEditor = false,
  onToggleEnvEditor = () => {},
  onPatchSettings = () => {},
  AppearanceThemeSectionComponent = null,
}) {
  const patchTrainingPreferences = (patch = {}) => {
    onPatchSettings({ trainingPreferences: { ...trainingPrefs, ...patch } });
  };

  const patchNotifications = (patch = {}) => {
    onPatchSettings({ notifications: { ...notifications, ...patch } });
  };

  const AppearanceSection = AppearanceThemeSectionComponent;

  return (
    <section data-testid="settings-preferences-section" style={{ borderTop:"1px solid #233851", paddingTop:"0.75rem", display:"grid", gap:"0.35rem" }}>
      <div style={{ display:"grid", gap:"0.14rem" }}>
        <div className="sect-title" style={{ color:colors.purple, marginBottom:0 }}>NOTIFICATIONS & DEFAULTS</div>
        <div style={{ fontSize:"0.56rem", color:"#8fa5c8", lineHeight:1.5 }}>
          Keep reminders, defaults, and appearance simple without burying the controls you actually use.
        </div>
      </div>
      <div style={{ border:"1px solid #243752", borderRadius:12, background:"#0f172a", padding:"0.55rem 0.75rem", display:"grid", gap:"0.08rem" }}>
        <SettingsFieldRow label="Default environment" helper="Used unless Today overrides the setup for a single session.">
          <div style={{ display:"grid", gap:"0.35rem", maxWidth:320 }}>
            <button className="btn" onClick={onToggleEnvEditor} style={{ justifyContent:"space-between", fontSize:"0.56rem", color:"#dbe7f6" }}>
              <span>{trainingPrefs?.defaultEnvironment || "Home"}</span>
              <span>{showEnvEditor ? "Hide" : "Edit"}</span>
            </button>
            {showEnvEditor && (
              <div style={{ display:"grid", gap:"0.28rem" }}>
                <select value={trainingPrefs?.defaultEnvironment || "Home"} onChange={(e) => patchTrainingPreferences({ defaultEnvironment: e.target.value })}>
                  {["Home", "Gym", "Travel"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </select>
                <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>
                  Session-by-session changes still happen from Today.
                </div>
              </div>
            )}
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label="Weekly check-in day" helper="Sets the anchor day for weekly review prompts.">
          <div style={{ maxWidth:220 }}>
            <select value={trainingPrefs?.weeklyCheckinDay || "Sun"} onChange={(e) => patchTrainingPreferences({ weeklyCheckinDay: e.target.value })}>
              {["Sun", "Mon", "Sat"].map((day) => <option key={day} value={day}>{day}</option>)}
            </select>
          </div>
        </SettingsFieldRow>
        <SettingsFieldRow label="Intensity preference" helper="Tells the planner how much progression risk you want it to accept.">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%, 140px),1fr))", gap:"0.3rem" }}>
            {[["Conservative", "Lower risk"], ["Standard", "Balanced"], ["Aggressive", "Higher risk"]].map(([mode, desc]) => (
              <button
                key={mode}
                className="btn"
                onClick={() => patchTrainingPreferences({ intensityPreference: mode })}
                style={{
                  fontSize:"0.54rem",
                  color:trainingPrefs?.intensityPreference === mode ? colors.green : "#9fb2d2",
                  borderColor:trainingPrefs?.intensityPreference === mode ? colors.green + "35" : "#324961",
                  textAlign:"left",
                  minWidth:0,
                  whiteSpace:"normal",
                  lineHeight:1.35,
                }}
              >
                <div>{mode}</div>
                <div style={{ fontSize:"0.46rem", color:"#7f94b3", marginTop:"0.1rem" }}>{desc}</div>
              </button>
            ))}
          </div>
        </SettingsFieldRow>
      </div>
      <div style={{ borderTop:"1px solid #233851", paddingTop:"0.75rem", display:"grid", gap:"0.35rem" }}>
        <div className="sect-title" style={{ color:colors.amber, marginBottom:0 }}>APPEARANCE</div>
        {AppearanceSection ? <AppearanceSection appearance={appearance} onPatchAppearance={(nextAppearance) => onPatchSettings({ appearance: nextAppearance })} /> : null}
      </div>
      <div data-testid="settings-preferences-lower" style={{ borderTop:"1px solid #233851", paddingTop:"0.75rem", display:"grid", gap:"0.35rem" }}>
        <div className="sect-title" style={{ color:"#dbe7f6", marginBottom:0 }}>NOTIFICATIONS</div>
        <div data-testid="settings-notifications-section" style={{ border:"1px solid #243752", borderRadius:12, background:"#0f172a", padding:"0.55rem 0.75rem", display:"grid", gap:"0.08rem", minWidth:0 }}>
          <SettingsFieldRow label="Pause all notifications" helper="Stops reminders and proactive nudges from this device.">
            <label style={{ display:"inline-flex", alignItems:"center", gap:"0.45rem", fontSize:"0.58rem", color:"#cbd5e1", minWidth:0 }}>
              <input type="checkbox" checked={Boolean(notifications?.allOff)} onChange={(e) => patchNotifications({ allOff: e.target.checked })} />
              <span>All notifications off</span>
            </label>
          </SettingsFieldRow>
          <SettingsFieldRow label="Weekly reminder" helper="One reminder at a consistent time on the chosen weekly check-in day.">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%, 180px),1fr))", gap:"0.35rem", alignItems:"center", minWidth:0 }}>
              <label style={{ display:"inline-flex", alignItems:"center", gap:"0.45rem", fontSize:"0.58rem", color:"#cbd5e1", minWidth:0, lineHeight:1.4 }}>
                <input type="checkbox" checked={Boolean(notifications?.weeklyReminderOn)} disabled={notifications?.allOff} onChange={(e) => patchNotifications({ weeklyReminderOn: e.target.checked })} />
                <span>Send weekly reminder</span>
              </label>
              <div style={{ maxWidth:180 }}>
                <input type="time" value={notifications?.weeklyReminderTime || "18:00"} disabled={notifications?.allOff || !notifications?.weeklyReminderOn} onChange={(e) => patchNotifications({ weeklyReminderTime: e.target.value })} />
              </div>
            </div>
          </SettingsFieldRow>
          <SettingsFieldRow label="Coach proactive nudge" helper="One message if you have been away for three or more days.">
            <label style={{ display:"inline-flex", alignItems:"center", gap:"0.45rem", fontSize:"0.58rem", color:"#cbd5e1", minWidth:0, lineHeight:1.4 }}>
              <input type="checkbox" checked={Boolean(notifications?.proactiveNudgeOn)} disabled={notifications?.allOff} onChange={(e) => patchNotifications({ proactiveNudgeOn: e.target.checked })} />
              <span>Send coach nudge</span>
            </label>
          </SettingsFieldRow>
        </div>
      </div>
    </section>
  );
}
