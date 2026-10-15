# asset-usage

Find where assets are used in a Cocos Creator 3.8 project, like Unity's **Find References In Project** and **Find References In Scene**. It can also list unused assets and broken references.

## Opening it

- **Assets panel → right-click an asset → Find References** lists everything that uses it.
- **Assets panel → right-click an asset → Show Dependencies** lists everything it uses.
- **Hierarchy → right-click a node → Find References In Scene** lists what in the open scene points at that node.
- **Panel → Asset Usage** opens the panel.
- **Extension → Asset Usage → Find Unused Assets / Find Missing References** open the panel on those tabs.

## Tabs

| Tab | Shows |
|---|---|
| **References** | Every asset that uses the target, and each place it is used: node path, component and property (`Canvas/Hero · Sprite · spriteFrame`). A sub-asset (an image's spriteFrame, an atlas frame) narrows it to that sub-asset. |
| **Dependencies** | What the target uses. Missing references are listed first, in red. |
| **Unused** | Project assets that no scene, script, resources folder, Asset Bundle or project setting reaches. Filter by type, see the size, select and delete. |
| **Missing** | References to assets or sub-assets that no longer exist, with where they are. |
| **In Scene** | Components in the open scene that point at a node or at one of its components, read from the live scene, so unsaved changes count. |

- **Click** a row to select the asset (Inspector, Assets panel). **Double-click** it to open it.
- **Click a place in a scene** to select that node. If the scene isn't open, it opens first.
- **Refs / Deps** (on hover) jump to that asset's references or dependencies. **‹ ›** go back and forward.
- **Follow Selection** updates the target when you select another asset (or node, in In Scene).
- **Filter** searches names, paths and places.

## What counts as a reference

- Asset references in scenes, prefabs (including nested prefab instances and their overrides), materials, animation clips and graphs, physics materials, render textures, label atlases and auto atlases.
- Import settings in `.meta` files: atlas frames → atlas texture, bitmap fonts, spine, models, ...
- Script components: a scene or prefab that has a component (or a `@ccclass` object, or a Button click event) from a script uses that script.
- Script imports (`import ... from './Utils'`).
- **Strings in code** that match the load path of an asset in `resources` or an Asset Bundle, e.g. `resources.load('prefabs/Enemy')` or `'ui/icon/spriteFrame'`. These are marked **code**. They are a strong hint, not proof.
- Project settings (`settings/**/*.json`), e.g. the splash image.

### Unused assets

Everything is counted as used when it is reachable from a root: all scenes, all scripts, everything in `resources` and Asset Bundles (code may load it by path), and project settings. An asset used only by unused assets is unused too. It shows "used only by …".

Check before deleting. Code that builds paths at runtime (`'level' + n`), loads by uuid, or uses remote assets can't be seen. Deleting goes through the asset database, the same as deleting in the Assets panel.

## Speed

The first scan reads every asset. The results are cached in `temp/asset-usage/index.json`, keyed by file modification time. After that, only changed files are read, and the panel updates by itself when assets change. **Rescan** reads everything again.

## Development

```bash
npm install
npm run build      # type-check + bundle to dist/
npm test           # parser and index tests (on a generated fixture project)
npm run preview    # builds tests/preview/out/preview.html: the panel in a browser with a fake editor
```

After a build, reload `asset-usage` in **Extension → Extension Manager**.
