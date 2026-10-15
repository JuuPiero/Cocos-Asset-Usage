/** Assets panel context menu: Find References / Show Dependencies (Unity: Find References In Project). */
export function onAssetMenu(assetInfo: { uuid: string; isDirectory?: boolean }) {
    if (!assetInfo?.uuid) return [];
    const items: Editor.Menu.ContextMenuItem[] = [
        {
            label: 'Find References',
            click() {
                Editor.Message.send('asset-usage', 'find-references', assetInfo.uuid);
            },
        },
    ];
    if (!assetInfo.isDirectory) {
        items.push({
            label: 'Show Dependencies',
            click() {
                Editor.Message.send('asset-usage', 'show-dependencies', assetInfo.uuid);
            },
        });
    }
    return items;
}
