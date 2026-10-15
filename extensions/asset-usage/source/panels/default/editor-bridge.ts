/** UsageBridge backed by the Cocos editor (asset-db, selection, scene script). */
import { promises as fsp } from 'fs';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';
import { nodeFs, settingsRoots } from '../../core/node-fs';
import type { AssetRecord } from '../../core/types';
import type { IndexCache } from '../../core/usage-index';
import type { SceneQuery, UsageBridge } from './bridge';

const request = (Editor.Message.request as any).bind(Editor.Message) as (target: string, message: string, ...args: any[]) => Promise<any>;
const cacheFile = () => join(Editor.Project.path, 'temp', 'asset-usage', 'index.json');
const IMAGE_IMPORTERS = new Set(['image', 'texture', 'sprite-frame']);

async function waitForAssetDb() {
    for (let i = 0; i < 100; i++) {
        try {
            if (await request('asset-db', 'query-ready')) return;
        } catch {
            // not up yet
        }
        await new Promise((r) => setTimeout(r, 200));
    }
}

function lastSelected(type: string): string | null {
    const list = Editor.Selection.getSelected(type);
    return list && list.length ? list[list.length - 1] : null;
}

export const editorBridge: UsageBridge = {
    fs: nodeFs,

    async listAssets(): Promise<AssetRecord[]> {
        await waitForAssetDb();
        const infos: any[] = (await request('asset-db', 'query-assets')) || [];
        const byUuid = new Map<string, AssetRecord>();
        const subs: any[] = [];
        for (const a of infos) {
            if (!a?.uuid || !a.url) continue;
            if (a.uuid.includes('@')) {
                subs.push(a);
                continue;
            }
            byUuid.set(a.uuid, {
                uuid: a.uuid,
                url: a.url,
                file: a.file || '',
                importer: a.importer || 'unknown',
                isDirectory: !!a.isDirectory,
                subs: {},
                subsKnown: false,
                external: a.url.startsWith('db://internal/'),
            });
        }
        for (const s of subs) {
            const at = s.uuid.indexOf('@');
            const parent = byUuid.get(s.uuid.slice(0, at));
            if (parent) parent.subs[s.uuid.slice(at + 1)] = s.name || s.displayName || s.uuid.slice(at + 1);
        }
        return [...byUuid.values()];
    },

    settingsRoots: () => settingsRoots(Editor.Project.path),

    async loadCache(): Promise<IndexCache | null> {
        try {
            return JSON.parse(await fsp.readFile(cacheFile(), 'utf8'));
        } catch {
            return null;
        }
    },

    async saveCache(cache: IndexCache) {
        try {
            await fsp.mkdir(dirname(cacheFile()), { recursive: true });
            await fsp.writeFile(cacheFile(), JSON.stringify(cache));
        } catch (e) {
            console.warn('[Asset Usage] Could not save the index cache:', e);
        }
    },

    selectAsset(uuid) {
        Editor.Selection.clear('asset');
        Editor.Selection.select('asset', [uuid]);
    },

    locateAsset(uuid) {
        Editor.Message.send('assets', 'twinkle', uuid);
    },

    async openAsset(uuid) {
        await request('asset-db', 'open-asset', uuid);
    },

    async currentScene() {
        try {
            return await request('scene', 'execute-scene-script', { name: 'asset-usage', method: 'currentScene', args: [] });
        } catch {
            return null;
        }
    },

    selectNode(uuid) {
        Editor.Selection.clear('node');
        Editor.Selection.select('node', [uuid]);
    },

    async findNodeReferences(uuid): Promise<SceneQuery> {
        try {
            return await request('scene', 'execute-scene-script', { name: 'asset-usage', method: 'findNodeReferences', args: [uuid] });
        } catch (e) {
            return { error: String((e as Error)?.message || e) };
        }
    },

    selectedAsset: () => lastSelected('asset'),
    selectedNode: () => lastSelected('node'),

    async confirm(message, detail, ok) {
        const r = await Editor.Dialog.warn(message, { detail, buttons: [ok, 'Cancel'], default: 0, cancel: 1 });
        return r.response === 0;
    },

    async deleteAssets(urls) {
        for (const url of urls) {
            try {
                await request('asset-db', 'delete-asset', url);
            } catch (e) {
                console.error(`[Asset Usage] Could not delete ${url}:`, e);
            }
        }
    },

    thumbnail(asset) {
        if (!IMAGE_IMPORTERS.has(asset.importer) || !asset.file || asset.external) return null;
        if (!/\.(png|jpe?g|webp|gif|bmp)$/i.test(asset.file)) return null;
        return pathToFileURL(asset.file).href;
    },
};
