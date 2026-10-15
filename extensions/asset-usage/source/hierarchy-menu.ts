/** Hierarchy context menu: Find References In Scene (what points at this node). */
export function onNodeMenu(node: { uuid?: string; value?: { uuid?: string } } | undefined) {
    const uuid = node?.uuid || node?.value?.uuid;
    if (!uuid) return [];
    return [
        {
            label: 'Find References In Scene',
            click() {
                Editor.Message.send('asset-usage', 'find-in-scene', uuid);
            },
        },
    ];
}
