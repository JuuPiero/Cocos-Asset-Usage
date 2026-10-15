/** An asset the index knows about. Sub-assets are not separate records (see `subs`). */
export interface AssetRecord {
    uuid: string;
    /** "db://assets/..." */
    url: string;
    /** Absolute source path ('' when there is none). */
    file: string;
    importer: string;
    isDirectory: boolean;
    /** Sub-asset id -> name, e.g. "f9941" -> "spriteFrame" (nested ids joined with "@"). */
    subs: Record<string, string>;
    /** False when the sub-assets were not read (internal assets): missing sub-assets aren't reported. */
    subsKnown: boolean;
    /** Folder that is an Asset Bundle (assets/resources is one). */
    isBundle?: boolean;
    /** In a read-only database (internal): listed, never scanned. */
    external?: boolean;
    /** Source file size in bytes. */
    size?: number;
}

/** Where a reference is, inside the asset that has it. */
export interface RefLocation {
    /** Node path in a scene or prefab, e.g. "Canvas/Panel/Button". */
    node?: string;
    /** The node's id in a scene file (selectable when the scene is open). */
    nodeId?: string;
    /**
     * Component or object type as stored: "cc.Sprite", a script's class id, or
     * "Import Settings" for .meta references. Shown resolved (see UsageIndex.componentName).
     */
    component?: string;
    /** Property path, e.g. "spriteFrame" or "clickEvents[0].target". */
    property: string;
    /** Sub-asset id used here ('' or absent = the main asset). */
    sub?: string;
    /** How it was found: serialized data (default), a script import, or a string in code. */
    via?: 'data' | 'import' | 'code';
}

/** A uuid used by an asset, with every place it is used. */
export interface Use {
    /** Main uuid (without "@sub"). */
    uuid: string;
    /** Sub-asset ids used ("" = the main asset itself). */
    subs: string[];
    /** __expectedType__ of the reference, when stored (e.g. "cc.SpriteFrame"). */
    type?: string;
    locations: RefLocation[];
}

/** A class id or class name used as a type (script components and classes). */
export interface TypeUse {
    id: string;
    location: RefLocation;
}

/** Everything read from one asset's files. Cached per asset by modification time. */
export interface ScanResult {
    uses: Use[];
    types: TypeUse[];
    /** Script: import specifiers as written. */
    imports: string[];
    /** Script: @ccclass names it declares. */
    classNames: string[];
    /** Script: string literals that may be load paths. */
    strings: { text: string; line: number }[];
}

export function emptyScan(): ScanResult {
    return { uses: [], types: [], imports: [], classNames: [], strings: [] };
}
