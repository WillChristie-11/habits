// Pure rules for Today's priorities. They are never counted, flagged or reminded about.
import type { Priority } from '../types';

/** At most this many open at a time. */
export const MAX_OPEN = 3;

export const openPriorities = (list: Priority[]) => list.filter((p) => p.done_on == null);
export const canAddPriority = (list: Priority[]) => openPriorities(list).length < MAX_OPEN;

/**
 * What a day shows. Today: everything still open (carried over from earlier days) plus what was
 * checked today. A past day: what was checked on that day. Open first, oldest first.
 */
export function prioritiesOn(list: Priority[], date: string, today: string): Priority[] {
  const shown =
    date === today
      ? list.filter((p) => (p.done_on == null && p.created_on <= today) || p.done_on === today)
      : list.filter((p) => p.done_on === date);
  return shown.sort((a, b) => Number(a.done_on != null) - Number(b.done_on != null) || a.id - b.id);
}
