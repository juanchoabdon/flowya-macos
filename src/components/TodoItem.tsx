import { useState, useRef, useEffect } from 'react';
import type { Todo, TaskStatus } from '../types';

interface TodoItemProps {
  todo: Todo;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onUpdate: (id: string, updates: { text?: string; description?: string | null }) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onOpenDetail: (todo: Todo) => void;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  backlog: { label: 'Backlog', color: '#8E8E93', bg: 'rgba(142, 142, 147, 0.2)' },
  in_progress: { label: 'In Progress', color: '#FF9F0A', bg: 'rgba(255, 159, 10, 0.2)' },
  done: { label: 'Done', color: '#30D158', bg: 'rgba(48, 209, 88, 0.2)' },
};

export function TodoItem({ todo, onStatusChange, onUpdate, onDelete, onArchive, onOpenDetail }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close status menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(event.target as Node)) {
        setShowStatusMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== todo.text) {
      onUpdate(todo.id, { text: trimmed });
    } else {
      setEditText(todo.text);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditText(todo.text);
      setIsEditing(false);
    }
  };

  const handleStatusChange = (newStatus: TaskStatus) => {
    setShowStatusMenu(false);
    
    // Celebrate when moving to done!
    if (newStatus === 'done' && todo.status !== 'done') {
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 1500);
    }
    
    onStatusChange(todo.id, newStatus);
  };

  const currentStatus = STATUS_CONFIG[todo.status];

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('taskId', todo.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div 
      className={`todo-item ${todo.status === 'done' ? 'completed' : ''} ${celebrating ? 'celebrating' : ''}`}
      draggable
      onDragStart={handleDragStart}
    >
      {/* Celebration particles */}
      {celebrating && (
        <div className="celebration">
          {['🎉', '✨', '🌟', '💫', '⭐', '🎊', '✨', '🌟', '💫', '⭐', '🎉', '🎊'].map((emoji, i) => (
            <span key={i} className="confetti">
              {emoji}
            </span>
          ))}
        </div>
      )}
      
      {/* Status selector */}
      <div className="status-selector" ref={statusRef}>
        <button
          className="status-badge"
          style={{ 
            color: currentStatus.color, 
            background: currentStatus.bg,
          }}
          onClick={() => setShowStatusMenu(!showStatusMenu)}
        >
          {todo.status === 'done' && <CheckIcon />}
          {todo.status === 'in_progress' && <ProgressIcon />}
          {todo.status === 'backlog' && <CircleIcon />}
        </button>
        
        {showStatusMenu && (
          <div className="status-menu">
            {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((status) => (
              <button
                key={status}
                className={`status-option ${todo.status === status ? 'selected' : ''}`}
                onClick={() => handleStatusChange(status)}
              >
                <span 
                  className="status-dot" 
                  style={{ background: STATUS_CONFIG[status].color }}
                />
                {STATUS_CONFIG[status].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div 
        className="todo-content"
        onDoubleClick={() => onOpenDetail(todo)}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="todo-text-input"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="todo-text-wrapper">
            <span className="todo-text">
              {todo.text}
            </span>
            {todo.description && (
              <NoteIcon />
            )}
          </div>
        )}
      </div>

      <div className="todo-actions">
        {todo.status !== 'done' && (
          <button
            className="todo-action-btn"
            onClick={() => setIsEditing(true)}
            title="Edit"
          >
            <EditIcon />
          </button>
        )}
        {todo.status === 'done' && (
          <button
            className="todo-action-btn archive"
            onClick={() => onArchive(todo.id)}
            title="Archive"
          >
            <ArchiveIcon />
          </button>
        )}
        <button
          className="todo-action-btn delete"
          onClick={() => onDelete(todo.id)}
          title="Delete"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

// Icons
function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 6L5 8.5L9.5 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProgressIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M6 1 A5 5 0 0 1 6 11" fill="currentColor" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M10.5 1.5L12.5 3.5M1.5 12.5L2.5 9L10.5 1L13 3.5L5 11.5L1.5 12.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M2.5 4H11.5M5.5 4V3C5.5 2.44772 5.94772 2 6.5 2H7.5C8.05228 2 8.5 2.44772 8.5 3V4M10.5 4V11C10.5 11.5523 10.0523 12 9.5 12H4.5C3.94772 12 3.5 11.5523 3.5 11V4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function NoteIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="note-icon">
      <path
        d="M3 2H9C9.5 2 10 2.5 10 3V9C10 9.5 9.5 10 9 10H3C2.5 10 2 9.5 2 9V3C2 2.5 2.5 2 3 2Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M4 4.5H8M4 6.5H7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
