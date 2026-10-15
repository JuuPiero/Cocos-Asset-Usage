/**
 * Cocos stores script components in scenes and prefabs by class id: the
 * script's uuid compressed to 23 characters (the first 5 hex digits, then
 * base64 of the rest), e.g. "8894b520-31df-..." -> "8894bUgMd9FU6rcH9iJw9RN".
 */
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const UUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:@(.+))?$/;

/** "uuid@sub" -> { uuid, sub } (sub '' for a main asset), or null for other strings. */
export function splitUuid(s: string): { uuid: string; sub: string } | null {
    const m = UUID_RE.exec(s);
    return m ? { uuid: m[1], sub: m[2] || '' } : null;
}

/** Compressed class id of a script uuid; `min` keeps 2 head digits (22 chars) instead of 5. */
export function compressUuid(uuid: string, min = false): string {
    const hex = uuid.replace(/-/g, '');
    const head = min ? 2 : 5;
    let out = hex.slice(0, head);
    for (let i = head; i < hex.length; i += 3) {
        const a = parseInt(hex[i], 16);
        const b = parseInt(hex[i + 1], 16);
        const c = parseInt(hex[i + 2], 16);
        out += BASE64[(a << 2) | (b >> 2)] + BASE64[((b & 3) << 4) | c];
    }
    return out;
}
