import React, { useEffect, useState } from 'react';
import { Alert, FormControlLabel, Switch, Typography } from '@mui/material';
import type { VisRxWidgetProps } from '@iobroker/types-vis-2';
import Generic from '../Generic';

export interface BlindControlSettingsProps {
    enabledOid?: string;
    socket?: VisRxWidgetProps['context']['socket'];
}

interface StateSwitchProps {
    oid?: string;
    socket: NonNullable<BlindControlSettingsProps['socket']>;
    label: string;
    description: string;
}

function StateSwitch({ oid, socket, label, description }: StateSwitchProps): React.JSX.Element {
    const [enabled, setEnabled] = useState<boolean | undefined>();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!oid || oid === 'nothing_selected' || !socket) {
            return;
        }
        let active = true;
        let received = false;
        const update = (_id: string, state: ioBroker.State | null | undefined): void => {
            if (!active) {
                return;
            }
            received = true;
            if (state && !state.ack) {
                return;
            }
            setEnabled(typeof state?.val === 'boolean' ? state.val : undefined);
            setPending(false);
            setError(typeof state?.val !== 'boolean');
        };
        void (async () => {
            try {
                await socket.subscribeState(oid, update);
                if (!active) {
                    socket.unsubscribeState(oid, update);
                    return;
                }
                const state = await socket.getState(oid);
                if (!received) {
                    update(oid, state);
                }
            } catch {
                if (active) {
                    setError(true);
                }
            }
        })();
        return () => {
            active = false;
            socket.unsubscribeState(oid, update);
        };
    }, [oid, socket]);

    useEffect(() => {
        if (!pending) {
            return;
        }
        const timer = setTimeout(() => {
            setPending(false);
            setError(true);
        }, 10000);
        return () => clearTimeout(timer);
    }, [pending]);

    return (
        <>
            <FormControlLabel
                label={label}
                control={
                    <Switch
                        checked={enabled === true}
                        disabled={enabled === undefined || pending}
                        slotProps={{ input: { 'aria-label': label } }}
                        onChange={async (_event, value) => {
                            if (!oid) {
                                return;
                            }
                            setPending(true);
                            setError(false);
                            try {
                                await socket.setState(oid, { val: value, ack: false });
                            } catch {
                                setPending(false);
                                setError(true);
                            }
                        }}
                    />
                }
            />
            <Typography variant="body2">{description}</Typography>
            {error ? <Alert severity="error">{Generic.t('blind_control_error')}</Alert> : null}
        </>
    );
}

export default function BlindControlSettings({ enabledOid, socket }: BlindControlSettingsProps): React.JSX.Element {
    if (!enabledOid || enabledOid === 'nothing_selected' || !socket) {
        return <Typography variant="body2">{Generic.t('blind_control_not_configured')}</Typography>;
    }
    const morningOid = enabledOid.endsWith('.enabled')
        ? enabledOid.replace(/\.enabled$/, '.autoOpenMorning')
        : undefined;

    return (
        <>
            <StateSwitch
                key={enabledOid}
                oid={enabledOid}
                socket={socket}
                label={Generic.t('blind_control_enabled')}
                description={Generic.t('blind_control_description')}
            />
            <div style={{ marginTop: 12 }}>
                <StateSwitch
                    key={morningOid || 'unmapped-morning'}
                    oid={morningOid}
                    socket={socket}
                    label={Generic.t('blind_control_auto_open_morning')}
                    description={Generic.t('blind_control_auto_open_morning_description')}
                />
            </div>
        </>
    );
}
