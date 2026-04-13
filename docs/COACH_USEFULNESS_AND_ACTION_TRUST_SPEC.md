# Coach Usefulness And Action Trust Spec

## Ownership Boundary
- Deterministic app state remains canonical.
- AI may improve explanation, interpretation, and tone.
- State changes happen only through explicit accepted actions.

## Product Rules
- Quick prompts must produce meaningfully different context and action options.
- Coach fallback responses should stay compact and specific instead of dumping large repeated blobs.
- Conversation history should stay trimmed by default.
- Advanced provider setup belongs in Settings, not in the main Coach surface.

## UX Rules
- Coach should answer with decisions, tradeoffs, or safe next moves.
- Coach should not look like the planner of record.
- Accepted action summaries should stay visible and explicit.
