/**
 * Reads references out of asset files:
 * - serialized data (scenes, prefabs, materials, animations, ...): every
 *   {"__uuid__"} and uuid string, script class ids in "__type__", located as
 *   node path + component + property;
 * - .meta files: uuids in import settings (atlases, fonts, models, ...);
 * - scripts: imports, @ccclass names and string literals.
 */
import { emptyScan, RefLocation, ScanResult, Use } from './types';
import { splitUuid } from './uuid';

/** Files whose content is serialized Cocos data. */
export const DATA_EXTENSIONS = new Set([
    '.scene', '.prefab', '.mtl', '.pmtl', '.anim', '.animgraph', '.animgraphvari', '.animask', '.rt', '.labelatlas', '.pac',
]);

export const SCRIPT_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs']);

class Collector {
    readonly result = emptyScan();
    private byUuid = new Map<string, Use>();

    use(uuidOrSub: string, location: RefLocation, type?: string): boolean {
        const parts = splitUuid(uuidOrSub);
        if (!parts) return false;
        let u = this.byUuid.get(parts.uuid);
        if (!u) {
            u = { uuid: parts.uuid, subs: [], locations: [] };
            this.byUuid.set(parts.uuid, u);
            this.result.uses.push(u);
        }
        if (!u.subs.includes(parts.sub)) u.subs.push(parts.sub);
        if (type && !u.type) u.type = type;
        const loc = parts.sub ? { ...location, sub: parts.sub } : location;
        if (!u.locations.some((l) => sameLocation(l, loc))) u.locations.push(loc);
        return true;
    }
}

function sameLocation(a: RefLocation, b: RefLocation): boolean {
    return a.node === b.node && a.component === b.component && a.property === b.property && a.via === b.via && (a.sub || '') === (b.sub || '');
}

/** "_spriteFrame" -> "spriteFrame", like the Inspector shows it. */
function displayKey(key: string): string {
    return /^_[A-Za-z]/.test(key) ? key.slice(1) : key;
}

function joinPath(base: string, key: string | number): string {
    if (typeof key === 'number') return `${base}[${key}]`;
    const k = displayKey(key);
    return base ? `${base}.${k}` : k;
}

function isEngineType(t: string): boolean {
    return /^(cc|sp|dragonBones)\./.test(t) || t === 'CCPropertyOverrideInfo' || t === 'TargetInfo' || t === 'TargetOverrideInfo';
}

// ------------------------------------------------------- serialized data

interface ObjInfo {
    type: string;
    name: string;
    parent?: number;
    node?: number;
    id?: string;
    isNode: boolean;
    isComp: boolean;
}

interface RawRef {
    obj: number;
    path: string;
    value: string;
    type?: string;
    kind: 'uuid' | 'type';
}

const isIdRef = (v: any): v is { __id__: number } => !!v && typeof v === 'object' && typeof v.__id__ === 'number' && Object.keys(v).length === 1;

/**
 * Scenes and prefabs: an array of objects linked by {"__id__": n}. A
 * reference is reported on the node or component that owns the object it
 * is in (structs like cc.ClickEvent or SceneGlobals belong to whatever
 * points at them first).
 */
export function scanSerialized(json: unknown): ScanResult {
    const c = new Collector();
    if (Array.isArray(json) && json.every((o) => o && typeof o === 'object' && typeof o.__type__ === 'string')) {
        scanObjectList(json as any[], c);
    } else {
        walk(json, '', (value, path, key, parent) => {
            if (typeof value !== 'string' || key === '__expectedType__') return;
            if (key === '__uuid__') {
                const type = typeof parent?.__expectedType__ === 'string' ? parent.__expectedType__ : undefined;
                c.use(value, { property: path.replace(/\.?__uuid__$/, '') }, type);
            } else if (key === '__type__') {
                if (!isEngineType(value)) c.result.types.push({ id: value, location: { property: path.replace(/\.?__type__$/, '') || '(root)' } });
            } else {
                c.use(value, { property: path });
            }
        });
    }
    return c.result;
}

function scanObjectList(list: any[], c: Collector) {
    const infos: ObjInfo[] = list.map((o) => ({
        type: o.__type__,
        name: typeof o._name === 'string' ? o._name : '',
        parent: isIdRef(o._parent) ? o._parent.__id__ : undefined,
        node: isIdRef(o.node) ? o.node.__id__ : undefined,
        id: typeof o._id === 'string' && o._id ? o._id : undefined,
        isNode: '_parent' in o && '_children' in o,
        isComp: isIdRef(o.node),
    }));
    const owner: (number | undefined)[] = [];
    const ownerPath: string[] = [];
    const raws: RawRef[] = [];

    list.forEach((o, i) => {
        walk(o, '', (value, path, key, parent) => {
            if (isIdRef(value)) {
                const k = value.__id__;
                const t = infos[k];
                if (t && k !== i && !t.isNode && !t.isComp && owner[k] === undefined) {
                    owner[k] = i;
                    ownerPath[k] = path;
                }
                return;
            }
            if (key === '__uuid__' && typeof value === 'string') {
                const type = typeof parent?.__expectedType__ === 'string' ? parent.__expectedType__ : undefined;
                raws.push({ obj: i, path: path.replace(/\.?__uuid__$/, ''), value, type, kind: 'uuid' });
                return;
            }
            if (typeof value !== 'string' || key === '__expectedType__') return;
            if (key === '__type__') {
                // A script component (or class) by class id or name.
                if (path === '__type__' && !isEngineType(value)) raws.push({ obj: i, path: '', value, kind: 'type' });
                else if (path !== '__type__' && !isEngineType(value)) raws.push({ obj: i, path: path.replace(/\.?__type__$/, ''), value, kind: 'type' });
                return;
            }
            if (key === '_componentId' && value) {
                raws.push({ obj: i, path, value, kind: 'type' });
                return;
            }
            if (splitUuid(value)) raws.push({ obj: i, path, value, kind: 'uuid' });
        });
    });

    const nodePath = (n: number | undefined): string => {
        const names: string[] = [];
        const seen = new Set<number>();
        for (let k = n; k !== undefined && infos[k] && !seen.has(k); k = infos[k].parent) {
            seen.add(k);
            if (infos[k].type === 'cc.Scene') break;
            names.unshift(infos[k].name);
        }
        return names.join('/');
    };

    const locate = (obj: number, path: string): RefLocation => {
        let i = obj;
        let p = path;
        let frozen = false;
        const seen = new Set<number>();
        while (!infos[i].isNode && !infos[i].isComp && owner[i] !== undefined && !seen.has(i)) {
            seen.add(i);
            if (!frozen) {
                const o = list[i];
                if (infos[i].type === 'CCPropertyOverrideInfo' && Array.isArray(o.propertyPath)) {
                    p = `override ${o.propertyPath.map((x: string) => displayKey(String(x))).join('.')}`;
                    frozen = true;
                } else if (infos[i].type === 'cc.PrefabInfo' && p === 'asset') {
                    p = 'prefab instance';
                    frozen = true;
                } else if (!p) {
                    p = ownerPath[i];
                } else {
                    p = p.startsWith('[') ? `${ownerPath[i]}${p}` : `${ownerPath[i]}.${p}`;
                }
            }
            i = owner[i]!;
        }
        const info = infos[i];
        if (info.isComp) {
            const node = info.node!;
            return { node: nodePath(node), nodeId: infos[node]?.id, component: info.type, property: p };
        }
        if (info.isNode) {
            if (info.type === 'cc.Scene') return { node: '', component: 'Scene', property: p };
            return { node: nodePath(i), nodeId: info.id, property: p };
        }
        return { property: p };
    };

    for (const r of raws) {
        if (r.kind === 'uuid') {
            if (r.obj === 1 && list[1]?.__type__ === 'cc.Scene' && r.path === 'id') continue; // the scene's own id
            c.use(r.value, locate(r.obj, r.path), r.type);
        } else {
            const loc = locate(r.obj, r.path);
            const isComponentType = r.path === '' && infos[r.obj].isComp;
            c.result.types.push({ id: r.value, location: isComponentType ? { ...loc, component: r.value, property: '(script)' } : loc });
        }
    }
}

type Visitor = (value: any, path: string, key: string | number, parent: any) => void;

function walk(value: any, path: string, visit: Visitor, key: string | number = '', parent: any = null, depth = 0) {
    visit(value, path, key, parent);
    if (!value || typeof value !== 'object' || depth > 64 || isIdRef(value)) return;
    if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, joinPath(path, i), visit, i, value, depth + 1));
    } else {
        for (const k of Object.keys(value)) {
            if (k === '__editorExtras__') continue;
            walk(value[k], k === '__uuid__' || k === '__type__' ? (path ? `${path}.${k}` : k) : joinPath(path, k), visit, k, value, depth + 1);
        }
    }
}

// ------------------------------------------------------------------ meta

/** Uuids in a .meta file that point at other assets (import settings). */
export function scanMeta(meta: any, selfUuid: string): ScanResult {
    const c = new Collector();
    const visit = (value: any, path: string[], subName: string) => {
        if (typeof value === 'string') {
            const parts = splitUuid(value);
            if (parts && parts.uuid !== selfUuid) {
                const component = subName ? `Import Settings (${subName})` : 'Import Settings';
                c.use(value, { component, property: path.filter((k) => k !== 'userData').join('.') || 'uuid' });
            }
            return;
        }
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) {
            value.forEach((v, i) => visit(v, [...path.slice(0, -1), `${path[path.length - 1] ?? ''}[${i}]`], subName));
            return;
        }
        for (const k of Object.keys(value)) {
            if (k === 'uuid' && path.length === 0) continue;
            if (k === 'subMetas' && value.subMetas && typeof value.subMetas === 'object') {
                for (const id of Object.keys(value.subMetas)) {
                    const sub = value.subMetas[id];
                    visit(sub, [], (subName ? `${subName}/` : '') + (sub?.name || id));
                }
                continue;
            }
            if (k === 'uuid' || k === 'importer' || k === 'ver' || k === 'id' || k === 'files') continue;
            visit(value[k], [...path, k], subName);
        }
    };
    visit(meta, [], '');
    return c.result;
}

/** Sub-asset ids (nested ones joined with "@") and names of a .meta file. */
export function subAssetsOf(meta: any): Record<string, string> {
    const out: Record<string, string> = {};
    const visit = (subMetas: any, prefix: string) => {
        if (!subMetas || typeof subMetas !== 'object') return;
        for (const id of Object.keys(subMetas)) {
            const sub = subMetas[id];
            const key = prefix ? `${prefix}@${id}` : id;
            out[key] = sub?.name || sub?.displayName || id;
            visit(sub?.subMetas, key);
        }
    };
    visit(meta?.subMetas, '');
    return out;
}

// ---------------------------------------------------------------- scripts

/** Replaces comments with spaces (keeps line numbers and string contents). */
export function stripComments(src: string): string {
    let out = '';
    let i = 0;
    let quote = '';
    while (i < src.length) {
        const ch = src[i];
        const next = src[i + 1];
        if (quote) {
            out += ch;
            if (ch === '\\') {
                out += next ?? '';
                i += 2;
                continue;
            }
            if (ch === quote) quote = '';
            i++;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
            out += ch;
            i++;
            continue;
        }
        if (ch === '/' && next === '/') {
            while (i < src.length && src[i] !== '\n') {
                out += ' ';
                i++;
            }
            continue;
        }
        if (ch === '/' && next === '*') {
            out += '  ';
            i += 2;
            while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
                out += src[i] === '\n' ? '\n' : ' ';
                i++;
            }
            out += '  ';
            i += 2;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

const IMPORT_RES = [
    /\b(?:import|export)\s[^'"`;]*?\bfrom\s*(['"])([^'"\n]+)\1/g,
    /\bimport\s*(['"])([^'"\n]+)\1/g,
    /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
    /\brequire\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
];
const CCCLASS_RE = /\bccclass\s*\(\s*(['"])([^'"\n]+)\1/g;
const STRING_RE = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;

export function scanScript(source: string): ScanResult {
    const result = emptyScan();
    const code = stripComments(source);
    const imports = new Set<string>();
    for (const re of IMPORT_RES) {
        re.lastIndex = 0;
        for (let m = re.exec(code); m; m = re.exec(code)) imports.add(m[2]);
    }
    result.imports = [...imports];
    CCCLASS_RE.lastIndex = 0;
    for (let m = CCCLASS_RE.exec(code); m; m = CCCLASS_RE.exec(code)) if (!result.classNames.includes(m[2])) result.classNames.push(m[2]);

    // String literals that could be asset paths (resources.load('ui/Panel') and the like).
    const lineStarts = [0];
    for (let i = 0; i < code.length; i++) if (code[i] === '\n') lineStarts.push(i + 1);
    const lineOf = (index: number) => {
        let lo = 0;
        let hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= index) lo = mid;
            else hi = mid - 1;
        }
        return lo + 1;
    };
    STRING_RE.lastIndex = 0;
    for (let m = STRING_RE.exec(code); m; m = STRING_RE.exec(code)) {
        const text = m[2];
        if (!text || text.length > 260 || text.includes('${') || /\s/.test(text) || imports.has(text)) continue;
        if (!/[A-Za-z]/.test(text)) continue;
        result.strings.push({ text, line: lineOf(m.index) });
    }
    return result;
}
