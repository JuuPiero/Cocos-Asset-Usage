/**
 * The reference index: which asset uses which, and where.
 *
 * build() reads every project asset (its .meta, plus the content of data
 * files and scripts) and keeps the results per asset, keyed by modification
 * times, so rebuilding only reads files that changed. link() then resolves
 * what was read into edges between assets:
 *   - uuids in data and .meta files,
 *   - script class ids / @ccclass names used as component types,
 *   - script imports,
 *   - strings in scripts that match load paths of assets in resources or
 *     an Asset Bundle (resources.load('ui/Panel')).
 */
import { basename, dirname, extname, join, normalize, resolve } from 'path';
import { DATA_EXTENSIONS, SCRIPT_EXTENSIONS, scanMeta, scanScript, scanSerialized, subAssetsOf } from './parse';
import { AssetRecord, emptyScan, RefLocation, ScanResult } from './types';
import { compressUuid } from './uuid';

export interface FileSystem {
    stat(file: string): Promise<{ mtimeMs: number; size: number; isDirectory: boolean } | null>;
    readText(file: string): Promise<string | null>;
}

/** What was read from one asset, cached by modification time. */
export interface CacheEntry {
    mtime: number;
    metaMtime: number;
    size: number;
    subs: Record<string, string>;
    isBundle: boolean;
    scan: ScanResult;
}

export interface IndexCache {
    version: number;
    entries: Record<string, CacheEntry>;
}

export const CACHE_VERSION = 1;

/** A file outside the asset databases whose uuids keep assets in use (project settings). */
export interface ExtraRoot {
    id: string;
    label: string;
    file: string;
}

export interface Edge {
    user: string;
    used: string;
    /** Sub-asset ids used ('' = the main asset). */
    subs: string[];
    type?: string;
    locations: RefLocation[];
}

export interface BuildOptions {
    cache?: IndexCache | null;
    extras?: ExtraRoot[];
    force?: boolean;
    /** Files read in parallel. */
    concurrency?: number;
    onProgress?(done: number, total: number): void;
}

export interface UnusedAsset {
    asset: AssetRecord;
    /** Assets that use it (all unused themselves). */
    usedBy: string[];
}

/** Importers never listed as unused. */
const NEVER_UNUSED = new Set(['typescript', 'javascript', 'directory', 'scene', 'auto-atlas', 'effect-header', 'database']);

const isWin = typeof process !== 'undefined' && process.platform === 'win32';

export function normalizeFile(file: string): string {
    const n = normalize(file).replace(/\\/g, '/');
    return isWin ? n.toLowerCase() : n;
}

function stripExt(url: string): string {
    const slash = url.lastIndexOf('/');
    const dot = url.lastIndexOf('.');
    return dot > slash ? url.slice(0, dot) : url;
}

function mergeScan(into: ScanResult, from: ScanResult) {
    for (const u of from.uses) {
        const existing = into.uses.find((x) => x.uuid === u.uuid);
        if (!existing) {
            into.uses.push(u);
            continue;
        }
        for (const s of u.subs) if (!existing.subs.includes(s)) existing.subs.push(s);
        existing.locations.push(...u.locations);
        existing.type = existing.type || u.type;
    }
    into.types.push(...from.types);
    into.imports.push(...from.imports);
    into.classNames.push(...from.classNames);
    into.strings.push(...from.strings);
}

export class UsageIndex {
    readonly assets = new Map<string, AssetRecord>();
    private entries = new Map<string, CacheEntry>();
    private extras: ExtraRoot[] = [];
    private extraScans = new Map<string, ScanResult>();

    private usesMap = new Map<string, Map<string, Edge>>();
    private usersMap = new Map<string, Map<string, Edge>>();
    private missingEdges: Edge[] = [];
    private scriptByClassId = new Map<string, string>();
    private byFile = new Map<string, string>();
    private byUrl = new Map<string, string>();
    private loadPaths = new Map<string, string[]>();
    private inBundle = new Set<string>();

    stats = { assets: 0, read: 0, cached: 0, ms: 0 };

    // -------------------------------------------------------------- build

    async build(records: AssetRecord[], fs: FileSystem, opts: BuildOptions = {}): Promise<void> {
        const start = Date.now();
        const cached = opts.cache && opts.cache.version === CACHE_VERSION ? opts.cache.entries : {};
        this.assets.clear();
        for (const r of records) this.assets.set(r.uuid, { ...r, subs: { ...r.subs } });
        const next = new Map<string, CacheEntry>();
        const todo = [...this.assets.values()].filter((r) => !r.external && r.file);
        let read = 0;
        let reused = 0;
        let done = 0;
        const concurrency = opts.concurrency ?? 16;
        for (let i = 0; i < todo.length; i += concurrency) {
            const batch = todo.slice(i, i + concurrency);
            const results = await Promise.all(batch.map((r) => this.readAsset(r, fs, opts.force ? undefined : cached[r.uuid])));
            batch.forEach((r, k) => {
                const { entry, fresh } = results[k];
                if (fresh) read++;
                else reused++;
                next.set(r.uuid, entry);
                r.subs = { ...entry.subs, ...r.subs };
                r.subsKnown = true;
                r.isBundle = r.isBundle || entry.isBundle;
                r.size = entry.size;
            });
            done += batch.length;
            opts.onProgress?.(done, todo.length);
        }
        this.entries = next;

        this.extras = opts.extras || [];
        this.extraScans.clear();
        for (const extra of this.extras) {
            const text = await fs.readText(extra.file);
            if (!text) continue;
            try {
                this.extraScans.set(extra.id, scanSerialized(JSON.parse(text)));
            } catch {
                // not JSON
            }
        }

        this.link();
        this.stats = { assets: this.assets.size, read, cached: reused, ms: Date.now() - start };
    }

    private async readAsset(r: AssetRecord, fs: FileSystem, prev?: CacheEntry): Promise<{ entry: CacheEntry; fresh: boolean }> {
        const [st, mst] = await Promise.all([fs.stat(r.file), fs.stat(`${r.file}.meta`)]);
        const mtime = st?.mtimeMs ?? 0;
        const metaMtime = mst?.mtimeMs ?? 0;
        if (prev && prev.mtime === mtime && prev.metaMtime === metaMtime) return { entry: prev, fresh: false };

        let meta: any = null;
        try {
            const text = await fs.readText(`${r.file}.meta`);
            meta = text ? JSON.parse(text) : null;
        } catch {
            meta = null;
        }
        const scan = meta ? scanMeta(meta, r.uuid) : emptyScan();
        const ext = extname(r.file).toLowerCase();
        if (!r.isDirectory && !(st && st.isDirectory)) {
            if (DATA_EXTENSIONS.has(ext)) {
                const text = await fs.readText(r.file);
                try {
                    if (text) mergeScan(scan, scanSerialized(JSON.parse(text)));
                } catch {
                    // not JSON: nothing to read
                }
            } else if (SCRIPT_EXTENSIONS.has(ext) && !r.file.endsWith('.d.ts')) {
                const text = await fs.readText(r.file);
                if (text) mergeScan(scan, scanScript(text));
            }
        }
        const entry: CacheEntry = {
            mtime,
            metaMtime,
            size: st && !st.isDirectory ? st.size : 0,
            subs: subAssetsOf(meta),
            isBundle: !!meta?.userData?.isBundle,
            scan,
        };
        return { entry, fresh: true };
    }

    toCache(): IndexCache {
        const entries: Record<string, CacheEntry> = {};
        for (const [k, v] of this.entries) entries[k] = v;
        return { version: CACHE_VERSION, entries };
    }

    // --------------------------------------------------------------- link

    private link() {
        this.usesMap.clear();
        this.usersMap.clear();
        this.missingEdges = [];
        this.scriptByClassId.clear();
        this.byFile.clear();
        this.byUrl.clear();
        this.loadPaths.clear();
        this.inBundle.clear();

        for (const r of this.assets.values()) {
            this.byUrl.set(r.url, r.uuid);
            if (r.file && !r.external) this.byFile.set(normalizeFile(r.file), r.uuid);
            if (this.isScript(r)) {
                this.scriptByClassId.set(compressUuid(r.uuid), r.uuid);
                this.scriptByClassId.set(compressUuid(r.uuid, true), r.uuid);
                for (const name of this.entries.get(r.uuid)?.scan.classNames || []) {
                    if (!this.scriptByClassId.has(name)) this.scriptByClassId.set(name, r.uuid);
                }
            }
        }

        // Load paths of assets in resources / Asset Bundles.
        const roots = [...this.assets.values()]
            .filter((r) => r.isDirectory && !r.external && (r.isBundle || r.url === 'db://assets/resources'))
            .map((r) => r.url)
            .sort((a, b) => b.length - a.length);
        for (const r of this.assets.values()) {
            if (r.isDirectory || r.external) continue;
            const root = roots.find((u) => r.url.startsWith(`${u}/`));
            if (!root) continue;
            this.inBundle.add(r.uuid);
            const path = stripExt(r.url.slice(root.length + 1));
            const list = this.loadPaths.get(path) || [];
            list.push(r.uuid);
            this.loadPaths.set(path, list);
        }

        for (const [uuid, entry] of this.entries) this.addScan(uuid, entry.scan, this.assets.get(uuid));
        for (const [id, scan] of this.extraScans) this.addScan(id, scan, undefined);
    }

    private isScript(r: AssetRecord): boolean {
        return r.importer === 'typescript' || r.importer === 'javascript' || SCRIPT_EXTENSIONS.has(extname(r.url).toLowerCase());
    }

    private addEdge(user: string, used: string, subs: string[], locations: RefLocation[], type?: string) {
        if (user === used) return;
        let uses = this.usesMap.get(user);
        if (!uses) this.usesMap.set(user, (uses = new Map()));
        let edge = uses.get(used);
        if (!edge) {
            edge = { user, used, subs: [], locations: [], type };
            uses.set(used, edge);
            let users = this.usersMap.get(used);
            if (!users) this.usersMap.set(used, (users = new Map()));
            users.set(user, edge);
        }
        for (const s of subs) if (!edge.subs.includes(s)) edge.subs.push(s);
        edge.locations.push(...locations);
        edge.type = edge.type || type;
    }

    private addScan(user: string, scan: ScanResult, rec: AssetRecord | undefined) {
        for (const use of scan.uses) {
            if (use.uuid === user) continue;
            const target = this.assets.get(use.uuid);
            if (!target) {
                this.missingEdges.push({ user, used: use.uuid, subs: use.subs, type: use.type, locations: use.locations });
                continue;
            }
            const goneSubs = target.subsKnown ? use.subs.filter((s) => s && !(s in target.subs)) : [];
            if (goneSubs.length) {
                const locations = use.locations.filter((l) => l.sub && goneSubs.includes(l.sub));
                this.missingEdges.push({ user, used: use.uuid, subs: goneSubs, type: use.type, locations });
            }
            this.addEdge(user, use.uuid, use.subs, use.locations, use.type);
        }
        for (const t of scan.types) {
            const script = this.scriptByClassId.get(t.id);
            if (script) this.addEdge(user, script, [''], [t.location]);
        }
        for (const spec of scan.imports) {
            const script = rec ? this.resolveImport(rec, spec) : undefined;
            if (script) this.addEdge(user, script, [''], [{ property: `import '${spec}'`, via: 'import' }]);
        }
        for (const s of scan.strings) {
            for (const hit of this.matchPath(s.text)) {
                const location: RefLocation = { property: `'${s.text}' (line ${s.line})`, via: 'code' };
                if (hit.sub) location.sub = hit.sub;
                this.addEdge(user, hit.uuid, [hit.sub], [location]);
            }
        }
    }

    private resolveImport(rec: AssetRecord, spec: string): string | undefined {
        if (spec.startsWith('db://')) {
            for (const u of [spec, `${spec}.ts`, `${spec}.js`]) {
                const id = this.byUrl.get(u);
                if (id) return id;
            }
            return undefined;
        }
        if (!rec.file || !(spec.startsWith('./') || spec.startsWith('../'))) return undefined;
        const base = resolve(dirname(rec.file), spec);
        const candidates = [base, `${base}.ts`, `${base}.js`, `${base}.mjs`, join(base, 'index.ts'), join(base, 'index.js')];
        if (/\.js$/.test(base)) candidates.push(base.replace(/\.js$/, '.ts'));
        for (const c of candidates) {
            const id = this.byFile.get(normalizeFile(c));
            if (id) return id;
        }
        return undefined;
    }

    /** Assets a string could load: a bundle load path, optionally with a sub-asset name, or a db:// url. */
    private matchPath(text: string): { uuid: string; sub: string }[] {
        const out: { uuid: string; sub: string }[] = [];
        const byPath = (path: string): string[] => {
            if (path.startsWith('db://')) {
                const id = this.byUrl.get(path);
                return id ? [id] : [];
            }
            return this.loadPaths.get(path) || [];
        };
        for (const uuid of byPath(text)) out.push({ uuid, sub: '' });
        const slash = text.lastIndexOf('/');
        if (slash > 0) {
            const subName = text.slice(slash + 1);
            for (const uuid of byPath(text.slice(0, slash))) {
                const subs = this.assets.get(uuid)?.subs || {};
                const id = Object.keys(subs).find((k) => subs[k] === subName);
                if (id) out.push({ uuid, sub: id });
            }
        }
        return out;
    }

    // ------------------------------------------------------------ queries

    /** Assets (or settings files) that use `uuid`; "uuid@sub" narrows to one sub-asset. */
    usersOf(uuidOrSub: string): Edge[] {
        const [uuid, sub] = splitSub(uuidOrSub);
        let edges = [...(this.usersMap.get(uuid)?.values() || [])];
        if (sub) {
            edges = edges
                .filter((e) => e.subs.includes(sub))
                .map((e) => ({ ...e, subs: [sub], locations: e.locations.filter((l) => l.sub === sub) }));
        }
        return edges.sort((a, b) => this.labelOf(a.user).localeCompare(this.labelOf(b.user)));
    }

    /** What `uuid` uses; missing references first (see isMissing). */
    dependenciesOf(uuid: string): Edge[] {
        const [main] = splitSub(uuid);
        const byLabel = (a: Edge, b: Edge) => this.labelOf(a.used).localeCompare(this.labelOf(b.used));
        const missing = this.missingEdges.filter((e) => e.user === main).sort(byLabel);
        return [...missing, ...[...(this.usesMap.get(main)?.values() || [])].sort(byLabel)];
    }

    /** References to assets (or sub-assets) that don't exist. */
    missing(): Edge[] {
        return [...this.missingEdges].sort((a, b) => this.labelOf(a.user).localeCompare(this.labelOf(b.user)) || a.used.localeCompare(b.used));
    }

    isMissing(edge: Edge): boolean {
        return this.missingEdges.includes(edge);
    }

    /**
     * Project assets nothing in the build reaches. Roots: scenes, scripts,
     * everything in resources / Asset Bundles (code may load it), and
     * project settings.
     */
    unused(): UnusedAsset[] {
        const roots: string[] = [];
        for (const r of this.assets.values()) {
            if (r.external) continue;
            if (r.importer === 'scene' || this.isScript(r) || this.inBundle.has(r.uuid)) roots.push(r.uuid);
        }
        for (const e of this.extras) roots.push(e.id);
        const reached = new Set(roots);
        const queue = [...roots];
        while (queue.length) {
            const u = queue.pop()!;
            for (const used of this.usesMap.get(u)?.keys() || []) {
                if (!reached.has(used)) {
                    reached.add(used);
                    queue.push(used);
                }
            }
        }
        const out: UnusedAsset[] = [];
        for (const r of this.assets.values()) {
            if (r.external || r.isDirectory || !r.url.startsWith('db://assets/') || reached.has(r.uuid) || NEVER_UNUSED.has(r.importer)) continue;
            out.push({ asset: r, usedBy: [...(this.usersMap.get(r.uuid)?.keys() || [])] });
        }
        return out.sort((a, b) => a.asset.url.localeCompare(b.asset.url));
    }

    /** Is this asset in resources or an Asset Bundle (loadable by path)? */
    isInBundle(uuid: string): boolean {
        return this.inBundle.has(uuid);
    }

    // ------------------------------------------------------------ display

    extraOf(id: string): ExtraRoot | undefined {
        return this.extras.find((e) => e.id === id);
    }

    labelOf(uuid: string): string {
        return this.assets.get(uuid)?.url || this.extraOf(uuid)?.label || uuid;
    }

    /** "cc.Sprite" -> "Sprite", a script class id -> the script's name. */
    componentName(id: string | undefined): string {
        if (!id) return '';
        if (/^(cc|sp|dragonBones)\./.test(id)) return id.replace(/^cc\./, '');
        const script = this.scriptByClassId.get(id);
        if (script) {
            const r = this.assets.get(script);
            if (r) return basename(r.url).replace(/\.(ts|js|mjs|cjs)$/, '');
        }
        return id;
    }

    /** Name of a sub-asset ("spriteFrame"), or '' for the main asset. */
    subName(uuid: string, sub: string): string {
        if (!sub) return '';
        return this.assets.get(uuid)?.subs[sub] || sub;
    }
}

export function splitSub(uuidOrSub: string): [string, string] {
    const at = uuidOrSub.indexOf('@');
    return at < 0 ? [uuidOrSub, ''] : [uuidOrSub.slice(0, at), uuidOrSub.slice(at + 1)];
}
