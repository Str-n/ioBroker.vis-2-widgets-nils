import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic from './Generic';
import '../public/smarthome.css';
import './HorizontalScrollView.css';

interface HorizontalScrollViewRxData {
    view: string;
}

class HorizontalScrollView extends Generic<HorizontalScrollViewRxData, VisRxWidgetState> {
    private readonly viewportRef: React.RefObject<HTMLDivElement | null> = React.createRef();

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2HorizontalScrollView',
            visSet: 'vis-2-widgets-nils-fork',
            visName: 'Horizontal scroll view',
            visWidgetLabel: 'horizontal_scroll_view',
            visAttrs: [
                {
                    name: 'common',
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
                height: 240,
                position: 'relative',
            },
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_horizontal_scroll_view.svg',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return HorizontalScrollView.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.viewportRef.current?.addEventListener('touchstart', this.stopParentGesture);
        this.viewportRef.current?.addEventListener('mousedown', this.stopParentGesture);
    }

    componentWillUnmount(): void {
        this.viewportRef.current?.removeEventListener('touchstart', this.stopParentGesture);
        this.viewportRef.current?.removeEventListener('mousedown', this.stopParentGesture);
        super.componentWillUnmount();
    }

    private stopParentGesture = (event: Event): void => {
        if (!this.state.editMode) {
            event.stopPropagation();
        }
    };

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);

        const view = this.state.rxData.view;
        const recursive = view === this.props.view;
        const settings = view ? this.props.context.views[view]?.settings : undefined;
        const viewWidth = Number(settings?.sizex);
        const viewHeight = Number(settings?.sizey);
        const width = Number.isFinite(viewWidth) && viewWidth > 0 ? `${viewWidth}px` : '100%';
        const height = Number.isFinite(viewHeight) && viewHeight > 0 ? `${viewHeight}px` : '100%';

        return (
            <div
                ref={this.viewportRef}
                className="vis-widget-body sh-theme sh-horizontal-scroll-view"
                role="region"
                aria-label={Generic.t('horizontal_scroll_view')}
            >
                {recursive ? (
                    <div className="sh-horizontal-scroll-view__placeholder">Cannot use recursive views</div>
                ) : view ? (
                    <div
                        className="sh-horizontal-scroll-view__content"
                        style={{ width, height }}
                    >
                        {this.getWidgetView(view, {
                            style: {
                                position: 'relative',
                                width: '100%',
                                height: '100%',
                                minWidth: '100%',
                                minHeight: '100%',
                                overflow: 'visible',
                                background: 'transparent',
                            },
                        })}
                    </div>
                ) : (
                    <div className="sh-horizontal-scroll-view__placeholder">Select a view</div>
                )}
                {this.state.editMode ? <div className="sh-horizontal-scroll-view__edit-overlay" /> : null}
            </div>
        );
    }
}

export default HorizontalScrollView;
