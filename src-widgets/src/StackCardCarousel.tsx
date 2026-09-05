import React from 'react';

import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic from './Generic';
import '../public/smarthome.css';
import './StackCardCarousel.css';

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
    private pointerStartY = 0;
    private swipePointerId: number | null = null;
    private suppressSwipeClick = false;

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
        this.suppressSwipeClick = false;
        if (
            this.state.editMode ||
            event.button !== 0 ||
            !event.isPrimary ||
            (event.target as Element).closest('.sh-carousel') !== event.currentTarget ||
            (event.target as Element).closest(
                'button, input, select, textarea, a, [role="slider"], [role="button"], [contenteditable="true"]',
            )
        ) {
            return;
        }
        this.pointerStartX = event.clientX;
        this.pointerStartY = event.clientY;
        this.swipePointerId = event.pointerId;
    };

    private handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
        if (this.pointerStartX === null || event.pointerId !== this.swipePointerId) {
            return;
        }
        const distanceX = Math.abs(event.clientX - this.pointerStartX);
        const distanceY = Math.abs(event.clientY - this.pointerStartY);
        if (distanceY >= SWIPE_THRESHOLD && distanceY > distanceX) {
            this.cancelSwipe();
        } else if (distanceX >= SWIPE_THRESHOLD && distanceX > distanceY) {
            // Capture only a confirmed swipe, preserving normal taps in embedded widgets.
            event.currentTarget.setPointerCapture(event.pointerId);
        }
    };

    private cancelSwipe = (): void => {
        this.pointerStartX = null;
        this.swipePointerId = null;
    };

    private handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
        if (this.pointerStartX === null || event.pointerId !== this.swipePointerId) {
            return;
        }
        const distance = event.clientX - this.pointerStartX;
        this.cancelSwipe();
        if (
            Math.abs(distance) >= SWIPE_THRESHOLD &&
            Math.abs(distance) > Math.abs(event.clientY - this.pointerStartY)
        ) {
            this.suppressSwipeClick = true;
            this.showCard(this.state.activeCard + (distance < 0 ? 1 : -1));
        }
    };

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const count = this.getCardCount();
        const activeCard = Math.min(this.state.activeCard, count - 1);

        const view = this.state.rxData[`view${activeCard + 1}`];
        const recursive = view === this.props.view;

        return (
            <div
                ref={this.refContainer}
                className="vis-widget-body sh-theme sh-carousel"
                role="region"
                aria-roledescription="carousel"
                aria-label="Cards"
                // Embedded vis widgets can stop bubbling pointer events.
                onPointerDownCapture={this.handlePointerDown}
                onPointerMoveCapture={this.handlePointerMove}
                onPointerUpCapture={this.handlePointerUp}
                onPointerCancelCapture={this.cancelSwipe}
                onLostPointerCapture={event => {
                    // Touch starts with implicit capture on the child. Transferring
                    // it to the carousel must not cancel the gesture we just claimed.
                    if (event.target === event.currentTarget) {
                        this.cancelSwipe();
                    }
                }}
                onPointerLeave={event => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                        this.cancelSwipe();
                    }
                }}
                onClickCapture={event => {
                    if (this.suppressSwipeClick && event.detail > 0) {
                        this.suppressSwipeClick = false;
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }}
            >
                <div
                    className="sh-carousel__card"
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`Card ${activeCard + 1} of ${count}`}
                    key={activeCard}
                >
                    {recursive ? (
                        <div className="sh-carousel__placeholder">Cannot use recursive views</div>
                    ) : view ? (
                        this.getWidgetView(view, {
                            style: { width: '100%', height: '100%', overflow: 'hidden', background: 'transparent' },
                        })
                    ) : (
                        <div className="sh-carousel__placeholder">Select a view for card {activeCard + 1}</div>
                    )}
                    {this.state.editMode ? <div className="sh-carousel__edit-overlay" /> : null}
                </div>
                {count > 1 ? (
                    <div className="sh-carousel__navigation">
                        <button
                            type="button"
                            className="sh-carousel__control"
                            aria-label="Previous card"
                            disabled={this.state.editMode}
                            onClick={() => this.showCard(activeCard - 1)}
                        >
                            <KeyboardArrowLeft style={{ width: 20, height: 20 }} />
                        </button>
                        <div className={`sh-carousel__pagination${count > 3 ? ' sh-carousel__pagination--dense' : ''}`}>
                            {count <= 5 ? (
                                <div className="sh-carousel__dots">
                                    {Array.from({ length: count }, (_, index) => (
                                        <button
                                            key={index}
                                            type="button"
                                            className="sh-carousel__control sh-carousel__dot"
                                            aria-label={`Show card ${index + 1}`}
                                            aria-current={index === activeCard ? 'true' : undefined}
                                            disabled={this.state.editMode}
                                            onClick={() => this.showCard(index)}
                                        >
                                            <span />
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                            <span
                                className={`sh-carousel__counter${count <= 5 ? ' sh-carousel__counter--alternative' : ''}`}
                            >
                                {activeCard + 1} / {count}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="sh-carousel__control"
                            aria-label="Next card"
                            disabled={this.state.editMode}
                            onClick={() => this.showCard(activeCard + 1)}
                        >
                            <KeyboardArrowRight style={{ width: 20, height: 20 }} />
                        </button>
                    </div>
                ) : null}
            </div>
        );
    }
}

export default StackCardCarousel;
