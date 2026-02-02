import { useState, useEffect, useRef, useCallback } from 'react';
import { useSpaces } from './hooks/useSpaces';
import { useTodos } from './hooks/useTodos';
import { useSettings } from './hooks/useSettings';
import { useAuth } from './hooks/useAuth';
import { GlassBar } from './components/GlassBar';
import { AddTodo } from './components/AddTodo';
import { FilterBar } from './components/FilterBar';
import { TodoList } from './components/TodoList';
import { TodoDetail } from './components/TodoDetail';
import { Login } from './components/Login';
import type { FilterType, Todo } from './types';

export default function App() {
  const { user, loading: authLoading, signInWithEmail, signOut } = useAuth();
  const { spaces, loading: spacesLoading, createSpace, updateSpace, deleteSpace } = useSpaces(user?.id);
  const { settings, loading: settingsLoading, updateSettings } = useSettings(user?.id);
  
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>('__all__');
  const [filter, setFilter] = useState<FilterType>('in_progress');
  const [windowFocused, setWindowFocused] = useState(true);
  const [detailTodo, setDetailTodo] = useState<Todo | null>(null);
  
  const {
    todos,
    loading: todosLoading,
    createTodo,
    updateTodo,
    deleteTodo,
    archiveTodo,
    archiveAllDone,
    reorderTodos,
    isAllView,
  } = useTodos(selectedSpaceId, user?.id);

  // Refresh dock icon after login
  const prevUserRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    // If user just logged in (was undefined, now has value)
    if (prevUserRef.current === undefined && user?.id) {
      window.windowApi?.refreshDock();
    }
    prevUserRef.current = user?.id;
  }, [user?.id]);

  // Create default space if none exist (only runs once when loaded)
  useEffect(() => {
    if (!spacesLoading && spaces.length === 0) {
      createSpace('Personal').then(space => {
        if (space) setSelectedSpaceId(space.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spacesLoading, spaces.length]); // Don't include createSpace to avoid loops

  // Save last selected space (only for real spaces, not "all" view)
  useEffect(() => {
    // Don't save if it's the "all" view or if nothing changed
    if (
      selectedSpaceId && 
      selectedSpaceId !== '__all__' &&
      settings && 
      settings.last_selected_space !== selectedSpaceId
    ) {
      updateSettings({ last_selected_space: selectedSpaceId });
    }
  }, [selectedSpaceId]); // Only depend on selectedSpaceId to avoid loops

  // Define handleSelectSpace first so it can be used in effects
  const handleSelectSpace = useCallback((id: string) => {
    setSelectedSpaceId(id);
  }, []);

  // Keyboard shortcuts for switching spaces (Cmd+1 = All, Cmd+2-9 = spaces)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd (Mac) or Ctrl (Windows)
      if (e.metaKey || e.ctrlKey) {
        const key = e.key;
        
        // Cmd+1 = All
        if (key === '1') {
          e.preventDefault();
          handleSelectSpace('__all__');
          return;
        }
        
        // Cmd+2 through Cmd+9 = spaces 1-8
        const num = parseInt(key);
        if (num >= 2 && num <= 9) {
          e.preventDefault();
          const spaceIndex = num - 2; // Cmd+2 = index 0, Cmd+3 = index 1, etc.
          if (spaceIndex < spaces.length) {
            handleSelectSpace(spaces[spaceIndex].id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [spaces, handleSelectSpace]);

  // Listen for window focus changes to adjust opacity
  useEffect(() => {
    if (window.windowApi?.onFocusChange) {
      const unsubscribe = window.windowApi.onFocusChange((focused) => {
        setWindowFocused(focused);
      });
      return unsubscribe;
    }
  }, []);

  // Track previous values to detect space changes and loading completion
  const prevSpaceRef = useRef<string | null>(null);
  const prevLoadingRef = useRef(true);
  
  // Auto-switch filter when space changes and todos finish loading
  useEffect(() => {
    const spaceChanged = selectedSpaceId !== prevSpaceRef.current;
    const justFinishedLoading = prevLoadingRef.current && !todosLoading;
    
    // Update refs
    if (spaceChanged) {
      prevSpaceRef.current = selectedSpaceId;
    }
    prevLoadingRef.current = todosLoading;
    
    // Set filter when loading finishes after a space change (or initial load)
    if (justFinishedLoading) {
      const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
      setFilter(inProgressCount > 0 ? 'in_progress' : 'backlog');
    }
  }, [selectedSpaceId, todosLoading, todos]);

  const handleCreateSpace = async (name: string) => {
    const space = await createSpace(name);
    if (space) {
      setSelectedSpaceId(space.id);
    }
  };

  const handleDeleteSpace = async (id: string) => {
    await deleteSpace(id);
    // Select another space after deletion
    const remaining = spaces.filter(s => s.id !== id);
    if (remaining.length > 0) {
      setSelectedSpaceId(remaining[0].id);
    }
  };

  const selectedSpace = spaces.find(s => s.id === selectedSpaceId);

  // Celebration animation for drag & drop to Done
  const triggerCelebration = () => {
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
    const container = document.querySelector('.app-container');
    if (!container) return;

    for (let i = 0; i < 30; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti-particle';
      confetti.style.left = `${Math.random() * 100}%`;
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.animationDelay = `${Math.random() * 0.5}s`;
      confetti.style.animationDuration = `${1 + Math.random() * 1}s`;
      container.appendChild(confetti);
      
      setTimeout(() => confetti.remove(), 2000);
    }
  };

  // Filter todos by status and apply sorting
  const filteredTodos = todos
    .filter(todo => {
      if (filter === 'backlog') return todo.status === 'backlog';
      if (filter === 'in_progress') return todo.status === 'in_progress';
      if (filter === 'done') return todo.status === 'done';
      return true;
    })
    .sort((a, b) => {
      // All statuses now use position for manual reordering
      return a.position - b.position;
    });

  // Count for display: done tasks vs pending (backlog + in_progress)
  const doneCount = todos.filter(t => t.status === 'done').length;
  const pendingCount = todos.filter(t => t.status !== 'done').length;

  // Swipe gesture handling for trackpad
  const swipeAccumulator = useRef(0);
  const swipeTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastSwipeTime = useRef(0);
  const filters: FilterType[] = ['backlog', 'in_progress', 'done'];

  const handleSwipe = useCallback((e: WheelEvent) => {
    // Only handle horizontal swipes
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    
    // Cooldown between swipes (500ms)
    const now = Date.now();
    if (now - lastSwipeTime.current < 500) return;
    
    // Accumulate swipe distance
    swipeAccumulator.current += e.deltaX;
    
    // Clear previous timeout
    if (swipeTimeout.current) {
      clearTimeout(swipeTimeout.current);
    }
    
    // Check if we've accumulated enough for a swipe (higher = needs stronger swipe)
    const threshold = 150;
    
    if (Math.abs(swipeAccumulator.current) > threshold) {
      const currentIndex = filters.indexOf(filter);
      
      if (swipeAccumulator.current > 0 && currentIndex < filters.length - 1) {
        // Swipe left -> next filter (backlog -> in_progress -> done)
        setFilter(filters[currentIndex + 1]);
        lastSwipeTime.current = now;
      } else if (swipeAccumulator.current < 0 && currentIndex > 0) {
        // Swipe right -> previous filter (done -> in_progress -> backlog)
        setFilter(filters[currentIndex - 1]);
        lastSwipeTime.current = now;
      }
      
      swipeAccumulator.current = 0;
    }
    
    // Reset accumulator after a pause
    swipeTimeout.current = setTimeout(() => {
      swipeAccumulator.current = 0;
    }, 150);
  }, [filter, filters]);

  // Add wheel event listener for swipe gestures
  useEffect(() => {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.addEventListener('wheel', handleSwipe as EventListener, { passive: true });
      return () => {
        mainContent.removeEventListener('wheel', handleSwipe as EventListener);
      };
    }
  }, [handleSwipe]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="auth-loading">
        <div className="spinner" />
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return (
      <Login
        onSignInWithEmail={signInWithEmail}
      />
    );
  }

  if (spacesLoading || settingsLoading) {
    return (
      <div className={`app-container ${!windowFocused ? 'unfocused' : ''}`}>
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className={`app-container ${!windowFocused ? 'unfocused' : ''}`}>
      <GlassBar
        spaces={spaces}
        selectedSpace={selectedSpace || null}
        selectedSpaceId={selectedSpaceId}
        onSelectSpace={handleSelectSpace}
        onCreateSpace={handleCreateSpace}
        onUpdateSpace={updateSpace}
        onDeleteSpace={handleDeleteSpace}
        settings={settings}
        onUpdateSettings={updateSettings}
        onSignOut={signOut}
        userEmail={user?.email}
        windowFocused={windowFocused}
      />
      
      <div className="main-content">
        {detailTodo ? (
          // Detail View - replaces the list
          <TodoDetail
            todo={detailTodo}
            onUpdate={(id, updates) => {
              updateTodo(id, updates);
              setDetailTodo(prev => prev ? { ...prev, ...updates } : null);
            }}
            onStatusChange={(id, status) => {
              updateTodo(id, { status });
              setDetailTodo(prev => prev ? { ...prev, status } : null);
            }}
            onClose={() => setDetailTodo(null)}
            space={isAllView ? spaces.find(s => s.id === detailTodo.space_id) : undefined}
          />
        ) : (
          // Normal list view
          <>
            <FilterBar
              filter={filter}
              onFilterChange={setFilter}
              onDropTask={(taskId, newStatus) => {
                updateTodo(taskId, { status: newStatus });
                if (newStatus === 'done') {
                  triggerCelebration();
                }
              }}
              doneCount={doneCount}
              pendingCount={pendingCount}
            />
            
            <TodoList
              todos={filteredTodos}
              loading={todosLoading}
              onStatusChange={(id, status) => updateTodo(id, { status })}
              onUpdate={(id, updates) => updateTodo(id, updates)}
              onDelete={deleteTodo}
              onArchive={archiveTodo}
              onOpenDetail={setDetailTodo}
              onArchiveAllDone={archiveAllDone}
              onReorder={reorderTodos}
              showClearAll={filter === 'done'}
              spaces={spaces}
              isAllView={isAllView}
              emptyMessage={
                filter === 'all'
                  ? 'No tasks yet. Add one below!'
                  : filter === 'backlog'
                  ? 'No backlog tasks'
                  : filter === 'in_progress'
                  ? 'No tasks in progress'
                  : 'No completed tasks'
              }
            />
            
            <AddTodo 
              onAdd={async (text) => {
                const result = await createTodo(text);
                if (result) {
                  setFilter('backlog'); // Switch to backlog tab after adding
                }
                return result;
              }} 
              disabled={!selectedSpaceId || isAllView}
              placeholder={isAllView ? 'Select a space to add tasks...' : 'Add new task...'}
            />
          </>
        )}
      </div>
    </div>
  );
}
