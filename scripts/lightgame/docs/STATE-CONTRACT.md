# State contract

All persistent states are under `0_userdata.0.energyGame`. The backend creates missing states only; existing objects and values are preserved on restart. Backend writes use `ack=true`.

## Scores and day

| State | Type / role | Meaning |
|---|---|---|
| `score.daily` | number / value | Points for the current `Europe/Berlin` calendar day. |
| `score.overall` | number / value | Lifetime points; never reset automatically. |
| `score.highScore` | number / value | Highest daily score ever reached. Ties do not break the record. |
| `day.key` | string / text | Current local day as `YYYY-MM-DD`. |
| `day.highScoreToday` | boolean / indicator | Whether the historical high score was exceeded today. |
| `day.recordBrokenAt` | number / value.time | Timestamp of the first record-breaking point today, or `0`. |

Day rollover resets `score.daily`, `day.highScoreToday`, and `day.recordBrokenAt`, while preserving `score.overall`, `score.highScore`, and `event.sequence`.

## Suppression

| State | Type / role | Writer | Meaning |
|---|---|---|---|
| `suppression.until` | number / value.time | Automations | Inclusive epoch-millisecond expiry for automatic OFF suppression. |
| `suppression.reason` | string / text | Automations | Diagnostic text for the latest suppression request. |

The helper extends the expiry with `max(existing, Date.now() + windowMs)`. It never clears the window. The backend compares the expiry with the OFF state's `lc` timestamp, not evaluation time.

## Visual event

The backend writes `event.delta`, `event.kind`, `event.lightCount`, `event.lightNames`, `event.timestamp`, and `event.json` before incrementing `event.sequence`. Consumers trigger on `event.sequence` and then read the other fields, or parse `event.json`.

`event.kind` is `POINT`, `COMBO`, or `NEW_RECORD`; `NEW_RECORD` has precedence over the other kinds. `event.json` includes the event fields plus `dailyAfter`, `overallAfter`, `highScoreAfter`, and `highScoreToday`.

## Diagnostics

| State | Meaning |
|---|---|
| `info.configStatus` | Startup validation report for every configured light. |
| `info.startedAt` | Last backend start timestamp. |
| `info.lastPointAt` | Most recent scored point timestamp. |
| `info.lastRolloverAt` | Most recent day rollover timestamp. |

VIS-2 is read-only. Administrators may correct `score.*`, but the running backend keeps an in-memory authoritative model; restart the backend for a manual correction to take effect.
