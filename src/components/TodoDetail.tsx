import { useState, useRef, useEffect } from 'react';
import type { Todo, TaskStatus, Space } from '../types';

interface TodoDetailProps {
  todo: Todo;
  onUpdate: (id: string, updates: { text?: string; description?: string | null }) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onClose: () => void;
  space?: Space; // Only provided in "All" view
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  backlog: { label: 'Backlog', color: '#8E8E93', bg: 'rgba(142, 142, 147, 0.2)' },
  in_progress: { label: 'In Progress', color: '#FF9F0A', bg: 'rgba(255, 159, 10, 0.2)' },
  done: { label: 'Done', color: '#30D158', bg: 'rgba(48, 209, 88, 0.2)' },
};

export function TodoDetail({ todo, onUpdate, onStatusChange, onClose, space }: TodoDetailProps) {
  const [title, setTitle] = useState(todo.text);
  const [description, setDescription] = useState(todo.description || '');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleSaveTitle = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== todo.text) {
      onUpdate(todo.id, { text: trimmed });
    } else {
      setTitle(todo.text);
    }
    setIsEditingTitle(false);
  };

  const handleSaveDescription = () => {
    const trimmed = description.trim();
    if (trimmed !== (todo.description || '')) {
      onUpdate(todo.id, { description: trimmed || null });
    }
  };

  const handleClose = () => {
    // Save any pending changes before closing
    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();
    
    const updates: { text?: string; description?: string | null } = {};
    
    if (trimmedTitle && trimmedTitle !== todo.text) {
      updates.text = trimmedTitle;
    }
    if (trimmedDesc !== (todo.description || '')) {
      updates.description = trimmedDesc || null;
    }
    
    if (Object.keys(updates).length > 0) {
      onUpdate(todo.id, updates);
    }
    
    onClose();
  };

  // Handle escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [title, description]);

  const currentStatus = STATUS_CONFIG[todo.status];

  return (
    <div className="todo-detail-container">
      {/* Back button header */}
      <div className="todo-detail-header">
        <button 
          className="todo-detail-back" 
          type="button"
          onClick={handleClose}
        >
          <BackIcon />
          <span>Back</span>
        </button>
        
        <div className="todo-detail-header-right">
          {space && (
            <span 
              className="space-label"
              style={{ 
                backgroundColor: `${space.color}25`,
                color: space.color,
                borderColor: `${space.color}40`,
              }}
            >
              {space.name}
            </span>
          )}
          <select
            value={todo.status}
            onChange={(e) => onStatusChange(todo.id, e.target.value as TaskStatus)}
            style={{ 
              color: currentStatus.color,
              background: currentStatus.bg,
            }}
            className="status-select"
          >
            {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_CONFIG[status].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content area */}
      <div className="todo-detail-content">
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            className="todo-detail-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTitle();
              if (e.key === 'Escape') {
                setTitle(todo.text);
                setIsEditingTitle(false);
              }
            }}
          />
        ) : (
          <h2 
            className="todo-detail-title"
            onClick={() => todo.status !== 'done' && setIsEditingTitle(true)}
          >
            {todo.text}
          </h2>
        )}

        <textarea
          className="todo-detail-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleSaveDescription}
          placeholder="Add notes, details, or anything else..."
          disabled={todo.status === 'done'}
        />
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M10 12L6 8L10 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
