import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './main.server';

// --- SSR Shims ---
if (typeof global !== 'undefined') {
    (global as any).localStorage = {
        getItem: () => null,
        setItem: () => { },
        removeItem: () => { },
        clear: () => { },
        key: () => null,
        length: 0
    };
    (global as any).sessionStorage = (global as any).localStorage;

    const mockNavigator = {
        userAgent: 'AngularSSR',
        clipboard: {
            writeText: () => Promise.resolve()
        },
        mediaSession: {
            setActionHandler: () => { },
            metadata: null,
            playbackState: 'none',
            setPositionState: () => { }
        }
    };

    try {
        Object.defineProperty(global, 'navigator', {
            value: mockNavigator,
            writable: true,
            configurable: true
        });
    } catch (e: any) {
        console.warn('⚠️ Could not shim navigator, ignoring:', e.message);
    }

    // Additional Browser Globals Shims
    class Mock { }
    (global as any).Event = Mock;
    (global as any).CustomEvent = Mock;
    (global as any).MouseEvent = Mock;
    (global as any).KeyboardEvent = Mock;
    (global as any).FocusEvent = Mock;
    (global as any).Image = Mock;
    (global as any).Audio = class extends Mock {
        play() { return Promise.resolve(); }
        pause() { }
        load() { }
        addEventListener() { }
        removeEventListener() { }
    };
    (global as any).MediaMetadata = Mock;
    (global as any).Node = Mock;
    (global as any).HTMLElement = Mock;
    (global as any).HTMLAudioElement = Mock;
    (global as any).HTMLImageElement = Mock;
    (global as any).HTMLCanvasElement = Mock;
}

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
    const server = express();
    const serverDistFolder = dirname(fileURLToPath(import.meta.url));
    const browserDistFolder = resolve(serverDistFolder, '../browser');
    const indexHtml = join(serverDistFolder, 'index.server.html');

    const commonEngine = new CommonEngine();

    server.set('view engine', 'html');
    server.set('views', browserDistFolder);

    // Serve static files from /browser
    server.get('**/*.*', express.static(browserDistFolder, {
        maxAge: '1y'
    }));

    // All regular routes use the Angular engine
    server.get('**', (req, res, next) => {
        const { protocol, originalUrl, baseUrl, headers } = req;

        // SSR TIMEOUT GUARD: If Angular SSR hangs (Zone.js never stabilizes due to
        // an unguarded HTTP call), fall back to CSR shell after 5s instead of
        // waiting 30s for Nginx to return 504.
        let responded = false;
        const ssrTimeout = setTimeout(() => {
            if (!responded) {
                responded = true;
                console.warn(`⚠️ [SSR Timeout] Falling back to CSR for: ${originalUrl}`);
                res.sendFile(join(browserDistFolder, 'index.csr.html'), (err: any) => {
                    if (err) res.sendFile(join(browserDistFolder, 'index.html'));
                });
            }
        }, 5000);

        commonEngine
            .render({
                bootstrap,
                documentFilePath: indexHtml,
                url: `${protocol}://${headers.host}${originalUrl}`,
                publicPath: browserDistFolder,
                providers: [{ provide: APP_BASE_HREF, useValue: baseUrl }],
            })
            .then((html) => {
                if (!responded) {
                    responded = true;
                    clearTimeout(ssrTimeout);
                    res.send(html);
                }
            })
            .catch((err) => {
                if (!responded) {
                    responded = true;
                    clearTimeout(ssrTimeout);
                    next(err);
                }
            });
    });

    return server;
}

// Removing automatic listen to avoid port conflicts when imported in app.js
// function run(): void {
//   const port = process.env['PORT'] || 4000;
//   const server = app();
//   server.listen(port, () => {
//     console.log(`Node Express server listening on http://localhost:${port}`);
//   });
// }
// if (import.meta.url === `file://${process.argv[1]}`) {
//   run();
// }