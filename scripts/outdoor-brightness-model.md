# Outdoor brightness model for ioBroker

Paste `outdoor-brightness-model.js` into a **second, normal JavaScript script** and enable it. Keep the original PV script running. Requires javascript adapter 7.9 or newer and outbound HTTPS; no additional packages or API keys.

Set `MODEL.latitude` and `MODEL.longitude` to your location. The defaults, 50.45 / 7.43, are approximate coordinates near 56567. The two free API requests run immediately and every ten minutes, 20 seconds after the PV script's scheduled update. OpenWeather is read from your existing adapter, with no additional OpenWeather requests.

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

Individual sources are stored under `0_userdata.0.sunlight.sources.<source>`:

| Source        | Input                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- |
| `pv`          | Existing PV estimate, inverter power and sun position                                       |
| `dwd`         | Open-Meteo DWD current model radiation                                                      |
| `satellite`   | Latest available Open-Meteo satellite radiation observation                                 |
| `openweather` | Existing OpenWeather cloud percentage and observation date, combined with a clear-sky model |

Each has `.irradiance` (W/m²), `.estimated` (lux), `.timestamp` (source time in Unix milliseconds), `.age_minutes`, `.available`, `.used`, `.status`, and `.details` (JSON). DWD diffuse radiation, PV power/clipping/original lux, and OpenWeather cloud percentage/clear-sky radiation are included in `.details`.

If a source fails, its previous numeric values, timestamp and details remain for inspection; `.available` and `.used` become false and `.status` explains why. The stored age is the age when that sample was last successfully checked; use `.timestamp` to calculate its current age. Old source values never enter the next calculation. If every source fails, combined values remain unchanged, their timestamps do not advance, and `.valid` is false. Consumers should check `.valid` and the output timestamp.

## Combination rules

1. Reject missing/non-numeric values, bad ioBroker quality, unexpected API units, future/stale timestamps, and irradiance outside 0–1600 W/m². Zero is a valid reading; null is not.
2. Local inputs expire after 25 minutes, satellite observations after 50 minutes, and OpenWeather after 120 minutes. OpenWeather freshness checks its **observation date**, not just the adapter's last state write.
3. PV at or above 590 W is considered clipped and excluded when other radiation sources are available. It remains a labelled lower-bound fallback if only PV and the cloud heuristic are available.
4. With three eligible radiation estimates, reject values outside a median-based tolerance: `max(100 W/m², 50% of median, 3 × 1.4826 × MAD)`. MAD is the median absolute deviation. These intentionally broad, adjustable thresholds avoid reacting to small differences.
5. With two conflicting sources, there is insufficient evidence to identify an outlier. Select the source with the higher configured reliability and report disagreement. Otherwise calculate a weighted mean: PV weight 3 (0.5 at low sun or grazing incidence), DWD weight 1, satellite weight declining from 1 towards 0.3 with age. Ties prefer the newer sample.
6. The OpenWeather cloud heuristic is a last fallback; it does not add a vote to the stronger radiation sources. Lux and irradiance from the same source are never counted twice.
7. Convert combined irradiance using 120 lux per W/m² and the adjustable lux calibration. Round to whole W/m² and 100 lux. At/below the horizon report zero; twilight and artificial light are not modelled.

These are heuristic estimates, not calibrated measurements or statistical confidence bounds. Delayed satellite observations and regional forecasts can disagree with real clouds at the house; consensus can also reject a correct local reading. Clipped PV is only approximately a lower bound because the original PV model itself has uncertain assumptions. Review source histories before tightening thresholds.

No unverified public weather-station feed is scraped. Local RLP station radiation can be added once a working endpoint, units and timestamps are established.

## Sources and attribution

Weather/radiation data by [Open-Meteo](https://open-meteo.com/), using DWD and satellite products, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The public API is for non-commercial use. Display attribution alongside shared dashboards using these data.

- [DWD API](https://open-meteo.com/en/docs/dwd-api): modelled instantaneous global and diffuse radiation. Sample valid time does not mean a weather model was rerun at that moment.
- [Satellite API](https://open-meteo.com/en/docs/satellite-radiation-api): native-resolution, instantaneous GHI. In this region automatic satellite selection uses DWD MTG; observations arrive with delay. The script requests yesterday as well to handle midnight and skips future/null samples.
- [Haurwitz clear-sky model](https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.clearsky.haurwitz.html). The additional cloud-transmission formula is a rough fallback assumption; cloud fraction does not describe cloud thickness or whether the sun is obscured.

## Verification

Run `node test/outdoor-brightness-model.test.cjs` from the repository root. The mocked ioBroker tests cover output separation, missing/null/zero data, freshness, bad units, malformed API responses, network failures, clipping, outliers, disagreement, night, and fallback operation.

Both actual public API requests were also checked successfully from the development environment. Deployment in your ioBroker instance is still required.
