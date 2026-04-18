# Program Information Architecture

## Goal
Program should feel like a believable training surface for someone chasing a real outcome, not a hidden planning tool.

The screen should answer four questions in order:

- Where am I right now
- What is today inside this week
- What is building over the next several weeks
- What does the full 12 to 15 week arc look like

## Revised Hierarchy

### 1. Hero snapshot
- Show the current week, current day highlight, and the main build signal.
- Keep trust language quiet and plain.
- Keep plan-management actions available without taking over the screen.

### 2. This week
- Show the week emphasis, the current primary build marker, and the next shift.
- Keep the current week grid visible so today is obvious.
- Let the user open a day and inspect full detail without leaving the week.

### 3. Coming up
- Show the next several actual weeks with clean week cards.
- Each card should show phase, main build marker, one focus line, and a few visible session previews.
- Full week details stay available, but the default card must already feel informative.

### 4. 15-week arc
- Show the zoomed-out arc as a scanning layer, not a paragraph wall.
- Keep phase shifts, cutbacks, and the primary progression visible at a glance.
- Use simpler week cards that emphasize the main build and support lane.

## Card Rules

- Current-day highlight must show the real planned session and the day label.
- Current-week highlight must show the phase and the current week state.
- Future week cards must show the main build first and explanation second.
- Roadmap cards must keep one primary metric, one focus line, and one support line at most.
- No `Later phases` pattern in the main future view.

## Acceptance Criteria

### Strength-only user
- The hero and the arc lead with strength build, not running defaults.
- Week cards show strength frequency or lift progression first.
- Any endurance or conditioning work reads as support, not the main story.

### Endurance-only user
- The hero and the arc lead with the endurance build, such as long run or key aerobic progression.
- Week cards make it easy to see progression, cutbacks, and phase shifts.
- Strength, if present, reads as support work.

### Hybrid user
- The hero follows the real priority-one goal.
- Week cards keep the secondary lane visible so the plan does not read like a single-sport template.
- The arc shows both the main build and the supporting lane without burying either one.
