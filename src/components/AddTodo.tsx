import { useState, useRef, useEffect } from 'react';

interface AddTodoProps {
  onAdd: (text: string) => Promise<unknown>;
  disabled?: boolean;
  placeholder?: string;
}

export function AddTodo({ onAdd, disabled, placeholder }: AddTodoProps) {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current && !disabled) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting || disabled) return;

    setIsSubmitting(true);
    try {
      await onAdd(trimmed);
      setText('');
    } finally {
      setIsSubmitting(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="todo-input-container">
      <input
        ref={inputRef}
        type="text"
        className="todo-input"
        placeholder={placeholder || (disabled ? 'Select a space first...' : 'Add a new task...')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || isSubmitting}
      />
    </div>
  );
}
