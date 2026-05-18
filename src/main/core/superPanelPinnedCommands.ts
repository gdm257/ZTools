interface SuperPanelPinnedCommandMatch {
  path?: string
  featureCode?: string
}

function matchesPinnedCommand(item: any, match: SuperPanelPinnedCommandMatch): boolean {
  if (match.featureCode !== undefined && item?.featureCode !== match.featureCode) {
    return false
  }
  if (match.path !== undefined && item?.path !== match.path) {
    return false
  }
  return match.featureCode !== undefined || match.path !== undefined
}

export function filterSuperPanelPinnedCommands(
  items: any[],
  match: SuperPanelPinnedCommandMatch
): { items: any[]; changed: boolean } {
  let changed = false
  const nextItems: any[] = []

  for (const item of items) {
    if (matchesPinnedCommand(item, match)) {
      changed = true
      continue
    }

    // 递归处理文件夹内部的指令；文件夹为空则移除，只剩 1 个指令时自动解散。
    if (item?.isFolder && Array.isArray(item.items)) {
      const filtered = filterSuperPanelPinnedCommands(item.items, match)
      if (filtered.changed) changed = true

      if (filtered.items.length === 0) {
        changed = true
        continue
      }

      if (filtered.items.length === 1) {
        changed = true
        nextItems.push(filtered.items[0])
        continue
      }

      nextItems.push(filtered.changed ? { ...item, items: filtered.items } : item)
      continue
    }

    nextItems.push(item)
  }

  return { items: nextItems, changed }
}
