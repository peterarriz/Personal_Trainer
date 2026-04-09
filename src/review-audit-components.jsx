const basePanelCardStyle = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 10,
  padding: "0.55rem",
};

export function HistoryAuditDayReviewCard({
  title = "DAY REVIEW",
  subtitle = "",
  selector = null,
  review = null,
  palette = {},
  sanitizeDisplayText,
  sanitizeStatusLabel,
  buildReviewBadgeTone,
  summarizeExecutionDelta,
  formatReviewTimestamp,
  buildSessionSummary,
  buildNutritionActualSummary,
  buildRecoveryActualSummary,
  cleanHistorySessionName,
  describeProvenanceRecord,
}) {
  if (!review) return null;
  const C = palette;
  const comparisonTone = buildReviewBadgeTone(review?.comparison?.completionKind || review?.comparison?.differenceKind);
  const revisionTone = buildReviewBadgeTone((review?.revisions?.length || 0) > 1 ? "changed" : "match");
  const nutritionTone = buildReviewBadgeTone(review?.actualNutrition?.adherence || review?.actualNutrition?.deviationKind);
  const planChanged = (review?.revisions?.length || 0) > 1;
  const executedDifferently = !["completed_as_planned", "matched", "followed"].includes(String(review?.comparison?.completionKind || "").toLowerCase())
    || !["matched", "followed", "none"].includes(String(review?.comparison?.differenceKind || "").toLowerCase());

  return (
    <div className="card card-soft" style={{ marginBottom: "0.8rem", borderColor: (C.blue || "#3b82f6") + "30" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
        <div>
          <div className="sect-title" style={{ color: C.blue, marginBottom: "0.12rem" }}>{title}</div>
          {subtitle && <div style={{ fontSize: "0.54rem", color: "#94a3b8" }}>{subtitle}</div>}
        </div>
        {selector}
      </div>

      <div style={{ display: "grid", gap: "0.55rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "0.45rem" }}>
          <div style={basePanelCardStyle}>
            <div style={{ fontSize: "0.48rem", color: "#64748b", letterSpacing: "0.08em" }}>REVIEW STATUS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.28rem", marginTop: "0.18rem" }}>
              <span style={{ fontSize: "0.48rem", color: comparisonTone.color, background: comparisonTone.bg, padding: "0.14rem 0.4rem", borderRadius: 999 }}>{summarizeExecutionDelta(review?.comparison)}</span>
              <span style={{ fontSize: "0.48rem", color: revisionTone.color, background: revisionTone.bg, padding: "0.14rem 0.4rem", borderRadius: 999 }}>{planChanged ? "Plan changed" : "Plan stable"}</span>
              <span style={{ fontSize: "0.48rem", color: executedDifferently ? C.amber : C.green, background: (executedDifferently ? C.amber : C.green) + "14", padding: "0.14rem 0.4rem", borderRadius: 999 }}>{executedDifferently ? "Executed differently" : "Executed as prescribed"}</span>
            </div>
            <div style={{ fontSize: "0.55rem", color: "#dbe7f6", marginTop: "0.22rem", lineHeight: 1.55 }}>{sanitizeDisplayText(review?.comparison?.summary || "Comparison unavailable.")}</div>
          </div>
          <div style={basePanelCardStyle}>
            <div style={{ fontSize: "0.48rem", color: "#64748b", letterSpacing: "0.08em" }}>PRESCRIPTION STATE</div>
            <div style={{ fontSize: "0.6rem", color: "#e2e8f0", marginTop: "0.16rem" }}>Rev {review?.currentRevision?.revisionNumber || 0} of {review?.revisions?.length || 0}</div>
            <div style={{ fontSize: "0.51rem", color: "#8fa5c8", marginTop: "0.14rem", lineHeight: 1.5 }}>Source: {sanitizeStatusLabel(review?.currentRevision?.sourceType, "unknown")} - {sanitizeStatusLabel(review?.currentRevision?.durability, "unknown")}</div>
          </div>
          <div style={basePanelCardStyle}>
            <div style={{ fontSize: "0.48rem", color: "#64748b", letterSpacing: "0.08em" }}>NUTRITION STATUS</div>
            <div style={{ display: "inline-flex", fontSize: "0.48rem", color: nutritionTone.color, background: nutritionTone.bg, padding: "0.14rem 0.4rem", borderRadius: 999, marginTop: "0.18rem" }}>{sanitizeStatusLabel(review?.actualNutrition?.adherence || review?.actualNutrition?.deviationKind, "Not logged")}</div>
            <div style={{ fontSize: "0.55rem", color: "#dbe7f6", marginTop: "0.22rem", lineHeight: 1.55 }}>{sanitizeDisplayText(review?.nutritionComparison?.summary || "Nutrition comparison unavailable.")}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "0.45rem" }}>
          <div style={basePanelCardStyle}>
            <div style={{ fontSize: "0.49rem", color: "#64748b", letterSpacing: "0.08em", marginBottom: "0.22rem" }}>ORIGINAL PRESCRIPTION</div>
            {(() => {
              const summary = buildSessionSummary(review?.originalRecord?.resolved?.training || review?.originalRecord?.base?.training || null);
              return (
                <>
                  <div style={{ fontSize: "0.6rem", color: "#e2e8f0" }}>{summary.label}</div>
                  <div style={{ fontSize: "0.53rem", color: "#8fa5c8", marginTop: "0.12rem" }}>{summary.detail || summary.type || "No detail saved."}</div>
                  <div style={{ fontSize: "0.5rem", color: "#64748b", marginTop: "0.18rem", lineHeight: 1.5 }}>{review?.originalRevision ? `${formatReviewTimestamp(review.originalRevision.capturedAt)} - ${sanitizeDisplayText(describeProvenanceRecord(review.originalRevision.provenance || null, review.originalRevision.reason || "initial_capture"))}` : "No original revision available."}</div>
                </>
              );
            })()}
          </div>
          <div style={basePanelCardStyle}>
            <div style={{ fontSize: "0.49rem", color: "#64748b", letterSpacing: "0.08em", marginBottom: "0.22rem" }}>LATEST PRESCRIPTION</div>
            {(() => {
              const summary = buildSessionSummary(review?.currentRecord?.resolved?.training || review?.currentRecord?.base?.training || null);
              return (
                <>
                  <div style={{ fontSize: "0.6rem", color: "#e2e8f0" }}>{summary.label}</div>
                  <div style={{ fontSize: "0.53rem", color: "#8fa5c8", marginTop: "0.12rem" }}>{summary.detail || summary.type || "No detail saved."}</div>
                  <div style={{ fontSize: "0.5rem", color: "#64748b", marginTop: "0.18rem", lineHeight: 1.5 }}>{review?.currentRevision ? `${formatReviewTimestamp(review.currentRevision.capturedAt)} - ${sanitizeDisplayText(describeProvenanceRecord(review.currentRevision.provenance || null, review.currentRevision.reason || "latest_revision"))}` : "No current revision available."}</div>
                </>
              );
            })()}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "0.45rem" }}>
          <div style={basePanelCardStyle}>
            <div style={{ fontSize: "0.49rem", color: "#64748b", letterSpacing: "0.08em", marginBottom: "0.22rem" }}>ACTUAL OUTCOME</div>
            <div style={{ fontSize: "0.6rem", color: "#e2e8f0" }}>{sanitizeDisplayText(cleanHistorySessionName(review?.actualLog?.type || review?.comparison?.actualSession?.label || "No workout log"))}</div>
            <div style={{ fontSize: "0.53rem", color: "#8fa5c8", marginTop: "0.12rem" }}>{sanitizeDisplayText(review?.actualLog?.notes || review?.comparison?.actualSession?.detail || review?.comparison?.status || "No session detail logged.")}</div>
            <div style={{ fontSize: "0.5rem", color: "#64748b", marginTop: "0.18rem" }}>Executed: {sanitizeStatusLabel(review?.comparison?.completionKind, "unknown")} - {sanitizeStatusLabel(review?.comparison?.differenceKind, "unknown")}</div>
          </div>
          <div style={basePanelCardStyle}>
            <div style={{ fontSize: "0.49rem", color: "#64748b", letterSpacing: "0.08em", marginBottom: "0.18rem" }}>ACTUAL CHECK-IN</div>
            <div style={{ fontSize: "0.56rem", color: "#e2e8f0" }}>{sanitizeDisplayText(review?.actualCheckin?.status || "No check-in saved")}</div>
            <div style={{ fontSize: "0.51rem", color: "#8fa5c8", marginTop: "0.12rem" }}>{sanitizeDisplayText(review?.actualCheckin?.note || review?.actualCheckin?.blocker || review?.actualCheckin?.sessionFeel || "No additional context saved.")}</div>
          </div>
          <div style={basePanelCardStyle}>
            <div style={{ fontSize: "0.49rem", color: "#64748b", letterSpacing: "0.08em", marginBottom: "0.18rem" }}>ACTUAL NUTRITION</div>
            {(() => {
              const nutritionSummary = buildNutritionActualSummary(review?.actualNutrition);
              return (
                <>
                  <div style={{ fontSize: "0.56rem", color: "#e2e8f0" }}>{sanitizeDisplayText(nutritionSummary.label)}</div>
                  <div style={{ fontSize: "0.51rem", color: "#8fa5c8", marginTop: "0.12rem" }}>{sanitizeDisplayText(nutritionSummary.detail)}</div>
                </>
              );
            })()}
          </div>
          <div style={basePanelCardStyle}>
            <div style={{ fontSize: "0.49rem", color: "#64748b", letterSpacing: "0.08em", marginBottom: "0.18rem" }}>ACTUAL RECOVERY</div>
            {(() => {
              const recoverySummary = buildRecoveryActualSummary(review?.actualRecovery);
              return (
                <>
                  <div style={{ fontSize: "0.56rem", color: "#e2e8f0" }}>{sanitizeDisplayText(recoverySummary.label)}</div>
                  <div style={{ fontSize: "0.51rem", color: "#8fa5c8", marginTop: "0.12rem" }}>{sanitizeDisplayText(recoverySummary.detail)}</div>
                </>
              );
            })()}
          </div>
        </div>

        <details style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "0.5rem 0.55rem" }} open={review?.revisions?.length > 1}>
          <summary style={{ cursor: "pointer", fontSize: "0.55rem", color: "#dbe7f6" }}>Revision timeline ({review?.revisions?.length || 0})</summary>
          <div style={{ marginTop: "0.35rem", display: "grid", gap: "0.32rem" }}>
            {(review?.revisions || []).map((revision) => {
              const summary = buildSessionSummary(revision?.record?.resolved?.training || revision?.record?.base?.training || null);
              const isOriginal = revision?.revisionNumber === review?.originalRevision?.revisionNumber;
              const isCurrent = revision?.revisionNumber === review?.currentRevision?.revisionNumber;
              return (
                <div key={revision?.revisionId || `${review?.dateKey}_${revision?.revisionNumber}`} style={{ border: "1px solid #182335", borderRadius: 8, background: "rgba(8,12,20,0.65)", padding: "0.4rem 0.45rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontSize: "0.56rem", color: "#e2e8f0" }}>Rev {revision?.revisionNumber || 0}: {summary.label}</div>
                    <div style={{ display: "flex", gap: "0.24rem", flexWrap: "wrap", alignItems: "center" }}>
                      {isOriginal && <span style={{ fontSize: "0.46rem", color: C.blue, background: C.blue + "14", padding: "0.12rem 0.35rem", borderRadius: 999 }}>original</span>}
                      {isCurrent && <span style={{ fontSize: "0.46rem", color: C.green, background: C.green + "14", padding: "0.12rem 0.35rem", borderRadius: 999 }}>latest</span>}
                      <div style={{ fontSize: "0.48rem", color: "#64748b" }}>{formatReviewTimestamp(revision?.capturedAt)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "0.5rem", color: "#8fa5c8", marginTop: "0.1rem" }}>{summary.detail || summary.type || "No session detail saved."}</div>
                  <div style={{ fontSize: "0.49rem", color: "#94a3b8", marginTop: "0.14rem", lineHeight: 1.5 }}>Plan changed because: {sanitizeDisplayText(revision?.provenanceSummary || revision?.reason || "unknown")} - {sanitizeDisplayText(revision?.sourceType || "unknown")} - {sanitizeDisplayText(revision?.durability || "unknown")}</div>
                </div>
              );
            })}
          </div>
        </details>
      </div>
    </div>
  );
}

export function HistoryAuditWeekHistorySection({
  title = "COMMITTED WEEK HISTORY",
  entries = [],
  emptyState = "",
  palette = {},
}) {
  const C = palette;
  return (
    <details className="card" style={{ marginBottom: "0.8rem" }} open={entries.length > 0}>
      <summary style={{ cursor: "pointer", fontSize: "0.58rem", color: "#94a3b8", letterSpacing: "0.06em" }}>{title}</summary>
      <div style={{ marginTop: "0.45rem", display: "grid", gap: "0.4rem" }}>
        {entries.length === 0 ? (
          <div style={{ fontSize: "0.55rem", color: "#64748b", lineHeight: 1.55 }}>{emptyState}</div>
        ) : entries.slice(0, 8).map((entry) => (
          <div key={entry.weekKey} style={{ border: "1px solid #20314a", borderRadius: 8, background: "#0f172a", padding: "0.45rem 0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontSize: "0.56rem", color: "#dbe7f6" }}>{entry.label}</div>
              <div style={{ display: "flex", gap: "0.24rem", flexWrap: "wrap", alignItems: "center" }}>
                {entry?.isCurrentWeek && <span style={{ fontSize: "0.46rem", color: C.green, background: C.green + "14", padding: "0.12rem 0.35rem", borderRadius: 999 }}>current</span>}
                <span style={{ fontSize: "0.46rem", color: "#8fa5c8", background: "#172233", padding: "0.12rem 0.35rem", borderRadius: 999 }}>{String(entry?.status || "planned").replaceAll("_", " ")}</span>
              </div>
            </div>
            <div style={{ fontSize: "0.52rem", color: "#93c5fd", marginTop: "0.12rem", lineHeight: 1.55 }}>{entry.focus || entry.summary || "Committed week snapshot"}</div>
            <div style={{ fontSize: "0.5rem", color: "#8fa5c8", marginTop: "0.12rem", lineHeight: 1.5 }}>
              {entry.startDate && entry.endDate ? `${entry.startDate} to ${entry.endDate}` : "Week window unavailable"} - {entry.plannedSessionCount || 0} planned - {entry.loggedSessionCount || 0} logged
            </div>
            {entry?.weeklyCheckin?.ts && (
              <div style={{ fontSize: "0.49rem", color: "#94a3b8", marginTop: "0.14rem", lineHeight: 1.5 }}>
                Weekly check-in: energy {entry.weeklyCheckin.energy || "?"}, stress {entry.weeklyCheckin.stress || "?"}, confidence {entry.weeklyCheckin.confidence || "?"}
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

export function HistoryAuditArchiveSection({
  archives = [],
  selectedArchiveReview = null,
  onSelectArchiveDay = null,
  palette = {},
  sanitizeDisplayText,
  sanitizeStatusLabel,
  buildReviewBadgeTone,
  summarizeExecutionDelta,
  formatReviewTimestamp,
  buildSessionSummary,
  buildNutritionActualSummary,
  buildRecoveryActualSummary,
  cleanHistorySessionName,
  describeProvenanceRecord,
}) {
  const C = palette;
  return (
    <details className="card" style={{ marginBottom: "0.8rem" }}>
      <summary style={{ cursor: "pointer", fontSize: "0.58rem", color: "#94a3b8", letterSpacing: "0.06em" }}>PREVIOUS PLANS</summary>
      <div style={{ marginTop: "0.45rem", display: "grid", gap: "0.4rem" }}>
        {archives.length === 0 && (
          <div style={{ fontSize: "0.55rem", color: "#64748b" }}>No archived plans yet.</div>
        )}
        {archives.map((archive) => {
          const selected = selectedArchiveReview?.archiveId === archive.id;
          return (
            <div key={archive.id} style={{ border: `1px solid ${selected ? C.blue + "55" : "#20314a"}`, borderRadius: 8, background: "#0f172a", padding: "0.45rem 0.5rem" }}>
              <div style={{ fontSize: "0.56rem", color: "#dbe7f6" }}>{archive.label}</div>
              <div style={{ fontSize: "0.5rem", color: "#7f94b3", marginTop: "0.1rem" }}>Archived {archive.archivedAt ? new Date(archive.archivedAt).toLocaleString() : "unknown"}</div>
              {archive.committedWeekCount > 0 && (
                <div style={{ fontSize: "0.49rem", color: "#93c5fd", marginTop: "0.1rem" }}>
                  {archive.committedWeekCount} committed week snapshots archived.
                </div>
              )}
              {archive.prescribedDayCount > 0 && (
                <div style={{ fontSize: "0.49rem", color: "#8fa5c8", marginTop: "0.1rem" }}>
                  {archive.prescribedDayCount} prescribed-day snapshots archived.
                </div>
              )}

              {archive.weekReviews.length > 0 && (
                <div style={{ marginTop: "0.25rem", display: "grid", gap: "0.18rem" }}>
                  {archive.weekReviews.slice(0, 4).map((entry) => (
                    <div key={`${archive.id}_week_${entry.weekKey}`} style={{ fontSize: "0.52rem", color: "#9fb2d2", lineHeight: 1.55 }}>
                      Week {entry.absoluteWeek || entry.weekNumber}: {sanitizeDisplayText(entry.label || "Committed week")} {entry.focus ? `- ${sanitizeDisplayText(entry.focus)}` : ""}{entry.summary ? ` - ${sanitizeDisplayText(entry.summary)}` : ""}
                    </div>
                  ))}
                </div>
              )}

              {archive.dayEntries.length > 0 && (
                <div style={{ marginTop: "0.35rem", display: "flex", flexWrap: "wrap", gap: "0.28rem" }}>
                  {archive.dayEntries.slice(0, 8).map((entry) => {
                    const selectedDay = selected && selectedArchiveReview?.dateKey === entry.dateKey;
                    return (
                      <button
                        key={`${archive.id}_${entry.dateKey}`}
                        className="btn"
                        onClick={() => typeof onSelectArchiveDay === "function" && onSelectArchiveDay({ archiveId: archive.id, dateKey: entry.dateKey })}
                        style={{
                          fontSize: "0.48rem",
                          color: selectedDay ? C.blue : "#cbd5e1",
                          borderColor: selectedDay ? C.blue + "55" : "#243449",
                          background: selectedDay ? C.blue + "14" : "transparent",
                          padding: "0.14rem 0.4rem",
                        }}
                      >
                        {entry.dateKey}
                      </button>
                    );
                  })}
                </div>
              )}

              {selected && selectedArchiveReview?.review && (
                <div style={{ marginTop: "0.45rem" }}>
                  <HistoryAuditDayReviewCard
                    title="ARCHIVED DAY REVIEW"
                    subtitle="Archived plan state stays separate from later actual outcome."
                    review={selectedArchiveReview.review}
                    palette={palette}
                    sanitizeDisplayText={sanitizeDisplayText}
                    sanitizeStatusLabel={sanitizeStatusLabel}
                    buildReviewBadgeTone={buildReviewBadgeTone}
                    summarizeExecutionDelta={summarizeExecutionDelta}
                    formatReviewTimestamp={formatReviewTimestamp}
                    buildSessionSummary={buildSessionSummary}
                    buildNutritionActualSummary={buildNutritionActualSummary}
                    buildRecoveryActualSummary={buildRecoveryActualSummary}
                    cleanHistorySessionName={cleanHistorySessionName}
                    describeProvenanceRecord={describeProvenanceRecord}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
