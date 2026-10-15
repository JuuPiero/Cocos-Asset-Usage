import { readFileSync } from 'fs';
import { join } from 'path';
import type { PanelRequest } from '../../shared';
import { createUsageApp, UsageApp } from './app';
import { editorBridge } from './editor-bridge';

const PACKAGE = 'asset-usage';
const STATIC = join(__dirname, '../../../static');

const apps = new WeakMap<object, UsageApp>();
/** Request that arrived before the Vue app was mounted. */
const early = new WeakMap<object, PanelRequest>();

module.exports = Editor.Panel.define({
    template: readFileSync(join(STATIC, 'template/default/index.html'), 'utf-8'),
    style: readFileSync(join(STATIC, 'style/default/index.css'), 'utf-8'),
    $: {
        app: '#app',
    },
    methods: {
        /** Message "panel-request" from the main process (context menus). */
        onRequest(request: PanelRequest) {
            const app = apps.get(this);
            if (app) app.request(request);
            else early.set(this, request);
        },
        /** Broadcast "selection:select" (Follow Selection). */
        onSelect(type: string, uuid: string) {
            apps.get(this)?.onSelect(type, uuid);
        },
        /** Broadcasts "asset-db:asset-add / change / delete". */
        onAssetsChanged() {
            apps.get(this)?.assetsChanged();
        },
    },
    async ready() {
        let pending: PanelRequest | null = null;
        try {
            pending = await (Editor.Message.request as any)(PACKAGE, 'take-pending');
        } catch {
            pending = null;
        }
        const request = early.get(this) || pending;
        early.delete(this);
        const el = (this as any).$.app as HTMLElement;
        const app = createUsageApp(el, editorBridge, readFileSync(join(STATIC, 'template/vue/app.html'), 'utf-8'), request);
        apps.set(this, app);
    },
    close() {
        apps.get(this)?.destroy();
    },
});
