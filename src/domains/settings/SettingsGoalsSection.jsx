import React from "react";

import {
  SETTINGS_ACTION_ROW_STYLE,
  SETTINGS_BODY_STYLE,
  SETTINGS_CHIP_ROW_STYLE,
  SETTINGS_LABEL_STYLE,
  SETTINGS_PANEL_STYLE,
  SETTINGS_SECTION_HEADER_STYLE,
  SETTINGS_SECTION_INTRO_STYLE,
  SETTINGS_SECTION_STYLE,
  SETTINGS_SUBPANEL_STYLE,
  SETTINGS_TITLE_STYLE,
  buildSettingsPillStyle,
} from "./settings-ui.js";

export function SettingsGoalsSection({
  colors,
  focusSection = "",
  priorityExplanation = "",
  goalCounts = {},
  currentGoalCards = [],
  goalManagementError = "",
  goalManagementNotice = "",
  goalManagementBusy = false,
  goalManagementPreview = null,
  goalOrderDirty = false,
  goalLifecycleSections = [],
  goalHistoryFeed = [],
  onAddGoal = () => {},
  onMoveGoal = () => {},
  onEditGoal = () => {},
  onArchiveGoal = () => {},
  onPreviewGoalReprioritization = () => {},
  onResetGoalOrder = () => {},
  onApplyGoalManagement = () => {},
  onResetGoalManagementWorkflow = () => {},
  onPreviewGoalRestore = () => {},
  getGoalRestoreLabel = () => "Restore",
}) {
  return (
    <section data-testid="settings-goals-section" style={SETTINGS_SECTION_STYLE}>
      <div style={SETTINGS_SECTION_HEADER_STYLE}>
        <div className="sect-title" style={{ color:colors.green, marginBottom:0 }}>GOALS</div>
        <div style={SETTINGS_SECTION_INTRO_STYLE}>
          Update your goals here.
        </div>
      </div>
      {focusSection === "plan" && (
        <div data-testid="settings-goals-migration-note" style={{ ...SETTINGS_SUBPANEL_STYLE, color:"var(--text-strong)" }}>
          Goal changes live here now.
        </div>
      )}
      <div data-testid="settings-goals-management" style={{ ...SETTINGS_PANEL_STYLE, gap:"0.55rem" }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:"0.5rem", alignItems:"flex-start", flexWrap:"wrap" }}>
          <div style={{ display:"grid", gap:"0.14rem", maxWidth:720 }}>
            <div style={SETTINGS_LABEL_STYLE}>ACTIVE GOALS</div>
            <div style={SETTINGS_TITLE_STYLE}>Set the order and update goals when life changes.</div>
            <div style={SETTINGS_BODY_STYLE}>Priority 1 gets the most support.</div>
            {!!priorityExplanation && (
              <details>
                <summary style={{ cursor:"pointer", fontSize:"0.47rem", color:"var(--text-muted)" }}>How priorities work</summary>
                <div style={{ ...SETTINGS_BODY_STYLE, fontSize:"0.47rem", color:"var(--text-muted)", marginTop:"0.3rem" }}>
                  {priorityExplanation}
                </div>
              </details>
            )}
          </div>
          <div style={{ ...SETTINGS_ACTION_ROW_STYLE, justifyContent:"flex-end" }}>
            <div style={buildSettingsPillStyle({ color:"var(--text-soft)", background:"var(--surface-2)", borderColor:"var(--border)" })}>
              {goalCounts.activeCount || 0} active - {goalCounts.inactiveCount || 0} inactive
            </div>
            <div style={buildSettingsPillStyle({ color:"var(--text-soft)", background:"var(--surface-2)", borderColor:"var(--border)" })}>
              Future {goalCounts.futureCount || 0} - Paused {goalCounts.pausedCount || 0}
            </div>
            <button
              data-testid="settings-goals-add"
              className="btn"
              onClick={onAddGoal}
              disabled={goalManagementBusy}
              style={{ fontSize:"0.48rem", color:"#dbe7f6", borderColor:"#2b3d55" }}
            >
              Add goal
            </button>
          </div>
        </div>

        {(goalManagementError || goalManagementNotice) && (
          <div style={{ fontSize:"0.5rem", color:goalManagementError ? colors.amber : colors.green, lineHeight:1.5 }}>
            {goalManagementError || goalManagementNotice}
          </div>
        )}

        {currentGoalCards.length === 0 ? (
          <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>
            No goals yet. Add one to start shaping the plan.
          </div>
        ) : (
          <div style={{ display:"grid", gap:"0.45rem" }}>
            {currentGoalCards.map((goalCard, index) => {
              const isTop = index === 0;
              const isBottom = index === currentGoalCards.length - 1;
              return (
                <div key={goalCard.id} data-testid={`settings-goal-card-${goalCard.id}`} style={{ border:"1px solid #20314a", borderRadius:12, background:"#0b1220", padding:"0.58rem" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:"0.5rem", alignItems:"flex-start", flexWrap:"wrap" }}>
                    <div style={{ display:"grid", gap:"0.14rem", minWidth:0 }}>
                      <div style={SETTINGS_CHIP_ROW_STYLE}>
                        <span data-testid="settings-goal-priority-label" style={buildSettingsPillStyle({ color:colors.green, background:colors.green + "14", borderColor:colors.green + "22", emphasized:true, uppercase:true })}>{goalCard.priorityLabel}</span>
                        <span style={buildSettingsPillStyle({ color:"var(--text-soft)", background:"var(--surface-2)", borderColor:"var(--border)" })}>{goalCard.goalTypeLabel}</span>
                        <span style={buildSettingsPillStyle({ color:"var(--text-soft)", background:"var(--surface-2)", borderColor:"var(--border)" })}>{goalCard.activeVersionLabel}</span>
                      </div>
                      <div style={{ fontSize:"0.62rem", color:"#f8fafc", lineHeight:1.38, fontWeight:600 }}>{goalCard.summary}</div>
                      <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5 }}>
                        {goalCard.timingLabel}{goalCard.lastChangedAt ? ` - updated ${new Date(goalCard.lastChangedAt).toLocaleDateString()}` : ""}
                      </div>
                      {goalCard.fuzzyLine && (
                        <div style={{ display:"flex", gap:"0.32rem", flexWrap:"wrap", alignItems:"center" }}>
                          <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.5, flex:"1 1 220px" }}>
                            Still open: {goalCard.fuzzyLine}
                          </div>
                          <button
                            data-testid={`settings-goal-fix-clarity-${goalCard.id}`}
                            className="btn"
                            onClick={() => onEditGoal(goalCard.id)}
                            disabled={goalManagementBusy}
                            style={{ fontSize:"0.45rem", color:colors.blue, borderColor:colors.blue + "35" }}
                          >
                            Fix target details
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex", gap:"0.28rem", flexWrap:"wrap" }}>
                      <button data-testid={`settings-goal-move-up-${goalCard.id}`} className="btn" onClick={() => onMoveGoal(goalCard.id, -1)} disabled={isTop || goalManagementBusy} style={{ fontSize:"0.47rem", color:"#dbe7f6", borderColor:"#2b3d55" }}>Up</button>
                      <button data-testid={`settings-goal-move-down-${goalCard.id}`} className="btn" onClick={() => onMoveGoal(goalCard.id, 1)} disabled={isBottom || goalManagementBusy} style={{ fontSize:"0.47rem", color:"#dbe7f6", borderColor:"#2b3d55" }}>Down</button>
                      <button data-testid={`settings-goal-edit-${goalCard.id}`} className="btn" onClick={() => onEditGoal(goalCard.id)} disabled={goalManagementBusy} style={{ fontSize:"0.47rem", color:colors.blue, borderColor:colors.blue + "35" }}>Edit</button>
                      <button data-testid={`settings-goal-archive-${goalCard.id}`} className="btn" onClick={() => onArchiveGoal(goalCard.id)} disabled={goalManagementBusy} style={{ fontSize:"0.47rem", color:colors.amber, borderColor:colors.amber + "35" }}>Change status</button>
                    </div>
                  </div>

                  <details style={{ marginTop:"0.45rem", borderTop:"1px solid #182335", paddingTop:"0.42rem" }}>
                    <summary style={{ cursor:"pointer", fontSize:"0.49rem", color:"#8fa5c8" }}>More details</summary>
                    <div style={{ display:"grid", gap:"0.42rem", marginTop:"0.42rem" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.35rem" }}>
                        {goalCard.fieldRows.map((fieldRow) => (
                          <div key={fieldRow.field} style={{ border:"1px solid #182335", borderRadius:10, background:"#0f172a", padding:"0.42rem" }}>
                            <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>{fieldRow.label}</div>
                            <div style={{ fontSize:"0.52rem", color:"#e2e8f0", marginTop:"0.14rem", lineHeight:1.45 }}>{fieldRow.value}</div>
                            <div style={{ fontSize:"0.46rem", color:"#8fa5c8", marginTop:"0.16rem", lineHeight:1.5 }}>{fieldRow.provenanceSummary}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display:"grid", gap:"0.24rem" }}>
                        {goalCard.historyRows.map((row) => (
                          <div key={row.id} style={{ fontSize:"0.48rem", color:"#9fb2d2", lineHeight:1.5 }}>
                            {row.changedAt ? new Date(row.changedAt).toLocaleString() : "Unknown"} - {row.sourceLabel || String(row.changeType || "update").replaceAll("_", " ")} - {row.changedFields.length ? row.changedFields.map((entry) => entry.label).join(", ") : "Captured active version"}
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}

        {goalOrderDirty && (
          <div data-testid="settings-goals-reorder-bar" style={{ border:"1px solid #20314a", borderRadius:12, background:"#0b1220", padding:"0.52rem", display:"grid", gap:"0.36rem" }}>
            <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.5 }}>
              Review the new order before you save it.
            </div>
            <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
              <button data-testid="settings-goals-preview-reorder" className="btn btn-primary" onClick={onPreviewGoalReprioritization} disabled={goalManagementBusy}>
                {goalManagementBusy ? "Loading..." : "See changes"}
              </button>
              <button data-testid="settings-goals-reset-reorder" className="btn" onClick={onResetGoalOrder} disabled={goalManagementBusy} style={{ color:"#dbe7f6", borderColor:"#2b3d55" }}>
                Reset order
              </button>
            </div>
          </div>
        )}

        {goalManagementPreview?.impactLines?.length > 0 && (
          <div data-testid="settings-goals-impact-preview" style={{ border:"1px solid #2b3d55", borderRadius:14, background:"#0b1220", padding:"0.7rem", display:"grid", gap:"0.45rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:"0.5rem", alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ fontSize:"0.56rem", color:"#f8fafc", lineHeight:1.45 }}>{goalManagementPreview.changeLabel || "What changes"}</div>
              <span style={buildSettingsPillStyle({ color:"var(--text-soft)", background:"var(--surface-2)", borderColor:"var(--border)" })}>Not saved yet</span>
            </div>
            <div style={{ display:"grid", gap:"0.2rem" }}>
              {goalManagementPreview.impactLines.map((line, index) => (
                <div key={`${goalManagementPreview.changeType}_${index}`} style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.55 }}>{line}</div>
              ))}
            </div>
            {goalManagementPreview.changedFields?.length > 0 && (
              <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.5 }}>
                Changing: {goalManagementPreview.changedFields.map((entry) => entry.label).join(", ")}
              </div>
            )}
            <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
              <button data-testid="settings-goals-confirm-preview" className="btn" onClick={onApplyGoalManagement} disabled={goalManagementBusy} style={{ color:colors.green, borderColor:colors.green + "35" }}>
                {goalManagementBusy ? "Saving..." : "Save goal"}
              </button>
              <button data-testid="settings-goals-cancel-preview" className="btn" onClick={onResetGoalManagementWorkflow} disabled={goalManagementBusy} style={{ color:"#dbe7f6", borderColor:"#2b3d55" }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <details data-testid="settings-goals-lifecycle" style={{ ...SETTINGS_PANEL_STYLE, gap:"0.45rem" }}>
        <summary style={{ cursor:"pointer", listStyle:"none" }}>
          <div style={{ display:"grid", gap:"0.14rem" }}>
            <div style={SETTINGS_LABEL_STYLE}>LIFECYCLE</div>
            <div style={SETTINGS_TITLE_STYLE}>Open goal history and restore older goals when you need them.</div>
          </div>
        </summary>
        <div style={{ display:"grid", gap:"0.45rem", marginTop:"0.55rem" }}>
          {goalLifecycleSections.map((section) => (
            <div key={section.key} data-testid={`settings-goals-bucket-${section.status === "archived" ? "archived" : section.status}`} style={{ border:"1px solid #20314a", borderRadius:12, background:"#0b1220", padding:"0.58rem", display:"grid", gap:"0.35rem" }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:"0.4rem", alignItems:"flex-start", flexWrap:"wrap" }}>
                <div style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.45 }}>{section.label}</div>
                <div style={buildSettingsPillStyle({ color:"var(--text-soft)", background:"var(--surface-2)", borderColor:"var(--border)" })}>
                  {section.count}
                </div>
              </div>
              {section.goals.length === 0 ? (
                <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5 }}>No goals in this bucket yet.</div>
              ) : (
                <div style={{ display:"grid", gap:"0.35rem" }}>
                  {section.goals.map((goalCard) => (
                    <div key={goalCard.id} data-testid={`settings-archived-goal-${goalCard.id}`} style={{ border:"1px solid #182335", borderRadius:12, background:"#0f172a", padding:"0.52rem", display:"grid", gap:"0.24rem" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", gap:"0.45rem", alignItems:"flex-start", flexWrap:"wrap" }}>
                        <div style={{ display:"grid", gap:"0.14rem" }}>
                          <div style={SETTINGS_CHIP_ROW_STYLE}>
                            <span style={buildSettingsPillStyle({ color:"#f59e0b", background:"#f59e0b14", borderColor:"#f59e0b22", emphasized:true, uppercase:true })}>{goalCard.statusLabel}</span>
                            <span style={buildSettingsPillStyle({ color:"var(--text-soft)", background:"var(--surface-2)", borderColor:"var(--border)" })}>{goalCard.activeVersionLabel}</span>
                          </div>
                          <div style={{ fontSize:"0.58rem", color:"#e2e8f0", lineHeight:1.45 }}>{goalCard.summary}</div>
                          <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5 }}>{goalCard.timingLabel}</div>
                        </div>
                        <button data-testid={`settings-goal-restore-${goalCard.id}`} className="btn" onClick={() => onPreviewGoalRestore(goalCard.id)} disabled={goalManagementBusy} style={{ fontSize:"0.47rem", color:colors.green, borderColor:colors.green + "35" }}>
                          {getGoalRestoreLabel(goalCard.status)}
                        </button>
                      </div>
                      <details>
                        <summary style={{ cursor:"pointer", fontSize:"0.48rem", color:"#8fa5c8" }}>More details</summary>
                        <div style={{ display:"grid", gap:"0.24rem", marginTop:"0.35rem" }}>
                          {goalCard.historyRows.map((row) => (
                            <div key={row.id} style={{ fontSize:"0.48rem", color:"#9fb2d2", lineHeight:1.5 }}>
                              {row.changedAt ? new Date(row.changedAt).toLocaleString() : "Unknown"} - {row.sourceLabel || String(row.changeType || "update").replaceAll("_", " ")} - {row.changedFields.length ? row.changedFields.map((entry) => entry.label).join(", ") : "Captured version"}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </details>

      <details data-testid="settings-goals-audit" style={SETTINGS_PANEL_STYLE}>
        <summary style={{ cursor:"pointer", listStyle:"none" }}>
          <div style={{ display:"grid", gap:"0.14rem" }}>
            <div style={SETTINGS_LABEL_STYLE}>RECENT CHANGES</div>
            <div style={SETTINGS_TITLE_STYLE}>Open to review recent goal changes.</div>
          </div>
        </summary>
        <div style={{ display:"grid", gap:"0.45rem", marginTop:"0.5rem" }}>
          {goalHistoryFeed.length === 0 ? (
            <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5 }}>No goal edits have been saved yet.</div>
          ) : (
            <div style={{ display:"grid", gap:"0.35rem" }}>
              {goalHistoryFeed.map((entry) => (
                <div key={entry.id} style={{ border:"1px solid #20314a", borderRadius:12, background:"#0b1220", padding:"0.52rem", display:"grid", gap:"0.2rem" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:"0.4rem", alignItems:"center", flexWrap:"wrap" }}>
                    <div style={{ fontSize:"0.54rem", color:"#e2e8f0", lineHeight:1.45 }}>{entry.headline || entry.goalSummary || "Goal update"}</div>
                    <div style={{ fontSize:"0.46rem", color:"#8fa5c8" }}>{entry.changedAt ? new Date(entry.changedAt).toLocaleString() : "Unknown time"}</div>
                  </div>
                  <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.5 }}>{entry.detail}</div>
                  {(entry.statusBeforeLabel || entry.statusAfterLabel) && (
                    <div style={{ fontSize:"0.47rem", color:"#9fb2d2", lineHeight:1.45 }}>
                      Status: {entry.statusBeforeLabel || "Not previously recorded"} to {entry.statusAfterLabel || "Active"}
                    </div>
                  )}
                  {entry.changedFieldLabels?.length > 0 && (
                    <div style={{ fontSize:"0.47rem", color:"#9fb2d2", lineHeight:1.45 }}>
                      Affected: {entry.changedFieldLabels.join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
