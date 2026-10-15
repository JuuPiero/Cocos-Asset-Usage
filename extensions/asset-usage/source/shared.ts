/** Types shared by the main process and the panel. */
export type Mode = 'references' | 'dependencies' | 'unused' | 'missing' | 'scene';

export interface PanelRequest {
    mode: Mode;
    /** Asset uuid (may be "uuid@sub"), or a node uuid for 'scene'. */
    uuid?: string;
}
