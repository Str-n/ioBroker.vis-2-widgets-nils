const DAY_COUNT = 2;

export type OpenWeatherMapBindings = Record<string, string>;

/** Build the state bindings exposed by ioBroker.openweathermap 0.2.x. */
export function createOpenWeatherMapBindings(instance = 'openweathermap.0'): OpenWeatherMapBindings {
    const root = `${instance || 'openweathermap.0'}.forecast`;
    const current = `${root}.current`;
    const bindings: OpenWeatherMapBindings = {
        oidCurrentTemperature: `${current}.temperature`,
        oidCurrentTemperatureMin: `${root}.day0.temperatureMin`,
        oidCurrentTemperatureMax: `${root}.day0.temperatureMax`,
        oidCurrentDescription: `${current}.state`,
        oidCurrentIcon: `${current}.icon`,
        oidCurrentPrecipitation: `${root}.day0.precipitation`,
        oidCurrentWindSpeed: `${current}.windSpeed`,
    };

    for (let day = 1; day <= DAY_COUNT; day++) {
        const dayRoot = `${root}.day${day - 1}`;
        bindings[`oidDay${day}Date`] = `${dayRoot}.date`;
        bindings[`oidDay${day}Icon`] = `${dayRoot}.icon`;
        bindings[`oidDay${day}Description`] = `${dayRoot}.state`;
        bindings[`oidDay${day}TemperatureMin`] = `${dayRoot}.temperatureMin`;
        bindings[`oidDay${day}TemperatureMax`] = `${dayRoot}.temperatureMax`;
        bindings[`oidDay${day}Precipitation`] = `${dayRoot}.precipitation`;
    }

    return bindings;
}
