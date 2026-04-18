const basePanelCardStyle = {
  background: "var(--consumer-panel)",
  border: "1px solid var(--consumer-border)",
  borderRadius: 10,
  padding: "0.55rem",
};

const detailDisclosureStyle = {
  background: "var(--consumer-panel)",
  border: "1px solid var(--consumer-border)",
  borderRadius: 10,
  padding: "0.5rem 0.55rem",
};

const eyebrowStyle = {
  fontSize: "0.48rem",
  color: "var(--consumer-text-faint)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const primaryContextStyle = {
  fontSize: "0.52rem",
  color: "var(--consumer-text-muted)",
  lineHeight: 1.55,
};

const buildLocalTone = (kind = "", palette = {}) => {
  const C = palette;
  const normalized = String(kind || "").trim().toLowerCase();
  if (["match", "completed_as_planned", "followed"].includes(normalized)) {
    return { color: C.green || "#22c55e", bg: `${C.green || "#22c55e"}14` };
  }
  if (["partial", "modified", "changed"].includes(normalized)) {
    return { color: C.blue || "#3b82f6", bg: `${C.blue || "#3b82f6"}14` };
  }
  if (["missing", "pending", "unknown", "skip", "skipped", "not_logged", "in_progress"].includes(normalized)) {
    return { color: C.amber || "#f59e0b", bg: `${C.amber || "#f59e0b"}14` };
  }
  return { color: "#cbd5e1", bg: "rgba(148,163,184,0.14)" };
};

const formatAuditLabel = (value = "", fallback = "unknown") => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw.replaceAll("_", " ").replaceAll("-", " ");
};

const formatHistorySourceLabel = (value = "", fallback = "FORMA") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (/(ai|coach)/i.test(normalized)) return "Coach";
  if (/(legacy|snapshot|backfill)/i.test(normalized)) return "Past saved data";
  if (/schedule/i.test(normalized)) return "Earlier schedule";
  if (/(plan_day_engine|current_plan_week|current|engine)/i.test(normalized)) return "FORMA";
  return formatAuditLabel(normalized, fallback);
};

const formatHistoryAccessLabel = (value = "", fallback = "saved") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "durable") return "saved";
  if (normalized === "legacy_backfill") return "imported from older data";
  if (normalized === "fallback_derived") return "filled in from earlier schedule";
  return formatAuditLabel(normalized, fallback);
};

const formatWeekSaveTypeLabel = (value = "", fallback = "saved") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "projected") return "preview";
  if (normalized === "committed") return "saved";
  return formatAuditLabel(normalized, fallback);
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
  const story = review?.story || {};
  const classificationTone = buildReviewBadgeTone(story?.toneKey || review?.comparison?.completionKind || review?.comparison?.differenceKind);
  const nutritionSummary = buildNutritionActualSummary(review?.actualNutrition);
  const recoverySummary = buildRecoveryActualSummary(review?.actualRecovery);
  const showCheckinContext = Boolean(review?.actualCheckin?.status || review?.actualCheckin?.note || review?.actualCheckin?.blocker || review?.actualCheckin?.sessionFeel);
  const showNutritionContext = Boolean(review?.actualNutrition?.loggedAt || review?.nutritionComparison?.hasPrescription);
  const showRecoveryContext = Boolean(review?.actualRecovery?.loggedAt);
  const revisionTimeline = review?.revisionTimeline || [];
  const originalSummary = buildSessionSummary(review?.originalRecord?.resolved?.training || review?.originalRecord?.base?.training || null);
  const currentSummary = buildSessionSummary(review?.currentRecord?.resolved?.training || review?.currentRecord?.base?.training || null);

  return (
    <div
      className="card card-soft"
      style={{ marginBottom: "0.8rem", borderColor: (C.blue || "#3b82f6") + "30" }}
      data-testid="history-day-review-card"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.45rem", flexWrap: "wrap" }}>
        <div>
          <div className="sect-title" style={{ color: C.blue, marginBottom: "0.12rem" }}>{title}</div>
          {subtitle && <div style={{ fontSize: "0.54rem", color: "var(--consumer-text-muted)" }}>{subtitle}</div>}
        </div>
        {selector}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", alignItems: "center", marginBottom: "0.55rem" }}>
        <span
          style={{
            fontSize: "0.48rem",
            color: classificationTone.color,
            background: classificationTone.bg,
            padding: "0.14rem 0.4rem",
            borderRadius: 999,
          }}
        >
          {sanitizeDisplayText(story?.classificationLabel || summarizeExecutionDelta(review?.comparison))}
        </span>
        {story?.auditSummary && (
          <span style={primaryContextStyle}>
            {sanitizeDisplayText(story.auditSummary)}
          </span>
        )}
      </div>

      <div data-testid="history-day-review-primary" style={{ display: "grid", gap: "0.55rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "0.45rem" }}>
          <div style={basePanelCardStyle}>
            <div style={eyebrowStyle}>What Was Planned</div>
            <div style={{ fontSize: "0.62rem", color: "var(--consumer-text)", marginTop: "0.18rem" }}>
              {sanitizeDisplayText(story?.plannedSummary?.label || currentSummary.label)}
            </div>
            <div style={{ fontSize: "0.53rem", color: "var(--consumer-text-muted)", marginTop: "0.12rem", lineHeight: 1.55 }}>
              {sanitizeDisplayText(story?.plannedSummary?.detail || currentSummary.detail || currentSummary.type || "No saved session detail.")}
            </div>
          </div>
          <div style={basePanelCardStyle}>
            <div style={eyebrowStyle}>What Happened</div>
            <div style={{ fontSize: "0.62rem", color: "var(--consumer-text)", marginTop: "0.18rem" }}>
              {sanitizeDisplayText(story?.actualSummary?.label || cleanHistorySessionName(review?.actualLog?.type || "No workout log"))}
            </div>
            <div style={{ fontSize: "0.53rem", color: "var(--consumer-text-muted)", marginTop: "0.12rem", lineHeight: 1.55 }}>
              {sanitizeDisplayText(story?.actualSummary?.detail || review?.actualLog?.notes || "No actual session detail was saved.")}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0.45rem" }}>
          <div style={basePanelCardStyle}>
            <div style={eyebrowStyle}>Why It Mattered</div>
            <div style={{ fontSize: "0.57rem", color: "var(--consumer-text-soft)", marginTop: "0.18rem", lineHeight: 1.6 }}>
              {sanitizeDisplayText(story?.mainLesson || review?.comparison?.summary || "No lesson is available yet.")}
            </div>
          </div>
          <div style={basePanelCardStyle}>
            <div style={eyebrowStyle}>What changes next</div>
            <div style={{ fontSize: "0.57rem", color: "var(--consumer-text-soft)", marginTop: "0.18rem", lineHeight: 1.6 }}>
              {sanitizeDisplayText(story?.nextEffect || "No forward-looking effect is available yet.")}
            </div>
          </div>
        </div>

        {(showCheckinContext || showNutritionContext || showRecoveryContext) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "0.45rem" }}>
            {showCheckinContext && (
              <div style={basePanelCardStyle}>
                <div style={eyebrowStyle}>Check-in context</div>
                <div style={{ fontSize: "0.55rem", color: "var(--consumer-text)", marginTop: "0.18rem" }}>
                  {sanitizeDisplayText(review?.actualCheckin?.status || "Check-in saved")}
                </div>
                <div style={{ fontSize: "0.5rem", color: "var(--consumer-text-muted)", marginTop: "0.12rem", lineHeight: 1.5 }}>
                  {sanitizeDisplayText(review?.actualCheckin?.note || review?.actualCheckin?.blocker || review?.actualCheckin?.sessionFeel || "No extra check-in detail saved.")}
                </div>
              </div>
            )}
            {showNutritionContext && (
              <div style={basePanelCardStyle}>
                <div style={eyebrowStyle}>Nutrition</div>
                <div style={{ fontSize: "0.55rem", color: "var(--consumer-text)", marginTop: "0.18rem" }}>
                  {sanitizeDisplayText(nutritionSummary.label)}
                </div>
                <div style={{ fontSize: "0.5rem", color: "var(--consumer-text-muted)", marginTop: "0.12rem", lineHeight: 1.5 }}>
                  {sanitizeDisplayText(review?.nutritionComparison?.summary || nutritionSummary.detail)}
                </div>
              </div>
            )}
            {showRecoveryContext && (
              <div style={basePanelCardStyle}>
                <div style={eyebrowStyle}>Recovery</div>
                <div style={{ fontSize: "0.55rem", color: "var(--consumer-text)", marginTop: "0.18rem" }}>
                  {sanitizeDisplayText(recoverySummary.label)}
                </div>
                <div style={{ fontSize: "0.5rem", color: "var(--consumer-text-muted)", marginTop: "0.12rem", lineHeight: 1.5 }}>
                  {sanitizeDisplayText(recoverySummary.detail)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <details style={{ ...detailDisclosureStyle, marginTop: "0.6rem" }} data-testid="history-day-review-audit">
        <summary style={{ cursor: "pointer", fontSize: "0.55rem", color: "var(--consumer-text)" }}>More detail</summary>
        <div style={{ marginTop: "0.4rem", display: "grid", gap: "0.45rem" }}>
          <div style={{ ...primaryContextStyle, color: "var(--consumer-text-muted)" }}>
            See the saved version history here without crowding the main story.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0.45rem" }}>
            <div style={basePanelCardStyle}>
              <div style={eyebrowStyle}>Current saved plan</div>
              <div style={{ fontSize: "0.6rem", color: "var(--consumer-text)", marginTop: "0.18rem" }}>
                {sanitizeDisplayText(currentSummary.label)}
              </div>
              <div style={{ fontSize: "0.52rem", color: "var(--consumer-text-muted)", marginTop: "0.12rem" }}>
                {sanitizeDisplayText(currentSummary.detail || currentSummary.type || "No saved session detail.")}
              </div>
              <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-muted)", marginTop: "0.18rem", lineHeight: 1.5 }}>
                {review?.currentRevision
                  ? `${formatReviewTimestamp(review.currentRevision.capturedAt)} • ${formatHistorySourceLabel(review.currentRevision.sourceType)} • ${formatHistoryAccessLabel(review.currentRevision.durability)}`
                  : "No current saved plan was found."}
              </div>
              <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-faint)", marginTop: "0.14rem", lineHeight: 1.5 }}>
                {sanitizeDisplayText(review?.provenanceSummary || describeProvenanceRecord(review?.currentRevision?.provenance || null, review?.currentRevision?.reason || "latest_revision"))}
              </div>
            </div>

            <div style={basePanelCardStyle}>
              <div style={eyebrowStyle}>{review?.revisions?.length > 1 ? "First saved plan" : "Saved plan"}</div>
              <div style={{ fontSize: "0.6rem", color: "var(--consumer-text)", marginTop: "0.18rem" }}>
                {sanitizeDisplayText(originalSummary.label)}
              </div>
              <div style={{ fontSize: "0.52rem", color: "var(--consumer-text-muted)", marginTop: "0.12rem" }}>
                {sanitizeDisplayText(originalSummary.detail || originalSummary.type || "No saved session detail.")}
              </div>
              <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-muted)", marginTop: "0.18rem", lineHeight: 1.5 }}>
                {review?.originalRevision
                  ? `${formatReviewTimestamp(review.originalRevision.capturedAt)} • ${formatHistorySourceLabel(review.originalRevision.sourceType)} • ${formatHistoryAccessLabel(review.originalRevision.durability)}`
                  : "No earlier saved capture was found."}
              </div>
              <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-faint)", marginTop: "0.14rem", lineHeight: 1.5 }}>
                {sanitizeDisplayText(
                  review?.originalRevision
                    ? describeProvenanceRecord(review.originalRevision.provenance || null, review.originalRevision.reason || "initial_capture")
                    : "No extra context was saved."
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "0.45rem" }}>
            <div style={basePanelCardStyle}>
              <div style={eyebrowStyle}>How it matched</div>
              <div style={{ fontSize: "0.56rem", color: "var(--consumer-text)", marginTop: "0.18rem" }}>
                {sanitizeDisplayText(summarizeExecutionDelta(review?.comparison))}
              </div>
              <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-muted)", marginTop: "0.12rem", lineHeight: 1.5 }}>
                {sanitizeDisplayText(review?.comparison?.summary || "Comparison unavailable.")}
              </div>
            </div>

            <div style={basePanelCardStyle}>
              <div style={eyebrowStyle}>Source</div>
              <div style={{ fontSize: "0.56rem", color: "var(--consumer-text)", marginTop: "0.18rem" }}>
                {formatHistorySourceLabel(review?.compatibility?.sourceType)}
              </div>
              <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-muted)", marginTop: "0.12rem", lineHeight: 1.5 }}>
                Version: {formatHistoryAccessLabel(review?.compatibility?.durability)}.
              </div>
              {review?.compatibility?.usedFallbackHistory && (
                <div style={{ fontSize: "0.49rem", color: C.amber || "#f59e0b", marginTop: "0.12rem", lineHeight: 1.5 }}>
                  An older saved version helped fill in this history.
                </div>
              )}
            </div>

            <div style={basePanelCardStyle}>
              <div style={eyebrowStyle}>Actual outcome source</div>
              <div style={{ fontSize: "0.56rem", color: "var(--consumer-text)", marginTop: "0.18rem" }}>
                {sanitizeDisplayText(cleanHistorySessionName(review?.actualLog?.type || review?.actualLog?.label || review?.actualLog?.actualSession?.sessionLabel || "No workout log"))}
              </div>
              <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-muted)", marginTop: "0.12rem", lineHeight: 1.5 }}>
                {sanitizeDisplayText(review?.actualLog?.notes || review?.actualCheckin?.note || "No extra actual-outcome detail was saved.")}
              </div>
            </div>
          </div>

          <div style={basePanelCardStyle}>
            <div style={eyebrowStyle}>Saved version history</div>
            <div style={{ marginTop: "0.28rem", display: "grid", gap: "0.32rem" }}>
              {revisionTimeline.length === 0 && (
                <div style={{ fontSize: "0.52rem", color: "var(--consumer-text-muted)" }}>No saved version history is available.</div>
              )}
              {revisionTimeline.map((revision) => {
                const summary = buildSessionSummary(revision?.record?.resolved?.training || revision?.record?.base?.training || null);
                const isOriginal = revision?.revisionNumber === review?.originalRevision?.revisionNumber;
                const isCurrent = revision?.revisionNumber === review?.currentRevision?.revisionNumber;
                return (
                  <div key={revision?.revisionId || `${review?.dateKey}_${revision?.revisionNumber}`} style={{ border: "1px solid var(--consumer-border)", borderRadius: 8, background: "color-mix(in srgb, var(--consumer-panel) 86%, transparent)", padding: "0.4rem 0.45rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontSize: "0.56rem", color: "var(--consumer-text)" }}>
                        Version {revision?.revisionNumber || 0}: {sanitizeDisplayText(summary.label)}
                      </div>
                      <div style={{ display: "flex", gap: "0.24rem", flexWrap: "wrap", alignItems: "center" }}>
                        {isOriginal && <span style={{ fontSize: "0.46rem", color: C.blue, background: `${C.blue}14`, padding: "0.12rem 0.35rem", borderRadius: 999 }}>first</span>}
                        {isCurrent && <span style={{ fontSize: "0.46rem", color: C.green, background: `${C.green}14`, padding: "0.12rem 0.35rem", borderRadius: 999 }}>active</span>}
                        <div style={{ fontSize: "0.48rem", color: "var(--consumer-text-faint)" }}>{formatReviewTimestamp(revision?.capturedAt)}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: "0.5rem", color: "var(--consumer-text-muted)", marginTop: "0.1rem" }}>
                      {sanitizeDisplayText(summary.detail || summary.type || "No session detail saved.")}
                    </div>
                    <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-muted)", marginTop: "0.14rem", lineHeight: 1.5 }}>
                      Why: {sanitizeDisplayText(revision?.provenanceSummary || revision?.reason || "unknown")} • {sanitizeDisplayText(formatHistorySourceLabel(revision?.sourceType))} • {sanitizeDisplayText(formatHistoryAccessLabel(revision?.durability))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

export function HistoryAuditWeekHistorySection({
  title = "WEEK HISTORY",
  entries = [],
  emptyState = "",
  palette = {},
}) {
  const C = palette;
  return (
    <details className="card" style={{ marginBottom: "0.8rem" }} data-testid="history-week-history-section">
      <summary style={{ cursor: "pointer", fontSize: "0.58rem", color: "var(--consumer-text-muted)", letterSpacing: "0.06em" }}>{title}</summary>
      <div style={{ marginTop: "0.45rem", display: "grid", gap: "0.45rem" }}>
        <div style={primaryContextStyle}>
          Each saved week story keeps the main takeaway up front, with a little more detail tucked here.
        </div>
        {entries.length === 0 ? (
          <div style={{ fontSize: "0.55rem", color: "var(--consumer-text-faint)", lineHeight: 1.55 }}>{emptyState}</div>
        ) : entries.slice(0, 8).map((entry) => {
          const story = entry?.story || {};
          const storyTone = buildLocalTone(story?.toneKey || story?.classificationKey || entry?.status, C);
          return (
            <div key={entry.weekKey} style={{ border: "1px solid var(--consumer-border)", borderRadius: 10, background: "var(--consumer-panel)", padding: "0.5rem 0.55rem" }} data-testid={`history-week-review-card-${entry.weekKey}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "0.58rem", color: "var(--consumer-text)" }}>{entry.label}</div>
                  {(entry.startDate || entry.endDate) && (
                    <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-muted)", marginTop: "0.1rem" }}>
                      {entry.startDate && entry.endDate ? `${entry.startDate} to ${entry.endDate}` : "Week window unavailable"}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.24rem", flexWrap: "wrap", alignItems: "center" }}>
                  {entry?.isCurrentWeek && <span style={{ fontSize: "0.46rem", color: C.green, background: `${C.green}14`, padding: "0.12rem 0.35rem", borderRadius: 999 }}>current</span>}
                  <span style={{ fontSize: "0.46rem", color: storyTone.color, background: storyTone.bg, padding: "0.12rem 0.35rem", borderRadius: 999 }}>
                    {story?.classificationLabel || formatAuditLabel(entry?.status || "planned")}
                  </span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0.45rem", marginTop: "0.45rem" }}>
                <div style={basePanelCardStyle}>
                  <div style={eyebrowStyle}>What Was Planned</div>
                  <div style={{ fontSize: "0.55rem", color: "var(--consumer-text-soft)", marginTop: "0.18rem", lineHeight: 1.55 }}>
                    {story?.plannedSummary || `Planned ${entry?.plannedSessionCount || 0} sessions.`}
                  </div>
                </div>
                <div style={basePanelCardStyle}>
                  <div style={eyebrowStyle}>What Happened</div>
                  <div style={{ fontSize: "0.55rem", color: "var(--consumer-text-soft)", marginTop: "0.18rem", lineHeight: 1.55 }}>
                    {story?.actualSummary || `Logged ${entry?.loggedSessionCount || 0} sessions.`}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0.45rem", marginTop: "0.45rem" }}>
                <div style={basePanelCardStyle}>
                  <div style={eyebrowStyle}>Why It Mattered</div>
                  <div style={{ fontSize: "0.55rem", color: "var(--consumer-text-soft)", marginTop: "0.18rem", lineHeight: 1.55 }}>
                    {story?.whatMattered || entry?.focus || entry?.summary || "No weekly context was saved."}
                  </div>
                </div>
                <div style={basePanelCardStyle}>
                  <div style={eyebrowStyle}>What changes next</div>
                  <div style={{ fontSize: "0.55rem", color: "var(--consumer-text-soft)", marginTop: "0.18rem", lineHeight: 1.55 }}>
                    {story?.nextEffect || "No forward-looking effect was saved."}
                  </div>
                </div>
              </div>

              <details style={{ ...detailDisclosureStyle, marginTop: "0.45rem" }}>
                <summary style={{ cursor: "pointer", fontSize: "0.53rem", color: "var(--consumer-text)" }}>More detail</summary>
                <div style={{ marginTop: "0.35rem", display: "grid", gap: "0.32rem" }}>
                  <div style={{ ...primaryContextStyle, color: "var(--consumer-text-muted)" }}>
                    Save type, source, and your weekly check-in stay here if you want the backstory.
                  </div>
                  <div style={{ fontSize: "0.5rem", color: "var(--consumer-text-muted)", lineHeight: 1.5 }}>
                    Status: {formatAuditLabel(entry?.status || "planned")} • {entry?.plannedSessionCount || 0} planned • {entry?.loggedSessionCount || 0} logged
                  </div>
                  <div style={{ fontSize: "0.5rem", color: "var(--consumer-text-muted)", lineHeight: 1.5 }}>
                    Saved as {formatWeekSaveTypeLabel(entry?.commitment || "committed")} • {formatHistoryAccessLabel(entry?.durability || "durable")}
                  </div>
                  {(entry?.focus || entry?.summary) && (
                    <div style={{ fontSize: "0.5rem", color: "var(--consumer-text-muted)", lineHeight: 1.5 }}>
                      {entry?.focus || entry?.summary}
                    </div>
                  )}
                  {entry?.weeklyCheckin?.ts && (
                    <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-muted)", lineHeight: 1.5 }}>
                      Weekly check-in: energy {entry.weeklyCheckin.energy || "?"}, stress {entry.weeklyCheckin.stress || "?"}, confidence {entry.weeklyCheckin.confidence || "?"}
                    </div>
                  )}
                </div>
              </details>
            </div>
          );
        })}
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
      <summary style={{ cursor: "pointer", fontSize: "0.58rem", color: "var(--consumer-text-muted)", letterSpacing: "0.06em" }}>PREVIOUS PLANS</summary>
      <div style={{ marginTop: "0.45rem", display: "grid", gap: "0.4rem" }}>
        {archives.length === 0 && (
          <div style={{ fontSize: "0.55rem", color: "var(--consumer-text-faint)" }}>No archived plans yet.</div>
        )}
        {archives.map((archive) => {
          const selected = selectedArchiveReview?.archiveId === archive.id;
          return (
            <div key={archive.id} style={{ border: `1px solid ${selected ? C.blue + "55" : "var(--consumer-border)"}`, borderRadius: 8, background: "var(--consumer-panel)", padding: "0.45rem 0.5rem" }}>
              <div style={{ fontSize: "0.56rem", color: "var(--consumer-text)" }}>{archive.label}</div>
              <div style={{ fontSize: "0.5rem", color: "var(--consumer-text-muted)", marginTop: "0.1rem" }}>Archived {archive.archivedAt ? new Date(archive.archivedAt).toLocaleString() : "unknown"}</div>
              {archive.committedWeekCount > 0 && (
                <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-soft)", marginTop: "0.1rem" }}>
                  {archive.committedWeekCount} saved week review{archive.committedWeekCount === 1 ? "" : "s"} archived.
                </div>
              )}
              {archive.prescribedDayCount > 0 && (
                <div style={{ fontSize: "0.49rem", color: "var(--consumer-text-muted)", marginTop: "0.1rem" }}>
                  {archive.prescribedDayCount} day review snapshot{archive.prescribedDayCount === 1 ? "" : "s"} archived.
                </div>
              )}

              {archive.weekReviews.length > 0 && (
                <div style={{ marginTop: "0.25rem", display: "grid", gap: "0.18rem" }}>
                  {archive.weekReviews.slice(0, 4).map((entry) => (
                    <div key={`${archive.id}_week_${entry.weekKey}`} style={{ fontSize: "0.52rem", color: "var(--consumer-text-muted)", lineHeight: 1.55 }}>
                      Week {entry.absoluteWeek || entry.weekNumber}: {sanitizeDisplayText(entry.label || "Saved week")} • {sanitizeDisplayText(entry?.story?.classificationLabel || formatAuditLabel(entry?.status || "planned"))}
                      {entry?.story?.whatMattered ? ` • ${sanitizeDisplayText(entry.story.whatMattered)}` : entry.focus ? ` • ${sanitizeDisplayText(entry.focus)}` : ""}
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
                    subtitle="Archived plan state stays separate from later outcome."
                    review={selectedArchiveReview.review}
                    palette={C}
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
