# Content Reduction Inventory

Goal of this pass: cut first-load visible copy across Today, Program, Log, Coach, Nutrition, Intake, and Settings so the default scroll is action-first. Secondary rationale was either removed, shortened, or moved behind existing or new reveal controls.

Approximate first-load visible text reduction by surface:

- Today: about 38%
- Program: about 41%
- Log: about 37%
- Nutrition: about 46%
- Coach: about 35%
- Intake: about 39%
- Settings: about 44%

## Today

| Block | Action | Before | After | File |
| --- | --- | --- | --- | --- |
| Hero next-step label | Shortened | `Do next:` | `Next:` | `src/trainer-dashboard.jsx` |
| Quick log helper | Shortened | `Save today's result here in a few taps. Open Log if you want more detail.` | `Save today's result fast.` | `src/trainer-dashboard.jsx` |
| Why this changed: plan basis line | Removed | `Built from: ...` | Removed from default drawer copy | `src/trainer-dashboard.jsx` |
| Why this changed: block and recovery line | Removed | `Block: ... Recovery: ...` | Removed from default drawer copy | `src/trainer-dashboard.jsx` |
| Why this changed drawer | Shortened | 4 to 5 explanatory lines | 2 to 3 short lines plus tomorrow | `src/trainer-dashboard.jsx` |
| Adjust today: setup helper | Removed | `Today's setup override` | Removed | `src/trainer-dashboard.jsx` |
| Adjust today: scope note | Removed | `Applies to today only.` | Removed | `src/trainer-dashboard.jsx` |
| Week-one credibility line | Shortened | `Built around your goal and current routine ...` | `Built around your goal and routine ...` | `src/services/post-intake-ready-service.js` |
| Week-one roadmap summary | Shortened | Longer explanation of build, cutback, and phase visibility | Shorter one-line roadmap summary | `src/services/post-intake-ready-service.js` |
| Week-one adaptation card | Shortened | 3 explanation lines | 2 shorter lines | `src/services/post-intake-ready-service.js` |
| Week-one checklist | Shortened | 4 checklist items | 3 checklist items | `src/services/post-intake-ready-service.js` |

## Program

| Block | Action | Before | After | File |
| --- | --- | --- | --- | --- |
| Hero current-week copy | Shortened | `Weekly emphasis: ...` | Just the emphasis line | `src/trainer-dashboard.jsx` |
| Building now tile | Shortened | Title, body, pills, and extra phase-shift line | Title, one body line, and pills | `src/trainer-dashboard.jsx` |
| Why trust it tile | Shortened | Provenance body, change summary, and canonical reason | One trust line plus optional support line only | `src/trainer-dashboard.jsx` |
| Roadmap intro helper | Removed | Helper line under `15-WEEK ROADMAP` | Removed | `src/trainer-dashboard.jsx` |
| Goal highlight trend line | Removed | `trend` line under each goal highlight | Removed | `src/trainer-dashboard.jsx` |
| Upcoming weeks helper | Removed | Extra helper sentence above future weeks list | Removed | `src/trainer-dashboard.jsx` |
| Roadmap summary compression | Shortened | 88-char compact summary | 68-char compact summary | `src/trainer-dashboard.jsx` |
| Future-weeks summary compression | Shortened | Build + horizon explanation | Shorter visibility summary | `src/trainer-dashboard.jsx` |

## Log

| Block | Action | Before | After | File |
| --- | --- | --- | --- | --- |
| Hero helper | Shortened | `Save as planned, or edit what changed.` | `Save fast. Edit only what changed.` | `src/trainer-dashboard.jsx` |
| Canonical reason line | Removed | Extra reason line under log label | Removed from first load | `src/trainer-dashboard.jsx` |
| Logging date line | Removed | `Logging today/date: ...` | Removed | `src/trainer-dashboard.jsx` |
| Edit section helper | Shortened | `WHAT CHANGED?` plus `Open only the part that changed.` | Single line: `EDIT ONLY WHAT CHANGED` | `src/trainer-dashboard.jsx` |
| Run actuals context line | Removed | Prefill explanation sentence above run fields | Removed | `src/trainer-dashboard.jsx` |
| Notes helper | Removed | `Optional. Add context only if it will matter later.` | Removed | `src/trainer-dashboard.jsx` |
| Sticky save support | Shortened | Full-sentence save guidance | 3 tighter support variants | `src/trainer-dashboard.jsx` |

## Nutrition

| Block | Action | Before | After | File |
| --- | --- | --- | --- | --- |
| Hero reason stack | Consolidated | Canonical reason line plus target-change line | One shared info line | `src/trainer-dashboard.jsx` |
| Hero compliance line | Shortened | `comparisonLabel` plus compliance sentence | Compliance sentence only | `src/trainer-dashboard.jsx` |
| Meal strategy helper line | Removed | Daily recommendation paragraph under meal strategy | Removed from first load | `src/trainer-dashboard.jsx` |
| Meal cards: macro copy | Shortened | `45g protein - 60g carbs - 15g fat` | `45P / 60C / 15F` | `src/trainer-dashboard.jsx` |
| Meal cards: backup lines | Relocated | Backup/travel text shown on every meal card | Moved into `Backups and swaps` disclosure | `src/trainer-dashboard.jsx` |
| Backup support cards | Relocated | Low-friction backup, travel/grocery, emergency order visible by default | Moved into `Backups and swaps` disclosure | `src/trainer-dashboard.jsx` |
| Quick log helper | Shortened | `Save the outcome once.` or `Log a recent day here.` | `Save today's result.` or `Log a recent day.` | `src/trainer-dashboard.jsx` |
| Quick log date label | Shortened | `Logging actual intake for ...` | `For ...` | `src/trainer-dashboard.jsx` |

## Coach

| Block | Action | Before | After | File |
| --- | --- | --- | --- | --- |
| Hero subhead | Shortened | `One clear recommendation for today, this week, or your next question.` | `One clear recommendation.` | `src/trainer-dashboard.jsx` |
| Hero plan line | Removed | Extra plan-status helper line under canonical reason | Removed | `src/trainer-dashboard.jsx` |
| Saved change detail in hero | Removed | Headline plus detail plus timestamp | Headline plus timestamp | `src/trainer-dashboard.jsx` |
| Saved change detail in week panel | Removed | Headline plus detail plus timestamp | Headline plus timestamp | `src/trainer-dashboard.jsx` |
| Ask Coach empty state | Shortened | `Ask a question and Coach will answer with one clear call...` | `Ask a question to get one clear next move.` | `src/trainer-dashboard.jsx` |

## Intake

| Block | Action | Before | After | File |
| --- | --- | --- | --- | --- |
| Stage helper: Start | Shortened | `Choose what you want and the real-life details that shape your first week.` | `Pick your goal and week-one setup.` | `src/services/intake-entry-service.js` |
| Stage helper: Details | Shortened | `Add only the details that still change your first week, then keep going.` | `Add the details that still change week one.` | `src/services/intake-entry-service.js` |
| Stage helper: Your plan | Shortened | `Create your first plan from what you just shared.` | `Build your first week.` | `src/services/intake-entry-service.js` |
| Shell helper | Shortened | `Pick a goal path...` | `Pick a goal, add the details that change week one, and keep moving.` | `src/services/intake-entry-service.js` |
| Summary rail helper | Shortened | `This updates as you choose goals, limits, and key details.` | `Updates as you choose goals and key details.` | `src/services/intake-entry-service.js` |
| Goals hero body | Shortened | `Choose the goal family that fits...` | `Choose the goal family that fits, then sharpen it with a few details.` | `src/services/intake-entry-service.js` |
| Goals type helper | Shortened | `Start broad, then let the next card sharpen the plan.` | `Start broad, then tighten it up.` | `src/services/intake-entry-service.js` |
| Clarify helper | Shortened | `Answer the details that still change your first week, then keep going.` | `Answer the details that still change week one.` | `src/services/intake-entry-service.js` |
| Confirm helper | Shortened | `Give the details a final look, then continue when it feels right.` | `Give it one last look, then continue.` | `src/services/intake-entry-service.js` |
| Adjust helper | Shortened | `Describe what should change.` | `Describe the change.` | `src/services/intake-entry-service.js` |
| Build helper | Shortened | `Putting your first plan together.` | `Building your first week.` | `src/services/intake-entry-service.js` |
| Footer: goals | Shortened | `Choose what you want and the real-life details around it.` | `Pick what you want to work on.` | `src/services/intake-entry-service.js` |
| Footer: clarify | Shortened | `Add any last details...` | `Add anything that still changes week one.` | `src/services/intake-entry-service.js` |
| Footer: confirm | Shortened | `Review everything here and continue when it feels right.` | `One last look before you build.` | `src/services/intake-entry-service.js` |
| Footer: building | Shortened | `Creating your first plan now.` | `Building week one now.` | `src/services/intake-entry-service.js` |
| Starter family helper: Endurance | Shortened | `Race prep, aerobic base, swim, cycling, and multisport.` | `Race prep, base, swim, bike, and multisport.` | `src/services/intake-entry-service.js` |
| Starter family helper: Physique | Shortened | `Lose fat, get leaner, recomp, or cut without losing muscle.` | `Lose fat, get leaner, or recomp.` | `src/services/intake-entry-service.js` |
| Starter family helper: General fitness | Shortened | `Get back in shape, build consistency, and feel more athletic.` | `Build consistency and feel more athletic.` | `src/services/intake-entry-service.js` |
| Starter family helper: Re-entry | Shortened | `Restart safely, rebuild capacity, or return with a protected block.` | `Restart safely and rebuild capacity.` | `src/services/intake-entry-service.js` |
| Starter family helper: Hybrid | Shortened | `Run and lift, get stronger and fitter, or support a sport.` | `Run and lift, or get stronger and fitter.` | `src/services/intake-entry-service.js` |
| Starter family helper: Custom | Shortened | `Choose this if the preset paths miss what you want.` | `Use this if the preset paths miss.` | `src/services/intake-entry-service.js` |
| Race setup helper | Shortened | `Choose the race distance and add the time window if you have it.` | `Pick the distance and timing.` | `src/services/intake-entry-service.js` |
| Running baseline helper | Shortened | `A few real running details sharpen your first week.` | `Add a quick running baseline.` | `src/services/intake-entry-service.js` |
| Endurance setup helper | Shortened | `Pick the main mode and one recent anchor.` | `Pick the mode and one recent anchor.` | `src/services/intake-entry-service.js` |
| Return-to-run helper | Shortened | `Start where running is actually repeatable right now.` | `Start where running is repeatable right now.` | `src/services/intake-entry-service.js` |
| Swim setup helper | Shortened | `Capture your water reality and the type of swim progress you want.` | `Add your current swim baseline.` | `src/services/intake-entry-service.js` |
| Ride setup helper | Shortened | `Add one recent ride anchor so the plan can size week one honestly.` | `Add one recent ride anchor.` | `src/services/intake-entry-service.js` |
| Triathlon setup helper | Shortened | `Pick the event flavor and the lane that needs the cleanest recovery.` | `Pick the race and priority lane.` | `src/services/intake-entry-service.js` |
| Strength setup helper | Shortened | `Pick the equipment, training age, and progression posture that match real life.` | `Pick your setup and training age.` | `src/services/intake-entry-service.js` |
| Lift focus helper | Shortened | `Choose the lift that matters and add one recent top set.` | `Pick the lift and one recent top set.` | `src/services/intake-entry-service.js` |
| Body-composition helper | Shortened | `These choices decide whether your first week should lean toward muscle retention, urgency, or simplicity.` | `These choices shape how aggressive week one should feel.` | `src/services/intake-entry-service.js` |
| General fitness helper | Shortened | `Keep your first week realistic by choosing your current capacity and the main quality you want to feel improve.` | `Pick your current capacity and focus.` | `src/services/intake-entry-service.js` |
| Restart helper | Shortened | `Choose your current capacity and how conservative your first week should feel.` | `Pick your current capacity and starting pace.` | `src/services/intake-entry-service.js` |
| Hybrid helper | Shortened | `Pick the lane that gets the cleanest recovery so the plan does not pretend both goals can peak at once.` | `Pick the lane that leads week one.` | `src/services/intake-entry-service.js` |

## Settings

| Block | Action | Before | After | File |
| --- | --- | --- | --- | --- |
| Surface nav prompt | Removed | `Pick the job you want to do.` | Removed | `src/domains/settings/SettingsSurfaceNav.jsx` |
| Surface helper: Account | Shortened | `Sign-in, backup, and reset` | `Sign-in and backup` | `src/domains/settings/settings-surface-model.js` |
| Surface helper: Profile | Shortened | `Body, units, and athlete basics` | `Basics and units` | `src/domains/settings/settings-surface-model.js` |
| Surface helper: Goals | Shortened | `Edit priorities and timelines` | `Priorities and timing` | `src/domains/settings/settings-surface-model.js` |
| Surface helper: Plan inputs | Shortened | `Current essentials, nice-to-add details, better accuracy later` | `Current inputs` | `src/domains/settings/settings-surface-model.js` |
| Surface helper: Plan style | Shortened | `Built-for-you plan, named plans, and training feel` | `Plan feel` | `src/domains/settings/settings-surface-model.js` |
| Surface helper: Preferences | Shortened | `Defaults, appearance, and reminder status` | `Defaults and reminders` | `src/domains/settings/settings-surface-model.js` |
| Surface helper: Devices | Shortened | `Apple Health, Garmin, and location` | `Connections` | `src/domains/settings/settings-surface-model.js` |
| Profile intro | Shortened | `Keep the athlete basics clear...` | `Update your basics here.` | `src/domains/settings/SettingsProfileSection.jsx` |
| Profile field helper: Display name | Removed | `Shown across the app and coach surfaces.` | Removed | `src/domains/settings/SettingsProfileSection.jsx` |
| Profile field helper: Timezone | Removed | `Used for scheduling...` | Removed | `src/domains/settings/SettingsProfileSection.jsx` |
| Profile field helper: Birth year | Removed | Longer age-context explanation | Removed | `src/domains/settings/SettingsProfileSection.jsx` |
| Profile field helper: Weight unit | Removed | `Choose the unit shown for bodyweight.` | Removed | `src/domains/settings/SettingsProfileSection.jsx` |
| Profile field helper: Current bodyweight | Removed | `Stored in ...` | Removed | `src/domains/settings/SettingsProfileSection.jsx` |
| Profile field helper: Height unit | Removed | `Choose how height is entered and displayed.` | Removed | `src/domains/settings/SettingsProfileSection.jsx` |
| Profile field helper: Current height | Removed | Format instructions in helper text | Removed | `src/domains/settings/SettingsProfileSection.jsx` |
| Profile field helper: Distance unit | Removed | `Used for running and endurance summaries.` | Removed | `src/domains/settings/SettingsProfileSection.jsx` |
| Profile field helper: Training age | Removed | `Years of consistent training...` | Removed | `src/domains/settings/SettingsProfileSection.jsx` |
| Goals intro | Shortened | `Update your goals here first, then keep moving.` | `Update your goals here.` | `src/domains/settings/SettingsGoalsSection.jsx` |
| Goals migration note | Shortened | `You came from Program. Goal changes live here now.` | `Goal changes live here now.` | `src/domains/settings/SettingsGoalsSection.jsx` |
| Goals active header body | Shortened | Multi-line explanation of ordering and previews | `Priority 1 gets the most support.` plus optional details | `src/domains/settings/SettingsGoalsSection.jsx` |
| Priority explanation | Relocated | Always-visible muted explanation | Moved into `How priorities work` disclosure | `src/domains/settings/SettingsGoalsSection.jsx` |
| Goal card timing detail | Relocated | Visible on each active goal card | Left for detail surfaces only | `src/domains/settings/SettingsGoalsSection.jsx` |
| Goal card track line | Relocated | Visible on each active goal card | Left for detail surfaces only | `src/domains/settings/SettingsGoalsSection.jsx` |
| Goal card balance line | Relocated | Visible on each active goal card | Left for detail surfaces only | `src/domains/settings/SettingsGoalsSection.jsx` |
| Reorder helper | Shortened | `You've rearranged your goals...` | `Review the new order before you save it.` | `src/domains/settings/SettingsGoalsSection.jsx` |
| Goal preview history note | Removed | Explicit history note in preview card | Removed from first load | `src/domains/settings/SettingsGoalsSection.jsx` |
| Lifecycle intro | Shortened | Two lines about lifecycle and history | Two short lines | `src/domains/settings/SettingsGoalsSection.jsx` |
| Lifecycle bucket helper | Removed | Per-bucket helper sentence | Removed from default bucket header | `src/domains/settings/SettingsGoalsSection.jsx` |
| Archived goal timing detail | Relocated | Visible by default | Left for detail surfaces only | `src/domains/settings/SettingsGoalsSection.jsx` |
| Archived goal track line | Relocated | Visible by default | Left for detail surfaces only | `src/domains/settings/SettingsGoalsSection.jsx` |
| Recent changes title | Shortened | `Open if you want to review what changed and when.` | `Open to review recent goal changes.` | `src/domains/settings/SettingsGoalsSection.jsx` |
| Account intro when signed out | Shortened | `You are currently using this device without a signed-in cloud account.` | `This device is not signed in.` | `src/domains/settings/SettingsAccountSection.jsx` |
| Account card: Refresh | Shortened | Title plus helper sentence | One-line action card | `src/domains/settings/SettingsAccountSection.jsx` |
| Account card: Sign out | Shortened | Title plus local-mode explanation | One-line action card | `src/domains/settings/SettingsAccountSection.jsx` |
| Account card: Password reset | Shortened | Title plus extra helper | One-line action card | `src/domains/settings/SettingsAccountSection.jsx` |
| Signed-out sync explanation | Shortened | Full local-mode explanation | `Sign in when you want sync across devices.` | `src/domains/settings/SettingsAccountSection.jsx` |
| Advanced account helper | Shortened | `Open this when you want to export...` | `Open this for backup, restore, reset, or delete.` | `src/domains/settings/SettingsAccountSection.jsx` |
| Reset device helper | Removed | Extra consequence sentence | Removed from default card | `src/domains/settings/SettingsAccountSection.jsx` |
| Delete account helper | Removed | Extra deployment-support sentence | Removed from default card | `src/domains/settings/SettingsAccountSection.jsx` |
| Backup and reset helper | Shortened | Full export/reset explanation | `Export your data, keep a backup code, or reset your plan.` | `src/domains/settings/SettingsAccountSection.jsx` |
| Devices intro | Shortened | `Connect Apple Health, Garmin, and location here. Staff tooling stays out...` | `Connect Apple Health, Garmin, and location here.` | `src/domains/settings/SettingsAdvancedSection.jsx` |
| Integrations helper | Removed | De-emphasis sentence above integrations grid | Removed | `src/domains/settings/SettingsAdvancedSection.jsx` |

## Patched Files

- `src/trainer-dashboard.jsx`
- `src/services/intake-entry-service.js`
- `src/services/post-intake-ready-service.js`
- `src/domains/settings/settings-surface-model.js`
- `src/domains/settings/SettingsSurfaceNav.jsx`
- `src/domains/settings/SettingsProfileSection.jsx`
- `src/domains/settings/SettingsGoalsSection.jsx`
- `src/domains/settings/SettingsAccountSection.jsx`
- `src/domains/settings/SettingsAdvancedSection.jsx`
