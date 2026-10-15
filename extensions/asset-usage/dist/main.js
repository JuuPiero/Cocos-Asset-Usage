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

// source/main.ts
var main_exports = {};
__export(main_exports, {
  load: () => load,
  methods: () => methods,
  unload: () => unload
});
module.exports = __toCommonJS(main_exports);
var PACKAGE = "asset-usage", pending = null;
async function show(request) {
  pending = request, await Editor.Panel.open(PACKAGE), Editor.Message.send(PACKAGE, "panel-request", request);
}
var methods = {
  openPanel() {
    Editor.Panel.open(PACKAGE);
  },
  findReferences(uuid) {
    uuid && show({ mode: "references", uuid });
  },
  showDependencies(uuid) {
    uuid && show({ mode: "dependencies", uuid });
  },
  findUnused() {
    show({ mode: "unused" });
  },
  findMissing() {
    show({ mode: "missing" });
  },
  findInScene(nodeUuid) {
    nodeUuid && show({ mode: "scene", uuid: nodeUuid });
  },
  takePending() {
    let r = pending;
    return pending = null, r;
  }
};
function load() {
}
function unload() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  methods,
  unload
});
//# sourceMappingURL=main.js.map
