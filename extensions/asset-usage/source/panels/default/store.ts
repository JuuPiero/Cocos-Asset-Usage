/**
 * State and actions of the Asset Usage panel. Owns the UsageIndex: builds it
 * (from the cache when possible), rebuilds after asset changes, and turns
 * index queries into rows for the five tabs.
 */
import { computed, markRaw, reactive, ref } from 'vue';
import { UsageIndex, type Edge } from '../../core/usage-index';
import type { AssetRecord, RefLocation } from '../../core/types';
import type { Mode, PanelRequest } from '../../shared';
import type { SceneQuery, UsageBridge } from './bridge';

export interface LocRow {
    key: string;
    node: string;
    component: string;
    property: string;
    /** Sub-asset name shown next to the place ("texture"), when it adds information. */
    sub: string;
    via: 'data' | 'import' | 'code';
    nodeId?: string;
    /** For Missing: what is missing. */
    missing?: string;
}

export interface Row {
    key: string;
    uuid: string;
    name: string;
    folder: string;
    url: string;
    importer: string;
    badge: string;
    thumb: string | null;
    note: string;
    missing: boolean;
    /** A project settings file, not an asset. */
    settings: boolean;
    size: number;
    locations: LocRow[];
}

export interface SceneRow {
    key: string;
    node: string;
    nodeUuid: string;
    component: string;
    property: string;
    points: string;
}

export const UNUSED_FILTERS: { id: string; label: string; importers: string[] | null }[] = [
    { id: 'all', label: 'All', importers: null },
    { id: 'image', label: 'Images', importers: ['image', 'texture', 'sprite-frame', 'sprite-atlas', 'render-texture'] },
    { id: 'prefab', label: 'Prefabs', importers: ['prefab'] },
    { id: 'material', label: 'Materials', importers: ['material', 'effect', 'physics-material'] },
    { id: 'anim', label: 'Animations', importers: ['animation-clip', 'animation-graph', 'animation-graph-variant', 'animation-mask'] },
    { id: 'audio', label: 'Audio', importers: ['audio-clip'] },
    { id: 'font', label: 'Fonts', importers: ['ttf-font', 'bitmap-font', 'label-atlas'] },
    { id: 'other', label: 'Other', importers: [] },
];

const BADGES: Record<string, string> = {
    image: 'IMG', texture: 'TEX', 'sprite-frame': 'SPR', 'sprite-atlas': 'ATL', 'auto-atlas': 'ATL', 'render-texture': 'RT',
    prefab: 'PFB', scene: 'SCN', material: 'MAT', 'physics-material': 'PMT', effect: 'FX', 'effect-header': 'FX',
    'animation-clip': 'ANM', 'animation-graph': 'ANG', 'animation-graph-variant': 'ANG', 'animation-mask': 'MSK',
    typescript: 'TS', javascript: 'JS', 'audio-clip': 'AUD', 'video-clip': 'VID', 'ttf-font': 'FNT', 'bitmap-font': 'FNT',
    'label-atlas': 'FNT', fbx: '3D', gltf: '3D', mesh: '3D', json: 'JSN', text: 'TXT', directory: 'DIR', particle: 'PTC',
    'spine-data': 'SKL', dragonbones: 'SKL', 'dragonbones-atlas': 'SKL', settings: 'CFG',
};

export function badgeOf(importer: string): string {
    return BADGES[importer] || importer.slice(0, 3).toUpperCase() || '?';
}

export function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function splitUrl(url: string): { name: string; folder: string } {
    const slash = url.lastIndexOf('/');
    return slash < 0 ? { name: url, folder: '' } : { name: url.slice(slash + 1), folder: url.slice(0, slash) };
}

function lastKey(property: string): string {
    const m = /([A-Za-z0-9_]+)\W*$/.exec(property);
    return m ? m[1].toLowerCase() : '';
}

export type Store = ReturnType<typeof createStore>;

export function createStore(bridge: UsageBridge) {
    const index = markRaw(new UsageIndex());
    /** Bumped when the index changes, so computed rows refresh. */
    const version = ref(0);

    const state = reactive({
        mode: 'references' as Mode,
        status: 'idle' as 'idle' | 'scanning' | 'ready' | 'error',
        error: '',
        progress: { done: 0, total: 0 },
        stats: { assets: 0, read: 0, cached: 0, ms: 0 },
        /** Asset (maybe "uuid@sub") for References / Dependencies. */
        target: '' as string,
        followSelection: false,
        filter: '',
        unusedFilter: 'all',
        expanded: {} as Record<string, boolean>,
        checked: {} as Record<string, boolean>,
        scene: { uuid: '', loading: false, result: null as SceneQuery | null },
        history: [] as PanelRequest[],
        future: [] as PanelRequest[],
    });

    let building: Promise<void> | null = null;
    let again = false;

    async function build(force = false) {
        if (building) {
            again = true;
            return building;
        }
        building = (async () => {
            do {
                again = false;
                state.status = 'scanning';
                state.error = '';
                try {
                    const [records, extras] = await Promise.all([bridge.listAssets(), bridge.settingsRoots()]);
                    const cache = force ? null : index.assets.size ? index.toCache() : await bridge.loadCache();
                    await index.build(records, bridge.fs, {
                        cache,
                        extras,
                        onProgress(done, total) {
                            state.progress = { done, total };
                        },
                    });
                    state.stats = { ...index.stats };
                    version.value++;
                    state.status = 'ready';
                    bridge.saveCache(index.toCache());
                } catch (e) {
                    state.status = 'error';
                    state.error = String((e as Error)?.message || e);
                    console.error('[Asset Usage]', e);
                }
            } while (again);
        })();
        try {
            await building;
        } finally {
            building = null;
        }
    }

    let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
    /** Assets changed in the editor: rebuild soon (only changed files are read). */
    function assetsChanged() {
        if (rebuildTimer) clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(() => {
            rebuildTimer = null;
            build();
        }, 600);
    }

    // ------------------------------------------------------------ rows

    function assetRow(uuid: string, key: string, edge?: Edge, locations: RefLocation[] = []): Row {
        const asset = index.assets.get(uuid);
        const extra = index.extraOf(uuid);
        const url = asset?.url || extra?.label || uuid;
        const { name, folder } = asset ? splitUrl(url) : { name: url, folder: '' };
        const subNames = edge ? edge.subs.filter(Boolean).map((s) => index.subName(edge.used, s)) : [];
        return {
            key,
            uuid,
            name,
            folder,
            url,
            importer: asset?.importer || (extra ? 'settings' : 'missing'),
            badge: asset ? badgeOf(asset.importer) : extra ? 'CFG' : '?',
            thumb: asset ? bridge.thumbnail(asset) : null,
            note: subNames.length ? subNames.join(', ') : '',
            missing: !asset && !extra,
            settings: !!extra,
            size: asset?.size || 0,
            locations: locations.map((l, i) => locRow(l, `${key}#${i}`, edge)),
        };
    }

    function locRow(l: RefLocation, key: string, edge?: Edge): LocRow {
        const sub = l.sub && edge ? index.subName(edge.used, l.sub) : '';
        return {
            key,
            node: l.node || '',
            component: index.componentName(l.component),
            property: l.property,
            sub: sub && sub.toLowerCase() !== lastKey(l.property) ? sub : '',
            via: l.via || 'data',
            nodeId: l.nodeId,
        };
    }

    const targetRow = computed<Row | null>(() => {
        version.value;
        if (!state.target) return null;
        const [uuid, sub] = state.target.split('@');
        const row = assetRow(uuid, 'target');
        if (sub) row.note = index.subName(uuid, sub);
        return row;
    });

    function matches(row: Row): boolean {
        const f = state.filter.trim().toLowerCase();
        if (!f) return true;
        if (row.url.toLowerCase().includes(f)) return true;
        return row.locations.some((l) => `${l.node} ${l.component} ${l.property}`.toLowerCase().includes(f));
    }

    const rows = computed<Row[]>(() => {
        version.value;
        let out: Row[] = [];
        if (state.mode === 'references' && state.target) {
            out = index.usersOf(state.target).map((e) => assetRow(e.user, `r:${e.user}`, e, e.locations));
        } else if (state.mode === 'dependencies' && state.target) {
            const edges = index.dependenciesOf(state.target);
            const gone = new Map<string, Set<string>>();
            for (const e of edges) if (index.isMissing(e)) gone.set(e.used, new Set([...(gone.get(e.used) || []), ...e.subs]));
            out = edges.map((edge, i) => {
                const missing = index.isMissing(edge);
                // Missing sub-assets get their own row: keep the valid row to the valid places.
                const g = missing ? undefined : gone.get(edge.used);
                const e = g ? { ...edge, subs: edge.subs.filter((s) => !g.has(s)), locations: edge.locations.filter((l) => !l.sub || !g.has(l.sub)) } : edge;
                const row = assetRow(e.used, `d:${i}:${e.used}`, e, e.locations);
                if (missing) {
                    row.missing = true;
                    row.badge = '!';
                    row.importer = 'missing';
                    const what = e.subs.filter(Boolean).map((s) => `@${s}`).join(', ');
                    row.name = index.assets.has(e.used) ? `${row.name} ${what} (missing sub-asset)` : `Missing ${e.type ? e.type.replace(/^cc\./, '') : 'asset'}`;
                    row.folder = index.assets.has(e.used) ? row.folder : `${e.used}${what}`;
                    row.note = '';
                }
                return row;
            });
        } else if (state.mode === 'unused') {
            const filter = UNUSED_FILTERS.find((x) => x.id === state.unusedFilter);
            const known = new Set(UNUSED_FILTERS.flatMap((x) => x.importers || []));
            out = index.unused()
                .filter((u) => !filter?.importers || (filter.id === 'other' ? !known.has(u.asset.importer) : filter.importers.includes(u.asset.importer)))
                .map((u) => {
                    const row = assetRow(u.asset.uuid, `u:${u.asset.uuid}`);
                    if (u.usedBy.length) row.note = `used only by ${u.usedBy.map((x) => splitUrl(index.labelOf(x)).name).join(', ')}`;
                    return row;
                });
        } else if (state.mode === 'missing') {
            const byUser = new Map<string, Row>();
            for (const e of index.missing()) {
                let row = byUser.get(e.user);
                if (!row) {
                    row = assetRow(e.user, `m:${e.user}`);
                    byUser.set(e.user, row);
                }
                const what = index.assets.has(e.used)
                    ? `${splitUrl(index.labelOf(e.used)).name} @${e.subs.join(', @')}`
                    : `${e.type ? e.type.replace(/^cc\./, '') : 'asset'} ${e.used}${e.subs.filter(Boolean).map((s) => `@${s}`).join('')}`;
                for (const l of e.locations) {
                    const loc = locRow(l, `${row.key}#${row.locations.length}`);
                    loc.missing = what;
                    loc.sub = '';
                    row.locations.push(loc);
                }
            }
            out = [...byUser.values()];
        }
        return out.filter(matches);
    });

    const sceneRows = computed<SceneRow[]>(() => {
        const refs = state.scene.result?.refs || [];
        const f = state.filter.trim().toLowerCase();
        return refs
            .map((r, i) => ({ key: `s:${i}`, ...r, component: r.component.replace(/^cc\./, '') }))
            .filter((r) => !f || `${r.node} ${r.component} ${r.property}`.toLowerCase().includes(f));
    });

    const summary = computed(() => {
        version.value;
        const list = rows.value;
        const places = list.reduce((n, r) => n + r.locations.length, 0);
        switch (state.mode) {
            case 'references':
                return state.target ? `Used by ${list.length} asset${list.length === 1 ? '' : 's'} in ${places} place${places === 1 ? '' : 's'}` : '';
            case 'dependencies':
                return state.target ? `Uses ${list.filter((r) => !r.missing).length} asset(s)${list.some((r) => r.missing) ? `, ${list.filter((r) => r.missing).length} missing` : ''}` : '';
            case 'unused': {
                const size = list.reduce((n, r) => n + r.size, 0);
                return `${list.length} unused asset${list.length === 1 ? '' : 's'} · ${formatSize(size)}`;
            }
            case 'missing':
                return places ? `${places} missing reference${places === 1 ? '' : 's'} in ${list.length} asset${list.length === 1 ? '' : 's'}` : 'No missing references';
            case 'scene':
                return state.scene.result?.refs ? `${state.scene.result.refs.length} reference(s) in the open scene` : '';
        }
        return '';
    });

    const checkedRows = computed(() => rows.value.filter((r) => state.checked[r.key]));

    // ---------------------------------------------------------- actions

    function current(): PanelRequest {
        return { mode: state.mode, uuid: state.mode === 'scene' ? state.scene.uuid : state.target || undefined };
    }

    function apply(req: PanelRequest) {
        state.mode = req.mode;
        state.expanded = {};
        if (req.mode === 'scene') {
            // The scene may have changed since: always ask again.
            if (req.uuid) runScene(req.uuid);
        } else if (req.uuid !== undefined && (req.mode === 'references' || req.mode === 'dependencies')) {
            state.target = req.uuid;
        }
        if (req.mode !== 'unused') state.checked = {};
    }

    /** Go somewhere, remembering where we were (Back / Forward). */
    function navigate(req: PanelRequest) {
        const cur = current();
        const same = cur.mode === req.mode && (cur.uuid || '') === (req.uuid || '');
        if (!same) {
            state.history.push(cur);
            if (state.history.length > 50) state.history.shift();
            state.future = [];
        }
        if (!same || req.mode === 'scene') apply(req);
    }

    function back() {
        const prev = state.history.pop();
        if (!prev) return;
        state.future.push(current());
        apply(prev);
    }

    function forward() {
        const next = state.future.pop();
        if (!next) return;
        state.history.push(current());
        apply(next);
    }

    async function runScene(uuid: string) {
        state.scene.uuid = uuid;
        state.scene.loading = true;
        state.scene.result = null;
        state.scene.result = await bridge.findNodeReferences(uuid);
        state.scene.loading = false;
    }

    function useSelection() {
        if (state.mode === 'scene') {
            const node = bridge.selectedNode();
            if (node) navigate({ mode: 'scene', uuid: node });
            return;
        }
        const asset = bridge.selectedAsset();
        if (asset) navigate({ mode: state.mode === 'dependencies' ? 'dependencies' : 'references', uuid: asset });
    }

    /** Broadcast selection:select. */
    function onSelect(type: string, uuid: string) {
        if (!state.followSelection || !uuid) return;
        if (type === 'asset' && (state.mode === 'references' || state.mode === 'dependencies') && uuid !== state.target) {
            navigate({ mode: state.mode, uuid });
        } else if (type === 'node' && state.mode === 'scene' && uuid !== state.scene.uuid) {
            navigate({ mode: 'scene', uuid });
        }
    }

    function toggle(row: Row) {
        state.expanded[row.key] = !isExpanded(row);
    }

    function isExpanded(row: Row): boolean {
        return state.expanded[row.key] ?? (state.mode !== 'unused' && row.locations.length <= 8);
    }

    function selectAsset(row: Row) {
        if (row.missing || row.settings) return;
        bridge.selectAsset(row.uuid);
        bridge.locateAsset(row.uuid);
    }

    async function openAsset(row: Row) {
        if (row.missing || row.settings) return;
        await bridge.openAsset(row.uuid);
    }

    /** A place in a scene: select its node, opening the scene first if needed. */
    async function goToLocation(row: Row, loc: LocRow) {
        if (row.importer === 'scene' && loc.nodeId) {
            if ((await bridge.currentScene()) !== row.uuid) {
                await bridge.openAsset(row.uuid);
                for (let i = 0; i < 50 && (await bridge.currentScene()) !== row.uuid; i++) await new Promise((r) => setTimeout(r, 100));
            }
            bridge.selectNode(loc.nodeId);
            return;
        }
        selectAsset(row);
    }

    function selectSceneNode(r: SceneRow) {
        bridge.selectNode(r.nodeUuid);
    }

    function setChecked(row: Row, on: boolean) {
        state.checked[row.key] = on;
    }

    function checkAll(on: boolean) {
        const next: Record<string, boolean> = {};
        if (on) for (const r of rows.value) next[r.key] = true;
        state.checked = next;
    }

    async function deleteChecked() {
        const list = checkedRows.value;
        if (!list.length) return;
        const size = list.reduce((n, r) => n + r.size, 0);
        const names = list.slice(0, 12).map((r) => r.url.replace(/^db:\/\/assets\//, '')).join('\n') + (list.length > 12 ? `\n… and ${list.length - 12} more` : '');
        const ok = await bridge.confirm(`Delete ${list.length} unused asset${list.length === 1 ? '' : 's'} (${formatSize(size)})?`, names, 'Delete');
        if (!ok) return;
        await bridge.deleteAssets(list.map((r) => r.url));
        state.checked = {};
        await build();
    }

    async function start(request: PanelRequest | null) {
        if (request) apply(request);
        await build();
    }

    return {
        state,
        version,
        rows,
        sceneRows,
        targetRow,
        summary,
        checkedRows,
        index,
        build,
        start,
        assetsChanged,
        navigate,
        back,
        forward,
        useSelection,
        onSelect,
        toggle,
        isExpanded,
        selectAsset,
        openAsset,
        goToLocation,
        selectSceneNode,
        runScene,
        setChecked,
        checkAll,
        deleteChecked,
    };
}
