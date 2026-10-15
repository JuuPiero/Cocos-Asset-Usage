/** The parts of Node's 'path' the index uses, POSIX-style, for the browser preview. */
export function normalize(p: string): string {
    const abs = p.startsWith('/');
    const out: string[] = [];
    for (const seg of p.split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') out.pop();
        else out.push(seg);
    }
    return (abs ? '/' : '') + out.join('/');
}

export function join(...parts: string[]): string {
    return normalize(parts.filter(Boolean).join('/'));
}

export function resolve(...parts: string[]): string {
    let p = '';
    for (const part of parts) p = part.startsWith('/') ? part : `${p}/${part}`;
    return normalize(p.startsWith('/') ? p : `/${p}`);
}

export function dirname(p: string): string {
    const i = p.lastIndexOf('/');
    return i <= 0 ? (i === 0 ? '/' : '.') : p.slice(0, i);
}

export function basename(p: string, ext?: string): string {
    const b = p.slice(p.lastIndexOf('/') + 1);
    return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
}

export function extname(p: string): string {
    const b = basename(p);
    const i = b.lastIndexOf('.');
    return i <= 0 ? '' : b.slice(i);
}

export function relative(from: string, to: string): string {
    return to.startsWith(`${from}/`) ? to.slice(from.length + 1) : to;
}

export default { normalize, join, resolve, dirname, basename, extname, relative };
