# Outdoor brightness model for ioBroker

Paste `outdoor-brightness-model.js` into a **second, normal JavaScript script** and enable it. Keep the original PV script running. Requires javascript adapter 7.9 or newer and outbound HTTPS; no additional packages or API keys. Satellite time correction uses `suncalc2`, which is included with the javascript adapter.

Set `MODEL.latitude` and `MODEL.longitude` to your location. The defaults, 50.45 / 7.43, are approximate coordinates near 56567. The two free API requests run immediately and every ten minutes, 20 seconds after the PV script's scheduled update. OpenWeather is read from your existing adapter, with no additional OpenWeather requests.

## Updating an existing installation

Replace the contents of the second script with `outdoor-brightness-model.js` and restart that script. Keep the original PV script running. Existing output IDs and raw source series are retained. New diagnostic states are created automatically. The first run after upgrading has no compatible smoothing history, so starts from the current estimate; subsequent restarts can restore fresh history.

The output now deliberately favors higher eligible estimates in low light. This is an automation preference, not a claim of better calibrated physical accuracy. The default error preference is 9:1 against underestimation.

## State IDs

The existing script's outputs remain inputs:

- `0_userdata.0.sunlight.solar.estimated` — existing PV lux, retained as a diagnostic.
- `0_userdata.0.sunlight.solar.irradiance_estimated` — existing PV horizontal irradiance used in the blend.

Combined outputs:

- `0_userdata.0.sunlight.overall.estimated` — estimated lux.
- `0_userdata.0.sunlight.overall.irradiance_estimated` — estimated horizontal W/m².
- `0_userdata.0.sunlight.overall.valid` — whether the most recent cycle produced a usable result.
- `0_userdata.0.sunlight.overall.status` — combination/fallback explanation.
- `0_userdata.0.sunlight.overall.sources_used` — JSON array of accepted sources.
- `0_userdata.0.sunlight.overall.sources_rejected` — JSON object of exclusion reasons.
- `0_userdata.0.sunlight.overall.source_count` — number of accepted sources.
- `0_userdata.0.sunlight.overall.last_success` — last successful calculation, Unix milliseconds.
- `0_userdata.0.sunlight.overall.central_estimated` — weighted central estimate in lux before upper preference.
- `0_userdata.0.sunlight.overall.upper_estimated` — interpolated ensemble quantile in lux.
- `0_userdata.0.sunlight.overall.target_estimated` — target lux after upper preference and twilight floor, before decline smoothing.
- `0_userdata.0.sunlight.overall.low_light_preference` — preference strength, from 0 to 1.
- `0_userdata.0.sunlight.overall.twilight_estimated` — uncalibrated twilight floor in lux; 0 outside its altitude range.
- `0_userdata.0.sunlight.overall.sun_altitude` — current followthesun altitude in degrees, null when unavailable.
- `0_userdata.0.sunlight.overall.smoothing_state` — internal JSON history with an expiry deadline; do not edit.

Individual sources are stored under `0_userdata.0.sunlight.sources.<source>`:

| Source        | Input                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- |
| `pv`          | Existing PV estimate, inverter power and sun position                                       |
| `dwd`         | Open-Meteo DWD current model radiation                                                      |
| `satellite`   | Latest available Open-Meteo satellite radiation observation                                 |
| `openweather` | Existing OpenWeather cloud percentage and observation date, combined with a clear-sky model |

Each source has these states:

| Suffix                                          | Meaning                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `.irradiance`, `.estimated`                     | Original, uncorrected source W/m² and lux; retained for historical comparisons                                                                |
| `.corrected_irradiance`, `.corrected_estimated` | Current-time estimate before spike/fallback selection; satellite is adjusted for solar elevation; null if correction is unavailable           |
| `.timestamp`                                    | Oldest prerequisite/sample time in Unix milliseconds, used for expiry                                                                         |
| `.observation_timestamp`                        | Distinct radiation observation timestamp; PV uses the underlying inverter power sample's timestamp, not the first script's recalculation time |
| `.age_minutes`                                  | Sample age when last successfully collected                                                                                                   |
| `.available`                                    | Source collection succeeded                                                                                                                   |
| `.eligible`                                     | Source passed correction and selection checks for this cycle                                                                                  |
| `.used`                                         | Source contributed to this cycle's target                                                                                                     |
| `.status`                                       | Availability, correction, or exclusion explanation                                                                                            |
| `.details`                                      | JSON: DWD diffuse radiation, PV power/clipping/original lux, OpenWeather cloud/clear-sky values, or satellite correction ratio and elevations |

`available=true` alone does not mean a reading was accepted. Use `.eligible`/`.used` and `.status`. During downward smoothing, the final value can also contain a contribution from fresh prior history.

If a source fails, its previous raw values, timestamp and details remain for inspection; corrected values become null, and `.available`, `.eligible` and `.used` become false and `.status` explains why. The stored age is the age when that sample was last successfully checked; use `.timestamp` to calculate its current age. Old source values never enter the next calculation. If every source fails, combined values remain unchanged, their timestamps do not advance, and `.valid` is false. Consumers should check `.valid` and the output timestamp.

## Combination rules

1. Reject missing/non-numeric values, bad ioBroker quality, unexpected API units, future/stale timestamps, and irradiance outside 0–1600 W/m². Zero is a valid reading; null is not. Local prerequisites expire after 25 minutes, satellite observations after 50 minutes, and OpenWeather after 120 minutes. OpenWeather freshness checks the original observation date.
2. Satellite irradiance is transported from its observation time to now using `clearSky(now) / clearSky(observation)`, with both solar elevations calculated at the configured coordinates by `suncalc2`. Both elevations and the current followthesun elevation must be at least 5°. The allowed ratio is 0.5–2; otherwise retain the raw reading but exclude it. This raises delayed sunrise-side values and lowers sunset-side values without guessing cloud movement. Solar-library errors affect only the satellite source.
3. PV at or above 590 W is considered clipped and excluded if another direct radiation estimate is available. It remains a labelled lower-bound fallback. OpenWeather's cloud heuristic is the last fallback, including when spike filtering leaves no usable radiation estimate.
4. Reject an isolated high spike until confirmed: it must exceed three times the next-highest source **and** differ by more than 5,000 lux. Confirmation requires a second distinct observation within 30 minutes, with raw irradiance within 35% (or 5 W/m²) of the preceding sample. Repeated polls of the same timestamp do not confirm it. A second high provider can corroborate a real rise immediately. With only one source, compare against its previous reading; a first-ever single source cannot be cross-checked and is labelled unverified. Spike evidence is in-memory and resets on script restart.
5. Calculate a continuous weighted central estimate from eligible sources. PV weight rises smoothly from 0.5 to 3 over altitude 5°–20° and incidence cosine 0–0.4. DWD weight is 1. Satellite weight declines with age towards 0.3. This removes the old binary PV weight jumps, median rejection, and two-source winner switches.
6. Calculate the interpolated ensemble quantile at `underestimationCost / (1 + underestimationCost)`. At the default cost of 9, three sources give **80% highest + 20% middle**; two give **90% highest + 10% lowest**. A single source supplies its own value. This is a heuristic ensemble quantile, not a 90% confidence guarantee.
7. Below 20,000 lux (highest eligible source), apply full upper preference. Between 20,000 and 40,000 lux, fade linearly to the central estimate. Never lower the central estimate when applying upper preference. OpenWeather and the PV lux diagnostic never add extra votes.
8. Apply the twilight floor described below. Accept validated rises immediately. For falls, decay the difference from the target with a **10-minute half-life**, using actual elapsed time. A decline cannot renew the history's expiry: retain it for at most 25 minutes and never past the contributing source/prerequisite freshness deadline. No-source cycles clear history and mark the result invalid. Fresh versioned smoothing history survives restarts; invalid, expired, malformed or incompatible history is ignored.
9. Write final W/m² with two decimal places. Lux is rounded to 1 lux below 100, 10 lux below 1,000, and 100 lux above that, so rounding does not erase the twilight model.

## Twilight and low-light settings

The twilight component is a **provisional, uncalibrated heuristic**, not a measured radiation source. It defaults to 400 lux at 0° solar altitude. Below the horizon it follows `400 × exp(altitude / 1.2)` with a smooth taper from −6° to −8°. Above the horizon it smoothly tapers away by +5°, acting only as a minimum floor. At −8° and below, this model writes zero and resets any remaining downward smoothing. It does not estimate moonlight or artificial lighting.

Below the horizon, daylight-source readings are excluded even if nonzero, since they can represent earlier sunlight. `source_count` is then 0, `.valid` is true for the completed model calculation, and status explicitly says twilight heuristic or modelled night. Near sunrise, a twilight floor can supply a model result even if the radiation sources are unavailable. `valid=true` means a usable model result, not confirmation by a sensor. If sun position is missing, no twilight floor is invented; available independent API estimates may still be used.

The final irradiance output includes the twilight equivalent through the same adjustable lux-per-W/m² conversion. This conversion is especially uncertain in twilight. Calibrate the curve against actual lux observations; do not treat the default 400 lux or the −8° cutoff as physical truths. Setting `twilightHorizonLux` to 0 disables the twilight floor.

| Setting                                          |         Default | Effect                                                                 |
| ------------------------------------------------ | --------------: | ---------------------------------------------------------------------- |
| `underestimationCost`                            |               9 | Relative cost of too-low estimates; larger means more upper preference |
| `lowLightFullLux` / `lowLightEndLux`             | 20,000 / 40,000 | Full preference threshold / end of transition                          |
| `declineHalfLifeMinutes`                         |              10 | Slower decreases; rises are immediate after validation                 |
| `historyMaxAgeMinutes`                           |              25 | Absolute upper limit on retained high history                          |
| `spikeRatio` / `spikeGapLux`                     |       3 / 5,000 | Both must be exceeded for spike confirmation                           |
| `satelliteMinAltitude`                           |              5° | Minimum elevation for stable time correction                           |
| `satelliteMinRatio` / `satelliteMaxRatio`        |         0.5 / 2 | Bounds for usable correction                                           |
| `twilightHorizonLux`                             |             400 | Provisional horizon brightness floor                                   |
| `twilightDecayDegrees`                           |            1.2° | Exponential decay scale below the horizon                              |
| `twilightEndAltitude` / `twilightDayEndAltitude` |       −8° / +5° | Modelled night / daylight end of floor                                 |

These are heuristic estimates, not calibrated measurements. Delayed satellite observations, regional forecasts and local PV shading can disagree. Temporal confirmation cannot detect a persistent faulty sensor on its own. Clipped PV is only approximately a lower bound because the original PV model also has uncertain assumptions.

For the next comparison, log the raw **and** corrected states, their observation timestamps and eligibility flags, sun altitude, the central/upper/target estimates, final output, and status. Export actual samples without interpolation.

No unverified public weather-station feed is scraped. Local RLP station radiation can be added once a working endpoint, units and timestamps are established.

## Sources and attribution

Weather/radiation data by [Open-Meteo](https://open-meteo.com/), using DWD and satellite products, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The public API is for non-commercial use. Display attribution alongside shared dashboards using these data.

- [DWD API](https://open-meteo.com/en/docs/dwd-api): modelled instantaneous global and diffuse radiation. Sample valid time does not mean a weather model was rerun at that moment.
- [Satellite API](https://open-meteo.com/en/docs/satellite-radiation-api): native-resolution, instantaneous GHI. In this region automatic satellite selection uses DWD MTG; observations arrive with delay. The script requests yesterday as well to handle midnight and skips future/null samples.
- [Haurwitz clear-sky model](https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.clearsky.haurwitz.html). The additional cloud-transmission formula is a rough fallback assumption; cloud fraction does not describe cloud thickness or whether the sun is obscured.

## Verification

Run `node test/outdoor-brightness-model.test.cjs` from the repository root. The tests cover collection failures and freshness, clipping, the exported morning/evening examples, low-light preference and its transition, continuous PV weights, spike confirmation, satellite correction and its horizon limits, asymmetric smoothing, expiry/restart behavior, twilight, and fallback operation.

The unchanged public API requests were checked successfully during the initial implementation. This revision has been tested with simulated ioBroker inputs; deployment in your ioBroker instance is still required.
