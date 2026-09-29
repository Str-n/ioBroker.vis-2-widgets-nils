# Installation

## 1. Test the workspace

From the workspace root:

```bash
npm test
TZ=America/New_York node tests/energyGame.test.js
```

Both runs must pass (`24/24`). The second confirms that scoring does not depend on the server timezone.

## 2. Configure and install the backend

1. Open [`backend/energyGame.js`](../backend/energyGame.js).
2. Replace each `REPLACE_WITH_...` entry in `LIGHTS` with a full ioBroker actual-status state ID.
3. Use only Boolean states (`common.type === 'boolean'`). Prefer reported device status over a separate command-only state.
4. Give every light a unique `key` and a display `name`; remove unused placeholder entries.
5. Paste the complete file into a new JavaScript-adapter script and start it.

The script creates `0_userdata.0.energyGame.*` on first start. If an old JavaScript adapter reports a missing parent, create the `0_userdata.0.energyGame` folder manually in Admin → Objects and restart the script.

## 3. Verify startup

Check the JavaScript log and Admin → Objects:

- `info.configStatus.invalidCount` is `0`.
- `day.key` is today's date in `Europe/Berlin`.
- Existing score values were preserved.
- `info.startedAt` has been updated.
- Exactly one backend script instance is running.

The backend subscribes only to configured light IDs. A qualifying event is a `true → false` value transition with `state.lc - oldState.lc >= 60000` ms.

## 4. Integrate automatic OFF commands

Install [`automations/global/energyGameHelpers.js`](../automations/global/energyGameHelpers.js) as a global script, or copy the function into each automation. Call and await it directly before an automatic OFF command:

```js
await suppressEnergyGameScoring(5000, 'Hallway motion timeout');
await setStateAsync(LIGHT_COMMAND_ID, false, false);
```

Do not suppress ON commands or manual OFF actions. Choose a window covering the command and the slowest device status update.

## 5. Debug and upgrade safely

Temporarily set `DEBUG = true` to inspect one compact JSON diagnostic per OFF candidate, then set it back to `false`. For upgrades, stop changing scores while testing, note the current score values, replace the script, and verify the startup `Loaded:` line. Manual score corrections require stopping and restarting the backend.
