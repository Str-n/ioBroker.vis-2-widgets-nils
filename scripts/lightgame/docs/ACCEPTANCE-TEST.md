# Acceptance test

Use real configured lamps and perform these checks after installation. Record the starting values of `score.daily`, `score.overall`, `score.highScore`, `event.sequence`, and `day.highScoreToday`.

## Scoring

- ON for 20 seconds, then manual OFF → `TOO_SHORT`, no score.
- ON for exactly 60 seconds, then manual OFF → `SCORED`, exactly one point.
- ON for longer than 60 seconds, then OFF through a wall switch, VIS, or voice command → one point regardless of origin.
- Repeated OFF while already false and repeated ON while already true → no duplicate point.

## Restart and suppression

- Turn a lamp ON, restart `javascript.0`, leave it ON for at least 60 seconds total, then turn it OFF. It should score using the persisted `lc` metadata.
- Let a motion timeout switch an ON lamp off. It should log `SUPPRESSED` and leave the score unchanged.
- Switch that same lamp OFF manually during the countdown. It should score if it was ON for at least 60 seconds.
- Run nightly All-Off with several lamps ON. Every automatic OFF should be `SUPPRESSED`.
- After `suppression.until` expires, a manual qualifying OFF should score normally.

## Batching and records

- Turn at least three configured lamps OFF manually within 350 ms. The score rises once per lamp, while one event has `kind=COMBO` and `delta=lightCount` equal to the number of lamps.
- A combo that first exceeds the historical high score has `kind=NEW_RECORD`.
- A tie does not break the record. The first later score above it sets `day.highScoreToday=true` and emits `NEW_RECORD` once for that day.

## Day handling

Simulate a stale `day.key`, restart the backend, and verify that only daily fields reset. `score.overall`, `score.highScore`, and `event.sequence` must remain unchanged. The core tests cover both Berlin DST boundaries.

## Production mode

Set `DEBUG=false` after verification. Normal OFF candidates should then be quiet; startup, configuration errors, rollovers, errors, and new records remain logged.
