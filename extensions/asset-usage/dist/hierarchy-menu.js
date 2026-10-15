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

// source/hierarchy-menu.ts
var hierarchy_menu_exports = {};
__export(hierarchy_menu_exports, {
  onNodeMenu: () => onNodeMenu
});
module.exports = __toCommonJS(hierarchy_menu_exports);
function onNodeMenu(node) {
  var _a;
  let uuid = (node == null ? void 0 : node.uuid) || ((_a = node == null ? void 0 : node.value) == null ? void 0 : _a.uuid);
  return uuid ? [
    {
      label: "Find References In Scene",
      click() {
        Editor.Message.send("asset-usage", "find-in-scene", uuid);
      }
    }
  ] : [];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  onNodeMenu
});
//# sourceMappingURL=hierarchy-menu.js.map
