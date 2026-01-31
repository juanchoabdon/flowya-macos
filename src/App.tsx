import { useState, useEffect, useRef, useCallback } from 'react';
import { useSpaces } from './hooks/useSpaces';
import { useTodos } from './hooks/useTodos';
import { useSettings } from './hooks/useSettings';
import { GlassBar } from './components/GlassBar';
import { AddTodo } from './components/AddTodo';
import { FilterBar } from './components/FilterBar';
import { TodoList } from './components/TodoList';
import { TodoDetail } from './components/TodoDetail';
import type { FilterType, Todo } from './types';

export default function App() {
  const { spaces, loading: spacesLoading, createSpace, updateSpace, deleteSpace } = useSpaces();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
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
  } = useTodos(selectedSpaceId);

  // Set initial selected space from settings or first space (only once)
  useEffect(() => {
    if (spaces.length > 0 && !selectedSpaceId) {
      const lastSpace = settings?.last_selected_space;
      const spaceExists = lastSpace && spaces.some(s => s.id === lastSpace);
      setSelectedSpaceId(spaceExists ? lastSpace : spaces[0].id);
    }
  }, [spaces.length, settings?.last_selected_space]); // Minimal dependencies

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

  // Keyboard shortcuts for switching spaces (Cmd+1, Cmd+2, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd (Mac) or Ctrl (Windows)
      if (e.metaKey || e.ctrlKey) {
        const key = e.key;
        
        // Cmd+0 = All
        if (key === '0') {
          e.preventDefault();
          handleSelectSpace('__all__');
          return;
        }
        
        // Cmd+1 through Cmd+9 = spaces 1-9
        const num = parseInt(key);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          const spaceIndex = num - 1;
          if (spaceIndex < spaces.length) {
            handleSelectSpace(spaces[spaceIndex].id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [spaces]);

  // Listen for window focus changes to adjust opacity
  useEffect(() => {
    if (window.windowApi?.onFocusChange) {
      const unsubscribe = window.windowApi.onFocusChange((focused) => {
        setWindowFocused(focused);
      });
      return unsubscribe;
    }
  }, []);

  const handleSelectSpace = (id: string) => {
    setSelectedSpaceId(id);
    setFilter('in_progress'); // Reset filter when switching spaces
  };

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

  // Filter todos by status
  const filteredTodos = todos.filter(todo => {
    if (filter === 'backlog') return todo.status === 'backlog';
    if (filter === 'in_progress') return todo.status === 'in_progress';
    if (filter === 'done') return todo.status === 'done';
    return true;
  });

  // Count for display
  const activeCount = todos.filter(t => t.status !== 'done').length;
  const totalCount = todos.length;

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

  if (spacesLoading || settingsLoading) {
    return (
      <div className={`app-container ${!windowFocused ? 'unfocused' : ''}`}>
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  // Handle minimize - just hide the window
  const handleMinimize = () => {
    window.windowApi?.toggleVisibility();
  };

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
        onMinimize={handleMinimize}
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
              activeCount={activeCount}
              totalCount={totalCount}
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
