/** Puts a realtime insert/update into a newest-first list: replaces the row with the same id, keeps the newest `max`. */
export function mergeNewestFirst<T extends { id: string; created_at: string }>(list: T[], row: T, max: number): T[] {
  return [row, ...list.filter((r) => r.id !== row.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, max);
}
