Act as a senior TypeScript, React, Material UI, ioBroker VIS-2, and frontend animation engineer.

Your task is to implement the GUI for an existing smart-home energy-saving gamification backend as a clean patch against this repository:

https://github.com/Str-n/ioBroker.vis-2-widgets-nils

I want an actual implementation patch, not pseudocode, mockups, or general advice.

## Primary objective

Add a new production-quality VIS-2 widget to `ioBroker.vis-2-widgets-nils` that displays an energy-saving game score and reacts visually whenever the backend awards points.

The widget should feel like a polished mini-game embedded in a smart-home dashboard while still fitting the visual quality and conventions of the existing Material-style widget set.

The backend already owns all game logic.

The frontend MUST NOT:

* calculate whether a light deserves a point
* calculate daily rollover
* calculate high scores
* infer automation/manual events
* modify scores
* implement anti-cheat logic

It only renders backend states and reacts to backend event changes.

---

# 1. Inspect the repository before coding

First inspect the current repository and specifically understand:

* `CLAUDE.md`
* `src-widgets/src/Generic.tsx`
* several existing widgets with modern code patterns
* at least one relatively simple widget
* at least one visually sophisticated widget
* `src-widgets/vite.config.ts`
* `src-widgets/src/i18n/`
* preview/dev infrastructure
* current lint/build/test scripts
* current widget configuration conventions
* lifecycle/state subscription patterns used by VIS-2 widgets in this repository

The repository currently uses:

* TypeScript
* React
* Material UI
* `Generic<RxData, State>`
* `window.visRxWidget` through Generic
* Vite
* Module Federation

Do not replace this architecture.

Do not introduce a second frontend framework.

Do not upgrade dependencies unless absolutely required.

Do not refactor unrelated widgets.

Do not blindly follow this prompt where the repository's actual API/conventions differ. Inspect the code and adapt the implementation to the repository's established patterns.

If something in this prompt conflicts with actual repository conventions, prefer the repository convention and explain the deviation.

---

# 2. Widget identity

Create a new widget named conceptually:

`EnergyGame`

Suggested file:

`src-widgets/src/EnergyGame.tsx`

Suggested widget ID:

`tplNils2EnergyGame`

Suggested VIS name:

`EnergyGame`

Use the existing widget set identifier used by this fork.

Follow the naming and `getWidgetInfo()` patterns already present in the repository.

Register the widget correctly in Module Federation / `vite.config.ts` and anywhere else required by the actual repository architecture.

Do not add unnecessary registration mechanisms.

---

# 3. Backend state contract

The backend exposes persistent states below approximately:

`0_userdata.0.energyGame`

The widget must allow the user to configure the relevant OIDs in the VIS editor rather than hard-coding them.

Required bindings:

### Scores

Daily score:
`0_userdata.0.energyGame.score.daily`

Lifetime score:
`0_userdata.0.energyGame.score.overall`

Daily high score:
`0_userdata.0.energyGame.score.highScore`

### High-score state

Boolean:
`0_userdata.0.energyGame.day.highScoreToday`

Optional timestamp:
`0_userdata.0.energyGame.day.recordBrokenAt`

### Event states

Monotonically increasing event sequence:
`0_userdata.0.energyGame.event.sequence`

Points represented by this visual event:
`0_userdata.0.energyGame.event.delta`

Event type:
`0_userdata.0.energyGame.event.kind`

Number of lights:
`0_userdata.0.energyGame.event.lightCount`

Optional light names:
`0_userdata.0.energyGame.event.lightNames`

Event timestamp:
`0_userdata.0.energyGame.event.timestamp`

Expected event kinds include:

`POINT`
`COMBO`
`NEW_RECORD`

Do not assume `lightNames` is always valid or present. Handle missing, empty, malformed, array-like, or JSON-string values gracefully.

The score states are authoritative.

---

# 4. VIS editor configuration

The widget configuration should expose sensible fields grouped according to existing repository conventions.

At minimum provide OID selectors for:

* daily score
* overall score
* high score
* highScoreToday
* event.sequence
* event.delta
* event.kind
* event.lightCount
* event.lightNames

Optional:

* recordBrokenAt
* event.timestamp

Provide useful defaults using the expected `0_userdata.0.energyGame...` paths if VIS-2 widget configuration conventions safely support defaults.

If hard-coded defaults would cause problems in the editor, leave configurable fields empty instead.

Also expose a restrained set of visual options.

Suggested options:

### Labels

* widget title, default conceptually `Energy Saver`
* daily label, default `TODAY`
* overall label, default `ALL TIME`
* record label, default `RECORD`
* unit/points label, default `ENERGY`

### Behavior

* animations enabled
* show light names in event animation
* show persistent record sparkles
* optional compact mode if straightforward

### Appearance

Do not create a giant theme editor.

Use existing VIS/MUI theme values wherever practical.

At most expose a few high-value settings such as:

* accent color
* card/background mode if existing widget conventions support it
* maybe corner radius or transparent-card option if that is already standard in this repository

Avoid dozens of minor configuration fields.

---

# 5. Main visual design

The widget should work well on a wall-mounted tablet.

The information hierarchy should be:

1. DAILY SCORE — dominant
2. HIGH SCORE — prominent but secondary
3. ALL-TIME SCORE — secondary

Conceptual structure:

```
                ENERGY SAVER

                     ⚡

                     18
                   TODAY

           2,847          🏆 27
          ALL TIME         RECORD
```

This is only conceptual. Produce a polished layout, not ASCII.

The daily score should be visually dominant.

Use:

* strong typography
* tasteful glow/highlight
* Material-compatible surfaces
* responsive sizing
* clean spacing
* clear contrast

It should look like a game without looking like a children's mobile game.

Think:

* arcade energy
* futuristic smart home
* premium dashboard
* restrained neon accents

Avoid:

* casino aesthetics
* constant flashing
* rainbow gradients everywhere
* excessive emojis
* tacky particle overload

Use Material icons or lightweight inline SVG where appropriate.

Do not depend on external images, fonts, CDNs, or web services.

---

# 6. Normal point animation

The main game interaction occurs whenever `event.sequence` changes after the widget has already initialized.

For:

`event.kind === "POINT"`
and typically:
`event.delta === 1`

show an approximately 1-1.5 second animation.

Conceptually:

```
             +1

          ENERGY SAVED

         Kitchen Ceiling
```

Animation ideas:

* `+1` rises slightly upward
* scale from about 0.8 to 1.1 and settle
* opacity fade
* brief energy pulse/ring around the main score
* small lightweight spark/energy particles
* daily score briefly scales/pulses
* subtle glow

Use performant properties:

* transform
* opacity

Avoid layout-heavy continuous animations.

CSS/SVG is preferred over Canvas unless repository evidence strongly favors something else.

The daily score should already show its new authoritative backend value. Do not animate by locally adding 1 to it.

---

# 7. Combo animation

Several physical lights may score within the backend aggregation window.

Example backend visual event:

`event.delta = 10`
`event.lightCount = 10`
`event.kind = "COMBO"`

For delta greater than 1, display a stronger but still short celebration.

Conceptually:

```
               +10

              ENERGY

          10 LIGHT COMBO!
```

Optionally show a small secondary line such as:

`Kitchen, Hall, Dining +7`

Do not dump an enormous array of names onto the screen.

Create a sensible summarization helper.

Example:

1 light:
`Kitchen`

2-3 lights:
`Kitchen • Hall • Dining`

many lights:
`Kitchen • Hall • Dining +7`

The backend has already awarded all points. The widget simply displays the supplied `delta`.

A +10 combo should feel significantly more rewarding than +1, but should finish after a few seconds.

---

# 8. New daily record behavior

The backend determines when a record was broken.

When:

`event.kind === "NEW_RECORD"`

play a larger one-time celebration.

Conceptually:

```
         ✦   ✦   ✦

           NEW RECORD

                🏆
                28

              +5 ENERGY

         ✦   ✦   ✦
```

If `delta > 1`, incorporate the combo/delta into the record celebration instead of trying to play two overlapping major animations.

A NEW_RECORD event must be visually special.

Suggested features:

* trophy highlight
* brighter pulse
* short burst of particles/sparkles
* shine sweep
* animated `NEW RECORD` badge

Duration should be roughly 2.5-4 seconds.

Do not continuously replay it.

---

# 9. Persistent high-score sparkle

When:

`highScoreToday === true`

the record section should visibly indicate that today's score established a new all-time daily record.

This persists for the remainder of the day.

Use a SUBTLE persistent effect such as:

* occasional tiny sparkles
* slow border shimmer
* periodic light sweep on trophy
* small `NEW RECORD` badge
* gentle glow breathing

Important:

This may run for many hours.

Therefore:

* low CPU/GPU cost
* no fast infinite particle storm
* no constant flashing
* avoid expensive blur changes across huge elements
* avoid layout animation
* avoid unnecessary React state timers

Prefer CSS animation.

The persistent effect should remain enjoyable after six hours.

---

# 10. CRITICAL event-sequence semantics

This is one of the most important implementation requirements.

`event.sequence` is monotonically incremented by the backend for every new visual event.

The widget must animate ONLY when it observes a genuine sequence change after initialization.

It MUST NOT animate merely because:

* the VIS page loaded
* the widget mounted
* the user navigated to the view
* the tablet woke up
* VIS reconnected
* state values were initially populated
* the current sequence is already 127 when the widget first appears

Example:

Backend currently contains:

daily = 18
event.sequence = 127
event.delta = 1

The user opens VIS.

Expected:

Display score 18 immediately.
Display no `+1` animation.

Internally establish sequence 127 as the baseline.

Later backend changes:

sequence 127 -> 128

Now play the event animation exactly once.

Implement this robustly using the lifecycle/update mechanisms appropriate to this repository.

Do not guess the VIS subscription API. Inspect existing widgets and Generic/visRxWidget behavior.

---

# 11. Reconnect/remount behavior

Be conservative about animations.

The user should never get fake rewards simply because the dashboard reconnects.

If the component is genuinely remounted without any reliable previous sequence baseline, initialize silently from the current sequence.

It is preferable to miss replaying an animation that occurred while the widget was completely absent than to display an old event as though it just happened.

The actual scores are always authoritative.

Document how your implementation prevents mount/reconnect replay.

---

# 12. Rapid event handling

The backend normally aggregates near-simultaneous scoring, but separate events may still arrive quickly.

Example:

sequence 50 -> 51
then 51 -> 52 shortly afterward

The widget must behave predictably.

Do not:

* leak timers
* create unbounded animation queues
* render dozens of particle systems indefinitely

Choose a sensible strategy, for example:

* restart/replace current normal animation with the latest event
* or use a small bounded queue

A NEW_RECORD event should not be silently hidden by an ordinary POINT event.

Explain and implement the chosen priority behavior.

Prefer simplicity and reliability over elaborate animation queuing.

---

# 13. Data consistency / asynchronous state updates

Different ioBroker event datapoints may update within a very short interval.

For example sequence could become visible close to delta/kind/lightNames changes.

Do not assume React necessarily receives every related value in one atomic render.

Inspect how state updates work in this repository.

Design event capture so the widget does not accidentally animate sequence N using stale metadata from sequence N-1.

If necessary, use a very short deferred snapshot or another repository-compatible mechanism.

Do not add large artificial delays.

Document the decision.

---

# 14. Missing or malformed data

The widget must not crash when:

* an OID isn't configured
* an object does not exist
* value is undefined
* value is null
* daily score is a numeric string
* event.delta is missing
* event.kind is unknown
* lightNames has malformed JSON
* highScoreToday is absent

Use safe fallback rendering.

Examples:

Score unavailable:
`—`

Missing event metadata:
still update static score display but skip unsafe animation details.

Unknown event.kind:
treat conservatively as a standard point/combo presentation based on delta.

Do not throw errors in normal VIS runtime.

---

# 15. Responsive behavior

The widget should work at approximately:

* compact: ~260 x 180
* normal tablet card: ~400 x 260
* larger dashboard: ~600 x 350

Do not hard-code one pixel size.

Use:

* responsive flex/grid
* CSS `clamp()` where appropriate
* container-relative sizing if reliable in supported browser target
* sensible text overflow

Respect the repository's browser build target and existing compatibility expectations.

Do not introduce CSS that only works in very recent Chromium if the repository intentionally supports older versions.

---

# 16. Dark/light themes

Support both dark and light VIS/MUI themes.

Prefer the actual MUI theme rather than guessing whether the page background is dark.

Ensure:

* readable text
* controlled glow
* accessible contrast
* record sparkles visible in both modes

Do not hard-code the complete palette.

If the user configures an accent color, combine it sensibly with the current Material theme.

---

# 17. Reduced motion and accessibility

Respect:

`prefers-reduced-motion: reduce`

When reduced motion is active:

* no flying particles
* no big scaling animation
* no repeated shimmer movement
* score changes remain visible
* NEW RECORD remains clearly indicated through static styling/badge

Do not make animation necessary to understand the information.

Use semantic/accessible text where practical.

Pure decorative SVG/particles should not pollute accessibility output.

---

# 18. Performance

Assume this runs continuously on a wall tablet that may not have a powerful GPU.

Requirements:

* avoid requestAnimationFrame loops unless truly necessary
* avoid large Canvas particle engines
* avoid WebGL
* avoid continuous JS-driven animation
* avoid unnecessary state updates
* avoid interval timers for effects that CSS can implement
* clean up all setTimeout/setInterval/listeners on unmount
* no memory leaks
* no ever-growing arrays
* avoid huge DOM particle counts

For transient particles, use a small bounded count.

Persistent high-score sparkle must remain lightweight.

---

# 19. Editor behavior

The widget must behave sensibly in both:

* VIS-2 editor
* VIS-2 runtime

Do not trigger distracting game celebrations merely because properties are being edited.

If repository conventions allow detecting edit mode reliably, suppress transient scoring effects in the editor.

Static score preview should still render.

Do not invent an edit-mode API; inspect existing code.

---

# 20. Internationalization

Follow the repository's actual i18n convention.

Add translation keys required by the widget to all existing language JSON files.

At minimum translate sensibly:

* Energy Saver
* Today
* All Time
* Record
* New Record
* Energy
* Combo
* Score IDs/configuration labels
* animation settings
* appearance settings
* light-name setting if required

The repository currently carries 11 language files. Update all of them according to repository convention.

Use correct translations where confident.

For uncertain wording, use a clear neutral translation rather than omitting keys.

Do not modify unrelated translations.

---

# 21. Preview/dev environment

The repository has a widget preview/development mechanism.

Inspect it and, if practical without invasive changes, add an EnergyGame preview/demo with mocked values for:

* normal idle state
* +1 point
* +5 combo
* NEW_RECORD
* highScoreToday=true

It should make visual tuning possible without requiring production ioBroker scoring events.

Do not build a completely separate preview application if the existing infrastructure already supports this.

Keep preview-only code out of production runtime where practical.

---

# 22. Testing

Add useful tests using the repository's existing testing infrastructure where practical.

At minimum test pure/helper logic for:

* parsing score values
* malformed values
* parsing lightNames
* summarizing light names
* delta=1 versus delta>1 presentation
* unknown event.kind
* NEW_RECORD priority
* baseline event sequence does not generate animation
* changed sequence does generate animation
* same sequence does not replay animation
* reduced-motion behavior where realistically testable
* cleanup logic where realistically testable

Do not introduce a huge new testing framework only for this widget.

If repository infrastructure makes React animation testing impractical, test the deterministic helpers and provide a focused manual acceptance checklist for lifecycle behavior.

---

# 23. Repository quality requirements

Before modifying files:

1. inspect repository status if available
2. identify existing conventions
3. run or identify baseline lint/build/test commands

After implementation run:

* TypeScript/build
* lint
* relevant tests

Use the commands defined by the repository itself.

The repository documentation indicates commands such as:

`npm run build`
`npm run lint`
`npm run test`

but verify the current package files before relying on them.

Do not fix unrelated baseline failures unless they prevent validating the new widget.

Clearly distinguish:

* pre-existing failure
* failure caused by this patch

---

# 24. Patch discipline

This task must produce a clean patch.

Do not:

* update unrelated dependencies
* rewrite package-lock unnecessarily
* reformat unrelated source files
* rename existing widgets
* modify Generic globally unless absolutely necessary
* redesign the widget library
* add backend game logic
* add network dependencies
* add telemetry
* add external assets

Prefer adding:

* `EnergyGame.tsx`
* a small dedicated CSS/module file if appropriate
* small helpers/tests if justified
* i18n entries
* Module Federation expose
* preview integration if appropriate

Keep the diff reviewable.

---

# 25. Visual details to aim for

Use your frontend design judgment rather than mechanically implementing every example.

Desired feeling:

`premium smart-home + arcade reward`

Idle state should be calm.

A point event should briefly make the card feel alive.

Possible normal event:

```
         ⚡ +1
         ENERGY

      Kitchen Ceiling
```

with:

* brief central energy pulse
* tiny sparks
* score number emphasis

Possible combo:

```
         ⚡ +10

      ENERGY COMBO

      10 LIGHTS SAVED
```

Possible record:

```
     ✦                ✦

         NEW RECORD

            🏆
            31

          +5 ENERGY

     ✦                ✦
```

Persistent record state:

A subtle golden/energy shimmer around only the record portion of the card.

Do not literally copy these layouts if a better implementation fits the component.

---

# 26. Visual state transitions

Static daily score updates must remain smooth if numbers change digit count:

9 -> 10
99 -> 100
999 -> 1000

Avoid major layout shifts.

Format large scores sensibly using the VIS/current locale if practical.

Example:

2847

may render according to locale as:

`2,847`
or
`2.847`

depending on locale.

Follow the existing localization/environment approach rather than forcing English formatting.

---

# 27. Card modes

If consistent with existing widgets, support:

### Normal card

Material-style contained surface.

### Transparent/no-card mode

Useful when the widget is placed on a custom VIS background.

Only implement this if it maps naturally to conventions already used in this repository.

Do not invent an elaborate new card framework.

---

# 28. Suggested internal component structure

Use your judgment after inspecting the repository.

A clean implementation could conceptually separate:

* main EnergyGame VIS widget class
* score board presentation
* transient event overlay
* record badge
* lightweight sparkle component/helper
* event metadata parsing helpers

But do not create excessive abstraction for a single widget.

Favor maintainable, readable code.

---

# 29. Important architecture boundary

Remember:

Backend:

light OFF
↓
backend validates
↓
score changes
↓
event.sequence changes

Frontend:

observe score states
observe event.sequence
↓
render values
↓
animate only valid new event sequence

The frontend must never say:

"score changed, therefore I assume a scoring event happened"

The visual trigger is:

`event.sequence`

The score values and `highScoreToday` control static presentation.

---

# 30. Acceptance scenarios

The implementation must satisfy these manual scenarios.

### A. Initial load

Backend:

daily=18
overall=2847
highScore=27
sequence=100

Open VIS.

Expected:

* scores display
* no +1 animation
* no combo animation
* no new-record animation

### B. Normal point

sequence:
100 -> 101

delta:
1

kind:
POINT

Expected:

* daily score displays backend value
* +1 animation exactly once
* optional light name appears
* animation disappears cleanly

### C. Combo

sequence:
101 -> 102

delta:
10

kind:
COMBO

lightCount:
10

Expected:

* +10 combo animation
* no ten overlapping +1 animations

### D. New record

sequence:
102 -> 103

delta:
3

kind:
NEW_RECORD

highScoreToday:
true

Expected:

* one large NEW RECORD celebration
* +3 reflected within that celebration
* afterwards subtle persistent high-score sparkle remains

### E. Later point after record

sequence:
103 -> 104

delta:
1

kind:
POINT

highScoreToday:
true

Expected:

* normal +1 animation
* persistent record sparkle remains
* large NEW RECORD celebration does not replay

### F. Page refresh

Backend remains:

sequence=104

Refresh browser.

Expected:

* scores display
* persistent record sparkle displays because highScoreToday=true
* no +1 animation
* no NEW_RECORD replay

### G. Missing event data

sequence changes but lightNames is malformed.

Expected:

* widget does not crash
* safe event animation still works without names if enough metadata exists

### H. Reduced motion

OS/browser reduced-motion enabled.

Expected:

* static values and NEW RECORD indication remain clear
* major movement/particle effects disabled

---

# 31. Deliverable format

I want an implementation patch against the CURRENT `main` branch of:

https://github.com/Str-n/ioBroker.vis-2-widgets-nils

Do not give me only snippets.

If your environment can modify/clone repositories:

* inspect current main
* create the implementation in a feature branch/worktree
* run validation
* present the resulting diff

If your environment cannot modify the repository directly:

* inspect current main from GitHub
* generate a complete unified Git patch that can be saved as, for example:

`energy-game-widget.patch`

and applied with:

`git apply energy-game-widget.patch`

The patch must include every required text-file change.

Avoid binary files in the patch unless absolutely necessary.

If a widget preview thumbnail is normally binary, either:

* omit it if the widget architecture permits this, or
* use a text-based SVG asset if repository conventions allow it

Do not put an unusable binary diff into the answer.

---

# 32. Required final response

At completion provide:

## Summary

What was implemented.

## Design

Short description of the resulting widget and animations.

## Files changed

Every added/modified file.

## State bindings

List of widget editor fields and their backend purpose.

## Event lifecycle

Explain precisely:

* how initial sequence baseline works
* how a genuine new event is detected
* how stale event replay is prevented
* how event metadata consistency is handled
* how timers/animations are cleaned up

## Validation

Report exact commands run and results.

## Manual tests

List any behavior that still requires testing inside real VIS-2.

## Patch

Provide the complete patch or ensure all repository modifications are present in the coding workspace.

## Self-review

Before finishing, inspect your own diff for:

* TypeScript errors
* broken widget registration
* missing i18n keys
* incorrect VIS binding behavior
* initial-load fake animation
* reconnect fake animation
* stale event metadata
* event replay
* timer leaks
* React updates after unmount
* excessive persistent animation cost
* editor-mode animation problems
* layout problems around small widget sizes
* missing values causing crashes
* accidental backend writes
* unnecessary dependency changes
* unrelated formatting changes

Fix problems discovered during self-review before presenting the final patch.

Do not stop after describing what should be implemented.

Implement it.z


claude-fable-5.1-high
Read this first – honest scoping of what I could and could not do

In this session I have no repository access (no clone, no GitHub browsing, no shell). I therefore could not inspect CLAUDE.md, the fork's Generic.tsx, vite.config.ts, the demo app, the test runner, or the 11 i18n files, and I could not run npm run build / lint / test. Anything below that claims otherwise would be fabricated, so I don't claim it.

What I did instead:

Built the widget against the architecture this fork is derived from (ioBroker.vis-2-widgets-material: Generic<RxData, State> over window.visRxWidget, getWidgetInfo() with visAttrs groups, this.state.rxData / this.state.values / getPropertyValue(), wrapContent() for card/no-card + title, renderWidgetBody(), Vite + Module Federation exposes, src-widgets/src/i18n/<lang>.json with a vis_2_widgets_<set>_ key prefix, WidgetDemoApp dev preview).
Every place where the fork may differ is marked VERIFY with the exact thing to check and the one-line change to make.
All new files are complete and apply cleanly with git apply. The four touch points in existing files (vite.config.ts, 11 i18n JSONs, dev index.tsx, optional README) cannot be expressed as reliable hunks without the real file contents; for those I give exact insertions plus a tiny merge one-liner for the JSONs that only adds keys and preserves each file's indentation.
Validation section reports what was not run and what you must run.
Summary
A new VIS-2 widget EnergyGame (tplNils2EnergyGame) was implemented as five new source files plus i18n keys and a federation expose:

File	Role
src-widgets/src/EnergyGame.tsx	VIS widget class: config, subscriptions (via Generic's type:'id' attrs), event-sequence detection, snapshot deferral, event priority/queue, timers, reconnect/visibility re-baselining, edit-mode suppression, size observation, card wrapping. Zero backend writes.
src-widgets/src/EnergyGameView.tsx	Pure presentational React component (score board, record section, transient overlay, sparks, persistent sparkle), injected CSS (transform/opacity only). No VIS dependency → previewable and reusable.
src-widgets/src/EnergyGameUtils.ts	Pure helpers: value parsing, light-name parsing/summarising, kind classification, EventSequenceTracker, resolveEventTransition (priority/bounded queue), deterministic spark layout, number formatting, reduced-motion query.
src-widgets/src/EnergyGameUtils.test.ts	Deterministic tests for everything above (vitest/jest syntax – VERIFY runner).
src-widgets/src/dev/EnergyGamePreview.tsx	Dev-only preview with scenario buttons (idle, +1, +5 combo, NEW_RECORD, highScoreToday, reduced motion, dark/light, three sizes). Not exposed via federation.
src-widgets/public/img/prev_energy_game.svg	Text-based preview thumbnail (VERIFY path).
i18n: 38 keys × 11 languages	Editor labels + runtime texts.
src-widgets/vite.config.ts	'./EnergyGame': './src/EnergyGame' expose.
Design
Idle: calm Material surface (Generic card or transparent). Centre: small accent bolt, dominant daily score (tabular numerals, soft accent glow), TODAY label. Bottom row: ALL TIME (left) and RECORD with trophy (right). Accent defaults to cyan (dark) / deep blue (light); record colour gold; both tuned per MUI palette mode. User may override accent.

POINT (≈1.4 s): +1 rises/settles (0.8→1.12→1 scale, opacity), ENERGY SAVED, optional light name; one expanding ring around the score; 6 sparks; daily number pops once.

COMBO (≈2.4 s): bigger +10, ENERGY COMBO, 10 lights saved / Kitchen • Hall • Dining +7; two rings; 12 sparks; stronger glow.

NEW_RECORD (≈3.6 s): dimming scrim, animated NEW RECORD badge, gold trophy with shine sweep, the authoritative daily value, +5 ENERGY if delta > 1 (combo absorbed into the record celebration, never two overlapping majors), 4 corner stars, 16 sparks. Played once per sequence.

Persistent record (highScoreToday): only the record cell: gold breathing glow (opacity animation on a static box-shadow layer, 4 s), four tiny 4-point stars twinkling with 7–9 s periods, small static NEW RECORD chip. ~5 cheap animated nodes, no blur animation, no JS timers.

Reduced motion: no sparks/rings/stars/scaling; overlay simply fades in/out; record indication via static chip + static glow.

Files changed
text

A  src-widgets/src/EnergyGame.tsx
A  src-widgets/src/EnergyGameView.tsx
A  src-widgets/src/EnergyGameUtils.ts
A  src-widgets/src/EnergyGameUtils.test.ts
A  src-widgets/src/dev/EnergyGamePreview.tsx
A  src-widgets/public/img/prev_energy_game.svg            (VERIFY location)
M  src-widgets/vite.config.ts                             (1 line)
M  src-widgets/src/i18n/{en,de,ru,pt,nl,fr,it,es,pl,uk,zh-cn}.json   (38 keys each)
M  src-widgets/src/index.tsx                              (dev demo, 2 lines, optional)
State bindings
Editor field (rxData)	Group	Default	Backend purpose
widgetTitle, noCard	common	Energy Saver, false	Card header / transparent mode (Generic)
oid_daily	Score states	0_userdata.0.energyGame.score.daily	Dominant daily score
oid_overall	Score states	…score.overall	Lifetime score
oid_high_score	Score states	…score.highScore	Best daily score
oid_high_score_today	Score states	…day.highScoreToday	Persistent record styling
oid_record_broken_at	Score states	…day.recordBrokenAt	Optional, tooltip only
oid_seq	Event states	…event.sequence	The only animation trigger
oid_delta	Event states	…event.delta	Points shown in the event
oid_kind	Event states	…event.kind	POINT / COMBO / NEW_RECORD
oid_light_count	Event states	…event.lightCount	Combo count
oid_light_names	Event states	…event.lightNames	Optional names (JSON array / CSV / array)
oid_event_timestamp	Event states	…event.timestamp	Optional, diagnostics only
oid_event_json	Event states	…event.json	Optional atomic snapshot; used when its sequence matches
label_daily/overall/record/unit	Labels	empty → translated	Overrides
animations, show_light_names, record_sparkles, compact	Behavior	true, true, true, false	
accent_color	Appearance	empty → theme-derived	
Defaults for OIDs are plain strings on type:'id' fields (standard in vis-2 attr definitions; if your editor complains, blank them – code handles empty OIDs).

Event lifecycle
Baseline: EventSequenceTracker starts with baseline = null. The first numeric value ever observed for oid_seq (initial population after mount, whenever it arrives) becomes the baseline with animate=false. Mounting with sequence=127 therefore renders scores and nothing else.
Genuine new event: on every componentDidUpdate, the current oid_seq value is fed to the tracker. seq > baseline → animate=true, baseline = seq. seq === baseline → nothing. seq < baseline (backup restore/reset) → silent re-baseline.
Replay prevention: (1) baseline logic above; (2) socket.registerConnectionHandler → on reconnect the tracker is told requestRebaseline(), so the next observed value is adopted silently even if it jumped (events during the outage are deliberately not replayed); (3) document.visibilitychange hidden→visible does the same (tablet wake); (4) changing the oid_seq OID in the editor resets the tracker; (5) props.editMode suppresses all transient overlays; (6) animations=false suppresses them.
Metadata consistency: the backend writes delta/kind/lightCount/lightNames/json before sequence, and ioBroker delivers state changes in order, so metadata is normally already present. To be safe against React/VIS batching order, the snapshot is deferred by 80 ms (single timer, reset on newer sequence) and reads the values at that moment; if oid_event_json is configured and its sequence equals the observed one, that JSON is used as the authoritative snapshot. No large delays.
Priority / rapid events: resolveEventTransition(active, incoming): incoming with priority ≥ active replaces it (restarting the animation, key={sequence}); incoming with lower priority (e.g. POINT while NEW_RECORD or COMBO is playing) goes into a single pending slot (latest/highest wins) and is shown when the active one finishes. Bounded: one active + one pending; one active timer.
Cleanup: componentWillUnmount clears snapshot/active timers, disconnects ResizeObserver, removes matchMedia/visibility/connection listeners and sets unmounted=true; every deferred callback checks it before setState.
Validation
Not executed (no environment). Required before merging – run in src-widgets/ (or as the fork's root scripts define):

Bash

npm run build     # expected: EnergyGame chunk emitted, customWidgets.js exposes ./EnergyGame
npm run lint      # expected: clean; new files follow prettier/eslint defaults (4 spaces, single quotes)
npm run test      # expected: EnergyGameUtils.test.ts – 40 assertions pass
Known VERIFY points that may need a one-line adaptation (all marked in code): Generic import path/generics, i18n prefix vis_2_widgets_nils_, visSet id, visPrev path, RxWidgetInfo/RxRenderWidgetProps type names, test runner import, WidgetDemoApp demo file.

Manual tests (real VIS-2)
Scenarios A–H from the brief map 1:1 to the checklist at the end of this answer (section "Manual acceptance checklist").

Patch
Save as energy-game-widget.patch, then git apply --3way energy-game-widget.patch for the new files, and apply the four "existing file" edits described after the patch.

Diff

diff --git a/src-widgets/src/EnergyGameUtils.ts b/src-widgets/src/EnergyGameUtils.ts
new file mode 100644
--- /dev/null
+++ b/src-widgets/src/EnergyGameUtils.ts
@@ -0,0 +1,289 @@
+/**
+ * Pure helpers for the EnergyGame widget.
+ * No React, no VIS, no DOM (except the explicitly guarded prefersReducedMotion()).
+ */
+
+export type EventKind = 'POINT' | 'COMBO' | 'NEW_RECORD';
+
+export interface VisualEvent {
+    sequence: number;
+    kind: EventKind;
+    /** points represented by this visual event; null if backend value unusable */
+    delta: number | null;
+    lightCount: number | null;
+    lightNames: string[];
+    /** Date.now() when the widget accepted the event */
+    receivedAt: number;
+}
+
+export const EVENT_DURATION_MS: Record<EventKind, number> = {
+    POINT: 1400,
+    COMBO: 2400,
+    NEW_RECORD: 3600,
+};
+
+export const EVENT_PRIORITY: Record<EventKind, number> = {
+    POINT: 1,
+    COMBO: 2,
+    NEW_RECORD: 3,
+};
+
+export const SPARK_COUNT: Record<EventKind, number> = {
+    POINT: 6,
+    COMBO: 12,
+    NEW_RECORD: 16,
+};
+
+/** Delay before event metadata is snapshotted after a sequence change. */
+export const SNAPSHOT_DELAY_MS = 80;
+
+const MAX_LIGHT_NAMES = 50;
+const MAX_NAME_LENGTH = 24;
+
+// ---------------------------------------------------------------------------
+// Value parsing
+// ---------------------------------------------------------------------------
+
+export function parseNumber(value: unknown): number | null {
+    if (value === null || value === undefined || typeof value === 'boolean') {
+        return null;
+    }
+    if (typeof value === 'number') {
+        return Number.isFinite(value) ? value : null;
+    }
+    if (typeof value === 'string') {
+        const s = value.trim();
+        if (!s) {
+            return null;
+        }
+        const n = Number(s.replace(',', '.'));
+        return Number.isFinite(n) ? n : null;
+    }
+    return null;
+}
+
+/** Scores are integers; anything unusable becomes null (rendered as "—"). */
+export function parseScore(value: unknown): number | null {
+    const n = parseNumber(value);
+    return n === null ? null : Math.round(n);
+}
+
+/** Sequence must be a non-negative integer-like number. */
+export function parseSequence(value: unknown): number | null {
+    const n = parseNumber(value);
+    if (n === null || n < 0) {
+        return null;
+    }
+    return Math.floor(n);
+}
+
+/** Delta/lightCount: positive integer or null. */
+export function parsePositiveInt(value: unknown): number | null {
+    const n = parseNumber(value);
+    if (n === null) {
+        return null;
+    }
+    const i = Math.round(n);
+    return i >= 1 ? i : null;
+}
+
+export function parseBoolean(value: unknown): boolean {
+    if (value === true || value === 1) {
+        return true;
+    }
+    if (typeof value === 'string') {
+        const s = value.trim().toLowerCase();
+        return s === 'true' || s === '1' || s === 'on' || s === 'yes';
+    }
+    return false;
+}
+
+function cleanName(name: unknown): string {
+    if (name === null || name === undefined) {
+        return '';
+    }
+    const s = String(name).trim();
+    if (!s) {
+        return '';
+    }
+    return s.length > MAX_NAME_LENGTH ? `${s.slice(0, MAX_NAME_LENGTH - 1)}…` : s;
+}
+
+/**
+ * Accepts: array, JSON array string, delimited string ("a, b" / "a;b" / "a • b"),
+ * single name, object with lightNames array. Never throws.
+ */
+export function parseLightNames(value: unknown): string[] {
+    try {
+        if (value === null || value === undefined) {
+            return [];
+        }
+        if (Array.isArray(value)) {
+            return value.map(cleanName).filter(Boolean).slice(0, MAX_LIGHT_NAMES);
+        }
+        if (typeof value === 'object') {
+            const obj = value as { lightNames?: unknown };
+            return Array.isArray(obj.lightNames) ? parseLightNames(obj.lightNames) : [];
+        }
+        if (typeof value === 'string') {
+            const s = value.trim();
+            if (!s || s === '[]' || s === 'null') {
+                return [];
+            }
+            if (s.startsWith('[') || s.startsWith('{')) {
+                try {
+                    const parsed: unknown = JSON.parse(s);
+                    if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) {
+                        return parseLightNames(parsed);
+                    }
+                } catch {
+                    // malformed JSON -> fall through to delimiter handling
+                }
+            }
+            return s
+                .replace(/^[[{]|[\]}]$/g, '')
+                .split(/[,;•|]/)
+                .map(part => cleanName(part.replace(/^["']|["']$/g, '')))
+                .filter(Boolean)
+                .slice(0, MAX_LIGHT_NAMES);
+        }
+        return [];
+    } catch {
+        return [];
+    }
+}
+
+/**
+ * 1: "Kitchen" | 2-3: "Kitchen • Hall • Dining" | many: "Kitchen • Hall • Dining +7"
+ */
+export function summarizeLightNames(names: string[], maxShown = 3, separator = ' • '): string {
+    if (!names || !names.length) {
+        return '';
+    }
+    if (names.length <= maxShown) {
+        return names.join(separator);
+    }
+    return `${names.slice(0, maxShown).join(separator)} +${names.length - maxShown}`;
+}
+
+/** Unknown/missing kinds fall back to a presentation derived from delta. */
+export function classifyEventKind(rawKind: unknown, delta: number | null): EventKind {
+    if (typeof rawKind === 'string') {
+        const k = rawKind.trim().toUpperCase();
+        if (k === 'POINT' || k === 'COMBO' || k === 'NEW_RECORD') {
+            return k;
+        }
+    }
+    return delta !== null && delta > 1 ? 'COMBO' : 'POINT';
+}
+
+export interface EventJsonSnapshot {
+    sequence: number;
+    delta: number | null;
+    kind: unknown;
+    lightCount: number | null;
+    lightNames: string[];
+}
+
+/** Parses the optional atomic event.json state; null if unusable. */
+export function parseEventJson(value: unknown): EventJsonSnapshot | null {
+    try {
+        const obj: unknown = typeof value === 'string' ? JSON.parse(value) : value;
+        if (!obj || typeof obj !== 'object') {
+            return null;
+        }
+        const o = obj as Record<string, unknown>;
+        const sequence = parseSequence(o.sequence);
+        if (sequence === null) {
+            return null;
+        }
+        return {
+            sequence,
+            delta: parsePositiveInt(o.delta),
+            kind: o.kind,
+            lightCount: parsePositiveInt(o.lightCount),
+            lightNames: parseLightNames(o.lightNames),
+        };
+    } catch {
+        return null;
+    }
+}
+
+export function formatScore(value: number | null, lang?: string): string {
+    if (value === null) {
+        return '—';
+    }
+    try {
+        return new Intl.NumberFormat(lang || undefined).format(value);
+    } catch {
+        return String(value);
+    }
+}
+
+// ---------------------------------------------------------------------------
+// Event sequence tracking
+// ---------------------------------------------------------------------------
+
+export type SequenceReason = 'NO_VALUE' | 'BASELINE' | 'REBASELINE' | 'UNCHANGED' | 'REGRESSION' | 'NEW_EVENT';
+
+export interface SequenceDecision {
+    animate: boolean;
+    sequence: number | null;
+    reason: SequenceReason;
+}
+
+/**
+ * Decides whether an observed event.sequence value represents a genuine new
+ * event. The first observed value is always a silent baseline.
+ */
+export class EventSequenceTracker {
+    private baseline: number | null = null;
+
+    private rebaselinePending = false;
+
+    getBaseline(): number | null {
+        return this.baseline;
+    }
+
+    /** Next observed value is adopted silently (reconnect, wake-up). */
+    requestRebaseline(): void {
+        this.rebaselinePending = true;
+    }
+
+    /** Forget everything (e.g. OID changed in the editor). */
+    reset(): void {
+        this.baseline = null;
+        this.rebaselinePending = false;
+    }
+
+    observe(sequence: number | null): SequenceDecision {
+        if (sequence === null) {
+            return { animate: false, sequence: null, reason: 'NO_VALUE' };
+        }
+        if (this.baseline === null) {
+            this.baseline = sequence;
+            this.rebaselinePending = false;
+            return { animate: false, sequence, reason: 'BASELINE' };
+        }
+        if (this.rebaselinePending) {
+            this.baseline = sequence;
+            this.rebaselinePending = false;
+            return { animate: false, sequence, reason: 'REBASELINE' };
+        }
+        if (sequence === this.baseline) {
+            return { animate: false, sequence, reason: 'UNCHANGED' };
+        }
+        if (sequence < this.baseline) {
+            this.baseline = sequence;
+            return { animate: false, sequence, reason: 'REGRESSION' };
+        }
+        this.baseline = sequence;
+        return { animate: true, sequence, reason: 'NEW_EVENT' };
+    }
+}
+
+// ---------------------------------------------------------------------------
+// Event transition (priority + bounded queue of exactly one pending slot)
+// ---------------------------------------------------------------------------
+
+export interface EventTransition {
+    active: VisualEvent;
+    pending: VisualEvent | null;
+    /** true if the active event was replaced/started (animation must restart) */
+    restarted: boolean;
+}
+
+export function resolveEventTransition(
+    active: VisualEvent | null,
+    pending: VisualEvent | null,
+    incoming: VisualEvent,
+): EventTransition {
+    if (!active) {
+        return { active: incoming, pending: null, restarted: true };
+    }
+    if (EVENT_PRIORITY[incoming.kind] >= EVENT_PRIORITY[active.kind]) {
+        // equal or higher priority replaces immediately; anything queued is dropped
+        return { active: incoming, pending: null, restarted: true };
+    }
+    // lower priority than the running celebration: keep it, park incoming
+    let nextPending = incoming;
+    if (pending && EVENT_PRIORITY[pending.kind] > EVENT_PRIORITY[incoming.kind]) {
+        nextPending = pending;
+    }
+    return { active, pending: nextPending, restarted: false };
+}
+
+// ---------------------------------------------------------------------------
+// Deterministic spark layout (transform-only particles)
+// ---------------------------------------------------------------------------
+
+export interface Spark {
+    dx: number;
+    dy: number;
+    delayMs: number;
+    size: number;
+    durationMs: number;
+}
+
+function mulberry32(seed: number): () => number {
+    let a = seed >>> 0;
+    return () => {
+        a = (a + 0x6d2b79f5) >>> 0;
+        let t = a;
+        t = Math.imul(t ^ (t >>> 15), t | 1);
+        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
+        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
+    };
+}
+
+export function makeSparks(count: number, seed: number, radius: number): Spark[] {
+    const n = Math.max(0, Math.min(24, Math.floor(count)));
+    const rnd = mulberry32(seed || 1);
+    const sparks: Spark[] = [];
+    for (let i = 0; i < n; i++) {
+        const angle = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
+        const dist = radius * (0.55 + rnd() * 0.45);
+        sparks.push({
+            dx: Math.round(Math.cos(angle) * dist),
+            dy: Math.round(Math.sin(angle) * dist),
+            delayMs: Math.round(rnd() * 180),
+            size: 3 + Math.round(rnd() * 3),
+            durationMs: 700 + Math.round(rnd() * 400),
+        });
+    }
+    return sparks;
+}
+
+export function prefersReducedMotion(): boolean {
+    try {
+        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
+            return false;
+        }
+        return !!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
+    } catch {
+        return false;
+    }
+}
diff --git a/src-widgets/src/EnergyGameView.tsx b/src-widgets/src/EnergyGameView.tsx
new file mode 100644
--- /dev/null
+++ b/src-widgets/src/EnergyGameView.tsx
@@ -0,0 +1,457 @@
+import React from 'react';
+
+import {
+    EVENT_DURATION_MS,
+    SPARK_COUNT,
+    formatScore,
+    makeSparks,
+    summarizeLightNames,
+    type VisualEvent,
+} from './EnergyGameUtils';
+
+export interface EnergyGamePalette {
+    mode: 'light' | 'dark';
+    text: string;
+    textSecondary: string;
+    accent: string;
+    gold: string;
+}
+
+export interface EnergyGameLabels {
+    title: string;
+    daily: string;
+    overall: string;
+    record: string;
+    unit: string;
+}
+
+export interface EnergyGameViewProps {
+    daily: number | null;
+    overall: number | null;
+    highScore: number | null;
+    highScoreToday: boolean;
+    recordBrokenAt: number | null;
+    activeEvent: VisualEvent | null;
+    labels: EnergyGameLabels;
+    showTitle: boolean;
+    animationsEnabled: boolean;
+    reducedMotion: boolean;
+    showLightNames: boolean;
+    recordSparkles: boolean;
+    compact: boolean;
+    palette: EnergyGamePalette;
+    lang: string;
+    width: number;
+    height: number;
+    t: (key: string, ...args: (string | number)[]) => string;
+}
+
+const STYLE_ID = 'nils-energy-game-styles';
+
+const CSS = `
+.nils-eg{position:relative;width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;user-select:none;-webkit-user-select:none}
+.nils-eg *{box-sizing:border-box}
+.nils-eg-num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum";line-height:1;letter-spacing:-.02em;white-space:nowrap}
+.nils-eg-label{text-transform:uppercase;letter-spacing:.18em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
+.nils-eg-overlay{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
+.nils-eg-abs{position:absolute;left:50%;top:50%;pointer-events:none}
+.nils-eg-clip{position:relative;overflow:hidden}
+@keyframes nils-eg-rise{0%{opacity:0;transform:translate3d(0,16px,0) scale(.8)}18%{opacity:1;transform:translate3d(0,-2px,0) scale(1.12)}32%{transform:translate3d(0,-4px,0) scale(1)}72%{opacity:1;transform:translate3d(0,-10px,0) scale(1)}100%{opacity:0;transform:translate3d(0,-24px,0) scale(.96)}}
+@keyframes nils-eg-fade{0%{opacity:0}14%{opacity:1}80%{opacity:1}100%{opacity:0}}
+@keyframes nils-eg-scrim{0%{opacity:0}10%{opacity:1}85%{opacity:1}100%{opacity:0}}
+@keyframes nils-eg-ring{0%{opacity:.8;transform:translate(-50%,-50%) scale(.5)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.8)}}
+@keyframes nils-eg-spark{0%{opacity:0;transform:translate3d(0,0,0) scale(.3)}15%{opacity:1}100%{opacity:0;transform:translate3d(var(--dx),var(--dy),0) scale(1)}}
+@keyframes nils-eg-pop{0%{transform:scale(1)}30%{transform:scale(1.14)}100%{transform:scale(1)}}
+@keyframes nils-eg-badge{0%{opacity:0;transform:translate3d(0,-12px,0) scale(.7)}16%{opacity:1;transform:translate3d(0,0,0) scale(1.08)}28%{transform:scale(1)}86%{opacity:1}100%{opacity:0}}
+@keyframes nils-eg-shine{0%{transform:translate3d(-180%,0,0) skewX(-20deg)}100%{transform:translate3d(280%,0,0) skewX(-20deg)}}
+@keyframes nils-eg-star{0%{opacity:0;transform:scale(.3) rotate(0deg)}18%{opacity:1;transform:scale(1.15) rotate(20deg)}40%{transform:scale(1) rotate(30deg)}80%{opacity:1}100%{opacity:0;transform:scale(.5) rotate(60deg)}}
+@keyframes nils-eg-breathe{0%,100%{opacity:.3}50%{opacity:.8}}
+@keyframes nils-eg-twinkle{0%,100%{opacity:0;transform:scale(.4) rotate(0deg)}50%{opacity:.9;transform:scale(1) rotate(45deg)}}
+.nils-eg-a-rise{animation:nils-eg-rise var(--dur) cubic-bezier(.2,.8,.2,1) both}
+.nils-eg-a-fade{animation:nils-eg-fade var(--dur) ease-in-out both}
+.nils-eg-a-scrim{animation:nils-eg-scrim var(--dur) ease-in-out both}
+.nils-eg-a-ring{animation:nils-eg-ring .9s ease-out both}
+.nils-eg-a-spark{animation:nils-eg-spark var(--sdur) ease-out both}
+.nils-eg-a-pop{animation:nils-eg-pop .6s ease-out both}
+.nils-eg-a-badge{animation:nils-eg-badge var(--dur) cubic-bezier(.2,.8,.2,1) both}
+.nils-eg-a-shine{animation:nils-eg-shine 1.4s ease-in-out .3s both}
+.nils-eg-a-star{animation:nils-eg-star var(--dur) ease-out both}
+.nils-eg-p-breathe{animation:nils-eg-breathe 4s ease-in-out infinite}
+.nils-eg-p-twinkle{animation:nils-eg-twinkle var(--tdur) ease-in-out var(--tdelay) infinite}
+@media (prefers-reduced-motion: reduce){.nils-eg-motion{animation:none!important;opacity:0!important}.nils-eg-p-breathe,.nils-eg-p-twinkle{animation:none!important}}
+`;
+
+export function ensureEnergyGameStyles(): void {
+    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
+        return;
+    }
+    const style = document.createElement('style');
+    style.id = STYLE_ID;
+    style.textContent = CSS;
+    document.head.appendChild(style);
+}
+
+function clamp(v: number, min: number, max: number): number {
+    return Math.max(min, Math.min(max, v));
+}
+
+// --- inline, dependency-free icons (decorative, aria-hidden) ---------------
+const BoltIcon = ({ size, color }: { size: number; color: string }): React.JSX.Element => (
+    <svg
+        width={size}
+        height={size}
+        viewBox="0 0 24 24"
+        aria-hidden="true"
+        focusable="false"
+        style={{ display: 'block' }}
+    >
+        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" fill={color} />
+    </svg>
+);
+
+const TrophyIcon = ({ size, color }: { size: number; color: string }): React.JSX.Element => (
+    <svg
+        width={size}
+        height={size}
+        viewBox="0 0 24 24"
+        aria-hidden="true"
+        focusable="false"
+        style={{ display: 'block' }}
+    >
+        <path
+            d="M7 3h10v2h3v3a5 5 0 0 1-4.2 4.94A5 5 0 0 1 13 15.9V18h3v2H8v-2h3v-2.1a5 5 0 0 1-2.8-2.96A5 5 0 0 1 4 8V5h3V3zM6 7v1a3 3 0 0 0 1.6 2.65A7 7 0 0 1 7 8.5V7H6zm12 0h-1v1.5c0 .77-.2 1.5-.6 2.15A3 3 0 0 0 18 8V7z"
+            fill={color}
+        />
+    </svg>
+);
+
+const StarIcon = ({ size, color }: { size: number; color: string }): React.JSX.Element => (
+    <svg
+        width={size}
+        height={size}
+        viewBox="0 0 24 24"
+        aria-hidden="true"
+        focusable="false"
+        style={{ display: 'block' }}
+    >
+        <path d="M12 0l2.5 9.5L24 12l-9.5 2.5L12 24l-2.5-9.5L0 12l9.5-2.5z" fill={color} />
+    </svg>
+);
+
+// --- persistent record sparkle (cheap, CSS only) ---------------------------
+const TWINKLES = [
+    { left: '4%', top: '8%', size: 8, dur: '7s', delay: '0s' },
+    { left: '88%', top: '4%', size: 6, dur: '9s', delay: '2.5s' },
+    { left: '92%', top: '70%', size: 7, dur: '8s', delay: '5s' },
+    { left: '8%', top: '74%', size: 5, dur: '7.5s', delay: '1.3s' },
+];
+
+function RecordSparkle({ gold, reducedMotion }: { gold: string; reducedMotion: boolean }): React.JSX.Element {
+    return (
+        <>
+            <div
+                className={reducedMotion ? undefined : 'nils-eg-p-breathe'}
+                aria-hidden="true"
+                style={{
+                    position: 'absolute',
+                    left: -2,
+                    top: -2,
+                    right: -2,
+                    bottom: -2,
+                    borderRadius: 12,
+                    boxShadow: `0 0 0 1px ${gold}66, 0 0 14px ${gold}55`,
+                    opacity: reducedMotion ? 0.5 : undefined,
+                    pointerEvents: 'none',
+                }}
+            />
+            {!reducedMotion &&
+                TWINKLES.map((tw, i) => (
+                    <span
+                        key={i}
+                        className="nils-eg-p-twinkle"
+                        aria-hidden="true"
+                        style={
+                            {
+                                position: 'absolute',
+                                left: tw.left,
+                                top: tw.top,
+                                '--tdur': tw.dur,
+                                '--tdelay': tw.delay,
+                                pointerEvents: 'none',
+                            } as React.CSSProperties
+                        }
+                    >
+                        <StarIcon size={tw.size} color={gold} />
+                    </span>
+                ))}
+        </>
+    );
+}
+
+// --- transient event overlay -----------------------------------------------
+interface OverlayProps {
+    ev: VisualEvent;
+    dailyText: string;
+    reducedMotion: boolean;
+    showLightNames: boolean;
+    palette: EnergyGamePalette;
+    base: number;
+    compact: boolean;
+    t: EnergyGameViewProps['t'];
+}
+
+function EventOverlay({ ev, dailyText, reducedMotion, showLightNames, palette, base, compact, t }: OverlayProps): React.JSX.Element {
+    const dur = `${EVENT_DURATION_MS[ev.kind]}ms`;
+    const isRecord = ev.kind === 'NEW_RECORD';
+    const isCombo = ev.kind === 'COMBO';
+    const color = isRecord ? palette.gold : palette.accent;
+    const bigSize = clamp(base * (isRecord ? 0.16 : isCombo ? 0.19 : 0.15), 26, 84);
+    const lineSize = clamp(base * 0.04, 10, 16);
+    const deltaText = ev.delta !== null ? `+${ev.delta}` : '';
+    const names = showLightNames && !compact ? summarizeLightNames(ev.lightNames) : '';
+    const sparks = reducedMotion ? [] : makeSparks(SPARK_COUNT[ev.kind], ev.sequence, base * 0.42);
+    const textAnim = reducedMotion ? 'nils-eg-a-fade' : 'nils-eg-a-rise';
+    const glow = `0 0 ${Math.round(base * 0.05)}px ${color}99`;
+
+    let headline: string;
+    let subline = '';
+    if (isRecord) {
+        headline = t('eg_new_record');
+        subline = deltaText ? `${deltaText} ${t('eg_energy')}` : '';
+    } else if (isCombo) {
+        headline = t('eg_energy_combo');
+        const n = ev.lightCount ?? ev.delta;
+        subline = names || (n ? t('eg_lights_saved', n) : '');
+    } else {
+        headline = t('eg_energy_saved');
+        subline = names;
+    }
+
+    return (
+        <div
+            className="nils-eg-overlay"
+            aria-hidden="true"
+            style={{ '--dur': dur } as React.CSSProperties}
+        >
+            {isRecord && (
+                <div
+                    className="nils-eg-a-scrim"
+                    style={{
+                        position: 'absolute',
+                        left: 0,
+                        top: 0,
+                        right: 0,
+                        bottom: 0,
+                        background: palette.mode === 'dark' ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.72)',
+                    }}
+                />
+            )}
+            {!reducedMotion && (
+                <>
+                    <span
+                        className="nils-eg-abs nils-eg-a-ring nils-eg-motion"
+                        style={{ width: base * 0.5, height: base * 0.5, borderRadius: '50%', border: `2px solid ${color}` }}
+                    />
+                    {(isCombo || isRecord) && (
+                        <span
+                            className="nils-eg-abs nils-eg-a-ring nils-eg-motion"
+                            style={{ width: base * 0.5, height: base * 0.5, borderRadius: '50%', border: `1px solid ${color}`, animationDelay: '.18s' }}
+                        />
+                    )}
+                    {sparks.map((s, i) => (
+                        <span
+                            key={i}
+                            className="nils-eg-abs nils-eg-a-spark nils-eg-motion"
+                            style={
+                                {
+                                    width: s.size,
+                                    height: s.size,
+                                    marginLeft: -s.size / 2,
+                                    marginTop: -s.size / 2,
+                                    borderRadius: '50%',
+                                    background: color,
+                                    boxShadow: `0 0 6px ${color}`,
+                                    '--dx': `${s.dx}px`,
+                                    '--dy': `${s.dy}px`,
+                                    '--sdur': `${s.durationMs}ms`,
+                                    animationDelay: `${s.delayMs}ms`,
+                                } as React.CSSProperties
+                            }
+                        />
+                    ))}
+                    {isRecord &&
+                        [
+                            { left: '10%', top: '12%' },
+                            { left: '86%', top: '10%' },
+                            { left: '12%', top: '82%' },
+                            { left: '84%', top: '80%' },
+                        ].map((p, i) => (
+                            <span
+                                key={i}
+                                className="nils-eg-a-star nils-eg-motion"
+                                style={{ position: 'absolute', left: p.left, top: p.top, animationDelay: `${i * 120}ms` }}
+                            >
+                                <StarIcon size={clamp(base * 0.05, 10, 22)} color={palette.gold} />
+                            </span>
+                        ))}
+                </>
+            )}
+
+            <div className={isRecord ? 'nils-eg-a-badge' : textAnim} style={{ position: 'relative' }}>
+                {isRecord ? (
+                    <>
+                        <div
+                            className="nils-eg-label"
+                            style={{
+                                fontSize: clamp(base * 0.045, 11, 18),
+                                fontWeight: 800,
+                                color: palette.gold,
+                                padding: '4px 14px',
+                                borderRadius: 999,
+                                border: `1px solid ${palette.gold}`,
+                                display: 'inline-block',
+                                marginBottom: 8,
+                            }}
+                        >
+                            {headline}
+                        </div>
+                        <div className="nils-eg-clip" style={{ display: 'inline-block', borderRadius: 12 }}>
+                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
+                                <TrophyIcon size={bigSize * 0.9} color={palette.gold} />
+                                <span className="nils-eg-num" style={{ fontSize: bigSize, fontWeight: 800, color: palette.text, textShadow: glow }}>
+                                    {dailyText}
+                                </span>
+                            </div>
+                            {!reducedMotion && (
+                                <span
+                                    className="nils-eg-a-shine nils-eg-motion"
+                                    style={{
+                                        position: 'absolute',
+                                        top: 0,
+                                        bottom: 0,
+                                        left: 0,
+                                        width: '35%',
+                                        background: `linear-gradient(90deg, transparent, ${palette.gold}55, transparent)`,
+                                    }}
+                                />
+                            )}
+                        </div>
+                        {subline && (
+                            <div className="nils-eg-label" style={{ fontSize: lineSize, fontWeight: 700, color: palette.gold, marginTop: 6 }}>
+                                {subline}
+                            </div>
+                        )}
+                    </>
+                ) : (
+                    <>
+                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
+                            <BoltIcon size={bigSize * 0.55} color={color} />
+                            <span className="nils-eg-num" style={{ fontSize: bigSize, fontWeight: 800, color, textShadow: glow }}>
+                                {deltaText || '⚡'}
+                            </span>
+                        </div>
+                        <div className="nils-eg-label" style={{ fontSize: lineSize, fontWeight: 700, color: palette.text, marginTop: 4 }}>
+                            {headline}
+                        </div>
+                        {subline && (
+                            <div style={{ fontSize: lineSize, color: palette.textSecondary, marginTop: 2, maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
+                                {subline}
+                            </div>
+                        )}
+                    </>
+                )}
+            </div>
+        </div>
+    );
+}
+
+// --- main view ---------------------------------------------------------------
+export default function EnergyGameView(props: EnergyGameViewProps): React.JSX.Element {
+    const { palette, labels, t } = props;
+    const width = Math.max(120, props.width || 400);
+    const height = Math.max(80, props.height || 260);
+    const base = Math.max(150, Math.min(width, height * 1.45));
+    const compact = props.compact || width < 300 || height < 190;
+
+    const dailySize = clamp(base * (compact ? 0.17 : 0.2), 30, 96);
+    const secondarySize = clamp(base * 0.075, 14, 32);
+    const labelSize = clamp(base * 0.03, 9, 13);
+    const padding = compact ? 8 : clamp(base * 0.035, 10, 20);
+
+    const dailyText = formatScore(props.daily, props.lang);
+    const dailyDigits = Math.max(2, dailyText.length);
+    const ev = props.animationsEnabled ? props.activeEvent : null;
+    const showPersistentRecord = props.highScoreToday && props.recordSparkles;
+    const recordTitle = props.recordBrokenAt ? new Date(props.recordBrokenAt).toLocaleTimeString(props.lang || undefined) : undefined;
+
+    return (
+        <div className="nils-eg" style={{ padding, color: palette.text }}>
+            {props.showTitle && !compact && (
+                <div className="nils-eg-label" style={{ fontSize: labelSize, fontWeight: 700, color: palette.textSecondary, textAlign: 'center' }}>
+                    {labels.title}
+                </div>
+            )}
+
+            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
+                {!compact && <BoltIcon size={clamp(base * 0.06, 14, 26)} color={palette.accent} />}
+                <div
+                    key={ev ? ev.sequence : 'idle'}
+                    className={`nils-eg-num${ev && !props.reducedMotion ? ' nils-eg-a-pop' : ''}`}
+                    role="status"
+                    aria-live="polite"
+                    aria-label={`${labels.daily}: ${props.daily === null ? t('eg_score_unavailable') : dailyText}`}
+                    style={{
+                        fontSize: dailySize,
+                        fontWeight: 800,
+                        minWidth: `${dailyDigits * 0.62}em`,
+                        textAlign: 'center',
+                        textShadow: `0 0 ${Math.round(dailySize * 0.25)}px ${palette.accent}66`,
+                        marginTop: compact ? 0 : 4,
+                    }}
+                >
+                    {dailyText}
+                </div>
+                <div className="nils-eg-label" style={{ fontSize: labelSize, fontWeight: 700, color: palette.accent, marginTop: 6 }}>
+                    {labels.daily}
+                </div>
+            </div>
+
+            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
+                <div style={{ minWidth: 0, flex: 1 }}>
+                    <div className="nils-eg-num" style={{ fontSize: secondarySize, fontWeight: 700 }} aria-label={`${labels.overall}: ${formatScore(props.overall, props.lang)}`}>
+                        {formatScore(props.overall, props.lang)}
+                    </div>
+                    <div className="nils-eg-label" style={{ fontSize: labelSize, color: palette.textSecondary, marginTop: 3 }}>
+                        {labels.overall}
+                    </div>
+                </div>
+
+                <div
+                    title={recordTitle}
+                    style={{
+                        position: 'relative',
+                        minWidth: 0,
+                        flex: 1,
+                        display: 'flex',
+                        flexDirection: 'column',
+                        alignItems: 'flex-end',
+                        padding: '6px 10px',
+                        borderRadius: 12,
+                    }}
+                >
+                    {showPersistentRecord && <RecordSparkle gold={palette.gold} reducedMotion={props.reducedMotion} />}
+                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
+                        <TrophyIcon size={secondarySize * 0.95} color={props.highScoreToday ? palette.gold : palette.textSecondary} />
+                        <span className="nils-eg-num" style={{ fontSize: secondarySize, fontWeight: 700, color: props.highScoreToday ? palette.gold : palette.text }} aria-label={`${labels.record}: ${formatScore(props.highScore, props.lang)}`}>
+                            {formatScore(props.highScore, props.lang)}
+                        </span>
+                    </div>
+                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
+                        {props.highScoreToday && (
+                            <span
+                                className="nils-eg-label"
+                                style={{ fontSize: Math.max(8, labelSize - 2), fontWeight: 800, color: palette.gold, border: `1px solid ${palette.gold}88`, borderRadius: 999, padding: '1px 6px' }}
+                            >
+                                {t('eg_new_record')}
+                            </span>
+                        )}
+                        <span className="nils-eg-label" style={{ fontSize: labelSize, color: palette.textSecondary }}>
+                            {labels.record}
+                        </span>
+                    </div>
+                </div>
+            </div>
+
+            {ev && (
+                <EventOverlay
+                    key={ev.sequence}
+                    ev={ev}
+                    dailyText={dailyText}
+                    reducedMotion={props.reducedMotion}
+                    showLightNames={props.showLightNames}
+                    palette={palette}
+                    base={base}
+                    compact={compact}
+                    t={t}
+                />
+            )}
+        </div>
+    );
+}
diff --git a/src-widgets/src/EnergyGame.tsx b/src-widgets/src/EnergyGame.tsx
new file mode 100644
--- /dev/null
+++ b/src-widgets/src/EnergyGame.tsx
@@ -0,0 +1,437 @@
+import React from 'react';
+
+// VERIFY: the fork's Generic import (default vs named) and its generic parameters.
+import Generic from './Generic';
+// VERIFY: type names/paths used by other widgets in this repository.
+import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetState } from '@iobroker/types-vis-2';
+// VERIFY: I18n import used by other widgets (material uses @iobroker/adapter-react-v5).
+import { I18n } from '@iobroker/adapter-react-v5';
+
+import EnergyGameView, { ensureEnergyGameStyles, type EnergyGamePalette } from './EnergyGameView';
+import {
+    EVENT_DURATION_MS,
+    EventSequenceTracker,
+    SNAPSHOT_DELAY_MS,
+    classifyEventKind,
+    parseBoolean,
+    parseEventJson,
+    parseLightNames,
+    parsePositiveInt,
+    parseScore,
+    parseSequence,
+    prefersReducedMotion,
+    resolveEventTransition,
+    type VisualEvent,
+} from './EnergyGameUtils';
+
+interface EnergyGameRxData {
+    noCard: boolean;
+    widgetTitle: string;
+    oid_daily: string;
+    oid_overall: string;
+    oid_high_score: string;
+    oid_high_score_today: string;
+    oid_record_broken_at: string;
+    oid_seq: string;
+    oid_delta: string;
+    oid_kind: string;
+    oid_light_count: string;
+    oid_light_names: string;
+    oid_event_timestamp: string;
+    oid_event_json: string;
+    label_daily: string;
+    label_overall: string;
+    label_record: string;
+    label_unit: string;
+    animations: boolean;
+    show_light_names: boolean;
+    record_sparkles: boolean;
+    compact: boolean;
+    accent_color: string;
+}
+
+interface EnergyGameState extends VisRxWidgetState {
+    activeEvent: VisualEvent | null;
+    pendingEvent: VisualEvent | null;
+    reducedMotion: boolean;
+    size: { width: number; height: number };
+}
+
+const BASE = '0_userdata.0.energyGame';
+
+/** Translation helper; VERIFY that Generic.getI18nPrefix() exists (material: yes). */
+function tr(key: string, ...args: (string | number)[]): string {
+    return I18n.t(`${Generic.getI18nPrefix()}${key}`, ...args);
+}
+
+export default class EnergyGame extends Generic<EnergyGameRxData, EnergyGameState> {
+    private readonly tracker = new EventSequenceTracker();
+
+    private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
+
+    private eventTimer: ReturnType<typeof setTimeout> | null = null;
+
+    private resizeObserver: ResizeObserver | null = null;
+
+    private motionQuery: MediaQueryList | null = null;
+
+    private rootRef = React.createRef<HTMLDivElement>();
+
+    private unmounted = false;
+
+    private wasConnected: boolean | null = null;
+
+    constructor(props: EnergyGame['props']) {
+        super(props);
+        this.state = {
+            ...this.state,
+            activeEvent: null,
+            pendingEvent: null,
+            reducedMotion: prefersReducedMotion(),
+            size: { width: 0, height: 0 },
+        } as EnergyGameState;
+    }
+
+    static getWidgetInfo(): RxWidgetInfo {
+        return {
+            id: 'tplNils2EnergyGame',
+            visSet: 'vis-2-widgets-nils', // VERIFY: set id used by the other widgets of this fork
+            visWidgetLabel: 'energy_game',
+            visName: 'EnergyGame',
+            visAttrs: [
+                {
+                    name: 'common',
+                    fields: [
+                        { name: 'noCard', label: 'without_card', type: 'checkbox' },
+                        { name: 'widgetTitle', label: 'name', hidden: '!!data.noCard', default: 'Energy Saver' },
+                    ],
+                },
+                {
+                    name: 'eg_scores',
+                    label: 'group_eg_scores',
+                    fields: [
+                        { name: 'oid_daily', type: 'id', label: 'eg_oid_daily', default: `${BASE}.score.daily` },
+                        { name: 'oid_overall', type: 'id', label: 'eg_oid_overall', default: `${BASE}.score.overall` },
+                        { name: 'oid_high_score', type: 'id', label: 'eg_oid_high_score', default: `${BASE}.score.highScore` },
+                        { name: 'oid_high_score_today', type: 'id', label: 'eg_oid_high_score_today', default: `${BASE}.day.highScoreToday` },
+                        { name: 'oid_record_broken_at', type: 'id', label: 'eg_oid_record_broken_at', default: `${BASE}.day.recordBrokenAt` },
+                    ],
+                },
+                {
+                    name: 'eg_event',
+                    label: 'group_eg_event',
+                    fields: [
+                        { name: 'oid_seq', type: 'id', label: 'eg_oid_seq', default: `${BASE}.event.sequence` },
+                        { name: 'oid_delta', type: 'id', label: 'eg_oid_delta', default: `${BASE}.event.delta` },
+                        { name: 'oid_kind', type: 'id', label: 'eg_oid_kind', default: `${BASE}.event.kind` },
+                        { name: 'oid_light_count', type: 'id', label: 'eg_oid_light_count', default: `${BASE}.event.lightCount` },
+                        { name: 'oid_light_names', type: 'id', label: 'eg_oid_light_names', default: `${BASE}.event.lightNames` },
+                        { name: 'oid_event_timestamp', type: 'id', label: 'eg_oid_event_timestamp', default: `${BASE}.event.timestamp` },
+                        { name: 'oid_event_json', type: 'id', label: 'eg_oid_event_json', default: `${BASE}.event.json` },
+                    ],
+                },
+                {
+                    name: 'eg_labels',
+                    label: 'group_eg_labels',
+                    fields: [
+                        { name: 'label_daily', type: 'text', label: 'eg_label_daily' },
+                        { name: 'label_overall', type: 'text', label: 'eg_label_overall' },
+                        { name: 'label_record', type: 'text', label: 'eg_label_record' },
+                        { name: 'label_unit', type: 'text', label: 'eg_label_unit' },
+                    ],
+                },
+                {
+                    name: 'eg_behavior',
+                    label: 'group_eg_behavior',
+                    fields: [
+                        { name: 'animations', type: 'checkbox', label: 'eg_animations', default: true },
+                        { name: 'show_light_names', type: 'checkbox', label: 'eg_show_light_names', default: true },
+                        { name: 'record_sparkles', type: 'checkbox', label: 'eg_record_sparkles', default: true },
+                        { name: 'compact', type: 'checkbox', label: 'eg_compact', default: false },
+                    ],
+                },
+                {
+                    name: 'eg_appearance',
+                    label: 'group_eg_appearance',
+                    fields: [{ name: 'accent_color', type: 'color', label: 'eg_accent_color' }],
+                },
+            ],
+            visDefaultStyle: { width: 400, height: 260, position: 'relative' },
+            // VERIFY: preview path convention of this fork (svg kept text-based on purpose)
+            visPrev: 'widgets/vis-2-widgets-nils/img/prev_energy_game.svg',
+        } as RxWidgetInfo;
+    }
+
+    // eslint-disable-next-line class-methods-use-this
+    getWidgetInfo(): RxWidgetInfo {
+        return EnergyGame.getWidgetInfo();
+    }
+
+    // ------------------------------------------------------------------ lifecycle
+
+    componentDidMount(): void {
+        super.componentDidMount();
+        ensureEnergyGameStyles();
+
+        // size observation (no rAF loop; callback only fires on actual resizes)
+        const el = this.rootRef.current;
+        if (el) {
+            this.applySize(el.clientWidth, el.clientHeight);
+            if (typeof ResizeObserver !== 'undefined') {
+                this.resizeObserver = new ResizeObserver(entries => {
+                    const r = entries[0]?.contentRect;
+                    if (r) {
+                        this.applySize(r.width, r.height);
+                    }
+                });
+                this.resizeObserver.observe(el);
+            }
+        }
+
+        // reduced motion
+        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
+            this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
+            if (typeof this.motionQuery.addEventListener === 'function') {
+                this.motionQuery.addEventListener('change', this.onMotionChange);
+            } else if (typeof this.motionQuery.addListener === 'function') {
+                this.motionQuery.addListener(this.onMotionChange);
+            }
+        }
+
+        // wake-up / navigation: re-baseline silently
+        if (typeof document !== 'undefined') {
+            document.addEventListener('visibilitychange', this.onVisibilityChange);
+        }
+
+        // reconnect: re-baseline silently. VERIFY: socket-client exposes registerConnectionHandler.
+        const socket = this.getSocket();
+        if (socket && typeof socket.registerConnectionHandler === 'function') {
+            socket.registerConnectionHandler(this.onConnectionChange);
+        }
+
+        this.checkSequence();
+    }
+
+    componentDidUpdate(prevProps: Readonly<EnergyGame['props']>, prevState: Readonly<EnergyGameState>): void {
+        if (super.componentDidUpdate) {
+            super.componentDidUpdate(prevProps, prevState);
+        }
+        if (prevState.rxData?.oid_seq !== this.state.rxData?.oid_seq) {
+            // OID edited -> forget baseline, adopt new state silently
+            this.tracker.reset();
+            this.cancelTransient();
+        }
+        this.checkSequence();
+    }
+
+    componentWillUnmount(): void {
+        this.unmounted = true;
+        this.cancelTransient();
+        if (this.resizeObserver) {
+            this.resizeObserver.disconnect();
+            this.resizeObserver = null;
+        }
+        if (this.motionQuery) {
+            if (typeof this.motionQuery.removeEventListener === 'function') {
+                this.motionQuery.removeEventListener('change', this.onMotionChange);
+            } else if (typeof this.motionQuery.removeListener === 'function') {
+                this.motionQuery.removeListener(this.onMotionChange);
+            }
+            this.motionQuery = null;
+        }
+        if (typeof document !== 'undefined') {
+            document.removeEventListener('visibilitychange', this.onVisibilityChange);
+        }
+        const socket = this.getSocket();
+        if (socket && typeof socket.unregisterConnectionHandler === 'function') {
+            socket.unregisterConnectionHandler(this.onConnectionChange);
+        }
+        super.componentWillUnmount();
+    }
+
+    // ------------------------------------------------------------------ helpers
+
+    private getSocket(): any {
+        // VERIFY: material widgets access the connection via this.props.context.socket
+        const ctx = (this.props as any).context;
+        return ctx?.socket || (this.props as any).socket || null;
+    }
+
+    private applySize(width: number, height: number): void {
+        if (this.unmounted) {
+            return;
+        }
+        const w = Math.round(width);
+        const h = Math.round(height);
+        if (Math.abs(w - this.state.size.width) > 2 || Math.abs(h - this.state.size.height) > 2) {
+            this.setState({ size: { width: w, height: h } });
+        }
+    }
+
+    private readValue(attr: keyof EnergyGameRxData): unknown {
+        const oid = this.state.rxData?.[attr];
+        if (!oid || typeof oid !== 'string') {
+            return undefined;
+        }
+        // VERIFY: Generic.getPropertyValue(attrName) reads this.state.values[oid + '.val'] (material: yes)
+        return this.getPropertyValue(attr as string);
+    }
+
+    private cancelTransient(): void {
+        if (this.snapshotTimer) {
+            clearTimeout(this.snapshotTimer);
+            this.snapshotTimer = null;
+        }
+        if (this.eventTimer) {
+            clearTimeout(this.eventTimer);
+            this.eventTimer = null;
+        }
+        if (!this.unmounted && (this.state.activeEvent || this.state.pendingEvent)) {
+            this.setState({ activeEvent: null, pendingEvent: null });
+        }
+    }
+
+    private readonly onMotionChange = (): void => {
+        if (!this.unmounted) {
+            this.setState({ reducedMotion: prefersReducedMotion() });
+        }
+    };
+
+    private readonly onVisibilityChange = (): void => {
+        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
+            // Anything that happened while hidden must not be replayed as fresh.
+            this.tracker.requestRebaseline();
+            this.cancelTransient();
+        }
+    };
+
+    private readonly onConnectionChange = (connected: boolean): void => {
+        if (connected && this.wasConnected === false) {
+            this.tracker.requestRebaseline();
+            this.cancelTransient();
+        }
+        this.wasConnected = connected;
+    };
+
+    // ------------------------------------------------------------------ event pipeline
+
+    private checkSequence(): void {
+        const decision = this.tracker.observe(parseSequence(this.readValue('oid_seq')));
+        if (!decision.animate || decision.sequence === null) {
+            return;
+        }
+        const animationsEnabled = this.state.rxData?.animations !== false;
+        if ((this.props as any).editMode || !animationsEnabled) {
+            return; // baseline already advanced; nothing is shown
+        }
+        this.scheduleSnapshot(decision.sequence);
+    }
+
+    private scheduleSnapshot(sequence: number): void {
+        if (this.snapshotTimer) {
+            clearTimeout(this.snapshotTimer);
+        }
+        this.snapshotTimer = setTimeout(() => {
+            this.snapshotTimer = null;
+            if (!this.unmounted) {
+                this.captureEvent(sequence);
+            }
+        }, SNAPSHOT_DELAY_MS);
+    }
+
+    private captureEvent(sequence: number): void {
+        let delta = parsePositiveInt(this.readValue('oid_delta'));
+        let rawKind: unknown = this.readValue('oid_kind');
+        let lightCount = parsePositiveInt(this.readValue('oid_light_count'));
+        let lightNames = parseLightNames(this.readValue('oid_light_names'));
+
+        // Optional atomic snapshot wins if it belongs to exactly this sequence.
+        const json = parseEventJson(this.readValue('oid_event_json'));
+        if (json && json.sequence === sequence) {
+            delta = json.delta ?? delta;
+            rawKind = json.kind ?? rawKind;
+            lightCount = json.lightCount ?? lightCount;
+            lightNames = json.lightNames.length ? json.lightNames : lightNames;
+        }
+
+        const incoming: VisualEvent = {
+            sequence,
+            kind: classifyEventKind(rawKind, delta),
+            delta,
+            lightCount,
+            lightNames,
+            receivedAt: Date.now(),
+        };
+        this.enqueueEvent(incoming);
+    }
+
+    private enqueueEvent(incoming: VisualEvent): void {
+        const next = resolveEventTransition(this.state.activeEvent, this.state.pendingEvent, incoming);
+        this.setState({ activeEvent: next.active, pendingEvent: next.pending });
+        if (next.restarted) {
+            this.startEventTimer(next.active);
+        }
+    }
+
+    private startEventTimer(active: VisualEvent): void {
+        if (this.eventTimer) {
+            clearTimeout(this.eventTimer);
+        }
+        this.eventTimer = setTimeout(() => {
+            this.eventTimer = null;
+            if (this.unmounted) {
+                return;
+            }
+            const pending = this.state.pendingEvent;
+            if (pending) {
+                this.setState({ activeEvent: pending, pendingEvent: null });
+                this.startEventTimer(pending);
+            } else {
+                this.setState({ activeEvent: null });
+            }
+        }, EVENT_DURATION_MS[active.kind]);
+    }
+
+    // ------------------------------------------------------------------ rendering
+
+    private buildPalette(): EnergyGamePalette {
+        // VERIFY: material widgets get the MUI theme via this.props.context.theme (fallback: themeType)
+        const theme = (this.props as any).context?.theme;
+        const mode: 'light' | 'dark' =
+            theme?.palette?.mode || ((this.props as any).themeType === 'dark' ? 'dark' : 'light');
+        const dark = mode === 'dark';
+        const custom = this.state.rxData?.accent_color;
+        return {
+            mode,
+            text: theme?.palette?.text?.primary || (dark ? '#f5f7fa' : '#111827'),
+            textSecondary: theme?.palette?.text?.secondary || (dark ? 'rgba(245,247,250,.65)' : 'rgba(17,24,39,.6)'),
+            accent: typeof custom === 'string' && custom.trim() ? custom : dark ? '#4fd6ff' : '#0369a1',
+            gold: dark ? '#ffc857' : '#b7791f',
+        };
+    }
+
+    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
+        super.renderWidgetBody(props);
+        const rx = this.state.rxData || ({} as EnergyGameRxData);
+        const lang = (this.props as any).context?.lang || I18n.getLanguage() || 'en';
+        const inEditor = !!(this.props as any).editMode;
+
+        const content = (
+            <div ref={this.rootRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
+                <EnergyGameView
+                    daily={parseScore(this.readValue('oid_daily'))}
+                    overall={parseScore(this.readValue('oid_overall'))}
+                    highScore={parseScore(this.readValue('oid_high_score'))}
+                    highScoreToday={parseBoolean(this.readValue('oid_high_score_today'))}
+                    recordBrokenAt={parsePositiveInt(this.readValue('oid_record_broken_at'))}
+                    activeEvent={inEditor ? null : this.state.activeEvent}
+                    labels={{
+                        title: rx.widgetTitle || tr('eg_energy_saver'),
+                        daily: rx.label_daily || tr('eg_today'),
+                        overall: rx.label_overall || tr('eg_all_time'),
+                        record: rx.label_record || tr('eg_record'),
+                        unit: rx.label_unit || tr('eg_energy'),
+                    }}
+                    showTitle={!!rx.noCard && !!rx.widgetTitle}
+                    animationsEnabled={rx.animations !== false}
+                    reducedMotion={this.state.reducedMotion}
+                    showLightNames={rx.show_light_names !== false}
+                    recordSparkles={rx.record_sparkles !== false}
+                    compact={!!rx.compact}
+                    palette={this.buildPalette()}
+                    lang={lang}
+                    width={this.state.size.width}
+                    height={this.state.size.height}
+                    t={tr}
+                />
+            </div>
+        );
+
+        // VERIFY: Generic.wrapContent(content, addToHeader?, cardContentStyle?) signature (material: yes)
+        return this.wrapContent(content, null, { padding: 0, height: '100%', boxSizing: 'border-box' });
+    }
+}
diff --git a/src-widgets/src/EnergyGameUtils.test.ts b/src-widgets/src/EnergyGameUtils.test.ts
new file mode 100644
--- /dev/null
+++ b/src-widgets/src/EnergyGameUtils.test.ts
@@ -0,0 +1,214 @@
+// VERIFY test runner: written for vitest (Vite-native). For jest the same
+// file works with `import { describe, it, expect } from '@jest/globals'`;
+// for mocha+chai replace `expect(x).toBe(y)` with `expect(x).to.equal(y)`.
+import { describe, it, expect, afterEach } from 'vitest';
+
+import {
+    EventSequenceTracker,
+    classifyEventKind,
+    formatScore,
+    makeSparks,
+    parseBoolean,
+    parseEventJson,
+    parseLightNames,
+    parsePositiveInt,
+    parseScore,
+    parseSequence,
+    prefersReducedMotion,
+    resolveEventTransition,
+    summarizeLightNames,
+    type VisualEvent,
+} from './EnergyGameUtils';
+
+const ev = (sequence: number, kind: VisualEvent['kind'], delta = 1): VisualEvent => ({
+    sequence,
+    kind,
+    delta,
+    lightCount: delta,
+    lightNames: [],
+    receivedAt: 0,
+});
+
+describe('score parsing', () => {
+    it('parses numbers and numeric strings', () => {
+        expect(parseScore(18)).toBe(18);
+        expect(parseScore('18')).toBe(18);
+        expect(parseScore(' 2847 ')).toBe(2847);
+        expect(parseScore('17.6')).toBe(18);
+        expect(parseScore('1,5')).toBe(2);
+    });
+    it('returns null for malformed values', () => {
+        expect(parseScore(undefined)).toBeNull();
+        expect(parseScore(null)).toBeNull();
+        expect(parseScore('')).toBeNull();
+        expect(parseScore('abc')).toBeNull();
+        expect(parseScore(NaN)).toBeNull();
+        expect(parseScore(true)).toBeNull();
+        expect(parseScore({})).toBeNull();
+    });
+    it('formats null as em dash and numbers per locale', () => {
+        expect(formatScore(null)).toBe('—');
+        expect(formatScore(2847, 'en')).toBe('2,847');
+        expect(formatScore(2847, 'de')).toBe('2.847');
+        expect(formatScore(5, 'not-a-locale-!!')).toBe('5');
+    });
+    it('parses sequence, positive ints and booleans defensively', () => {
+        expect(parseSequence('127')).toBe(127);
+        expect(parseSequence(-1)).toBeNull();
+        expect(parseSequence('x')).toBeNull();
+        expect(parsePositiveInt(0)).toBeNull();
+        expect(parsePositiveInt('10')).toBe(10);
+        expect(parseBoolean('true')).toBe(true);
+        expect(parseBoolean(1)).toBe(true);
+        expect(parseBoolean('false')).toBe(false);
+        expect(parseBoolean(undefined)).toBe(false);
+    });
+});
+
+describe('light names', () => {
+    it('parses arrays, JSON strings, CSV and single names', () => {
+        expect(parseLightNames(['Kitchen', ' Hall '])).toEqual(['Kitchen', 'Hall']);
+        expect(parseLightNames('["Kitchen","Hall"]')).toEqual(['Kitchen', 'Hall']);
+        expect(parseLightNames('Kitchen, Hall;Dining')).toEqual(['Kitchen', 'Hall', 'Dining']);
+        expect(parseLightNames('Kitchen Ceiling')).toEqual(['Kitchen Ceiling']);
+        expect(parseLightNames({ lightNames: ['A'] })).toEqual(['A']);
+    });
+    it('never throws on malformed input', () => {
+        expect(parseLightNames('["Kitchen",')).toEqual(['Kitchen']);
+        expect(parseLightNames('{oops')).toEqual(['oops']);
+        expect(parseLightNames(null)).toEqual([]);
+        expect(parseLightNames(undefined)).toEqual([]);
+        expect(parseLightNames(42)).toEqual([]);
+        expect(parseLightNames('[]')).toEqual([]);
+        expect(parseLightNames([null, '', 3])).toEqual(['3']);
+    });
+    it('bounds size and length', () => {
+        expect(parseLightNames(new Array(200).fill('x')).length).toBe(50);
+        expect(parseLightNames(['a'.repeat(60)])[0].length).toBe(24);
+    });
+    it('summarizes', () => {
+        expect(summarizeLightNames([])).toBe('');
+        expect(summarizeLightNames(['Kitchen'])).toBe('Kitchen');
+        expect(summarizeLightNames(['Kitchen', 'Hall', 'Dining'])).toBe('Kitchen • Hall • Dining');
+        expect(summarizeLightNames(['Kitchen', 'Hall', 'Dining', 'a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBe('Kitchen • Hall • Dining +7');
+    });
+});
+
+describe('event kind classification', () => {
+    it('honours known kinds', () => {
+        expect(classifyEventKind('POINT', 1)).toBe('POINT');
+        expect(classifyEventKind(' combo ', 1)).toBe('COMBO');
+        expect(classifyEventKind('NEW_RECORD', 5)).toBe('NEW_RECORD');
+    });
+    it('falls back on delta for unknown/missing kinds', () => {
+        expect(classifyEventKind('SOMETHING', 1)).toBe('POINT');
+        expect(classifyEventKind('SOMETHING', 10)).toBe('COMBO');
+        expect(classifyEventKind(undefined, null)).toBe('POINT');
+        expect(classifyEventKind(null, 3)).toBe('COMBO');
+    });
+    it('parses event.json only when usable', () => {
+        expect(parseEventJson('{"sequence":5,"delta":3,"kind":"COMBO","lightCount":3,"lightNames":["a","b","c"]}')).toEqual({
+            sequence: 5, delta: 3, kind: 'COMBO', lightCount: 3, lightNames: ['a', 'b', 'c'],
+        });
+        expect(parseEventJson('{}')).toBeNull();
+        expect(parseEventJson('not json')).toBeNull();
+        expect(parseEventJson(null)).toBeNull();
+    });
+});
+
+describe('event sequence tracker', () => {
+    it('first observed value is a silent baseline (initial load)', () => {
+        const t = new EventSequenceTracker();
+        expect(t.observe(null).reason).toBe('NO_VALUE');
+        const d = t.observe(127);
+        expect(d.animate).toBe(false);
+        expect(d.reason).toBe('BASELINE');
+        expect(t.getBaseline()).toBe(127);
+    });
+    it('changed sequence animates exactly once; same sequence never replays', () => {
+        const t = new EventSequenceTracker();
+        t.observe(127);
+        expect(t.observe(127).animate).toBe(false);
+        const d = t.observe(128);
+        expect(d.animate).toBe(true);
+        expect(d.sequence).toBe(128);
+        expect(t.observe(128).animate).toBe(false);
+        expect(t.observe(128).reason).toBe('UNCHANGED');
+    });
+    it('re-baseline (reconnect / wake-up) swallows missed events', () => {
+        const t = new EventSequenceTracker();
+        t.observe(100);
+        t.requestRebaseline();
+        expect(t.observe(104).animate).toBe(false);
+        expect(t.observe(104).reason).toBe('UNCHANGED');
+        expect(t.observe(105).animate).toBe(true);
+    });
+    it('regression (backup restore) is silent; reset forgets baseline', () => {
+        const t = new EventSequenceTracker();
+        t.observe(100);
+        expect(t.observe(3).reason).toBe('REGRESSION');
+        expect(t.observe(4).animate).toBe(true);
+        t.reset();
+        expect(t.observe(999).reason).toBe('BASELINE');
+    });
+});
+
+describe('event transition / priority', () => {
+    it('starts when idle', () => {
+        const r = resolveEventTransition(null, null, ev(1, 'POINT'));
+        expect(r.active.sequence).toBe(1);
+        expect(r.pending).toBeNull();
+        expect(r.restarted).toBe(true);
+    });
+    it('equal/higher priority replaces the running event', () => {
+        expect(resolveEventTransition(ev(1, 'POINT'), null, ev(2, 'POINT')).active.sequence).toBe(2);
+        expect(resolveEventTransition(ev(1, 'POINT'), null, ev(2, 'COMBO', 10)).active.kind).toBe('COMBO');
+        const r = resolveEventTransition(ev(1, 'COMBO', 10), ev(2, 'POINT'), ev(3, 'NEW_RECORD', 3));
+        expect(r.active.kind).toBe('NEW_RECORD');
+        expect(r.pending).toBeNull();
+    });
+    it('NEW_RECORD is never hidden by a later POINT; POINT waits in the single pending slot', () => {
+        const r = resolveEventTransition(ev(1, 'NEW_RECORD', 3), null, ev(2, 'POINT'));
+        expect(r.active.kind).toBe('NEW_RECORD');
+        expect(r.pending?.sequence).toBe(2);
+        expect(r.restarted).toBe(false);
+        // a second POINT replaces the pending POINT (bounded queue, latest wins)
+        const r2 = resolveEventTransition(r.active, r.pending, ev(3, 'POINT'));
+        expect(r2.pending?.sequence).toBe(3);
+        // a pending COMBO is not downgraded by a later POINT
+        const r3 = resolveEventTransition(ev(1, 'NEW_RECORD', 3), ev(2, 'COMBO', 4), ev(3, 'POINT'));
+        expect(r3.pending?.kind).toBe('COMBO');
+    });
+});
+
+describe('sparks and reduced motion', () => {
+    it('spark count is bounded and deterministic per sequence', () => {
+        expect(makeSparks(6, 42, 100).length).toBe(6);
+        expect(makeSparks(100, 42, 100).length).toBe(24);
+        expect(makeSparks(0, 42, 100)).toEqual([]);
+        expect(makeSparks(6, 42, 100)).toEqual(makeSparks(6, 42, 100));
+        expect(makeSparks(6, 42, 100)).not.toEqual(makeSparks(6, 43, 100));
+    });
+
+    const originalMatchMedia = (globalThis as any).window?.matchMedia;
+    afterEach(() => {
+        if ((globalThis as any).window) {
+            (globalThis as any).window.matchMedia = originalMatchMedia;
+        }
+    });
+    it('prefersReducedMotion reflects matchMedia and never throws without it', () => {
+        (globalThis as any).window = (globalThis as any).window || {};
+        (globalThis as any).window.matchMedia = () => ({ matches: true });
+        expect(prefersReducedMotion()).toBe(true);
+        (globalThis as any).window.matchMedia = () => ({ matches: false });
+        expect(prefersReducedMotion()).toBe(false);
+        (globalThis as any).window.matchMedia = undefined;
+        expect(prefersReducedMotion()).toBe(false);
+        (globalThis as any).window.matchMedia = () => {
+            throw new Error('boom');
+        };
+        expect(prefersReducedMotion()).toBe(false);
+    });
+});
diff --git a/src-widgets/src/dev/EnergyGamePreview.tsx b/src-widgets/src/dev/EnergyGamePreview.tsx
new file mode 100644
--- /dev/null
+++ b/src-widgets/src/dev/EnergyGamePreview.tsx
@@ -0,0 +1,151 @@
+/**
+ * Dev-only preview for the EnergyGame widget. Not exposed via Module Federation;
+ * import it from the demo app (src/index.tsx) only.
+ */
+import React, { useEffect, useRef, useState } from 'react';
+
+import EnergyGameView, { ensureEnergyGameStyles } from '../EnergyGameView';
+import { EVENT_DURATION_MS, type VisualEvent } from '../EnergyGameUtils';
+
+const SIZES: Record<string, { width: number; height: number }> = {
+    compact: { width: 260, height: 180 },
+    tablet: { width: 400, height: 260 },
+    large: { width: 600, height: 350 },
+};
+
+const TEXTS: Record<string, string> = {
+    eg_new_record: 'New record',
+    eg_energy: 'Energy',
+    eg_energy_saved: 'Energy saved',
+    eg_energy_combo: 'Energy combo',
+    eg_lights_saved: '%s lights saved',
+    eg_score_unavailable: 'Score unavailable',
+};
+const t = (key: string, ...args: (string | number)[]): string =>
+    args.reduce<string>((s, a) => s.replace('%s', String(a)), TEXTS[key] || key);
+
+export default function EnergyGamePreview(): React.JSX.Element {
+    const [mode, setMode] = useState<'light' | 'dark'>('dark');
+    const [size, setSize] = useState('tablet');
+    const [highScoreToday, setHighScoreToday] = useState(false);
+    const [reducedMotion, setReducedMotion] = useState(false);
+    const [daily, setDaily] = useState(18);
+    const [highScore, setHighScore] = useState(27);
+    const [event, setEvent] = useState<VisualEvent | null>(null);
+    const seq = useRef(100);
+    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
+
+    useEffect(() => {
+        ensureEnergyGameStyles();
+        return () => {
+            if (timer.current) {
+                clearTimeout(timer.current);
+            }
+        };
+    }, []);
+
+    const fire = (kind: VisualEvent['kind'], delta: number, names: string[]): void => {
+        seq.current += 1;
+        const nextDaily = daily + delta;
+        setDaily(nextDaily);
+        if (kind === 'NEW_RECORD') {
+            setHighScore(Math.max(highScore, nextDaily));
+            setHighScoreToday(true);
+        }
+        const ev: VisualEvent = { sequence: seq.current, kind, delta, lightCount: names.length || delta, lightNames: names, receivedAt: Date.now() };
+        setEvent(ev);
+        if (timer.current) {
+            clearTimeout(timer.current);
+        }
+        timer.current = setTimeout(() => setEvent(null), EVENT_DURATION_MS[kind]);
+    };
+
+    const dark = mode === 'dark';
+    const dims = SIZES[size];
+
+    return (
+        <div style={{ padding: 16, fontFamily: 'Roboto, sans-serif' }}>
+            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
+                <button onClick={() => fire('POINT', 1, ['Kitchen Ceiling'])}>+1 point</button>
+                <button onClick={() => fire('COMBO', 5, ['Kitchen', 'Hall', 'Dining', 'Office', 'Bath'])}>+5 combo</button>
+                <button onClick={() => fire('COMBO', 10, [])}>+10 combo (no names)</button>
+                <button onClick={() => fire('NEW_RECORD', 3, ['Kitchen', 'Hall', 'Dining'])}>NEW_RECORD +3</button>
+                <button onClick={() => fire('NEW_RECORD', 1, ['Hallway'])}>NEW_RECORD +1</button>
+                <label>
+                    <input type="checkbox" checked={highScoreToday} onChange={e => setHighScoreToday(e.target.checked)} /> highScoreToday
+                </label>
+                <label>
+                    <input type="checkbox" checked={reducedMotion} onChange={e => setReducedMotion(e.target.checked)} /> reduced motion
+                </label>
+                <label>
+                    <input type="checkbox" checked={dark} onChange={e => setMode(e.target.checked ? 'dark' : 'light')} /> dark
+                </label>
+                <select value={size} onChange={e => setSize(e.target.value)}>
+                    {Object.keys(SIZES).map(k => (
+                        <option key={k} value={k}>
+                            {k} {SIZES[k].width}x{SIZES[k].height}
+                        </option>
+                    ))}
+                </select>
+                <button onClick={() => { setDaily(18); setHighScore(27); setHighScoreToday(false); setEvent(null); }}>reset idle</button>
+            </div>
+            <div
+                style={{
+                    width: dims.width,
+                    height: dims.height,
+                    borderRadius: 12,
+                    background: dark ? '#1e1e1e' : '#ffffff',
+                    boxShadow: '0 2px 8px rgba(0,0,0,.3)',
+                }}
+            >
+                <EnergyGameView
+                    daily={daily}
+                    overall={2847}
+                    highScore={highScore}
+                    highScoreToday={highScoreToday}
+                    recordBrokenAt={highScoreToday ? Date.now() : null}
+                    activeEvent={event}
+                    labels={{ title: 'Energy Saver', daily: 'Today', overall: 'All time', record: 'Record', unit: 'Energy' }}
+                    showTitle
+                    animationsEnabled
+                    reducedMotion={reducedMotion}
+                    showLightNames
+                    recordSparkles
+                    compact={false}
+                    palette={{
+                        mode,
+                        text: dark ? '#f5f7fa' : '#111827',
+                        textSecondary: dark ? 'rgba(245,247,250,.65)' : 'rgba(17,24,39,.6)',
+                        accent: dark ? '#4fd6ff' : '#0369a1',
+                        gold: dark ? '#ffc857' : '#b7791f',
+                    }}
+                    lang="en"
+                    width={dims.width}
+                    height={dims.height}
+                    t={t}
+                />
+            </div>
+        </div>
+    );
+}
diff --git a/src-widgets/public/img/prev_energy_game.svg b/src-widgets/public/img/prev_energy_game.svg
new file mode 100644
--- /dev/null
+++ b/src-widgets/public/img/prev_energy_game.svg
@@ -0,0 +1,14 @@
+<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">
+  <rect x="4" y="4" width="232" height="152" rx="12" fill="#1f2530"/>
+  <text x="120" y="26" fill="#9aa4b2" font-family="Roboto,Arial,sans-serif" font-size="9" letter-spacing="2" text-anchor="middle">ENERGY SAVER</text>
+  <path d="M121 36 113 48h6l-1 8 8-12h-6l1-8z" fill="#4fd6ff"/>
+  <text x="120" y="96" fill="#f5f7fa" font-family="Roboto,Arial,sans-serif" font-size="46" font-weight="800" text-anchor="middle">18</text>
+  <text x="120" y="110" fill="#4fd6ff" font-family="Roboto,Arial,sans-serif" font-size="8" letter-spacing="2" text-anchor="middle">TODAY</text>
+  <text x="28" y="136" fill="#f5f7fa" font-family="Roboto,Arial,sans-serif" font-size="16" font-weight="700">2,847</text>
+  <text x="28" y="148" fill="#9aa4b2" font-family="Roboto,Arial,sans-serif" font-size="7" letter-spacing="2">ALL TIME</text>
+  <rect x="150" y="118" width="70" height="34" rx="8" fill="none" stroke="#ffc857" stroke-opacity=".5"/>
+  <path d="M170 124h8v1.5h2.5v2.5a4 4 0 0 1-3.3 3.9 4 4 0 0 1-2.2 2.3V136h2.4v1.6h-6.8V136h2.4v-1.8a4 4 0 0 1-2.2-2.3 4 4 0 0 1-3.3-3.9v-2.5h2.5z" fill="#ffc857"/>
+  <text x="214" y="136" fill="#ffc857" font-family="Roboto,Arial,sans-serif" font-size="16" font-weight="700" text-anchor="end">27</text>
+  <text x="214" y="148" fill="#9aa4b2" font-family="Roboto,Arial,sans-serif" font-size="7" letter-spacing="2" text-anchor="end">RECORD</text>
+</svg>
Edits to existing files (apply by hand – exact insertions)
1. src-widgets/vite.config.ts – inside the federation plugin's exposes: { … } map add one entry next to the other widgets:

TypeScript

        './EnergyGame': './src/EnergyGame',
2. src-widgets/src/index.tsx (dev demo app; optional) – add the import and one entry to the widgets map rendered by WidgetDemoApp (VERIFY shape of that map):

React

import EnergyGamePreview from './dev/EnergyGamePreview';
// … inside the demo widgets list:
EnergyGame: <EnergyGamePreview />,
3. i18n (11 files) – save the block below as energy-game-i18n.json in the repo root and run the merge one-liner; it only adds keys, keeps key order of existing entries, and detects each file's indentation, so git diff shows pure additions. If the fork's prefix is not vis_2_widgets_nils_, sed the prefix in this JSON (and in EnergyGame.tsx labels, which are unprefixed, so only the JSON matters).

Bash

node -e '
const fs=require("fs");const add=JSON.parse(fs.readFileSync("energy-game-i18n.json","utf8"));
for (const [lang,keys] of Object.entries(add)) {
  const p=`src-widgets/src/i18n/${lang}.json`; const raw=fs.readFileSync(p,"utf8");
  const indent=(raw.match(/\n(\s+)"/)||[,"    "])[1]; const j=JSON.parse(raw);
  for (const [k,v] of Object.entries(keys)) if (!(k in j)) j[k]=v;
  fs.writeFileSync(p, JSON.stringify(j,null,indent)+(raw.endsWith("\n")?"\n":""));
}'
JSON

{
"en":{"vis_2_widgets_nils_energy_game":"Energy game","vis_2_widgets_nils_group_eg_scores":"Score states","vis_2_widgets_nils_group_eg_event":"Event states","vis_2_widgets_nils_group_eg_labels":"Labels","vis_2_widgets_nils_group_eg_behavior":"Behavior","vis_2_widgets_nils_group_eg_appearance":"Appearance","vis_2_widgets_nils_eg_oid_daily":"Daily score (score.daily)","vis_2_widgets_nils_eg_oid_overall":"Overall score (score.overall)","vis_2_widgets_nils_eg_oid_high_score":"High score (score.highScore)","vis_2_widgets_nils_eg_oid_high_score_today":"High score today (day.highScoreToday)","vis_2_widgets_nils_eg_oid_record_broken_at":"Record broken at (optional)","vis_2_widgets_nils_eg_oid_seq":"Event sequence (event.sequence)","vis_2_widgets_nils_eg_oid_delta":"Event delta (event.delta)","vis_2_widgets_nils_eg_oid_kind":"Event kind (event.kind)","vis_2_widgets_nils_eg_oid_light_count":"Event light count (event.lightCount)","vis_2_widgets_nils_eg_oid_light_names":"Event light names (event.lightNames)","vis_2_widgets_nils_eg_oid_event_timestamp":"Event timestamp (optional)","vis_2_widgets_nils_eg_oid_event_json":"Event JSON snapshot (optional)","vis_2_widgets_nils_eg_label_daily":"Daily label (empty = Today)","vis_2_widgets_nils_eg_label_overall":"Overall label (empty = All time)","vis_2_widgets_nils_eg_label_record":"Record label (empty = Record)","vis_2_widgets_nils_eg_label_unit":"Points label (empty = Energy)","vis_2_widgets_nils_eg_animations":"Animations","vis_2_widgets_nils_eg_show_light_names":"Show light names in animation","vis_2_widgets_nils_eg_record_sparkles":"Persistent record sparkles","vis_2_widgets_nils_eg_compact":"Compact mode","vis_2_widgets_nils_eg_accent_color":"Accent color","vis_2_widgets_nils_eg_energy_saver":"Energy Saver","vis_2_widgets_nils_eg_today":"Today","vis_2_widgets_nils_eg_all_time":"All time","vis_2_widgets_nils_eg_record":"Record","vis_2_widgets_nils_eg_energy":"Energy","vis_2_widgets_nils_eg_energy_saved":"Energy saved","vis_2_widgets_nils_eg_new_record":"New record","vis_2_widgets_nils_eg_combo":"Combo","vis_2_widgets_nils_eg_energy_combo":"Energy combo","vis_2_widgets_nils_eg_lights_saved":"%s lights saved","vis_2_widgets_nils_eg_score_unavailable":"Score unavailable"},
"de":{"vis_2_widgets_nils_energy_game":"Energiespiel","vis_2_widgets_nils_group_eg_scores":"Punktestände","vis_2_widgets_nils_group_eg_event":"Ereignis-Datenpunkte","vis_2_widgets_nils_group_eg_labels":"Beschriftungen","vis_2_widgets_nils_group_eg_behavior":"Verhalten","vis_2_widgets_nils_group_eg_appearance":"Aussehen","vis_2_widgets_nils_eg_oid_daily":"Tagespunkte (score.daily)","vis_2_widgets_nils_eg_oid_overall":"Gesamtpunkte (score.overall)","vis_2_widgets_nils_eg_oid_high_score":"Rekord (score.highScore)","vis_2_widgets_nils_eg_oid_high_score_today":"Rekord heute (day.highScoreToday)","vis_2_widgets_nils_eg_oid_record_broken_at":"Rekordzeitpunkt (optional)","vis_2_widgets_nils_eg_oid_seq":"Ereignis-Sequenz (event.sequence)","vis_2_widgets_nils_eg_oid_delta":"Ereignis-Delta (event.delta)","vis_2_widgets_nils_eg_oid_kind":"Ereignis-Art (event.kind)","vis_2_widgets_nils_eg_oid_light_count":"Anzahl Lampen (event.lightCount)","vis_2_widgets_nils_eg_oid_light_names":"Lampennamen (event.lightNames)","vis_2_widgets_nils_eg_oid_event_timestamp":"Ereignis-Zeitstempel (optional)","vis_2_widgets_nils_eg_oid_event_json":"Ereignis-JSON (optional)","vis_2_widgets_nils_eg_label_daily":"Beschriftung Tag (leer = Heute)","vis_2_widgets_nils_eg_label_overall":"Beschriftung Gesamt (leer = Gesamt)","vis_2_widgets_nils_eg_label_record":"Beschriftung Rekord (leer = Rekord)","vis_2_widgets_nils_eg_label_unit":"Beschriftung Punkte (leer = Energie)","vis_2_widgets_nils_eg_animations":"Animationen","vis_2_widgets_nils_eg_show_light_names":"Lampennamen in Animation anzeigen","vis_2_widgets_nils_eg_record_sparkles":"Dauerhaftes Rekord-Funkeln","vis_2_widgets_nils_eg_compact":"Kompaktmodus","vis_2_widgets_nils_eg_accent_color":"Akzentfarbe","vis_2_widgets_nils_eg_energy_saver":"Energiesparer","vis_2_widgets_nils_eg_today":"Heute","vis_2_widgets_nils_eg_all_time":"Gesamt","vis_2_widgets_nils_eg_record":"Rekord","vis_2_widgets_nils_eg_energy":"Energie","vis_2_widgets_nils_eg_energy_saved":"Energie gespart","v
Something went wrong with this response, please try again.

Trace ID: 6e0287a48e8f6a7b027895