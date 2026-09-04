import React from 'react';

import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import { Card, IconButton } from '@mui/material';
import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic from './Generic';

interface StackCardCarouselRxData {
    count: number;
    [key: `view${number}`]: string;
}

interface StackCardCarouselState extends VisRxWidgetState {
    activeCard: number;
}

const MAX_CARDS = 20;
const SWIPE_THRESHOLD = 45;

class StackCardCarousel extends Generic<StackCardCarouselRxData, StackCardCarouselState> {
    private readonly refContainer: React.RefObject<HTMLDivElement | null> = React.createRef();
    private pointerStartX: number | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            activeCard: 0,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2StackCardCarousel',
            visSet: 'vis-2-widgets-nils-fork',
            visWidgetLabel: 'stack_card_carousel',
            visName: 'Stack Card Carousel',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'count',
                            type: 'number',
                            default: 3,
                            label: 'count',
                            min: 1,
                            max: MAX_CARDS,
                        },
                    ],
                },
                {
                    name: 'card',
                    label: 'group_item',
                    indexFrom: 1,
                    indexTo: 'count',
                    fields: [
                        {
                            name: 'view',
                            label: 'view',
                            type: 'select-views',
                            multiple: false,
                        },
                    ],
                },
            ],
            visDefaultStyle: {
                width: 420,
                height: 320,
                position: 'relative',
            },
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_view.png',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return StackCardCarousel.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.refContainer.current?.addEventListener('touchstart', this.stopParentSwipe);
        this.refContainer.current?.addEventListener('mousedown', this.stopParentSwipe);
    }

    componentWillUnmount(): void {
        this.refContainer.current?.removeEventListener('touchstart', this.stopParentSwipe);
        this.refContainer.current?.removeEventListener('mousedown', this.stopParentSwipe);
        super.componentWillUnmount();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: typeof this.state): void {
        super.componentDidUpdate(prevProps, prevState);
        const count = this.getCardCount();
        if (this.state.activeCard >= count) {
            this.setState({ activeCard: Math.max(0, count - 1) });
        }
    }

    private getCardCount(): number {
        const count = Number(this.state.rxData.count);
        return Math.max(1, Math.min(MAX_CARDS, Number.isFinite(count) ? Math.floor(count) : 1));
    }

    private showCard(index: number): void {
        const count = this.getCardCount();
        this.setState({ activeCard: (index + count) % count });
    }

    private stopParentSwipe = (event: Event): void => {
        if (!this.state.editMode) {
            event.stopPropagation();
        }
    };

    private handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
        if (this.state.editMode || event.button !== 0) {
            return;
        }
        this.pointerStartX = event.clientX;
    };

    private handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
        if (this.pointerStartX === null) {
            return;
        }
        const distance = event.clientX - this.pointerStartX;
        this.pointerStartX = null;
        if (Math.abs(distance) >= SWIPE_THRESHOLD) {
            this.showCard(this.state.activeCard + (distance < 0 ? 1 : -1));
        }
    };

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const count = this.getCardCount();
        const activeCard = Math.min(this.state.activeCard, count - 1);

        return (
            <div
                ref={this.refContainer}
                className="vis-widget-body"
                onPointerDown={this.handlePointerDown}
                onPointerUp={this.handlePointerUp}
                onPointerCancel={() => (this.pointerStartX = null)}
                style={{
                    position: 'absolute',
                    inset: 0,
                    overflow: 'hidden',
                    touchAction: 'pan-y',
                    userSelect: 'none',
                }}
            >
                <div style={{ position: 'absolute', inset: '8px 16px 48px' }}>
                    {Array.from({ length: count }, (_, index) => {
                        const distance = (index - activeCard + count) % count;
                        const inStack = distance < Math.min(count, 3);
                        const view = this.state.rxData[`view${index + 1}`];
                        const recursive = view === this.props.view;

                        return (
                            <Card
                                key={index}
                                elevation={Math.max(1, 8 - distance * 2)}
                                aria-hidden={distance !== 0}
                                sx={{
                                    position: 'absolute',
                                    inset: 0,
                                    zIndex: count - distance,
                                    borderRadius: 4,
                                    overflow: 'hidden',
                                    opacity: inStack ? 1 : 0,
                                    pointerEvents: distance === 0 ? 'auto' : 'none',
                                    transform: inStack
                                        ? `translateY(${distance * 9}px) scale(${1 - distance * 0.035})`
                                        : 'translateY(24px) scale(.88)',
                                    transformOrigin: 'center bottom',
                                    transition: 'transform 260ms ease, opacity 220ms ease, box-shadow 260ms ease',
                                    border: theme => `1px solid ${theme.palette.divider}`,
                                    bgcolor: 'background.paper',
                                }}
                            >
                                {recursive ? (
                                    <div
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            display: 'grid',
                                            placeItems: 'center',
                                            color: 'var(--mui-palette-text-secondary, rgba(0, 0, 0, .6))',
                                        }}
                                    >
                                        Cannot use recursive views
                                    </div>
                                ) : view ? (
                                    this.getWidgetView(view, {
                                        style: { width: '100%', height: '100%', overflow: 'hidden' },
                                    })
                                ) : (
                                    <div
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            display: 'grid',
                                            placeItems: 'center',
                                            color: 'var(--mui-palette-text-secondary, rgba(0, 0, 0, .6))',
                                        }}
                                    >
                                        Select a view for card {index + 1}
                                    </div>
                                )}
                                {this.state.editMode && distance === 0 ? (
                                    <div style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
                                ) : null}
                            </Card>
                        );
                    })}
                </div>

                <div
                    style={{
                        position: 'absolute',
                        left: 8,
                        right: 8,
                        bottom: 4,
                        height: 40,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                    }}
                >
                    <IconButton
                        size="small"
                        aria-label="Previous card"
                        disabled={count < 2 || this.state.editMode}
                        onClick={() => this.showCard(activeCard - 1)}
                    >
                        <KeyboardArrowLeft />
                    </IconButton>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 32, gap: 7 }}>
                        {count <= 8 ? Array.from({ length: count }, (_, index) => (
                            <button
                                key={index}
                                type="button"
                                aria-label={`Show card ${index + 1}`}
                                aria-current={index === activeCard ? 'true' : undefined}
                                disabled={this.state.editMode}
                                onClick={() => this.showCard(index)}
                                style={{
                                    width: index === activeCard ? 18 : 7,
                                    height: 7,
                                    padding: 0,
                                    border: 0,
                                    borderRadius: 999,
                                    cursor: this.state.editMode ? 'default' : 'pointer',
                                    background: index === activeCard
                                        ? 'var(--mui-palette-primary-main, #1976d2)'
                                        : 'var(--mui-palette-action-disabled, rgba(0, 0, 0, .26))',
                                    transition: 'width 180ms ease, background-color 180ms ease',
                                }}
                            />
                        )) : (
                            <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                                {activeCard + 1} / {count}
                            </span>
                        )}
                    </div>
                    <IconButton
                        size="small"
                        aria-label="Next card"
                        disabled={count < 2 || this.state.editMode}
                        onClick={() => this.showCard(activeCard + 1)}
                    >
                        <KeyboardArrowRight />
                    </IconButton>
                </div>
            </div>
        );
    }
}

export default StackCardCarousel;
