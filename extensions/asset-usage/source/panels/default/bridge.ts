/**
 * Everything the panel needs from the editor. The Vue app only talks to this
 * interface, so it can also run in a browser preview with a fake bridge.
 */
import type { AssetRecord } from '../../core/types';
import type { ExtraRoot, FileSystem, IndexCache } from '../../core/usage-index';

export interface SceneRef {
    node: string;
    nodeUuid: string;
    component: string;
    property: string;
    points: string;
}

export interface SceneQuery {
    target?: { name: string; path: string };
    refs?: SceneRef[];
    error?: string;
}

export interface UsageBridge {
    fs: FileSystem;
    listAssets(): Promise<AssetRecord[]>;
    settingsRoots(): Promise<ExtraRoot[]>;
    loadCache(): Promise<IndexCache | null>;
    saveCache(cache: IndexCache): Promise<void>;

    /** Select in the Assets panel / Inspector. */
    selectAsset(uuid: string): void;
    /** Flash it in the Assets panel. */
    locateAsset(uuid: string): void;
    /** Open a scene / prefab / script like a double-click in the Assets panel. */
    openAsset(uuid: string): Promise<void>;
    /** Uuid of the open scene. */
    currentScene(): Promise<string | null>;
    selectNode(uuid: string): void;
    findNodeReferences(uuid: string): Promise<SceneQuery>;
    /** Selected asset / node in the editor, if any. */
    selectedAsset(): string | null;
    selectedNode(): string | null;

    confirm(message: string, detail: string, ok: string): Promise<boolean>;
    deleteAssets(urls: string[]): Promise<void>;
    /** Image URL for a thumbnail, or null. */
    thumbnail(asset: AssetRecord): string | null;
}
