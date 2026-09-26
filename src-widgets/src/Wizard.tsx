import React from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    LinearProgress,
    TextField,
} from '@mui/material';
import { Add, Close, ExpandMore, Lightbulb, QuestionMark } from '@mui/icons-material';
import { Icon } from '@iobroker/gui-components';

import Generic from './Generic';
import { getDeviceWidget } from './deviceWidget';
import type {
    VisRxWidgetState,
    AnyWidgetId,
    CustomPaletteProperties,
    DetectorResult,
    Project,
    RxWidgetInfo,
    SingleWidgetId,
} from '@iobroker/types-vis-2';

interface WizardDialogProps extends CustomPaletteProperties {
    onClose: () => void;
}

interface WizardDialogState {
    rooms: DetectorResult[] | null;
    devicesChecked: Record<string, boolean>;
    roomsChecked: Record<string, boolean>;
}

class WizardDialog extends React.Component<WizardDialogProps, WizardDialogState> {
    constructor(props: WizardDialogProps) {
        super(props);
        this.state = {
            rooms: null,
            devicesChecked: {},
            roomsChecked: {},
        };
    }

    componentDidMount(): void {
        void (async () => {
            let _rooms: DetectorResult[] = (await this.props.helpers?.detectDevices(this.props.socket)) || [];
            // ignore buttons
            _rooms.forEach(room => {
                room.devices = room.devices.filter(
                    device => device.common.role !== 'button' && getDeviceWidget(device),
                );
            });
            // ignore empty rooms
            _rooms = _rooms.filter(room => room.devices.length);

            // Fix names
            _rooms.forEach(room => {
                room.devices.forEach(device => {
                    // Device.Name.Room => Device Name Room
                    device.common.name = (Generic.getText(device.common.name) || '').replace(/\./g, ' ').trim();
                    // delete room name from device name
                    if (device.roomName) {
                        device.common.name = device.common.name.replace(Generic.getText(device.roomName), '').trim();
                    }
                });
            });

            const _devicesChecked: Record<string, boolean> = {};
            const _roomsChecked: Record<string, boolean> = {};
            _rooms.forEach(room => {
                _roomsChecked[room._id] = true;
                room.devices.forEach(device => {
                    _devicesChecked[device._id] = true;
                });
            });
            this.setState({ rooms: _rooms, devicesChecked: _devicesChecked, roomsChecked: _roomsChecked });
        })();
    }

    handleSubmit = (): void => {
        const { rooms, roomsChecked, devicesChecked } = this.state;
        const project: Project = JSON.parse(JSON.stringify(this.props.project));
        let newKey = this.props.helpers?.getNewWidgetIdNumber(false, project) || 1000;
        let changed = false;
        let firstCreatedRoom = '';
        rooms!.forEach(room => {
            if (
                !roomsChecked[room._id] ||
                !room.devices.length ||
                !room.devices.find(device => devicesChecked[device._id])
            ) {
                return;
            }
            let viewId = Generic.getText(room.common.name);
            {
                // try to find existing view
                const projectView = Object.keys(project).find(view => project[view].settings?.wizardId === room._id);

                if (projectView) {
                    viewId = projectView;
                } else if (project[viewId]) {
                    project[viewId].settings!.wizardId = room._id;
                } else {
                    // create a new view
                    project[viewId] = {
                        name: Generic.getText(room.common.name),
                        parentId: undefined,
                        settings: {
                            style: {},
                            wizardId: room._id,
                        },
                        rerender: false,
                        filterList: [],
                        widgets: {},
                        activeWidgets: [],
                    };
                    if (room.common.icon?.startsWith('data:image')) {
                        project[viewId].settings!.navigationIcon = room.common.icon;
                    }
                    if (room.common.color) {
                        project[viewId].settings!.navigationBackground = room.common.color;
                    }

                    // add new view to opened views
                    if (project.___settings.openedViews && !project.___settings.openedViews.includes(viewId)) {
                        project.___settings.openedViews.push(viewId);
                    }
                }
                firstCreatedRoom = firstCreatedRoom || viewId;

                // create widgets for every room
                room.devices.forEach(device => {
                    if (!devicesChecked[device._id]) {
                        return;
                    }

                    const projectWidget = Object.keys(project[viewId].widgets).find(
                        _widget => project[viewId].widgets?.[_widget as AnyWidgetId].data?.wizardId === device._id,
                    );

                    if (!projectWidget) {
                        const widget = getDeviceWidget(device);
                        if (widget) {
                            changed = true;
                            const widgetId: SingleWidgetId = `w${newKey.toString().padStart(6, '0')}`;
                            project[viewId].widgets[widgetId] = widget;
                            newKey++;
                        } else {
                            console.warn(
                                `Cannot find widget for ${device._id} (${JSON.stringify(device.common.name)})`,
                            );
                        }
                    } else {
                        // merge ??
                    }
                });
            }
        });

        changed && this.props.changeProject(project);
        if (changed && firstCreatedRoom) {
            setTimeout(() => {
                // open first created room
                this.props.changeView?.(firstCreatedRoom);
            }, 100);
        }
        this.props.onClose();
    };

    render(): React.ReactNode {
        const { rooms, roomsChecked, devicesChecked } = this.state;
        const allChecked = rooms?.every(room => roomsChecked[room._id]);
        const anyChecked = rooms?.some(room => roomsChecked[room._id]);
        const counters =
            rooms?.map(room => room.devices.reduce((a, b) => a + (devicesChecked[b._id] ? 1 : 0), 0)) || [];

        return (
            <Dialog
                key="materialWizardDialog"
                open={!0}
                onClose={this.props.onClose}
                fullWidth
                sx={{
                    '& .MuiDialog-paper': {
                        maxHeight: 'calc(100% - 80px)',
                        height: 'calc(100% - 80px)',
                    },
                }}
            >
                <DialogTitle>{Generic.t('Wizard')}</DialogTitle>
                <DialogContent style={{ height: '100%', overflowY: 'hidden' }}>
                    {rooms ? (
                        <div style={{ height: '100%', overflowY: 'hidden' }}>
                            <div style={{ marginLeft: 26 }}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            indeterminate={!allChecked && anyChecked}
                                            checked={allChecked}
                                            onChange={() => {
                                                const _roomsChecked = JSON.parse(JSON.stringify(roomsChecked));
                                                rooms.forEach(room => (_roomsChecked[room._id] = !allChecked));
                                                this.setState({ roomsChecked: _roomsChecked });
                                            }}
                                        />
                                    }
                                    label={allChecked ? Generic.t('Unselect all rooms') : Generic.t('Select all rooms')}
                                />
                            </div>
                            <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto' }}>
                                {!rooms.length ? <div>{Generic.t('Nothing detected')}</div> : null}
                                {rooms.map((room, roomId) => (
                                    <div key={room._id}>
                                        <Accordion>
                                            <AccordionSummary expandIcon={<ExpandMore />}>
                                                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                                    <Checkbox
                                                        checked={roomsChecked[room._id]}
                                                        onChange={e => {
                                                            const _roomsChecked = JSON.parse(
                                                                JSON.stringify(roomsChecked),
                                                            );
                                                            _roomsChecked[room._id] = e.target.checked;
                                                            this.setState({ roomsChecked: _roomsChecked });
                                                        }}
                                                        onClick={e => e.stopPropagation()}
                                                    />

                                                    {room.common.icon ? (
                                                        room.common.icon === '?' ? (
                                                            <QuestionMark
                                                                style={{ width: 24, height: 24, marginRight: 8 }}
                                                            />
                                                        ) : (
                                                            <Icon
                                                                src={room.common.icon}
                                                                style={{ width: 24, height: 24, marginRight: 8 }}
                                                                alt=""
                                                            />
                                                        )
                                                    ) : null}

                                                    <div style={{ flexGrow: 1 }}>
                                                        {Generic.getText(room.common.name)}
                                                    </div>

                                                    <Checkbox
                                                        title={Generic.t('Select/Unselect all devices in room')}
                                                        indeterminate={
                                                            counters[roomId] !== room.devices.length &&
                                                            !!counters[roomId]
                                                        }
                                                        checked={counters[roomId] === room.devices.length}
                                                        disabled={!roomsChecked[room._id]}
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            const _devicesChecked = JSON.parse(
                                                                JSON.stringify(devicesChecked),
                                                            );
                                                            if (counters[roomId] === room.devices.length) {
                                                                room.devices.forEach(device => {
                                                                    _devicesChecked[device._id] = false;
                                                                });
                                                            } else {
                                                                room.devices.forEach(device => {
                                                                    _devicesChecked[device._id] = true;
                                                                });
                                                            }
                                                            this.setState({ devicesChecked: _devicesChecked });
                                                        }}
                                                    />
                                                    <div
                                                        style={{
                                                            fontSize: 12,
                                                            opacity: 0.7,
                                                            marginLeft: 20,
                                                            minWidth: 200,
                                                        }}
                                                    >
                                                        {Generic.t(
                                                            '%s of %s devices selected',
                                                            counters[roomId]?.toString() || '0',
                                                            room.devices.length.toString(),
                                                        )}
                                                    </div>
                                                </div>
                                            </AccordionSummary>
                                            <AccordionDetails
                                                style={{
                                                    backgroundColor: this.props.themeType === 'dark' ? '#111' : '#eee',
                                                }}
                                            >
                                                {room.devices.map((device, deviceId) => (
                                                    <div
                                                        key={device._id}
                                                        style={{ backgroundColor: 'transparent' }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                marginLeft: 20,
                                                                marginBottom: 20,
                                                                opacity: roomsChecked[room._id] ? 1 : 0.5,
                                                            }}
                                                        >
                                                            <Checkbox
                                                                checked={devicesChecked[device._id]}
                                                                onChange={e => {
                                                                    const _devicesChecked = JSON.parse(
                                                                        JSON.stringify(devicesChecked),
                                                                    );
                                                                    _devicesChecked[device._id] = e.target.checked;
                                                                    this.setState({ devicesChecked: _devicesChecked });
                                                                }}
                                                                onClick={e => e.stopPropagation()}
                                                            />
                                                            <span style={{ marginRight: 8 }}>
                                                                {device.common.icon ? (
                                                                    device.common.icon === '?' ? (
                                                                        <QuestionMark
                                                                            style={{ width: 24, height: 24 }}
                                                                        />
                                                                    ) : (
                                                                        <Icon
                                                                            src={device.common.icon}
                                                                            style={{ width: 24, height: 24 }}
                                                                            alt=""
                                                                        />
                                                                    )
                                                                ) : (
                                                                    this.props.helpers?.deviceIcons[
                                                                        device.deviceType
                                                                    ] || <Lightbulb />
                                                                )}
                                                            </span>
                                                            <TextField
                                                                variant="standard"
                                                                fullWidth
                                                                label={device._id}
                                                                helperText={
                                                                    <span style={{ fontStyle: 'italic' }}>
                                                                        {`${Generic.t('Device type')}: ${Generic.t(device.deviceType).replace('vis_2_widgets_nils_', '')}`}
                                                                    </span>
                                                                }
                                                                value={device.common.name}
                                                                onChange={e => {
                                                                    const _rooms = JSON.parse(JSON.stringify(rooms));
                                                                    _rooms[roomId].devices[deviceId].common.name =
                                                                        e.target.value;
                                                                    this.setState({ rooms: _rooms });
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </AccordionDetails>
                                        </Accordion>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <LinearProgress />
                    )}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        disabled={!rooms?.length || !Object.values(roomsChecked).find(val => val)}
                        onClick={this.handleSubmit}
                        startIcon={<Add />}
                    >
                        {Generic.t('Add widgets')}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => this.props.onClose()}
                        startIcon={<Close />}
                        color="grey"
                    >
                        {Generic.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}

const WizardIcon = (): React.JSX.Element => (
    <svg
        stroke="currentColor"
        fill="none"
        strokeWidth="0"
        viewBox="0 0 15 15"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M13.9 0.499976C13.9 0.279062 13.7209 0.0999756 13.5 0.0999756C13.2791 0.0999756 13.1 0.279062 13.1 0.499976V1.09998H12.5C12.2791 1.09998 12.1 1.27906 12.1 1.49998C12.1 1.72089 12.2791 1.89998 12.5 1.89998H13.1V2.49998C13.1 2.72089 13.2791 2.89998 13.5 2.89998C13.7209 2.89998 13.9 2.72089 13.9 2.49998V1.89998H14.5C14.7209 1.89998 14.9 1.72089 14.9 1.49998C14.9 1.27906 14.7209 1.09998 14.5 1.09998H13.9V0.499976ZM11.8536 3.14642C12.0488 3.34168 12.0488 3.65826 11.8536 3.85353L10.8536 4.85353C10.6583 5.04879 10.3417 5.04879 10.1465 4.85353C9.9512 4.65827 9.9512 4.34169 10.1465 4.14642L11.1464 3.14643C11.3417 2.95116 11.6583 2.95116 11.8536 3.14642ZM9.85357 5.14642C10.0488 5.34168 10.0488 5.65827 9.85357 5.85353L2.85355 12.8535C2.65829 13.0488 2.34171 13.0488 2.14645 12.8535C1.95118 12.6583 1.95118 12.3417 2.14645 12.1464L9.14646 5.14642C9.34172 4.95116 9.65831 4.95116 9.85357 5.14642ZM13.5 5.09998C13.7209 5.09998 13.9 5.27906 13.9 5.49998V6.09998H14.5C14.7209 6.09998 14.9 6.27906 14.9 6.49998C14.9 6.72089 14.7209 6.89998 14.5 6.89998H13.9V7.49998C13.9 7.72089 13.7209 7.89998 13.5 7.89998C13.2791 7.89998 13.1 7.72089 13.1 7.49998V6.89998H12.5C12.2791 6.89998 12.1 6.72089 12.1 6.49998C12.1 6.27906 12.2791 6.09998 12.5 6.09998H13.1V5.49998C13.1 5.27906 13.2791 5.09998 13.5 5.09998ZM8.90002 0.499976C8.90002 0.279062 8.72093 0.0999756 8.50002 0.0999756C8.2791 0.0999756 8.10002 0.279062 8.10002 0.499976V1.09998H7.50002C7.2791 1.09998 7.10002 1.27906 7.10002 1.49998C7.10002 1.72089 7.2791 1.89998 7.50002 1.89998H8.10002V2.49998C8.10002 2.72089 8.2791 2.89998 8.50002 2.89998C8.72093 2.89998 8.90002 2.72089 8.90002 2.49998V1.89998H9.50002C9.72093 1.89998 9.90002 1.72089 9.90002 1.49998C9.90002 1.27906 9.72093 1.09998 9.50002 1.09998H8.90002V0.499976Z"
            fill="currentColor"
        />
    </svg>
);

interface WizardButtonState {
    open?: boolean;
}

class WizardButton extends React.Component<CustomPaletteProperties, WizardButtonState> {
    constructor(props: CustomPaletteProperties) {
        super(props);
        this.state = {
            open: false,
        };
    }
    render(): (React.JSX.Element | null)[] {
        return [
            <Button
                key="materialWizardButton"
                onClick={() => this.setState({ open: true })}
                variant="contained"
                startIcon={<WizardIcon />}
            >
                {Generic.t('Wizard')}
            </Button>,
            this.state.open ? (
                <WizardDialog
                    key="materialWizardDialog"
                    onClose={() => this.setState({ open: false })}
                    {...this.props}
                />
            ) : null,
        ];
    }
}

export default class Wizard extends window.visRxWidget<Record<string, any>, VisRxWidgetState> {
    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2Wizard',
            visSet: 'vis-2-widgets-nils-fork',
            visName: 'Wizard',
            visWidgetLabel: 'wizard',
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_wizard.png',
            visOrder: 100,
            visAttrs: [],
            customPalette: props => (
                <WizardButton
                    key="wizard"
                    {...props}
                />
            ),
        };
    }
}
