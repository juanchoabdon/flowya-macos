import { createClient } from '@supabase/supabase-js';
import type { Space, Todo, Settings, WeeklyGoal, RecurringTask, Note, DailyPlan, DailyPlanView } from '../types';
import { SPACE_COLORS } from '../types';

// Get Supabase credentials from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Fixed user ID for single-user mode
export const USER_ID = 'local-user';

// ============ Spaces API ============

export async function getSpaces(): Promise<Space[]> {
  const { data, error } = await supabase
    .from('spaces')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error fetching spaces:', error);
    throw error;
  }
  return data || [];
}

export async function createSpace(name: string, userId: string): Promise<Space> {
  // Pick a random pastel color
  const randomColor = SPACE_COLORS[Math.floor(Math.random() * SPACE_COLORS.length)];
  
  // Get the max position to add at the end
  const { data: existing } = await supabase
    .from('spaces')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: false })
    .limit(1);
  
  const maxPosition = existing?.[0]?.position ?? -1;
  
  const { data, error } = await supabase
    .from('spaces')
    .insert({ name, color: randomColor, user_id: userId, position: maxPosition + 1 })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating space:', error);
    throw error;
  }
  return data;
}

export async function updateSpace(id: string, updates: Partial<Pick<Space, 'name' | 'color' | 'position'>>): Promise<Space> {
  const { data, error } = await supabase
    .from('spaces')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating space:', error);
    throw error;
  }
  return data;
}

export async function reorderSpaces(spaceIds: string[]): Promise<void> {
  // Update positions for all spaces in the new order
  const updates = spaceIds.map((id, index) => 
    supabase
      .from('spaces')
      .update({ position: index })
      .eq('id', id)
  );
  
  await Promise.all(updates);
}

export async function deleteSpace(id: string): Promise<void> {
  // First delete all todos in the space
  await supabase.from('todos').delete().eq('space_id', id);
  
  const { error } = await supabase
    .from('spaces')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Error deleting space:', error);
    throw error;
  }
}

// ============ Todos API ============

export async function getTodos(spaceId: string): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('space_id', spaceId)
    .eq('archived', false)
    .order('position', { ascending: true });
  
  if (error) {
    console.error('Error fetching todos:', error);
    throw error;
  }
  return data || [];
}

export async function getAllTodos(): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('archived', false)
    .order('position', { ascending: true });
  
  if (error) {
    console.error('Error fetching all todos:', error);
    throw error;
  }
  return data || [];
}

export async function createTodo(spaceId: string, text: string): Promise<Todo> {
  // Get current max position for backlog to place new todo at bottom (oldest first)
  const { data: existing } = await supabase
    .from('todos')
    .select('position')
    .eq('space_id', spaceId)
    .eq('status', 'backlog')
    .order('position', { ascending: false })
    .limit(1);
  
  const maxPosition = existing?.[0]?.position ?? -1;
  const newPosition = maxPosition + 1;

  const { data, error } = await supabase
    .from('todos')
    .insert({
      space_id: spaceId,
      text,
      status: 'backlog',
      position: newPosition,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating todo:', error);
    throw error;
  }
  return data;
}

export async function updateTodo(
  id: string,
  updates: Partial<Pick<Todo, 'text' | 'description' | 'status' | 'position' | 'priority' | 'due_date' | 'space_id'>>
): Promise<Todo> {
  const updateData: Record<string, unknown> = { ...updates };
  
  // Set timestamps based on status changes
  if (updates.status !== undefined) {
    // Set started_at when moving to in_progress
    if (updates.status === 'in_progress') {
      updateData.started_at = new Date().toISOString();
      updateData.completed_at = null;
    } else if (updates.status === 'done') {
      updateData.completed_at = new Date().toISOString();
    } else {
      // backlog - clear both timestamps
      updateData.started_at = null;
      updateData.completed_at = null;
    }
  }
  
  const { data, error } = await supabase
    .from('todos')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating todo:', error);
    throw error;
  }
  return data;
}

export async function reorderTodos(todoIds: string[]): Promise<void> {
  // Update positions in batch
  const updates = todoIds.map((id, index) => ({
    id,
    position: index,
  }));

  for (const update of updates) {
    await supabase
      .from('todos')
      .update({ position: update.position })
      .eq('id', update.id);
  }
}

export async function deleteTodo(id: string): Promise<void> {
  const { error } = await supabase
    .from('todos')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Error deleting todo:', error);
    throw error;
  }
}

export async function unarchiveTodo(id: string): Promise<void> {
  const { error } = await supabase
    .from('todos')
    .update({ archived: false })
    .eq('id', id);

  if (error) {
    console.error('Error unarchiving todo:', error);
    throw error;
  }
}

export async function archiveTodo(id: string): Promise<void> {
  const { error } = await supabase
    .from('todos')
    .update({ archived: true })
    .eq('id', id);
  
  if (error) {
    console.error('Error archiving todo:', error);
    throw error;
  }
}

export async function archiveAllDone(spaceId?: string): Promise<void> {
  let query = supabase
    .from('todos')
    .update({ archived: true })
    .eq('status', 'done')
    .eq('archived', false);
  
  if (spaceId) {
    query = query.eq('space_id', spaceId);
  }
  
  const { error } = await query;
  
  if (error) {
    console.error('Error archiving all done todos:', error);
    throw error;
  }
}

// ============ Settings API ============

export async function getSettings(userId: string): Promise<Settings> {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error) {
    // If no settings exist, create default settings
    if (error.code === 'PGRST116') {
      return createDefaultSettings(userId);
    }
    console.error('Error fetching settings:', error);
    throw error;
  }
  return data;
}

async function createDefaultSettings(userId: string): Promise<Settings> {
  const defaultSettings = {
    user_id: userId,
    always_on_top: true,
    visible_on_all_workspaces: true,
    opacity: 1.0,
    last_selected_space: null,
    all_spaces_color: '#64B5F6',
    nickname: null,
  };
  
  const { data, error } = await supabase
    .from('settings')
    .upsert(defaultSettings)
    .select()
    .single();
  
  if (error) {
    console.error('Error creating default settings:', error);
    throw error;
  }
  return data;
}

export async function updateSettings(
  updates: Partial<Omit<Settings, 'id'>>,
  userId: string
): Promise<Settings> {
  // First try to get existing settings
  const { data: existing } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (existing) {
    // Update existing settings
    const { data, error } = await supabase
      .from('settings')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
    return data;
  } else {
    // Create new settings with the updates
    const newSettings = {
      user_id: userId,
      always_on_top: true,
      visible_on_all_workspaces: true,
      opacity: 1.0,
      last_selected_space: null,
      all_spaces_color: '#64B5F6',
      nickname: null,
      ...updates,
    };
    
    const { data, error } = await supabase
      .from('settings')
      .insert(newSettings)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating settings:', error);
      throw error;
    }
    return data;
  }
}

// ============================================
// Changelogs
// ============================================

export interface Changelog {
  id: string;
  version: string;
  date: string;
  changes: string[];
  created_at: string;
}

// ============ Weekly Goals API ============

export function getMonday(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  // Sunday: plan for NEXT Monday (tomorrow)
  if (day === 0) {
    d.setDate(d.getDate() + 1);
  } else {
    d.setDate(d.getDate() - day + 1);
  }
  // Use local time (not UTC) to avoid timezone drift
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function getWeeklyGoals(userId: string, weekStart: string): Promise<WeeklyGoal[]> {
  const { data, error } = await supabase
    .from('weekly_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .order('position', { ascending: true });

  if (error) {
    console.error('Error fetching weekly goals:', error);
    return [];
  }
  return data || [];
}

export async function getLastWeekGoals(userId: string): Promise<WeeklyGoal[]> {
  const now = new Date();
  const lastMonday = new Date(now);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const weekStart = getMonday(lastMonday);

  return getWeeklyGoals(userId, weekStart);
}

export async function upsertWeeklyGoals(
  userId: string,
  goals: Array<{ space_id: string; goal_text: string; position: number; linked_todo_id?: string | null; linked_todo_ids?: string[] }>
): Promise<WeeklyGoal[]> {
  const weekStart = getMonday();

  // Delete existing goals for this week first
  await supabase
    .from('weekly_goals')
    .delete()
    .eq('user_id', userId)
    .eq('week_start', weekStart);

  if (goals.length === 0) return [];

  const rows = goals.map(g => ({
    user_id: userId,
    space_id: g.space_id,
    week_start: weekStart,
    goal_text: g.goal_text,
    position: g.position,
    linked_todo_id: g.linked_todo_ids?.[0] || g.linked_todo_id || null,
    linked_todo_ids: g.linked_todo_ids || (g.linked_todo_id ? [g.linked_todo_id] : []),
    completed: false,
  }));

  const { data, error } = await supabase
    .from('weekly_goals')
    .insert(rows)
    .select();

  if (error) {
    console.error('Error upserting weekly goals:', error);
    throw error;
  }
  return data || [];
}

export async function updateWeeklyGoalLinkedTodo(goalId: string, linkedTodoId: string): Promise<void> {
  const { error } = await supabase
    .from('weekly_goals')
    .update({ linked_todo_id: linkedTodoId })
    .eq('id', goalId);

  if (error) {
    console.error('Error updating weekly goal linked todo:', error);
  }
}

export async function linkTodoToGoal(goalId: string, todoId: string): Promise<void> {
  const { data } = await supabase
    .from('weekly_goals')
    .select('linked_todo_ids, linked_todo_id')
    .eq('id', goalId)
    .single();

  const current: string[] = data?.linked_todo_ids || (data?.linked_todo_id ? [data.linked_todo_id] : []);
  if (current.includes(todoId)) return;

  const updated = [...current, todoId];
  const { error } = await supabase
    .from('weekly_goals')
    .update({ linked_todo_ids: updated, linked_todo_id: updated[0] })
    .eq('id', goalId);

  if (error) console.error('Error linking todo to goal:', error);
}

export async function unlinkTodoFromGoal(goalId: string, todoId: string): Promise<void> {
  const { data } = await supabase
    .from('weekly_goals')
    .select('linked_todo_ids, linked_todo_id')
    .eq('id', goalId)
    .single();

  const current: string[] = data?.linked_todo_ids || (data?.linked_todo_id ? [data.linked_todo_id] : []);
  const updated = current.filter(id => id !== todoId);
  const { error } = await supabase
    .from('weekly_goals')
    .update({ linked_todo_ids: updated, linked_todo_id: updated[0] || null })
    .eq('id', goalId);

  if (error) console.error('Error unlinking todo from goal:', error);
}

export async function updateWeeklyGoalCompletion(goalId: string, completed: boolean): Promise<void> {
  const { error } = await supabase
    .from('weekly_goals')
    .update({ completed })
    .eq('id', goalId);

  if (error) {
    console.error('Error updating weekly goal completion:', error);
  }
}

// ============ Daily Plans API ============

const DEFAULT_TZ = 'America/Mexico_City';

export function getLocalDateString(date: Date = new Date(), timezone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function joinDailyPlanItems(
  items: Array<{ id: string; task_id: string; bucket: string; position: number }>,
): Promise<DailyPlanView['items']> {
  if (items.length === 0) return [];
  const taskIds = items.map(i => i.task_id);
  const { data } = await supabase.from('todos').select('*').in('id', taskIds);
  const taskMap = new Map((data || []).map((t: Todo) => [t.id, t]));

  return items.map(item => ({
    id: item.id,
    task_id: item.task_id,
    bucket: item.bucket as DailyPlanView['items'][0]['bucket'],
    position: item.position,
    task: taskMap.get(item.task_id) ?? null,
    missing: !taskMap.has(item.task_id),
  }));
}

export async function getDailyPlan(
  userId: string,
  date?: string,
  timezone = DEFAULT_TZ,
): Promise<DailyPlanView> {
  const planDate = date ?? getLocalDateString(new Date(), timezone);

  const { data: plan, error } = await supabase
    .from('daily_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_date', planDate)
    .maybeSingle();

  if (error) {
    console.error('Error fetching daily plan:', error);
    return { plan: null, items: [] };
  }

  if (!plan) return { plan: null, items: [] };

  const { data: items, error: itemsErr } = await supabase
    .from('daily_plan_items')
    .select('id, task_id, bucket, position')
    .eq('daily_plan_id', plan.id)
    .is('removed_at', null)
    .order('position', { ascending: true });

  if (itemsErr) {
    console.error('Error fetching daily plan items:', itemsErr);
    return { plan: plan as DailyPlan, items: [] };
  }

  const joined = await joinDailyPlanItems(items || []);
  return { plan: plan as DailyPlan, items: joined };
}

// ============ Recurring Tasks API ============

export async function getRecurringTasks(userId: string): Promise<RecurringTask[]> {
  const { data, error } = await supabase
    .from('recurring_tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching recurring tasks:', error);
    return [];
  }
  return data || [];
}

export async function createRecurringTask(
  task: { user_id: string; space_id: string; text: string; days: number[] }
): Promise<RecurringTask> {
  const { data, error } = await supabase
    .from('recurring_tasks')
    .insert({ ...task, enabled: true })
    .select()
    .single();

  if (error) {
    console.error('Error creating recurring task:', error);
    throw error;
  }
  return data;
}

export async function updateRecurringTask(
  id: string,
  updates: Partial<Pick<RecurringTask, 'text' | 'space_id' | 'days' | 'enabled'>>
): Promise<RecurringTask> {
  const { data, error } = await supabase
    .from('recurring_tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating recurring task:', error);
    throw error;
  }
  return data;
}

export async function deleteRecurringTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_tasks')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting recurring task:', error);
    throw error;
  }
}

export async function markRecurringTaskCreated(id: string, date: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_tasks')
    .update({ last_created_date: date })
    .eq('id', id);

  if (error) {
    console.error('Error marking recurring task created:', error);
  }
}

export async function createTodoAtTop(spaceId: string, text: string): Promise<Todo> {
  // Shift all existing backlog tasks' positions up by 1
  const { data: existing } = await supabase
    .from('todos')
    .select('id, position')
    .eq('space_id', spaceId)
    .eq('archived', false)
    .order('position', { ascending: true });

  if (existing && existing.length > 0) {
    for (const todo of existing) {
      await supabase
        .from('todos')
        .update({ position: todo.position + 1 })
        .eq('id', todo.id);
    }
  }

  const { data, error } = await supabase
    .from('todos')
    .insert({
      space_id: spaceId,
      text,
      status: 'backlog',
      priority: 'P0',
      position: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating todo at top:', error);
    throw error;
  }
  return data;
}

// ============ Notes API ============

export async function getNotes(spaceId: string, _userId?: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('space_id', spaceId)
    .order('position', { ascending: true });

  if (error) {
    console.error('Error fetching notes:', error);
    return [];
  }
  return data || [];
}

export async function getAllNotes(_userId?: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching all notes:', error);
    return [];
  }
  return data || [];
}

export async function createNote(spaceId: string, title: string): Promise<Note> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: existing } = await supabase
    .from('notes')
    .select('position')
    .eq('space_id', spaceId)
    .order('position', { ascending: false })
    .limit(1);

  const maxPosition = existing?.[0]?.position ?? -1;

  const { data, error } = await supabase
    .from('notes')
    .insert({ space_id: spaceId, user_id: user.id, title, position: maxPosition + 1 })
    .select()
    .single();

  if (error) {
    console.error('Error creating note:', error);
    throw error;
  }
  return data;
}

export async function updateNote(
  id: string,
  updates: Partial<Pick<Note, 'title' | 'content' | 'position'>>
): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating note:', error);
    throw error;
  }
  return data;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting note:', error);
    throw error;
  }
}

// ============================================
// Changelogs
// ============================================

export async function getChangelogs(): Promise<Changelog[]> {
  const { data, error } = await supabase
    .from('changelogs')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching changelogs:', error);
    return [];
  }
  
  return data || [];
}
