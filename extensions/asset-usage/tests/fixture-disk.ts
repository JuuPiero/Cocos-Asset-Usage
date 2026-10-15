import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fixtureFiles } from './fixture-files';

/** Writes the fixture project into a new temp folder and returns its path. */
export function makeFixture(): string {
    const root = mkdtempSync(join(tmpdir(), 'asset-usage-fixture-'));
    const files = fixtureFiles();
    for (const rel of Object.keys(files)) {
        const file = join(root, rel);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, files[rel]);
    }
    // Folders with a .meta exist even when empty.
    for (const rel of Object.keys(files)) {
        if (rel.endsWith('.meta') && !files[rel.slice(0, -5)] && JSON.parse(files[rel]).importer === 'directory') {
            mkdirSync(join(root, rel.slice(0, -5)), { recursive: true });
        }
    }
    return root;
}
