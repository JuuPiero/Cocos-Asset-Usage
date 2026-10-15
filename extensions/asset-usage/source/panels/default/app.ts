/**
 * Vue app of the Asset Usage panel. Free of Node / Editor APIs (those come
 * through the UsageBridge), so it also runs in a plain browser preview.
 */
import { computed, createApp, defineComponent, h, type PropType } from 'vue';
import type { Mode, PanelRequest } from '../../shared';
import type { UsageBridge } from './bridge';
import { createStore, formatSize, Row, Store, UNUSED_FILTERS } from './store';

export interface UsageApp {
    readonly store: Store;
    request(req: PanelRequest): void;
    onSelect(type: string, uuid: string): void;
    assetsChanged(): void;
    destroy(): void;
}

const TABS: { id: Mode; label: string; title: string }[] = [
    { id: 'references', label: 'References', title: 'Assets that use the target asset, and where' },
    { id: 'dependencies', label: 'Dependencies', title: 'Assets the target asset uses' },
    { id: 'unused', label: 'Unused', title: 'Project assets no scene, bundle or script reaches' },
    { id: 'missing', label: 'Missing', title: 'References to assets that no longer exist' },
    { id: 'scene', label: 'In Scene', title: 'What in the open scene points at a node' },
];

const AssetIcon = defineComponent({
    name: 'AssetIcon',
    props: { row: { type: Object as PropType<Row>, required: true } },
    setup(props) {
        return () =>
            props.row.thumb
                ? h('img', { class: 'au-thumb', src: props.row.thumb, draggable: false })
                : h('span', { class: ['au-badge', `k-${props.row.importer}`] }, props.row.badge);
    },
});

export function createUsageApp(el: HTMLElement, bridge: UsageBridge, template: string, request: PanelRequest | null): UsageApp {
    const store = createStore(bridge);
    const { state } = store;

    const Root = defineComponent({
        components: { AssetIcon },
        template,
        setup() {
            const tabs = computed(() =>
                TABS.map((t) => ({ ...t, count: t.id === 'missing' && state.status === 'ready' ? missingCount.value : 0 })));
            const missingCount = computed(() => {
                store.version.value; // recompute when the index changes
                return store.index.missing().reduce((n, e) => n + e.locations.length, 0);
            });

            const statusText = computed(() => {
                if (state.status === 'scanning') return state.progress.total ? `Scanning ${state.progress.done} / ${state.progress.total}…` : 'Listing assets…';
                if (state.status === 'error') return `Scan failed: ${state.error}`;
                if (state.status !== 'ready') return '';
                const s = state.stats;
                return `${s.assets} assets · ${(s.ms / 1000).toFixed(1)}s (${s.read} read, ${s.cached} cached)`;
            });

            const emptyText = computed(() => {
                if (state.status === 'scanning') return 'Scanning assets…';
                switch (state.mode) {
                    case 'references':
                        return state.target ? 'Nothing uses this asset.' : '';
                    case 'dependencies':
                        return state.target ? 'This asset uses no other assets.' : '';
                    case 'unused':
                        return 'No unused assets.';
                    case 'missing':
                        return 'No missing references.';
                }
                return '';
            });

            const sceneTitle = computed(() => {
                const r = state.scene.result;
                if (state.scene.loading) return 'Searching the open scene…';
                if (!state.scene.uuid) return '';
                if (r?.error) return r.error;
                return r?.target ? r.target.path || r.target.name : '';
            });

            const goTab = (id: Mode) => {
                if (id === 'scene') store.navigate({ mode: 'scene', uuid: state.scene.uuid || bridge.selectedNode() || undefined });
                else if (id === 'references' || id === 'dependencies') store.navigate({ mode: id, uuid: state.target || bridge.selectedAsset() || undefined });
                else store.navigate({ mode: id });
            };

            const allChecked = computed(() => store.rows.value.length > 0 && store.rows.value.every((r) => state.checked[r.key]));

            return {
                store, state, tabs, statusText, emptyText, sceneTitle, goTab, allChecked, formatSize,
                filters: UNUSED_FILTERS,
                rows: store.rows,
                sceneRows: store.sceneRows,
                targetRow: store.targetRow,
                summary: store.summary,
                checkedRows: store.checkedRows,
            };
        },
    });

    const app = createApp(Root);
    app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');
    app.mount(el);
    store.start(request);

    return {
        store,
        request: (req) => store.navigate(req),
        onSelect: (type, uuid) => store.onSelect(type, uuid),
        assetsChanged: () => store.assetsChanged(),
        destroy: () => app.unmount(),
    };
}
