/**
 * Scene-process half of asset-usage: "Find References In Scene" for a node
 * (which components in the open scene point at the node or its components),
 * read from the live scene so unsaved changes count.
 */
import { join } from 'path';

module.paths.push(join(Editor.App.path, 'node_modules'));

function cc(): any {
    return require('cc');
}

export interface SceneRef {
    node: string;
    nodeUuid: string;
    component: string;
    property: string;
    /** What it points at: "Node", or the component type on the target node. */
    points: string;
}

const MAX_DEPTH = 4;
const MAX_ITEMS = 2000;

function displayKey(key: string): string {
    return /^_[A-Za-z]/.test(key) ? key.slice(1) : key;
}

function nodePath(node: any): string {
    const names: string[] = [];
    for (let n = node; n && n.parent; n = n.parent) names.unshift(n.name);
    return names.join('/');
}

function findNode(root: any, uuid: string): any {
    if (root.uuid === uuid) return root;
    for (const child of root.children) {
        const found = findNode(child, uuid);
        if (found) return found;
    }
    return null;
}

function propsOf(obj: any): string[] {
    const props = obj?.constructor?.__props__;
    return Array.isArray(props) && props.length ? props : Object.keys(obj);
}

export const methods: Record<string, (...args: any[]) => any> = {
    /** Uuid of the open scene (its root node has the scene asset's uuid). */
    currentScene(): string | null {
        return cc().director.getScene()?.uuid ?? null;
    },

    findNodeReferences(uuid: string): { target?: { name: string; path: string }; refs?: SceneRef[]; error?: string } {
        const { director, js, Node, Component, Asset } = cc();
        const scene = director.getScene();
        if (!scene) return { error: 'No scene is open.' };
        const target = findNode(scene, uuid);
        if (!target) return { error: 'The node is not in the open scene.' };

        const refs: SceneRef[] = [];
        const visit = (value: any, path: string, depth: number, owner: any, comp: any, seen: Set<unknown>) => {
            if (!value || typeof value !== 'object' || refs.length >= MAX_ITEMS) return;
            if (value === target || (value instanceof Component && value.node === target)) {
                refs.push({
                    node: nodePath(owner),
                    nodeUuid: owner.uuid,
                    component: js.getClassName(comp) || comp.constructor?.name || 'Component',
                    property: path,
                    points: value === target ? 'Node' : (js.getClassName(value) || 'Component').replace(/^cc\./, ''),
                });
                return;
            }
            if (value instanceof Node || value instanceof Component || value instanceof Asset || depth >= MAX_DEPTH || seen.has(value)) return;
            seen.add(value);
            if (Array.isArray(value)) {
                const n = Math.min(value.length, MAX_ITEMS);
                for (let i = 0; i < n; i++) visit(value[i], `${path}[${i}]`, depth + 1, owner, comp, seen);
                return;
            }
            for (const key of propsOf(value)) {
                let v: any;
                try {
                    v = value[key];
                } catch {
                    continue;
                }
                visit(v, `${path}.${displayKey(key)}`, depth + 1, owner, comp, seen);
            }
        };

        const walk = (node: any) => {
            for (const comp of node.components) {
                for (const key of propsOf(comp)) {
                    if (key === 'node' || key === '_name' || key === '__prefab') continue;
                    let v: any;
                    try {
                        v = comp[key];
                    } catch {
                        continue;
                    }
                    visit(v, displayKey(key), 0, node, comp, new Set());
                }
            }
            for (const child of node.children) walk(child);
        };
        walk(scene);
        return { target: { name: target.name, path: nodePath(target) }, refs };
    },
};

export function load() {}

export function unload() {}
