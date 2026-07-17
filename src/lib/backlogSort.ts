import type { Todo } from '../types';

export type BacklogSortTodo = Pick<Todo, 'id' | 'space_id' | 'status' | 'position' | 'manual_order' | 'due_date' | 'created_at' | 'priority'>;

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function priorityRank(priority?: string | null): number {
  return PRIORITY_RANK[priority ?? 'P1'] ?? 1;
}

function parseDueMs(due: string | null): number | null {
  if (!due || !due.trim()) return null;
  let s = due.replace(' ', 'T');
  if (!s.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(s) && !/[+-]\d{2}$/.test(s)) s += 'Z';
  const ms = new Date(s).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function comparePriorityThenCreated(a: BacklogSortTodo, b: BacklogSortTodo): number {
  const pa = priorityRank(a.priority);
  const pb = priorityRank(b.priority);
  if (pa !== pb) return pa - pb;
  return a.created_at.localeCompare(b.created_at) || a.position - b.position;
}

/** Chronological compare for auto-sorted backlog tasks (null due_date last). */
export function compareDueDate(a: BacklogSortTodo, b: BacklogSortTodo): number {
  const aMs = parseDueMs(a.due_date);
  const bMs = parseDueMs(b.due_date);
  if (aMs === null && bMs === null) return comparePriorityThenCreated(a, b);
  if (aMs === null) return 1;
  if (bMs === null) return -1;
  if (aMs !== bMs) return aMs - bMs;
  return comparePriorityThenCreated(a, b);
}

/** UI sort for backlog: manual tasks by position; auto tasks by due_date. */
export function compareBacklogDisplay(a: BacklogSortTodo, b: BacklogSortTodo): number {
  if (a.manual_order && b.manual_order) return a.position - b.position;
  if (!a.manual_order && !b.manual_order) return compareDueDate(a, b);
  return a.position - b.position;
}

/** Assign positions to auto tasks in gaps left by manually pinned tasks. */
export function computeAutoBacklogPositions(backlog: BacklogSortTodo[]): Map<string, number> {
  const manual = backlog.filter(t => t.manual_order);
  const auto = backlog.filter(t => !t.manual_order).sort(compareDueDate);
  const manualPos = new Set(manual.map(t => t.position));
  const updates = new Map<string, number>();

  for (const m of manual) updates.set(m.id, m.position);

  let ai = 0;
  let p = 0;
  while (ai < auto.length) {
    while (manualPos.has(p)) p++;
    updates.set(auto[ai].id, p);
    p++;
    ai++;
  }
  return updates;
}

export function groupBacklogBySpace(backlog: BacklogSortTodo[]): Map<string, BacklogSortTodo[]> {
  const map = new Map<string, BacklogSortTodo[]>();
  for (const t of backlog) {
    const list = map.get(t.space_id) ?? [];
    list.push(t);
    map.set(t.space_id, list);
  }
  return map;
}
