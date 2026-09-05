import React from 'react';
import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps } from '@iobroker/types-vis-2';
import Generic from './Generic';

// Keep the installation metadata for the page lifetime, including view navigation.
// A normal reload without this widget restores the host application's metadata.
function configureHomeScreen(): void {
    const metadata: Record<string, string> = {
        'mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-capable': 'yes',
        'apple-mobile-web-app-title': 'Home',
        'apple-mobile-web-app-status-bar-style': 'black',
    };
    Object.entries(metadata).forEach(([name, content]) => {
        const existing = document.head.querySelectorAll<HTMLMetaElement>(`meta[name="${name}"]`);
        if (existing.length) {
            existing.forEach(meta => {
                meta.content = content;
            });
        } else {
            const meta = document.createElement('meta');
            meta.name = name;
            meta.content = content;
            document.head.appendChild(meta);
        }
    });

    const href = new URL('widgets/vis-2-widgets-nils-fork/home-screen.webmanifest', window.location.href).href;
    const existing = document.head.querySelectorAll<HTMLLinkElement>('link[rel~="manifest"]');
    if (existing.length) {
        existing.forEach(link => {
            link.href = href;
        });
    } else {
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = href;
        document.head.appendChild(link);
    }
}

export default class HomeScreenFullscreen extends Generic<Record<string, never>> {
    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2HomeScreenFullscreen',
            visSet: 'vis-2-widgets-nils-fork',
            visName: 'Home Screen Fullscreen',
            visWidgetLabel: 'home_screen_fullscreen',
            visAttrs: [],
            visDefaultStyle: { width: 180, height: 48, position: 'absolute' },
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_fullscreen.svg',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return HomeScreenFullscreen.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        if (!this.props.editMode) {
            configureHomeScreen();
        }
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: typeof this.state): void {
        super.componentDidUpdate(prevProps, prevState);
        if (prevProps.editMode && !this.props.editMode) {
            configureHomeScreen();
        }
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | null {
        super.renderWidgetBody(props);
        return <div style={{ padding: 8, border: '1px dashed currentColor' }}>Home Screen Fullscreen (EG)</div>;
    }

    render(): React.JSX.Element | null {
        // Omit the outer widget container too, so it cannot intercept dashboard taps.
        return this.props.editMode ? super.render() : null;
    }
}
