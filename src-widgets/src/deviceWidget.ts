import Generic from './Generic';
import type { SingleWidget, WidgetStyle, DetectorDevice } from '@iobroker/types-vis-2';
import { createOpenWeatherMapBindings } from './WeatherUtils';

export function getDeviceWidget(device: DetectorDevice): null | SingleWidget {
    const style: WidgetStyle = {
        left: '0px',
        top: '0px',
        width: '100%',
        position: 'relative',
    };

    if (device.deviceType === 'thermostat') {
        const set = device.states.find(state => state.name === 'SET')!;
        const actual = device.states.find(state => state.name === 'ACTUAL');
        const mode = device.states.find(state => state.name === 'MODE');
        const power = device.states.find(state => state.name === 'POWER');
        const party = device.states.find(state => state.name === 'PARTY');
        const boost = device.states.find(state => state.name === 'BOOST');
        style.height = 160;

        const widget: SingleWidget = {
            tpl: 'tplNils2Thermostat',
            style,
            widgetSet: 'vis-2-widgets-nils-fork',
            data: {
                name: Generic.getText(device.common.name),
                widgetTitle: Generic.t(device.deviceType).replace('vis_2_widgets_nils_', ''),
                wizardId: device._id,
                step: (set.common as ioBroker.StateCommon).step === 0.5 ? '0.5' : '1',
                g_common: true,
                count: 5,
                'oid-temp-set': set?._id || '',
                'oid-temp-actual': actual?._id || '',
                'oid-power': power?._id || '',
                'oid-mode': mode?._id || '',
                'oid-boost': boost?._id || '',
                'oid-party': party?._id || '',
            },
        };
        const modeState: ioBroker.StateCommon | undefined = mode?.common as ioBroker.StateCommon;
        if (modeState?.states) {
            if (Array.isArray(modeState.states)) {
                const states: Record<string, string> = {};
                modeState.states.forEach(key => (states[key] = key));
                modeState.states = states;
            }
            widget.data.count = Object.keys(modeState.states).length;
            Object.keys(modeState.states).forEach((_mode, index) => {
                widget.data[`g_modes-${index}`] = true;
                widget.data[`title${index}`] = (modeState.states as Record<string, string>)[_mode]
                    .toString()
                    .toUpperCase();
            });
        }

        return widget;
    }

    if (device.deviceType === 'blind') {
        const set = device.states.find(state => state.name === 'SET');
        style.width = '40px';
        style.height = 40;
        return {
            tpl: 'tplNils2Blinds',
            widgetSet: 'vis-2-widgets-nils-fork',
            style,
            data: {
                name: Generic.getText(device.common.name),
                widgetTitle: Generic.t(device.deviceType).replace('vis_2_widgets_nils_', ''),
                wizardId: device._id,
                sashCount: 1,
                g_common: true,
                ratio: 1,
                borderWidth: 3,
                oid: set?._id,
            },
        };
    }

    if (device.deviceType === 'temperature') {
        const actual = device.states.find(state => state.name === 'ACTUAL');
        const humidity = device.states.find(state => state.name === 'SECOND');
        return {
            tpl: 'tplNils2Actual',
            style,
            widgetSet: 'vis-2-widgets-nils-fork',
            data: {
                name: Generic.getText(device.common.name),
                widgetTitle: Generic.t(device.deviceType).replace('vis_2_widgets_nils_', ''),
                wizardId: device._id,
                timeInterval: 12,
                updateInterval: 60,
                'oid-main': actual?._id,
                'oid-secondary': humidity?._id,
            },
        };
    }

    if (device.deviceType === 'weatherForecast') {
        const idParts = device._id.split('.');
        const instance =
            idParts[0] === 'openweathermap' && idParts[1] ? `${idParts[0]}.${idParts[1]}` : 'openweathermap.0';
        return {
            tpl: 'tplNils2Weather',
            style,
            widgetSet: 'vis-2-widgets-nils-fork',
            data: {
                name: Generic.getText(device.common.name),
                widgetTitle: Generic.t(device.deviceType).replace('vis_2_widgets_nils_', ''),
                wizardId: device._id,
                g_common: true,
                instance,
                locationName: '',
                oidTemperatureOverride: '',
                forecastDays: 2,
                temperatureDigits: 0,
                ...createOpenWeatherMapBindings(instance),
            },
        };
    }

    // The multi-view wizard only adds device types with a dedicated widget.
    return null;
}
