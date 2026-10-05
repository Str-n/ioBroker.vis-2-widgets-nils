# Energy Game for ioBroker

This workspace contains the ioBroker Energy-Saving Gamification Backend described in [`stepbysstepfabel.md`](stepbysstepfabel.md).

## Workspace

| Path | Purpose |
|---|---|
| [`backend/energyGame.js`](backend/energyGame.js) | Production JavaScript-adapter script. Configure `LIGHTS` before enabling it. |
| [`backend/energyGameCore.js`](backend/energyGameCore.js) | Standalone CommonJS copy of the pure scoring core. |
| [`display/README.md`](display/README.md) | RP2040 round score display firmware, USB bridge, installer and device tests. |
| [`tests/energyGame.test.js`](tests/energyGame.test.js) | Dependency-free Node test harness with 24 deterministic scenarios. |
| [`automations/global/energyGameHelpers.js`](automations/global/energyGameHelpers.js) | Global suppression helper for automatic OFF commands. |
| [`automations/javascript/hallwayMotion.js`](automations/javascript/hallwayMotion.js) | Motion timeout integration example. |
| [`automations/javascript/nightlyAllOff.js`](automations/javascript/nightlyAllOff.js) | Scheduled all-off integration example. |
| [`automations/blockly/README.md`](automations/blockly/README.md) | Blockly integration instructions and paste-ready blocks. |
| [`docs/STATE-CONTRACT.md`](docs/STATE-CONTRACT.md) | Persistent state tree and writer/consumer contract. |
| [`docs/INSTALLATION.md`](docs/INSTALLATION.md) | Installation and configuration procedure. |
| [`docs/ACCEPTANCE-TEST.md`](docs/ACCEPTANCE-TEST.md) | Real-device acceptance checklist. |
| [`docs/RISKS-AND-LIMITATIONS.md`](docs/RISKS-AND-LIMITATIONS.md) | Known v1 trade-offs and device assumptions. |
| [`docs/FINAL-SELF-REVIEW.md`](docs/FINAL-SELF-REVIEW.md) | Implemented final-review fixes and verification notes. |

## Quick start

1. Run `npm test` (or `node tests/energyGame.test.js`).
2. Copy [`backend/energyGame.js`](backend/energyGame.js) into an ioBroker JavaScript script and replace the `LIGHTS` placeholders with actual Boolean status states.
3. Start the script and verify `0_userdata.0.energyGame.info.configStatus`.
4. Install the global helper and add suppression immediately before every automatic OFF command.

The production script has no frontend dependency. A VIS-2 view should consume only `0_userdata.0.energyGame.*` and trigger on `event.sequence`.
