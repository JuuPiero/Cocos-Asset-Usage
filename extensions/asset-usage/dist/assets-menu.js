"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// source/assets-menu.ts
var assets_menu_exports = {};
__export(assets_menu_exports, {
  onAssetMenu: () => onAssetMenu
});
module.exports = __toCommonJS(assets_menu_exports);
function onAssetMenu(assetInfo) {
  if (!(assetInfo != null && assetInfo.uuid)) return [];
  let items = [
    {
      label: "Find References",
      click() {
        Editor.Message.send("asset-usage", "find-references", assetInfo.uuid);
      }
    }
  ];
  return assetInfo.isDirectory || items.push({
    label: "Show Dependencies",
    click() {
      Editor.Message.send("asset-usage", "show-dependencies", assetInfo.uuid);
    }
  }), items;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  onAssetMenu
});
//# sourceMappingURL=assets-menu.js.map
