import assert from 'assert';
import { existsSync, readFileSync, utimesSync, writeFileSync } from 'fs';
import { join } from 'path';
import { assetsFromDisk, nodeFs, settingsRoots } from '../source/core/node-fs';
import { scanMeta, scanScript, scanSerialized, stripComments } from '../source/core/parse';
import { compressUuid, splitUuid } from '../source/core/uuid';
import { Edge, UsageIndex } from '../source/core/usage-index';
import { makeFixture } from './fixture-disk';
import { PLAYER_SOURCE, U } from './fixture-files';
import { section, test } from './harness';

section('uuid');

test('compresses script uuids like Cocos', () => {
    // From a real scene: AdvancedInspectorDemo.ts and its component __type__.
    assert.strictEqual(compressUuid('8894b520-31df-4553-aadc-1fd889c3d44d'), '8894bUgMd9FU6rcH9iJw9RN');
    assert.strictEqual(compressUuid('8894b520-31df-4553-aadc-1fd889c3d44d', true).length, 22);
    assert.deepStrictEqual(splitUuid('f1072ac0-4426-4cff-a628-cfb26925f8e4@f9941'), { uuid: 'f1072ac0-4426-4cff-a628-cfb26925f8e4', sub: 'f9941' });
    assert.strictEqual(splitUuid('not-a-uuid'), null);
});

section('parse');

test('scripts: imports, class names, strings', () => {
    const r = scanScript(PLAYER_SOURCE);
    assert.deepStrictEqual(r.imports.sort(), ['./Utils', 'cc']);
    assert.deepStrictEqual(r.classNames, ['Player']);
    const texts = r.strings.map((s) => s.text);
    assert.ok(texts.includes('prefabs/Enemy') && texts.includes('ui/icons/coin/spriteFrame'));
    assert.ok(!texts.includes('not a path') && !texts.includes('./Utils'));
    assert.strictEqual(r.strings.find((s) => s.text === 'prefabs/Enemy')!.line, 9);
});

test('comments are removed but strings kept', () => {
    assert.strictEqual(stripComments("a // x\nb /* y */ 'c // d'"), "a     \nb         'c // d'");
});

test('meta: references to other assets, not to itself', () => {
    const r = scanMeta({
        uuid: 'aaaaaaaa-0000-4000-8000-000000000001',
        subMetas: {
            x: { uuid: 'aaaaaaaa-0000-4000-8000-000000000001@x', name: 'frame', userData: { image: 'aaaaaaaa-0000-4000-8000-000000000001@t', atlas: 'bbbbbbbb-0000-4000-8000-000000000002' } },
        },
        userData: { redirect: 'aaaaaaaa-0000-4000-8000-000000000001@t', font: 'cccccccc-0000-4000-8000-000000000003@t' },
    }, 'aaaaaaaa-0000-4000-8000-000000000001');
    assert.deepStrictEqual(r.uses.map((u) => [u.uuid, u.subs, u.locations[0]]), [
        ['bbbbbbbb-0000-4000-8000-000000000002', [''], { component: 'Import Settings (frame)', property: 'atlas' }],
        ['cccccccc-0000-4000-8000-000000000003', ['t'], { component: 'Import Settings', property: 'font', sub: 't' }],
    ]);
});

const realScene = 'E:/Workspace/cocos/AdvanceInspector/assets/scene.scene';
test('a real scene: script component and sprite frame on a node', () => {
    if (!existsSync(realScene)) return;
    const r = scanSerialized(JSON.parse(readFileSync(realScene, 'utf8')));
    const script = r.types.find((t) => t.id === '8894bUgMd9FU6rcH9iJw9RN')!;
    assert.strictEqual(script.location.property, '(script)');
    const icon = r.uses.find((u) => u.uuid === 'f1072ac0-4426-4cff-a628-cfb26925f8e4')!;
    assert.deepStrictEqual(icon.subs, ['f9941']);
    assert.strictEqual(icon.type, 'cc.SpriteFrame');
    assert.deepStrictEqual({ ...icon.locations[0], nodeId: undefined }, { node: script.location.node, nodeId: undefined, component: '8894bUgMd9FU6rcH9iJw9RN', property: 'icon', sub: 'f9941' });
    const sky = r.uses.find((u) => u.uuid === 'd032ac98-05e1-4090-88bb-eb640dcb5fc1')!;
    assert.strictEqual(sky.locations[0].component, 'Scene');
    assert.ok(sky.locations[0].property.startsWith('globals.skybox.'), sky.locations[0].property);
});

// ------------------------------------------------------------- the index

const root = makeFixture();
let index: UsageIndex;

const build = async (idx: UsageIndex, cache?: any) => {
    await idx.build(await assetsFromDisk(root), nodeFs, { extras: await settingsRoots(root), cache });
    return idx;
};
const url = (idx: UsageIndex, uuid: string) => idx.labelOf(uuid).replace('db://assets/', '');
const describe = (idx: UsageIndex, e: Edge, side: 'user' | 'used') =>
    `${url(idx, e[side])}: ${e.locations.map((l) => [l.node, idx.componentName(l.component), l.property].filter((x) => x !== undefined && x !== '').join(' · ')).join(' | ')}`;

section('index');

test('builds from a project folder', async () => {
    index = await build(new UsageIndex());
    assert.ok(index.stats.read > 20 && index.stats.cached === 0, JSON.stringify(index.stats));
    assert.strictEqual(index.assets.get(U.hero)!.subs.f9941, 'spriteFrame');
});

test('references to an image, with places', () => {
    assert.deepStrictEqual(index.usersOf(U.hero).map((e) => describe(index, e, 'user')), [
        'materials/Glow.mtl: props[0].mainTexture',
        'prefabs/Hero.prefab: Hero · Sprite · spriteFrame',
        'scenes/Main.scene: Canvas/Hero · override spriteFrame | Canvas/Bad · Sprite · spriteFrame',
    ]);
});

test('references to one sub-asset', () => {
    assert.deepStrictEqual(index.usersOf(`${U.hero}@6c48a`).map((e) => url(index, e.user)), ['materials/Glow.mtl']);
});

test('scripts: components, click events, class names, imports', () => {
    assert.deepStrictEqual(index.usersOf(U.player).map((e) => describe(index, e, 'user')), [
        'prefabs/Hero.prefab: Hero · Player · (script) | Hero · Button · clickEvents[0].componentId',
    ]);
    assert.deepStrictEqual(index.usersOf(U.itemData).map((e) => describe(index, e, 'user')), ['prefabs/Hero.prefab: Hero · Player · items[0]']);
    assert.deepStrictEqual(index.usersOf(U.utils).map((e) => describe(index, e, 'user')), ["scripts/Player.ts: import './Utils'"]);
    assert.deepStrictEqual(index.usersOf(U.unusedScript), []);
});

test('import settings and atlases', () => {
    assert.deepStrictEqual(index.usersOf(U.sheetPng).map((e) => describe(index, e, 'user')), [
        'atlas/sheet.plist: Import Settings (walk_0) · imageUuidOrDatabaseUri | Import Settings · textureUuid',
    ]);
    assert.deepStrictEqual(index.usersOf(U.sheet).map((e) => url(index, e.user)), ['anim/Old.anim', 'anim/Walk.anim', 'prefabs/Hero.prefab']);
});

test('load paths in code', () => {
    assert.deepStrictEqual(index.usersOf(U.enemyPrefab).map((e) => describe(index, e, 'user')), ["scripts/Player.ts: 'prefabs/Enemy' (line 9)"]);
    const coin = index.usersOf(`${U.coin}@f9941`);
    assert.strictEqual(coin.length, 1);
    assert.strictEqual(coin[0].locations[0].via, 'code');
});

test('nested prefab instance and project settings', () => {
    assert.deepStrictEqual(index.usersOf(U.heroPrefab).map((e) => describe(index, e, 'user')), ['scenes/Main.scene: Canvas/Hero · prefab instance']);
    assert.deepStrictEqual(index.usersOf(U.splash).map((e) => url(index, e.user)), ['Project Settings (settings/v2/packages/project.json)']);
    assert.strictEqual(index.usersOf(U.heroPrefab)[0].locations[0].nodeId, 'heroId');
});

test('dependencies, missing ones included', () => {
    const names = index.dependenciesOf(U.scene).map((e) => (index.isMissing(e) ? `missing ${e.used}` : url(index, e.used)));
    assert.deepStrictEqual(names, [`missing ${U.hero}`, `missing ${U.missing}`, 'materials/Glow.mtl', 'prefabs/Hero.prefab', 'textures/hero.png']);
});

test('missing references and missing sub-assets', () => {
    assert.deepStrictEqual(index.missing().map((e) => `${url(index, e.user)} -> ${e.used.slice(0, 8)}@${e.subs.join(',')} (${e.type}) at ${e.locations.map((l) => l.node).join()}`), [
        'scenes/Main.scene -> 00000000@zzzzz (cc.SpriteFrame) at Canvas/Bad',
        'scenes/Main.scene -> deadbeef@f9941 (cc.SpriteFrame) at Canvas/Bad',
    ]);
    // Narrowed to one sub-asset, only its places are listed.
    assert.deepStrictEqual(index.usersOf(`${U.hero}@f9941`).map((e) => e.locations.map((l) => l.node || l.property).join()), [
        'Hero',
        'Canvas/Hero',
    ]);
});

test('unused assets', () => {
    assert.deepStrictEqual(index.unused().map((u) => `${url(index, u.asset.uuid)}${u.usedBy.length ? ` (used by ${u.usedBy.map((x) => url(index, x)).join()})` : ''}`), [
        'anim/Old.anim',
        'prefabs/Unused.prefab',
        'textures/lonely.png (used by prefabs/Unused.prefab)',
        'textures/unused.png',
    ]);
});

test('component names', () => {
    assert.strictEqual(index.componentName('cc.Sprite'), 'Sprite');
    assert.strictEqual(index.componentName(compressUuid(U.player)), 'Player');
    assert.strictEqual(index.componentName('Import Settings'), 'Import Settings');
});

const realProject = 'E:/Workspace/cocos/AdvanceInspector';
test('a real project: scene uses the demo script and the image', async () => {
    if (!existsSync(join(realProject, 'assets'))) return;
    const idx = new UsageIndex();
    await idx.build(await assetsFromDisk(realProject), nodeFs, { extras: await settingsRoots(realProject) });
    const scene = [...idx.assets.values()].find((a) => a.url === 'db://assets/scene.scene')!;
    const demo = [...idx.assets.values()].find((a) => a.url === 'db://assets/AdvancedInspectorDemo.ts')!;
    const image = [...idx.assets.values()].find((a) => a.importer === 'image')!;
    assert.deepStrictEqual(idx.usersOf(demo.uuid).map((e) => e.user), [scene.uuid]);
    assert.deepStrictEqual(idx.usersOf(image.uuid).map((e) => e.user), [scene.uuid]);
    assert.strictEqual(idx.usersOf(image.uuid)[0].locations[0].property, 'icon');
    assert.deepStrictEqual(idx.unused(), []);
});

section('cache');

test('a rebuild reads only changed files', async () => {
    const again = await build(new UsageIndex(), index.toCache());
    assert.strictEqual(again.stats.read, 0, JSON.stringify(again.stats));
    const file = join(root, 'assets/materials/Glow.mtl');
    writeFileSync(file, JSON.stringify({ __type__: 'cc.Material', _effectAsset: null, _props: [] }));
    const later = new Date(Date.now() + 5000);
    utimesSync(file, later, later);
    const third = await build(new UsageIndex(), again.toCache());
    assert.strictEqual(third.stats.read, 1, JSON.stringify(third.stats));
    assert.deepStrictEqual(third.usersOf(U.glowEffect), []);
    assert.ok(third.unused().some((u) => u.asset.uuid === U.glowEffect));
});
