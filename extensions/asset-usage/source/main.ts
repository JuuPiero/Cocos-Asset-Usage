/**
 * Main process: opens the Asset Usage panel and hands it a request from the
 * Assets / Hierarchy context menus (kept until the panel is ready).
 */
import type { PanelRequest } from './shared';

const PACKAGE = 'asset-usage';

let pending: PanelRequest | null = null;

async function show(request: PanelRequest) {
    pending = request;
    await Editor.Panel.open(PACKAGE);
    // An open panel takes it now; a new one asks for it when ready.
    Editor.Message.send(PACKAGE, 'panel-request', request);
}

export const methods: Record<string, (...args: any[]) => any> = {
    openPanel() {
        Editor.Panel.open(PACKAGE);
    },
    findReferences(uuid: string) {
        if (uuid) show({ mode: 'references', uuid });
    },
    showDependencies(uuid: string) {
        if (uuid) show({ mode: 'dependencies', uuid });
    },
    findUnused() {
        show({ mode: 'unused' });
    },
    findMissing() {
        show({ mode: 'missing' });
    },
    findInScene(nodeUuid: string) {
        if (nodeUuid) show({ mode: 'scene', uuid: nodeUuid });
    },
    takePending(): PanelRequest | null {
        const r = pending;
        pending = null;
        return r;
    },
};

export function load() {}

export function unload() {}
