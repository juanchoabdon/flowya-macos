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
