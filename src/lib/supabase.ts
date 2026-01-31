import { createClient } from '@supabase/supabase-js';
import type { Space, Todo, Settings } from '../types';
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
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error fetching spaces:', error);
    throw error;
  }
  return data || [];
}

export async function createSpace(name: string): Promise<Space> {
  // Pick a random pastel color
  const randomColor = SPACE_COLORS[Math.floor(Math.random() * SPACE_COLORS.length)];
  
  const { data, error } = await supabase
    .from('spaces')
    .insert({ name, color: randomColor })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating space:', error);
    throw error;
  }
  return data;
}

export async function updateSpace(id: string, updates: Partial<Pick<Space, 'name' | 'color'>>): Promise<Space> {
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
  // Get current min position to place new todo at top
  const { data: existing } = await supabase
    .from('todos')
    .select('position')
    .eq('space_id', spaceId)
    .order('position', { ascending: true })
    .limit(1);
  
  const minPosition = existing?.[0]?.position ?? 1;
  const newPosition = minPosition - 1;

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
  updates: Partial<Pick<Todo, 'text' | 'description' | 'status' | 'position'>>
): Promise<Todo> {
  const updateData: Record<string, unknown> = { ...updates };
  
  // Set completed_at when marking as done
  if (updates.status !== undefined) {
    updateData.completed_at = updates.status === 'done' ? new Date().toISOString() : null;
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

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single();
  
  if (error) {
    // If no settings exist, create default settings
    if (error.code === 'PGRST116') {
      return createDefaultSettings();
    }
    console.error('Error fetching settings:', error);
    throw error;
  }
  return data;
}

async function createDefaultSettings(): Promise<Settings> {
  const defaultSettings: Omit<Settings, 'id'> & { id: number } = {
    id: 1,
    always_on_top: true,
    visible_on_all_workspaces: true,
    opacity: 1.0,
    last_selected_space: null,
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
  updates: Partial<Omit<Settings, 'id'>>
): Promise<Settings> {
  const { data, error } = await supabase
    .from('settings')
    .update(updates)
    .eq('id', 1)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
  return data;
}
