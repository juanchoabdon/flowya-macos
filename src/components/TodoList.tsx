import { useState } from 'react';
import type { Todo, TaskStatus } from '../types';
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
  onUpdate: (id: string, updates: { text?: string; description?: string | null }) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onOpenDetail: (todo: Todo) => void;
  onArchiveAllDone?: () => void;
  onReorder: (draggedId: string, targetId: string) => void;
  emptyMessage: string;
  showClearAll?: boolean;
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
}: TodoListProps) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent, todoId: string) => {
    e.preventDefault();
    setDragOverId(todoId);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    
    const draggedId = e.dataTransfer.getData('taskId');
    if (draggedId && draggedId !== targetId) {
      onReorder(draggedId, targetId);
    }
  };

  return (
    <div className="todo-list-wrapper">
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
        <div className="todo-list">
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
              />
            </div>
          ))}
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
