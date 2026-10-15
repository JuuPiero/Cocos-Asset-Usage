/**
 * Runs the real panel (Vue app + store + UsageIndex) in a browser on the
 * fixture project, with a fake editor bridge.
 *
 *   preview.html#interact    run the checks, print them into #result
 *   preview.html#references  (and #dependencies #unused #missing #scene) for screenshots
 */
import type { AssetRecord } from '../../source/core/types';
import type { FileSystem, IndexCache } from '../../source/core/usage-index';
import type { SceneQuery, UsageBridge } from '../../source/panels/default/bridge';
import { createUsageApp } from '../../source/panels/default/app';
import { fixtureFiles, U } from '../fixture-files';

const ROOT = '/project';
const files = new Map<string, { text: string; mtime: number }>();
for (const [rel, text] of Object.entries(fixtureFiles())) files.set(`${ROOT}/${rel}`, { text, mtime: 1000 });

const calls: string[] = [];
const errors: string[] = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
const err0 = console.error.bind(console);
console.error = (...a: any[]) => {
    errors.push(a.map(String).join(' '));
    err0(...a);
};

const fakeFs: FileSystem = {
    async stat(file) {
        const f = files.get(file);
        if (f) return { mtimeMs: f.mtime, size: f.text.length * 100, isDirectory: false };
        for (const k of files.keys()) if (k.startsWith(`${file}/`)) return { mtimeMs: 1, size: 0, isDirectory: true };
        return null;
    },
    async readText(file) {
        return files.get(file)?.text ?? null;
    },
};

function records(): AssetRecord[] {
    const out: AssetRecord[] = [];
    for (const [path, f] of files) {
        if (!path.startsWith(`${ROOT}/assets/`) || !path.endsWith('.meta')) continue;
        const meta = JSON.parse(f.text);
        const file = path.slice(0, -5);
        out.push({
            uuid: meta.uuid,
            url: `db://assets/${file.slice(`${ROOT}/assets/`.length)}`,
            file,
            importer: meta.importer,
            isDirectory: meta.importer === 'directory',
            subs: {},
            subsKnown: false,
        });
    }
    return out;
}

let openScene: string | null = null;
let cache: IndexCache | null = null;
const thumbs = new Map<string, string>();

function thumbFor(uuid: string): string {
    let url = thumbs.get(uuid);
    if (!url) {
        const c = document.createElement('canvas');
        c.width = c.height = 16;
        const g = c.getContext('2d')!;
        const hue = (parseInt(uuid.slice(-4), 16) * 47) % 360;
        g.fillStyle = `hsl(${hue}, 60%, 55%)`;
        g.beginPath();
        g.arc(8, 8, 7, 0, Math.PI * 2);
        g.fill();
        url = c.toDataURL();
        thumbs.set(uuid, url);
    }
    return url;
}

const bridge: UsageBridge = {
    fs: fakeFs,
    listAssets: async () => records(),
    settingsRoots: async () => [{ id: 'settings:settings/v2/packages/project.json', label: 'Project Settings (settings/v2/packages/project.json)', file: `${ROOT}/settings/v2/packages/project.json` }],
    loadCache: async () => cache,
    saveCache: async (c) => {
        cache = c;
    },
    selectAsset: (uuid) => calls.push(`select-asset ${uuid}`),
    locateAsset: (uuid) => calls.push(`locate ${uuid}`),
    openAsset: async (uuid) => {
        calls.push(`open ${uuid}`);
        if (uuid === U.scene) openScene = uuid;
    },
    currentScene: async () => openScene,
    selectNode: (uuid) => calls.push(`select-node ${uuid}`),
    async findNodeReferences(uuid): Promise<SceneQuery> {
        if (uuid !== 'node-hero') return { error: 'The node is not in the open scene.' };
        return {
            target: { name: 'Hero', path: 'Canvas/Hero' },
            refs: [
                { node: 'Canvas/Camera', nodeUuid: 'node-cam', component: 'FollowTarget', property: 'target', points: 'Node' },
                { node: 'Canvas/UI/HealthBar', nodeUuid: 'node-hp', component: 'HealthBar', property: 'player', points: 'Player' },
                { node: 'Canvas/UI/Button', nodeUuid: 'node-btn', component: 'cc.Button', property: 'clickEvents[0].target', points: 'Node' },
            ],
        };
    },
    selectedAsset: () => U.heroPrefab,
    selectedNode: () => 'node-hero',
    confirm: async (message) => {
        calls.push(`confirm ${message}`);
        return true;
    },
    deleteAssets: async (urls) => {
        calls.push(`delete ${urls.length}`);
        for (const url of urls) {
            const file = `${ROOT}/assets/${url.replace('db://assets/', '')}`;
            files.delete(file);
            files.delete(`${file}.meta`);
        }
    },
    thumbnail: (a) => (a.importer === 'image' ? thumbFor(a.uuid) : null),
};

// ----------------------------------------------------------------- checks

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: string[] = [];
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
    if (!ok) failed++;
    results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` -> ${detail}` : ''}`);
}
function report(text: string) {
    const out = document.createElement('div');
    out.id = 'result';
    out.textContent = text;
    document.body.appendChild(out);
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const text = (el: Element | null | undefined) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
/** A row's parts separated by spaces (they are separate spans spaced by CSS). */
const parts = (el: Element) => Array.from(el.children).map((c) => text(c)).filter(Boolean).join(' ');
const rowNames = () => $$('.au-row .au-name').map(text);
const click = (el: Element | null | undefined) => (el as HTMLElement)?.click();
const tab = (label: string) => $$('.au-tab').find((t) => text(t).startsWith(label));
const until = async (fn: () => boolean, ms = 3000) => {
    for (let t = 0; t < ms && !fn(); t += 20) await sleep(20);
    await sleep(30);
};

async function interact(app: ReturnType<typeof createUsageApp>) {
    await until(() => app.store.state.status === 'ready');
    check('scanned', app.store.state.status === 'ready' && app.store.state.stats.read > 20, JSON.stringify(app.store.state.stats));

    // References of hero.png
    check('target bar', text($('.au-target-name')) === 'hero.png');
    check('reference rows', rowNames().join() === 'Glow.mtl,Hero.prefab,Main.scene', rowNames().join());
    const locs = $$('.au-loc').map(parts);
    check('places', locs.join(' | ') === 'props[0].mainTexture texture | Hero Sprite spriteFrame | Canvas/Hero override spriteFrame | Canvas/Bad Sprite spriteFrame zzzzz', locs.join(' | '));
    check('thumbnail', !!$('.au-target-bar img, .au-bar img.au-thumb'));
    check('missing badge on tab', text(tab('Missing')).endsWith('2'), text(tab('Missing')));

    // A place in a scene that isn't open: open it, then select the node.
    click($$('.au-loc').find((l) => parts(l).startsWith('Canvas/Bad')));
    await until(() => calls.includes('select-node badId'));
    check('go to node in scene', calls.includes(`open ${U.scene}`) && calls.includes('select-node badId'), calls.join(' | '));

    // Filter
    app.store.state.filter = 'prefab';
    await sleep(30);
    check('filter', rowNames().join() === 'Hero.prefab', rowNames().join());
    app.store.state.filter = '';
    await sleep(30);

    // Drill into the scene's dependencies, then Back.
    const sceneRow = $$('.au-row').find((r) => text(r.querySelector('.au-name')) === 'Main.scene')!;
    click(Array.from(sceneRow.querySelectorAll('.au-mini')).find((b) => text(b) === 'Deps'));
    await sleep(50);
    check('dependencies tab', tab('Dependencies')!.classList.contains('active') && text($('.au-target-name')) === 'Main.scene');
    check('dependencies rows', rowNames().join() === 'hero.png @zzzzz (missing sub-asset),Missing SpriteFrame,Glow.mtl,Hero.prefab,hero.png', rowNames().join());
    check('missing rows are marked', $$('.au-row.missing').length === 2);
    click($('.au-icon[title="Back"]'));
    await sleep(50);
    check('back', tab('References')!.classList.contains('active') && text($('.au-target-name')) === 'hero.png');
    click($('.au-icon[title="Forward"]'));
    await sleep(50);
    check('forward', text($('.au-target-name')) === 'Main.scene');

    // Missing
    click(tab('Missing'));
    await sleep(50);
    check('missing rows', rowNames().join() === 'Main.scene' && $$('.au-missing').length === 2, $$('.au-missing').map(text).join(' | '));

    // Unused: filter, select, delete.
    click(tab('Unused'));
    await sleep(50);
    check('unused rows', rowNames().join() === 'Old.anim,Unused.prefab,lonely.png,unused.png', rowNames().join());
    check('used only by unused', text($$('.au-row').find((r) => text(r.querySelector('.au-name')) === 'lonely.png')!.querySelector('.au-note')) === 'used only by Unused.prefab');
    click($$('.au-chip').find((c) => text(c) === 'Images'));
    await sleep(30);
    check('type filter', rowNames().join() === 'lonely.png,unused.png', rowNames().join());
    const all = $('.au-bar .au-check input') as HTMLInputElement;
    all.checked = true;
    all.dispatchEvent(new Event('change'));
    await sleep(30);
    check('select all', text($('.au-btn.danger')) === 'Delete Selected (2)');
    click($('.au-btn.danger'));
    await until(() => app.store.state.status === 'ready' && calls.includes('delete 2') && rowNames().length === 0);
    check('delete', calls.some((c) => c.startsWith('confirm Delete 2 unused assets')) && calls.includes('delete 2') && rowNames().length === 0, rowNames().join());
    click($$('.au-chip').find((c) => text(c) === 'All'));
    await sleep(30);
    check('after delete', rowNames().join() === 'Old.anim,Unused.prefab', rowNames().join());

    // An edited file: rebuild reads only it.
    const mtl = `${ROOT}/assets/materials/Glow.mtl`;
    files.set(mtl, { text: JSON.stringify({ __type__: 'cc.Material', _effectAsset: null, _props: [] }), mtime: 2000 });
    app.assetsChanged();
    await sleep(700);
    await until(() => app.store.state.status === 'ready');
    check('incremental rebuild', app.store.state.stats.read === 1, JSON.stringify(app.store.state.stats));
    check('unused after edit', rowNames().join() === 'Old.anim,glow.effect,Unused.prefab', rowNames().join());

    // Follow Selection
    app.request({ mode: 'references', uuid: U.hero });
    await sleep(30);
    app.store.state.followSelection = true;
    app.onSelect('asset', U.heroPrefab);
    await sleep(50);
    check('follow selection', text($('.au-target-name')) === 'Hero.prefab' && rowNames().join() === 'Main.scene', rowNames().join());

    // In Scene
    app.request({ mode: 'scene', uuid: 'node-hero' });
    await until(() => $$('.au-scene-row').length > 0);
    check('scene refs', $$('.au-scene-row').map(parts).join(' | ') === 'Canvas/Camera FollowTarget target Node | Canvas/UI/HealthBar HealthBar player Player | Canvas/UI/Button Button clickEvents[0].target Node', $$('.au-scene-row').map(parts).join(' | '));
    click($$('.au-scene-row')[1]);
    check('select scene node', calls.includes('select-node node-hp'));

    check('no errors', errors.length === 0, errors.join(' | '));
    report(`${results.join('\n')}\n\n${results.length - failed} passed, ${failed} failed`);
}

async function shot(app: ReturnType<typeof createUsageApp>, mode: string) {
    await until(() => app.store.state.status === 'ready');
    if (mode === 'dependencies') app.request({ mode: 'dependencies', uuid: U.scene });
    else if (mode === 'unused') app.request({ mode: 'unused' });
    else if (mode === 'missing') app.request({ mode: 'missing' });
    else if (mode === 'scene') app.request({ mode: 'scene', uuid: 'node-hero' });
    await sleep(150);
    document.body.classList.add('ready');
}

const mode = location.hash.slice(1) || 'references';
const template = (window as any).__TEMPLATE__ as string;
const app = createUsageApp(document.getElementById('app')!, bridge, template, { mode: 'references', uuid: U.hero });
if (mode === 'interact') interact(app).catch((e) => report(`CRASH ${e?.stack || e}\n${results.join('\n')}`));
else shot(app, mode);
