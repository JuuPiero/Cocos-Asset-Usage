/**
 * A small Cocos-style project: scene, prefabs (one nested with an override),
 * material, effect, animations, a TexturePacker atlas, scripts with imports
 * and resources.load strings, resources and an Asset Bundle, project
 * settings, plus unused assets and broken references. Pure data, so the
 * browser preview can use it too (tests/fixture-disk.ts writes it out).
 */
import { compressUuid } from '../source/core/uuid';

export const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const U = {
    player: id(1),
    utils: id(2),
    unusedScript: id(3),
    itemData: id(4),
    hero: id(10),
    unusedPng: id(11),
    lonelyPng: id(12),
    sheetPng: id(13),
    sheet: id(14),
    enemyPng: id(15),
    coin: id(16),
    splash: id(17),
    heroPrefab: id(20),
    unusedPrefab: id(21),
    enemyPrefab: id(22),
    bossPrefab: id(23),
    scene: id(30),
    glow: id(40),
    glowEffect: id(41),
    walk: id(50),
    oldAnim: id(51),
    resources: id(60),
    level2: id(61),
    missing: 'deadbeef-dead-4bee-8eef-deadbeefdead',
};

export const PLAYER_SOURCE = `import { _decorator, Component, resources, Prefab, SpriteFrame } from 'cc';
import { clamp } from './Utils';
// import { nope } from './Commented';
const { ccclass } = _decorator;

@ccclass('Player')
export class Player extends Component {
    start() {
        resources.load('prefabs/Enemy', Prefab, () => {});
        resources.load('ui/icons/coin/spriteFrame', SpriteFrame, () => {});
        console.log(clamp(1), 'not a path');
    }
    onClick() {}
}
`;

function imageMeta(uuid: string) {
    return {
        ver: '1.0.27', importer: 'image', imported: true, uuid, files: ['.png', '.json'],
        subMetas: {
            '6c48a': { importer: 'texture', uuid: `${uuid}@6c48a`, id: '6c48a', name: 'texture', userData: { imageUuidOrDatabaseUri: uuid }, subMetas: {} },
            f9941: { importer: 'sprite-frame', uuid: `${uuid}@f9941`, id: 'f9941', name: 'spriteFrame', userData: { imageUuidOrDatabaseUri: `${uuid}@6c48a`, atlasUuid: '' }, subMetas: {} },
        },
        userData: { type: 'sprite-frame', redirect: `${uuid}@6c48a` },
    };
}

const vec3 = { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 };

function node(name: string, parent: number | null, children: number[], components: number[], extra: Record<string, unknown> = {}) {
    return {
        __type__: 'cc.Node', _name: name, _objFlags: 0, __editorExtras__: {},
        _parent: parent === null ? null : { __id__: parent },
        _children: children.map((n) => ({ __id__: n })),
        _active: true,
        _components: components.map((n) => ({ __id__: n })),
        _prefab: null, _lpos: vec3, ...extra,
    };
}

function sprite(nodeId: number, frame: string | null, extra: Record<string, unknown> = {}) {
    return {
        __type__: 'cc.Sprite', _name: '', _objFlags: 0, node: { __id__: nodeId }, _enabled: true,
        _spriteFrame: frame ? { __uuid__: frame, __expectedType__: 'cc.SpriteFrame' } : null,
        _customMaterial: null, ...extra,
    };
}

/** Hero.prefab: Hero (Sprite, Player, Button, Animation) > Weapon (Sprite from the atlas). */
function heroPrefab() {
    return [
        { __type__: 'cc.Prefab', _name: 'Hero', data: { __id__: 1 }, optimizationPolicy: 0 },
        node('Hero', null, [2], [4, 5, 6, 8], { _prefab: { __id__: 10 } }),
        node('Weapon', 1, [], [3]),
        sprite(2, `${U.sheet}@31105`),
        sprite(1, `${U.hero}@f9941`),
        {
            __type__: compressUuid(U.player), _name: '', node: { __id__: 1 }, _enabled: true,
            items: [{ __type__: 'ItemData', name: 'sword' }],
        },
        { __type__: 'cc.Button', _name: '', node: { __id__: 1 }, _enabled: true, clickEvents: [{ __id__: 7 }] },
        { __type__: 'cc.ClickEvent', target: { __id__: 1 }, component: '', _componentId: compressUuid(U.player), handler: 'onClick', customEventData: '' },
        {
            __type__: 'cc.Animation', _name: '', node: { __id__: 1 }, _enabled: true,
            _clips: [{ __uuid__: U.walk, __expectedType__: 'cc.AnimationClip' }], _defaultClip: { __uuid__: U.walk, __expectedType__: 'cc.AnimationClip' },
        },
        { __type__: 'cc.CompPrefabInfo', fileId: 'abc' },
        { __type__: 'cc.PrefabInfo', root: { __id__: 1 }, asset: { __id__: 0 }, fileId: 'root', instance: null },
    ];
}

/** Main.scene: Canvas > Hero (Hero.prefab instance, spriteFrame overridden), Bad (missing references). */
function mainScene() {
    return [
        { __type__: 'cc.SceneAsset', _name: 'Main', scene: { __id__: 1 } },
        { __type__: 'cc.Scene', _name: 'Main', _parent: null, _children: [{ __id__: 2 }], _components: [], _globals: { __id__: 12 }, _id: U.scene },
        node('Canvas', 1, [3, 9], [], { _id: 'canvasId' }),
        node('Hero', 2, [], [], { _prefab: { __id__: 4 }, _id: 'heroId' }),
        { __type__: 'cc.PrefabInfo', root: { __id__: 3 }, asset: { __uuid__: U.heroPrefab, __expectedType__: 'cc.Prefab' }, fileId: 'x', instance: { __id__: 5 } },
        { __type__: 'cc.PrefabInstance', fileId: 'y', prefabRootNode: null, mountedChildren: [], propertyOverrides: [{ __id__: 6 }, { __id__: 8 }] },
        { __type__: 'CCPropertyOverrideInfo', targetInfo: { __id__: 7 }, propertyPath: ['_spriteFrame'], value: { __uuid__: `${U.hero}@f9941`, __expectedType__: 'cc.SpriteFrame' } },
        { __type__: 'TargetInfo', localID: ['abc'] },
        { __type__: 'CCPropertyOverrideInfo', targetInfo: { __id__: 7 }, propertyPath: ['_name'], value: 'Hero' },
        node('Bad', 2, [], [10, 11], { _id: 'badId' }),
        sprite(9, `${U.missing}@f9941`, { _customMaterial: { __uuid__: U.glow, __expectedType__: 'cc.Material' } }),
        sprite(9, `${U.hero}@zzzzz`),
        { __type__: 'cc.SceneGlobals', skybox: { __id__: 13 } },
        { __type__: 'cc.SkyboxInfo', _envmapHDR: null, _enabled: false },
    ];
}

/** The fixture project as relative path -> content (folders are implied by their files). */
export function fixtureFiles(): Record<string, string> {
    const files: Record<string, string> = {};
    const write = (rel: string, content: string | object) => {
        files[rel] = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    };
    const meta = (rel: string, uuid: string, importer: string, extra: Record<string, unknown> = {}) =>
        write(`${rel}.meta`, { ver: '1.0.0', importer, imported: true, uuid, files: [], subMetas: {}, userData: {}, ...extra });
    const dir = (rel: string, uuid: string, userData: Record<string, unknown> = {}) => meta(rel, uuid, 'directory', { userData });
    const png = (rel: string, uuid: string) => {
        write(rel, 'PNG');
        write(`${rel}.meta`, imageMeta(uuid));
    };

    let n = 100;
    for (const d of ['assets/scripts', 'assets/scripts/data', 'assets/textures', 'assets/atlas', 'assets/prefabs', 'assets/scenes', 'assets/materials', 'assets/effects', 'assets/anim', 'assets/resources/prefabs', 'assets/resources/ui', 'assets/resources/ui/icons', 'assets/bundles']) {
        dir(d, d === 'assets/resources' ? U.resources : id(n++));
    }
    dir('assets/resources', U.resources, { isBundle: true, bundleName: 'resources' });
    dir('assets/bundles/level2', U.level2, { isBundle: true, bundleName: 'level2' });

    write('assets/scripts/Player.ts', PLAYER_SOURCE);
    meta('assets/scripts/Player.ts', U.player, 'typescript');
    write('assets/scripts/Utils.ts', 'export function clamp(v: number) { return v; }\n');
    meta('assets/scripts/Utils.ts', U.utils, 'typescript');
    write('assets/scripts/Unused.ts', 'export const x = 1;\n');
    meta('assets/scripts/Unused.ts', U.unusedScript, 'typescript');
    write('assets/scripts/data/ItemData.ts', "import { _decorator } from 'cc';\nconst { ccclass } = _decorator;\n@ccclass('ItemData')\nexport class ItemData { name = ''; }\n");
    meta('assets/scripts/data/ItemData.ts', U.itemData, 'typescript');

    png('assets/textures/hero.png', U.hero);
    png('assets/textures/unused.png', U.unusedPng);
    png('assets/textures/lonely.png', U.lonelyPng);
    png('assets/textures/splash.png', U.splash);
    png('assets/atlas/sheet.png', U.sheetPng);
    write('assets/atlas/sheet.plist', '<plist/>');
    write('assets/atlas/sheet.plist.meta', {
        ver: '1.0.8', importer: 'sprite-atlas', imported: true, uuid: U.sheet, files: ['.json'],
        subMetas: {
            31105: { importer: 'sprite-frame', uuid: `${U.sheet}@31105`, id: '31105', name: 'walk_0', userData: { imageUuidOrDatabaseUri: `${U.sheetPng}@6c48a`, atlasUuid: U.sheet }, subMetas: {} },
        },
        userData: { atlasTextureName: 'sheet.png', textureUuid: `${U.sheetPng}@6c48a` },
    });

    write('assets/prefabs/Hero.prefab', heroPrefab());
    meta('assets/prefabs/Hero.prefab', U.heroPrefab, 'prefab', { userData: { syncNodeName: 'Hero' } });
    write('assets/prefabs/Unused.prefab', [
        { __type__: 'cc.Prefab', _name: 'Unused', data: { __id__: 1 } },
        node('Unused', null, [], [2]),
        sprite(1, `${U.lonelyPng}@f9941`),
    ]);
    meta('assets/prefabs/Unused.prefab', U.unusedPrefab, 'prefab');
    write('assets/resources/prefabs/Enemy.prefab', [
        { __type__: 'cc.Prefab', _name: 'Enemy', data: { __id__: 1 } },
        node('Enemy', null, [], [2]),
        sprite(1, `${U.enemyPng}@f9941`),
    ]);
    meta('assets/resources/prefabs/Enemy.prefab', U.enemyPrefab, 'prefab');
    png('assets/textures/enemy.png', U.enemyPng);
    png('assets/resources/ui/icons/coin.png', U.coin);
    write('assets/bundles/level2/Boss.prefab', [{ __type__: 'cc.Prefab', _name: 'Boss', data: { __id__: 1 } }, node('Boss', null, [], [])]);
    meta('assets/bundles/level2/Boss.prefab', U.bossPrefab, 'prefab');

    write('assets/scenes/Main.scene', mainScene());
    meta('assets/scenes/Main.scene', U.scene, 'scene');

    write('assets/materials/Glow.mtl', {
        __type__: 'cc.Material', _name: '', _effectAsset: { __uuid__: U.glowEffect, __expectedType__: 'cc.EffectAsset' }, _techIdx: 0,
        _defines: [{}], _states: [], _props: [{ mainTexture: { __uuid__: `${U.hero}@6c48a`, __expectedType__: 'cc.Texture2D' } }],
    });
    meta('assets/materials/Glow.mtl', U.glow, 'material');
    write('assets/effects/glow.effect', 'CCEffect %{ }%');
    meta('assets/effects/glow.effect', U.glowEffect, 'effect');

    const clip = (frames: string[]) => ({
        __type__: 'cc.AnimationClip', _name: '', sample: 60, _tracks: [{ __id__: 1 }],
        _exoticAnimation: null, _events: [], _keys: [], frames: frames.map((f) => ({ __uuid__: f, __expectedType__: 'cc.SpriteFrame' })),
    });
    write('assets/anim/Walk.anim', clip([`${U.sheet}@31105`]));
    meta('assets/anim/Walk.anim', U.walk, 'animation-clip');
    write('assets/anim/Old.anim', clip([`${U.sheet}@31105`]));
    meta('assets/anim/Old.anim', U.oldAnim, 'animation-clip');

    write('settings/v2/packages/project.json', { __version__: '1.0.6', splash: { image: U.splash }, general: { designResolution: { width: 960 } } });
    return files;
}
