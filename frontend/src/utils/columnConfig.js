export function readColumnKeys(storageKey) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter(Boolean) : null;
  } catch {
    return null;
  }
}

export function writeColumnKeys(storageKey, keys) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(keys));
  } catch {
    // Ignore storage failures; DB-backed dynamic column config still saves.
  }
}

export function orderedVisibleColumns(availableColumns, selectedKeys) {
  if (!Array.isArray(selectedKeys)) return availableColumns;
  const byKey = new Map(availableColumns.map((column) => [column.field_key, column]));
  return selectedKeys.map((key) => byKey.get(key)).filter(Boolean);
}

