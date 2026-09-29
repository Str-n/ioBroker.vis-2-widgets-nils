# Risks and limitations

- Suppression is intentionally one global window. A manual OFF that occurs inside an automatic window is also suppressed; use windows no longer than the device round-trip requires.
- Duration depends on `oldState.lc` and `state.lc`. If a device adapter resets or omits `lc` during reconnects, the backend cannot safely infer the ON duration and reports `MISSING_TIMESTAMP` or a short duration.
- Scene/group states can create many simultaneous transitions. Configure physical Boolean status states only; the validation warnings are defensive, not a substitute for checking the datapoint.
- The in-memory model is authoritative during runtime. External edits to scores are intentionally ignored until restart to avoid read-modify-write races.
- Day logic uses `Intl.DateTimeFormat` with `Europe/Berlin` and a 60-second check. A standard Node.js build with timezone ICU data is required.
- Event batching affects animation only. Points are applied immediately, so slow or staggered device updates may produce multiple visual events while preserving exact scoring.
- The backend does not subscribe to its own userdata tree, preventing recursive event handling. VIS-2 must remain a read-only consumer.
