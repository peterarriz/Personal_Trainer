# Claude Guidance

For architecture or cross-cutting tasks in this repo:

1. Read `docs/MASTER_SPEC.md` first.
2. Read `docs/BUILD_BACKLOG.md` second.
3. Minimize scope per task and avoid rebuilding adjacent systems unless the task requires it.

Working rules:

- Preserve coherence across Today, Program, Coach, Nutrition, and Logging.
- Prefer deterministic structured state over magic UI behavior.
- Keep planned state and actual state separate.
- Treat AI as an interpretation layer, not the source of truth.
- Reuse or strengthen existing seams instead of creating parallel models.
- If a task changes architecture, update the relevant doc before or alongside code.
