import { useState, useRef, useCallback, useEffect } from 'react';
import type { Todo, TaskStatus, Space, Priority } from '../types';
import { TodoItem } from './TodoItem';

function EmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="empty-state-icon">
      <rect x="8" y="12" width="32" height="28" rx="4" stroke="currentColor" strokeWidth="2" strokeOpacity="0.4"/>
      <path d="M16 22H32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.3"/>
      <path d="M16 30H28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.3"/>
      <circle cx="36" cy="12" r="8" fill="currentColor" fillOpacity="0.15"/>
      <path d="M33 12H39M36 9V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5"/>
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M2 4H12V11C12 11.5523 11.5523 12 11 12H3C2.44772 12 2 11.5523 2 11V4Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1 2H13V4H1V2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 7H8.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface TodoListProps {
  todos: Todo[];
  loading: boolean;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onUpdate: (id: string, updates: { text?: string; description?: string | null; priority?: Priority }) => Promise<void> | void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onOpenDetail: (todo: Todo) => void;
  onArchiveAllDone?: () => void;
  onReorder: (draggedId: string, targetId: string) => void;
  emptyMessage: string;
  showClearAll?: boolean;
  spaces?: Space[];
  isAllView?: boolean;
}

interface P0ConfirmModal {
  draggedId: string;
  targetId: string;
  draggedText: string;
}

export function TodoList({
  todos,
  loading,
  onStatusChange,
  onUpdate,
  onDelete,
  onArchive,
  onOpenDetail,
  onArchiveAllDone,
  onReorder,
  emptyMessage,
  showClearAll,
  spaces,
  isAllView,
}: TodoListProps) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [p0Modal, setP0Modal] = useState<P0ConfirmModal | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<number | null>(null);

  // Auto-scroll during drag
  const handleAutoScroll = useCallback((e: React.DragEvent) => {
    if (!listRef.current) return;
    
    const rect = listRef.current.getBoundingClientRect();
    const scrollThreshold = 60; // px from edge to start scrolling
    const scrollSpeed = 8; // px per frame
    
    const mouseY = e.clientY;
    const topEdge = rect.top + scrollThreshold;
    const bottomEdge = rect.bottom - scrollThreshold;
    
    // Clear any existing scroll interval
    if (scrollIntervalRef.current) {
      cancelAnimationFrame(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    
    if (mouseY < topEdge) {
      // Scroll up
      const scrollUp = () => {
        if (listRef.current && listRef.current.scrollTop > 0) {
          listRef.current.scrollTop -= scrollSpeed;
          scrollIntervalRef.current = requestAnimationFrame(scrollUp);
        }
      };
      scrollIntervalRef.current = requestAnimationFrame(scrollUp);
    } else if (mouseY > bottomEdge) {
      // Scroll down
      const scrollDown = () => {
        if (listRef.current) {
          const maxScroll = listRef.current.scrollHeight - listRef.current.clientHeight;
          if (listRef.current.scrollTop < maxScroll) {
            listRef.current.scrollTop += scrollSpeed;
            scrollIntervalRef.current = requestAnimationFrame(scrollDown);
          }
        }
      };
      scrollIntervalRef.current = requestAnimationFrame(scrollDown);
    }
  }, []);

  // Clean up scroll interval on drag end
  useEffect(() => {
    if (!isDragging && scrollIntervalRef.current) {
      cancelAnimationFrame(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }, [isDragging]);

  const handleDragOver = (e: React.DragEvent, todoId: string) => {
    e.preventDefault();
    setDragOverId(todoId);
    handleAutoScroll(e);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    setIsDragging(false);
    
    if (scrollIntervalRef.current) {
      cancelAnimationFrame(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    
    const draggedId = e.dataTransfer.getData('taskId');
    if (draggedId && draggedId !== targetId) {
      const draggedTodo = todos.find(t => t.id === draggedId);
      const targetTodo = todos.find(t => t.id === targetId);
      
      // Check if dropping non-P0 above a P0 task
      if (draggedTodo && targetTodo && 
          targetTodo.priority === 'P0' && 
          draggedTodo.priority !== 'P0') {
        // Show confirmation modal
        setP0Modal({
          draggedId,
          targetId,
          draggedText: draggedTodo.text.length > 30 
            ? draggedTodo.text.substring(0, 30) + '...' 
            : draggedTodo.text
        });
      } else {
        onReorder(draggedId, targetId);
      }
    }
  };
  
  const handleP0Confirm = async (makeP0: boolean) => {
    if (!p0Modal) return;
    
    const { draggedId, targetId } = p0Modal;
    setP0Modal(null);
    
    // First reorder
    onReorder(draggedId, targetId);
    
    // Then update priority (with small delay to ensure state is updated)
    if (makeP0) {
      setTimeout(() => {
        onUpdate(draggedId, { priority: 'P0' as Priority });
      }, 50);
    }
  };
  
  const handleP0Cancel = () => {
    setP0Modal(null);
  };

  const handleDragEnter = () => {
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDragOverId(null);
    if (scrollIntervalRef.current) {
      cancelAnimationFrame(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };

  return (
    <div className="todo-list-wrapper">
      {/* P0 Confirmation Modal */}
      {p0Modal && (
        <div className="p0-modal-overlay" onClick={handleP0Cancel}>
          <div className="p0-modal" onClick={e => e.stopPropagation()}>
            <p className="p0-modal-text">
              Moving "<strong>{p0Modal.draggedText}</strong>" above P0 tasks
            </p>
            <div className="p0-modal-actions">
              <button 
                className="p0-modal-btn p0-btn"
                onClick={() => handleP0Confirm(true)}
              >
                Make it P0
              </button>
              <button 
                className="p0-modal-btn move-btn"
                onClick={() => handleP0Confirm(false)}
              >
                Just move
              </button>
              <button 
                className="p0-modal-btn cancel-btn"
                onClick={handleP0Cancel}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {loading ? (
        <div className="todo-list-center">
          <div className="spinner" />
        </div>
      ) : todos.length === 0 ? (
        <div className="todo-list-center">
          <EmptyIcon />
          <p className="empty-state-text">{emptyMessage}</p>
        </div>
      ) : (
        <div 
          className="todo-list"
          ref={listRef}
          onDragEnter={handleDragEnter}
          onDragEnd={handleDragEnd}
        >
          {todos.map((todo) => (
            <div
              key={todo.id}
              className={`todo-drop-zone ${dragOverId === todo.id ? 'drag-over' : ''}`}
              onDragOver={(e) => handleDragOver(e, todo.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, todo.id)}
            >
              <TodoItem
                todo={todo}
                onStatusChange={onStatusChange}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onArchive={onArchive}
                onOpenDetail={onOpenDetail}
                space={isAllView ? spaces?.find(s => s.id === todo.space_id) : undefined}
              />
            </div>
          ))}
          {/* End drop zone to allow placing items at the very end */}
          <div
            className={`todo-drop-zone end-drop-zone ${dragOverId === '__end__' ? 'drag-over' : ''}`}
            onDragOver={(e) => handleDragOver(e, '__end__')}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, '__end__')}
          />
          {showClearAll && todos.length > 0 && onArchiveAllDone && (
            <button className="clear-all-btn" onClick={onArchiveAllDone}>
              <ArchiveIcon />
              Clear all completed
            </button>
          )}
        </div>
      )}
    </div>
  );
}
