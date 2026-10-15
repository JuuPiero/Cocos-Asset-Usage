import { promises as fsp } from 'fs';
import { join, relative } from 'path';
import type { AssetRecord } from './types';
import type { ExtraRoot, FileSystem } from './usage-index';

export const nodeFs: FileSystem = {
    async stat(file) {
        try {
            const s = await fsp.stat(file);
            return { mtimeMs: s.mtimeMs, size: s.size, isDirectory: s.isDirectory() };
        } catch {
            return null;
        }
    },
    async readText(file) {
        try {
            return await fsp.readFile(file, 'utf8');
        } catch {
            return null;
        }
    },
};

async function walkFiles(dir: string, out: string[], filter: (file: string) => boolean) {
    let names: string[];
    try {
        names = await fsp.readdir(dir);
    } catch {
        return;
    }
    for (const name of names) {
        const file = join(dir, name);
        let isDir = false;
        try {
            isDir = (await fsp.stat(file)).isDirectory();
        } catch {
            continue;
        }
        if (isDir) await walkFiles(file, out, filter);
        else if (filter(file)) out.push(file);
    }
}

/**
 * Asset records read straight from a project's assets folder (.meta files),
 * without the editor. Used by tests, and as a fallback.
 */
export async function assetsFromDisk(projectRoot: string, dbName = 'assets'): Promise<AssetRecord[]> {
    const root = join(projectRoot, dbName);
    const metas: string[] = [];
    await walkFiles(root, metas, (f) => f.endsWith('.meta'));
    const out: AssetRecord[] = [];
    for (const metaFile of metas) {
        let meta: any;
        try {
            meta = JSON.parse(await fsp.readFile(metaFile, 'utf8'));
        } catch {
            continue;
        }
        if (!meta?.uuid) continue;
        const file = metaFile.slice(0, -'.meta'.length);
        let isDirectory = false;
        try {
            isDirectory = (await fsp.stat(file)).isDirectory();
        } catch {
            continue; // orphan .meta
        }
        out.push({
            uuid: meta.uuid,
            url: `db://${dbName}/${relative(root, file).replace(/\\/g, '/')}`,
            file,
            importer: meta.importer || (isDirectory ? 'directory' : 'unknown'),
            isDirectory,
            subs: {},
            subsKnown: false,
            isBundle: !!meta.userData?.isBundle,
        });
    }
    return out;
}

/** Project settings files (their uuids keep assets in use). */
export async function settingsRoots(projectRoot: string): Promise<ExtraRoot[]> {
    const files: string[] = [];
    await walkFiles(join(projectRoot, 'settings'), files, (f) => f.endsWith('.json'));
    return files.map((file) => {
        const rel = relative(projectRoot, file).replace(/\\/g, '/');
        return { id: `settings:${rel}`, label: `Project Settings (${rel})`, file };
    });
}
