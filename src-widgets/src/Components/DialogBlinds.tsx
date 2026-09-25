/*
 * Copyright 2018-2025 Denis Haev <dogafox@gmail.com>
 *
 * Licensed under the Creative Commons Attribution-NonCommercial License, Version 4.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://creativecommons.org/licenses/by-nc/4.0/legalcode.txt
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import React, { Component, type CSSProperties, type MouseEventHandler, type TouchEventHandler } from 'react';

import { Dialog, DialogContent, DialogTitle, IconButton, Fab } from '@mui/material';

import { darken } from '@mui/system';

import {
    Stop as IconStop,
    KeyboardDoubleArrowUp as IconUp,
    KeyboardDoubleArrowDown as IconDown,
    Lightbulb as IconLamp,
    Close as CloseIcon,
} from '@mui/icons-material';

import { I18n } from '@iobroker/gui-components';
import { BlindSceneBackdrop, BlindSceneForeground } from './BlindsScene';

const styles: Record<string, CSSProperties> = {
    dialog: {
        maxWidth: '520px',
        width: 'calc(100vw - 28px)',
        margin: 14,
        maxHeight: 'calc(100% - 28px)',
        overflowX: 'hidden',
        overflowY: 'auto',
        borderRadius: 'var(--sh-radius-card, 22px)',
        background: 'var(--sh-surface, #2D4E63)',
        color: 'var(--sh-text, #F7FAFC)',
        boxShadow: 'var(--sh-shadow-card, 0 8px 24px rgba(23, 47, 64, 0.2))',
    },
    dialogContent: {
        padding: 0,
        background: 'var(--sh-surface, #2D4E63)',
        overflow: 'visible',
    },
    dialogTitle: {
        minHeight: 64,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        padding: '8px 64px',
        textAlign: 'center',
        color: 'var(--sh-text, #F7FAFC)',
        background: 'var(--sh-surface-2, #365B73)',
    },
    sceneStack: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        gap: 0,
        background: 'var(--sh-surface, #2D4E63)',
    },
    sliderText: {
        fontSize: '1.2rem',
        fontWeight: 600,
        lineHeight: 1.2,
    },
    sliderStyle: {
        position: 'relative',
        zIndex: 11,
        width: '100%',
        height: '100%',
        borderRadius: 0,
        overflow: 'hidden',
        background: 'transparent',
        cursor: 'pointer',
        boxShadow: 'none',
        boxSizing: 'border-box',
        touchAction: 'none',
    },
    scene: {
        position: 'relative',
        flex: '0 0 auto',
        width: 'min(100%, 47vh)',
        maxWidth: '520px',
        aspectRatio: '1024 / 1378',
        overflow: 'hidden',
        isolation: 'isolate',
        background: 'var(--sh-blind-scene-background, #477592)',
    },
    blindWindow: {
        position: 'absolute',
        // The glass spans x=156..862 and y=156..1089 in the cropped 1024 x 1378 scene.
        left: '15.234375%',
        right: '15.8203125%',
        top: '11.3207547%',
        bottom: '20.9724238%',
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        borderRadius: '14.73% / 11.15%',
        overflow: 'hidden',
    },
    sceneControls: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        width: '100%',
        boxSizing: 'border-box',
        padding: '14px 18px 18px',
        background: 'var(--sh-surface, #2D4E63)',
    },
    controlButton: {
        width: 64,
        height: 60,
        flex: '1 1 0',
        maxWidth: 112,
        minWidth: 56,
        borderRadius: 'var(--sh-radius-control, 14px)',
        color: 'var(--sh-text, #F7FAFC)',
        background: 'var(--sh-surface-2, #365B73)',
        boxShadow: 'var(--sh-shadow-control, 0 4px 12px rgba(23, 47, 64, 0.18))',
    },
    stopButton: {
        width: 64,
        height: 60,
        flex: '1 1 0',
        maxWidth: 112,
        minWidth: 56,
        borderRadius: 'var(--sh-radius-control, 14px)',
        color: 'var(--sh-primary-contrast, #172F40)',
        background: 'var(--sh-error, #F5BCB7)',
        boxShadow: 'var(--sh-shadow-control, 0 4px 12px rgba(23, 47, 64, 0.18))',
    },
};

const LAMP_ON_COLOR = '#c7c70e';

interface DialogBlindsProps {
    onClose: () => void;
    onStop?: () => void;
    onToggle?: () => void;
    onValueChange: (value: number, isCommitment?: boolean) => void;
    startValue: number;
    startToggleValue?: boolean;
    type: number;
    unit?: string;
    background?: string;
    controlTimeout?: number;
}

interface DialogBlindsState {
    value: number;
    toggleValue: boolean;
    lastControl: number;
}

export default class DialogBlinds extends Component<DialogBlindsProps, DialogBlindsState> {
    static types = {
        value: 0,
        dimmer: 1,
        blinds: 2,
    };
    static mouseDown = false;
    private button: {
        name: string;
        time: number;
        timer: ReturnType<typeof setTimeout> | null;
        timeUp: number;
    } = {
        time: 0,
        name: '',
        timer: null,
        timeUp: 0,
    };
    private readonly refSlider: React.RefObject<HTMLDivElement | null> = React.createRef();
    private readonly type: number;
    private top: number | undefined = undefined;
    private height: number | undefined = undefined;
    private controlTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: DialogBlindsProps) {
        super(props);
        this.state = {
            value: this.props.startValue || 0,
            toggleValue: this.props.startToggleValue || false,
            lastControl: 0,
        };
        this.type = this.props.type || DialogBlinds.types.dimmer;
    }

    static getDerivedStateFromProps(
        nextProps: DialogBlindsProps,
        state: DialogBlindsState,
    ): Partial<DialogBlindsState> | null {
        let newState: Partial<DialogBlindsState> | null = null;
        if (nextProps.startValue !== state.value && !DialogBlinds.mouseDown && Date.now() - state.lastControl > 1000) {
            newState = {};
            newState.value = nextProps.startValue;
        }
        if (nextProps.startToggleValue !== undefined && nextProps.startToggleValue !== state.toggleValue) {
            newState ||= {};
            newState.toggleValue = nextProps.startToggleValue;
        }
        return newState || null;
    }

    eventToValue(e: MouseEvent & TouchEvent): void {
        const pageY = e.touches ? e.touches[e.touches.length - 1].clientY : e.clientY;

        let value = 100 - Math.round(((pageY - this.top!) / this.height!) * 100);

        if (value > 100) {
            value = 100;
        } else if (value < 0) {
            value = 0;
        }
        this.setState({ value });

        if (Date.now() - this.state.lastControl > 200 && this.type !== DialogBlinds.types.blinds) {
            this.setState({ lastControl: Date.now() }, () => this.onValueChanged(value));
        }
    }

    onMouseMove = (e: MouseEvent & TouchEvent): void => {
        if (DialogBlinds.mouseDown) {
            e.preventDefault();
            e.stopPropagation();
            this.eventToValue(e);
        }
    };

    onMouseDown = (e: MouseEvent & TouchEvent): void => {
        e.preventDefault();
        e.stopPropagation();

        if (!this.refSlider.current) {
            return;
        }
        const { top, height } = this.refSlider.current.getBoundingClientRect();
        if (!height) {
            return;
        }
        this.top = top;
        this.height = height;

        DialogBlinds.mouseDown = true;
        this.eventToValue(e);

        window.document.addEventListener('mousemove', this.onMouseMove as EventListener, {
            passive: false,
            capture: true,
        });
        window.document.addEventListener('mouseup', this.onMouseUp as EventListener, { passive: false, capture: true });
        window.document.addEventListener('touchmove', this.onMouseMove as EventListener, {
            passive: false,
            capture: true,
        });
        window.document.addEventListener('touchend', this.onMouseUp as EventListener, {
            passive: false,
            capture: true,
        });
    };

    onValueChanged(value: number): void {
        if (this.props.controlTimeout) {
            if (this.controlTimer) {
                clearTimeout(this.controlTimer);
                this.controlTimer = null;
            }
            this.controlTimer = setTimeout(() => {
                this.props.onValueChange?.(value);
            }, this.props.controlTimeout);
        } else {
            this.props.onValueChange?.(value);
        }
    }

    onMouseUp = (e: MouseEvent & TouchEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        if (DialogBlinds.mouseDown) {
            DialogBlinds.mouseDown = false;
            window.document.removeEventListener(
                'mousemove',
                this.onMouseMove as EventListener,
                { passive: false, capture: true } as EventListenerOptions,
            );
            window.document.removeEventListener(
                'mouseup',
                this.onMouseUp as EventListener,
                { passive: false, capture: true } as EventListenerOptions,
            );
            window.document.removeEventListener(
                'touchmove',
                this.onMouseMove as EventListener,
                { passive: false, capture: true } as EventListenerOptions,
            );
            window.document.removeEventListener(
                'touchend',
                this.onMouseUp as EventListener,
                { passive: false, capture: true } as EventListenerOptions,
            );
        }

        this.setState({ lastControl: Date.now() }, () => {
            this.props.onValueChange?.(this.state.value, true);
        });
    };

    componentWillUnmount(): void {
        // document.getElementById('root').className = ``;
        if (DialogBlinds.mouseDown) {
            DialogBlinds.mouseDown = false;
            window.document.removeEventListener(
                'mousemove',
                this.onMouseMove as EventListener,
                { passive: false, capture: true } as EventListenerOptions,
            );
            window.document.removeEventListener(
                'mouseup',
                this.onMouseUp as EventListener,
                { passive: false, capture: true } as EventListenerOptions,
            );
            window.document.removeEventListener(
                'touchmove',
                this.onMouseMove as EventListener,
                { passive: false, capture: true } as EventListenerOptions,
            );
            window.document.removeEventListener(
                'touchend',
                this.onMouseUp as EventListener,
                { passive: false, capture: true } as EventListenerOptions,
            );
        }
    }

    getTopButtonName(): React.ReactNode {
        switch (this.props.type) {
            case DialogBlinds.types.blinds:
                return <IconUp style={{ width: 26, height: 26 }} />;

            case DialogBlinds.types.dimmer:
                return <IconLamp style={{ color: LAMP_ON_COLOR, width: 20, height: 20 }} />;

            default:
                return I18n.t('ON');
        }
    }

    getBottomButtonName(): React.ReactNode {
        switch (this.props.type) {
            case DialogBlinds.types.blinds:
                return <IconDown style={{ width: 26, height: 26 }} />;

            case DialogBlinds.types.dimmer:
                return <IconLamp style={{ width: 20, height: 20 }} />;

            default:
                return I18n.t('OFF');
        }
    }

    onButtonDown(e: React.MouseEvent, buttonName: string): void {
        e?.stopPropagation();
        if (Date.now() - this.button.time < 50) {
            return;
        }
        if (this.button.timer) {
            clearTimeout(this.button.timer);
        }
        this.button.name = buttonName;
        this.button.time = Date.now();
        this.button.timer = setTimeout(() => {
            this.button.timer = null;
            let value: number | undefined = undefined;
            switch (this.button.name) {
                case 'top':
                    value = 100;
                    break;

                case 'bottom':
                    value = 0;
                    break;

                default:
                    break;
            }
            if (value !== undefined) {
                this.setState({ value }, () => this.props.onValueChange?.(value, true));
            }
        }, 400);
    }

    getSliderColor(): string | undefined {
        if (this.props.type === DialogBlinds.types.blinds) {
            return undefined;
        }

        if (this.props.type === DialogBlinds.types.dimmer) {
            const val = this.state.value;
            return darken(LAMP_ON_COLOR, 1 - (val / 70 + 0.3));
        }

        return '#888';
    }

    getValueText(): string {
        let unit = '%';
        if (this.props.type !== DialogBlinds.types.blinds && this.props.type !== DialogBlinds.types.dimmer) {
            unit = this.props.unit || '';
        }

        return this.state.value + unit;
    }

    getToggleButton(): React.ReactNode {
        if (!this.props.onToggle) {
            return null;
        }
        return (
            <Fab
                onClick={this.props.onToggle}
                className="dimmer-button"
                style={styles.controlButton}
            >
                <IconLamp />
            </Fab>
        );
    }

    getStopButton(): React.ReactNode {
        return (
            <Fab
                style={styles.stopButton}
                size="large"
                onClick={this.props.onStop}
                disabled={!this.props.onStop}
                aria-label={I18n.t('stop')}
                title={I18n.t('stop')}
            >
                <IconStop />
            </Fab>
        );
    }

    generateContent(): React.ReactNode {
        const sliderStyle: CSSProperties = {
            position: 'absolute',
            width: '100%',
            left: 0,
            height: `${this.props.type === DialogBlinds.types.blinds ? 100 - this.state.value : this.state.value}%`,
            background: this.props.background || this.getSliderColor(),
            transitionProperty: 'height',
            transitionDuration: '0.1s',
        };

        const handlerStyle: CSSProperties = {
            position: 'absolute',
            width: '2.4em',
            height: '0.25em',
            left: 'calc(50% - 1.2em)',
            background: 'var(--sh-text, #F7FAFC)',
            borderRadius: '1em',
        };

        if (this.props.type === DialogBlinds.types.blinds) {
            sliderStyle.top = 0;
            handlerStyle.bottom = '0.4em';
            sliderStyle.backgroundImage =
                'repeating-linear-gradient(to bottom, var(--sh-blind-scene-slat-line, #888888) 0 2px, var(--sh-blind-scene-slat, #C9C9C9) 2px 20px)';
            sliderStyle.backgroundSize = '100% 20px';
            sliderStyle.backgroundPosition = 'center bottom';
        } else {
            sliderStyle.bottom = 0;
            handlerStyle.top = '0.4em';
        }

        const blindStyle: CSSProperties = {
            ...styles.sliderStyle,
            width: '100%',
            height: '100%',
            background: 'transparent',
            boxShadow: 'none',
            borderRadius: 0,
            overflow: 'hidden',
        };

        return (
            <div
                className="vis-2-slider-wrapper"
                style={styles.sceneStack}
            >
                <div style={styles.scene}>
                    <BlindSceneBackdrop />
                    <div style={styles.blindWindow}>
                        <div
                            className="vis-2-slider-blind"
                            ref={this.refSlider}
                            onMouseDown={this.onMouseDown as unknown as MouseEventHandler}
                            onTouchStart={this.onMouseDown as unknown as TouchEventHandler}
                            onClick={e => e.stopPropagation()}
                            style={blindStyle}
                        >
                            <div
                                style={sliderStyle}
                                className="vis-2-slider-inside"
                            >
                                <div
                                    style={handlerStyle}
                                    className="vis-2-slider-handler"
                                />
                            </div>
                        </div>
                    </div>
                    <BlindSceneForeground />
                </div>
                <div style={styles.sceneControls}>
                    <Fab
                        style={styles.controlButton}
                        size="large"
                        onClick={e => this.onButtonDown(e, 'top')}
                        aria-label="Open blinds"
                        title="Open blinds"
                    >
                        {this.getTopButtonName()}
                    </Fab>
                    {this.getStopButton()}
                    <Fab
                        style={styles.controlButton}
                        size="large"
                        onClick={e => this.onButtonDown(e, 'bottom')}
                        aria-label="Close blinds"
                        title="Close blinds"
                    >
                        {this.getBottomButtonName()}
                    </Fab>
                </div>
                {this.getToggleButton()}
            </div>
        );
    }

    render(): React.ReactNode {
        return (
            <Dialog
                open={!0}
                onClose={() => this.props.onClose()}
                slotProps={{ paper: { style: styles.dialog } }}
            >
                <DialogTitle style={styles.dialogTitle}>
                    <div style={styles.sliderText}>{this.getValueText()}</div>
                    <IconButton
                        onClick={() => this.props.onClose()}
                        aria-label={I18n.t('close')}
                        style={{
                            position: 'absolute',
                            right: 8,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--sh-text, #F7FAFC)',
                        }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent style={styles.dialogContent}>{this.generateContent()}</DialogContent>
            </Dialog>
        );
    }
}
