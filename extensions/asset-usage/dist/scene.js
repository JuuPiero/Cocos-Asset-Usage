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

// source/scene.ts
var scene_exports = {};
__export(scene_exports, {
  load: () => load,
  methods: () => methods,
  unload: () => unload
});
module.exports = __toCommonJS(scene_exports);
var import_path = require("path");
module.paths.push((0, import_path.join)(Editor.App.path, "node_modules"));
function cc() {
  return require("cc");
}
var MAX_DEPTH = 4, MAX_ITEMS = 2e3;
function displayKey(key) {
  return /^_[A-Za-z]/.test(key) ? key.slice(1) : key;
}
function nodePath(node) {
  let names = [];
  for (let n = node; n && n.parent; n = n.parent) names.unshift(n.name);
  return names.join("/");
}
function findNode(root, uuid) {
  if (root.uuid === uuid) return root;
  for (let child of root.children) {
    let found = findNode(child, uuid);
    if (found) return found;
  }
  return null;
}
function propsOf(obj) {
  var _a;
  let props = (_a = obj == null ? void 0 : obj.constructor) == null ? void 0 : _a.__props__;
  return Array.isArray(props) && props.length ? props : Object.keys(obj);
}
var methods = {
  /** Uuid of the open scene (its root node has the scene asset's uuid). */
  currentScene() {
    var _a;
    return ((_a = cc().director.getScene()) == null ? void 0 : _a.uuid) ?? null;
  },
  findNodeReferences(uuid) {
    let { director, js, Node, Component, Asset } = cc(), scene = director.getScene();
    if (!scene) return { error: "No scene is open." };
    let target = findNode(scene, uuid);
    if (!target) return { error: "The node is not in the open scene." };
    let refs = [], visit = (value, path, depth, owner, comp, seen) => {
      var _a;
      if (!(!value || typeof value != "object" || refs.length >= MAX_ITEMS)) {
        if (value === target || value instanceof Component && value.node === target) {
          refs.push({
            node: nodePath(owner),
            nodeUuid: owner.uuid,
            component: js.getClassName(comp) || ((_a = comp.constructor) == null ? void 0 : _a.name) || "Component",
            property: path,
            points: value === target ? "Node" : (js.getClassName(value) || "Component").replace(/^cc\./, "")
          });
          return;
        }
        if (!(value instanceof Node || value instanceof Component || value instanceof Asset || depth >= MAX_DEPTH || seen.has(value))) {
          if (seen.add(value), Array.isArray(value)) {
            let n = Math.min(value.length, MAX_ITEMS);
            for (let i = 0; i < n; i++) visit(value[i], `${path}[${i}]`, depth + 1, owner, comp, seen);
            return;
          }
          for (let key of propsOf(value)) {
            let v;
            try {
              v = value[key];
            } catch {
              continue;
            }
            visit(v, `${path}.${displayKey(key)}`, depth + 1, owner, comp, seen);
          }
        }
      }
    }, walk = (node) => {
      for (let comp of node.components)
        for (let key of propsOf(comp)) {
          if (key === "node" || key === "_name" || key === "__prefab") continue;
          let v;
          try {
            v = comp[key];
          } catch {
            continue;
          }
          visit(v, displayKey(key), 0, node, comp, /* @__PURE__ */ new Set());
        }
      for (let child of node.children) walk(child);
    };
    return walk(scene), { target: { name: target.name, path: nodePath(target) }, refs };
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
//# sourceMappingURL=scene.js.map
