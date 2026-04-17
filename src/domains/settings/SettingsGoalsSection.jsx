import React from "react";

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
    <section data-testid="settings-goals-section" style={{ borderTop:"1px solid #233851", paddingTop:"0.75rem", display:"grid", gap:"0.45rem" }}>
      <div style={{ display:"grid", gap:"0.14rem" }}>
        <div className="sect-title" style={{ color:colors.green, marginBottom:0 }}>GOALS</div>
        <div style={{ fontSize:"0.52rem", color:"#8fa5c8", lineHeight:1.5 }}>
          Edit the goal stack first. History stays secondary so changing the plan feels straightforward.
        </div>
      </div>
      {focusSection === "plan" && (
        <div data-testid="settings-goals-migration-note" style={{ fontSize:"0.5rem", color:"#cbd5e1", lineHeight:1.5, border:"1px solid #243752", borderRadius:12, background:"#0f172a", padding:"0.55rem 0.6rem" }}>
          Opened from Plan. Goals live here now.
        </div>
      )}
      <div data-testid="settings-goals-management" style={{ border:"1px solid #22324a", borderRadius:14, background:"#0f172a", padding:"0.65rem", display:"grid", gap:"0.55rem" }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:"0.5rem", alignItems:"flex-start", flexWrap:"wrap" }}>
          <div style={{ display:"grid", gap:"0.14rem", maxWidth:720 }}>
            <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.1em" }}>ACTIVE GOALS</div>
            <div style={{ fontSize:"0.6rem", color:"#e2e8f0", lineHeight:1.45 }}>Set the order once, then edit one goal at a time.</div>
            <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5 }}>
              Priority order drives tradeoffs, but every active goal still stays in view. Changes remain preview-only until you confirm them.
            </div>
            <div style={{ fontSize:"0.47rem", color:"#94a3b8", lineHeight:1.5 }}>
              {priorityExplanation}
            </div>
          </div>
          <div style={{ display:"flex", gap:"0.35rem", alignItems:"center", flexWrap:"wrap", justifyContent:"flex-end" }}>
            <div style={{ fontSize:"0.47rem", color:"#8fa5c8", background:"#111827", border:"1px solid #23344d", borderRadius:999, padding:"0.18rem 0.5rem" }}>
              {goalCounts.activeCount || 0} active - {goalCounts.inactiveCount || 0} inactive
            </div>
            <div style={{ fontSize:"0.47rem", color:"#8fa5c8", background:"#111827", border:"1px solid #23344d", borderRadius:999, padding:"0.18rem 0.5rem" }}>
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
                      <div style={{ display:"flex", gap:"0.28rem", flexWrap:"wrap", alignItems:"center" }}>
                        <span data-testid="settings-goal-priority-label" style={{ fontSize:"0.46rem", color:colors.green, background:colors.green + "14", border:`1px solid ${colors.green}22`, borderRadius:999, padding:"0.14rem 0.38rem", letterSpacing:"0.08em" }}>{goalCard.priorityLabel}</span>
                        <span style={{ fontSize:"0.46rem", color:"#8fa5c8", background:"#162131", border:"1px solid #23344d", borderRadius:999, padding:"0.14rem 0.38rem" }}>{goalCard.goalTypeLabel}</span>
                        <span style={{ fontSize:"0.46rem", color:"#8fa5c8", background:"#162131", border:"1px solid #23344d", borderRadius:999, padding:"0.14rem 0.38rem" }}>{goalCard.activeVersionLabel}</span>
                      </div>
                      <div style={{ fontSize:"0.62rem", color:"#f8fafc", lineHeight:1.38, fontWeight:600 }}>{goalCard.summary}</div>
                      <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5 }}>
                        {goalCard.timingLabel}{goalCard.lastChangedAt ? ` - updated ${new Date(goalCard.lastChangedAt).toLocaleDateString()}` : ""}
                      </div>
                      {goalCard.timingDetail ? (
                        <div style={{ fontSize:"0.47rem", color:"#94a3b8", lineHeight:1.5 }}>
                          {goalCard.timingDetail}
                        </div>
                      ) : null}
                      <div style={{ fontSize:"0.49rem", color:"#dbe7f6", lineHeight:1.5 }}>
                        Track: {goalCard.trackingLabels.length ? goalCard.trackingLabels.join(", ") : "30-day success definition"}
                      </div>
                      {goalCard.tradeoff && (
                        <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.5 }}>
                          Balance: {goalCard.tradeoff}
                        </div>
                      )}
                      {goalCard.fuzzyLine && (
                        <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.5 }}>
                          Still open: {goalCard.fuzzyLine}
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
                    <summary style={{ cursor:"pointer", fontSize:"0.49rem", color:"#8fa5c8" }}>Audit details</summary>
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
              Reprioritization is staged. Preview plan impact before you commit the new order.
            </div>
            <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
              <button data-testid="settings-goals-preview-reorder" className="btn btn-primary" onClick={onPreviewGoalReprioritization} disabled={goalManagementBusy}>
                {goalManagementBusy ? "Previewing..." : "Preview impact"}
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
              <div style={{ fontSize:"0.56rem", color:"#f8fafc", lineHeight:1.45 }}>{goalManagementPreview.changeLabel || "Preview impact"}</div>
              <span style={{ fontSize:"0.46rem", color:"#8fa5c8", background:"#162131", border:"1px solid #23344d", borderRadius:999, padding:"0.14rem 0.38rem" }}>Preview only</span>
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
            <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.5 }}>
              {goalManagementPreview.explicitHistoryNote}
            </div>
            <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
              <button data-testid="settings-goals-confirm-preview" className="btn" onClick={onApplyGoalManagement} disabled={goalManagementBusy} style={{ color:colors.green, borderColor:colors.green + "35" }}>
                {goalManagementBusy ? "Applying..." : "Confirm goal change"}
              </button>
              <button data-testid="settings-goals-cancel-preview" className="btn" onClick={onResetGoalManagementWorkflow} disabled={goalManagementBusy} style={{ color:"#dbe7f6", borderColor:"#2b3d55" }}>
                Discard preview
              </button>
            </div>
          </div>
        )}
      </div>

      <div data-testid="settings-goals-lifecycle" style={{ border:"1px solid #22324a", borderRadius:14, background:"#0f172a", padding:"0.65rem", display:"grid", gap:"0.45rem" }}>
        <div style={{ display:"grid", gap:"0.14rem" }}>
          <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.1em" }}>LIFECYCLE</div>
          <div style={{ fontSize:"0.58rem", color:"#e2e8f0", lineHeight:1.45 }}>Keep future, paused, completed, archived, and dropped goals visible without muddying the live stack.</div>
          <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5 }}>
            Restoring a goal brings it back into the active priority order. Historical plans and logs stay attached to the earlier version either way.
          </div>
        </div>
        <div style={{ display:"grid", gap:"0.45rem" }}>
          {goalLifecycleSections.map((section) => (
            <div key={section.key} data-testid={`settings-goals-bucket-${section.status === "archived" ? "archived" : section.status}`} style={{ border:"1px solid #20314a", borderRadius:12, background:"#0b1220", padding:"0.58rem", display:"grid", gap:"0.35rem" }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:"0.4rem", alignItems:"flex-start", flexWrap:"wrap" }}>
                <div style={{ display:"grid", gap:"0.12rem" }}>
                  <div style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.45 }}>{section.label}</div>
                  <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.5 }}>{section.helper}</div>
                </div>
                <div style={{ fontSize:"0.46rem", color:"#8fa5c8", background:"#111827", border:"1px solid #23344d", borderRadius:999, padding:"0.14rem 0.38rem" }}>
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
                          <div style={{ display:"flex", gap:"0.28rem", flexWrap:"wrap", alignItems:"center" }}>
                            <span style={{ fontSize:"0.46rem", color:"#f59e0b", background:"#f59e0b14", border:"1px solid #f59e0b22", borderRadius:999, padding:"0.14rem 0.38rem", letterSpacing:"0.08em" }}>{goalCard.statusLabel}</span>
                            <span style={{ fontSize:"0.46rem", color:"#8fa5c8", background:"#162131", border:"1px solid #23344d", borderRadius:999, padding:"0.14rem 0.38rem" }}>{goalCard.activeVersionLabel}</span>
                          </div>
                          <div style={{ fontSize:"0.58rem", color:"#e2e8f0", lineHeight:1.45 }}>{goalCard.summary}</div>
                          <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5 }}>{goalCard.timingLabel}</div>
                          {goalCard.timingDetail ? (
                            <div style={{ fontSize:"0.47rem", color:"#94a3b8", lineHeight:1.5 }}>{goalCard.timingDetail}</div>
                          ) : null}
                          <div style={{ fontSize:"0.48rem", color:"#dbe7f6", lineHeight:1.5 }}>
                            Track: {goalCard.trackingLabels.length ? goalCard.trackingLabels.join(", ") : "Stored goal context"}
                          </div>
                        </div>
                        <button data-testid={`settings-goal-restore-${goalCard.id}`} className="btn" onClick={() => onPreviewGoalRestore(goalCard.id)} disabled={goalManagementBusy} style={{ fontSize:"0.47rem", color:colors.green, borderColor:colors.green + "35" }}>
                          {getGoalRestoreLabel(goalCard.status)}
                        </button>
                      </div>
                      <details>
                        <summary style={{ cursor:"pointer", fontSize:"0.48rem", color:"#8fa5c8" }}>Audit details</summary>
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
      </div>

      <details data-testid="settings-goals-audit" style={{ border:"1px solid #22324a", borderRadius:14, background:"#0f172a", padding:"0.65rem" }}>
        <summary style={{ cursor:"pointer", listStyle:"none" }}>
          <div style={{ display:"grid", gap:"0.14rem" }}>
            <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.1em" }}>RECENT CHANGES</div>
            <div style={{ fontSize:"0.58rem", color:"#e2e8f0", lineHeight:1.45 }}>Open if you want to review what changed and when.</div>
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
