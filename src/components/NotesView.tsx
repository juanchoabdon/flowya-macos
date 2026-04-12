import { useState, useRef, useEffect } from 'react';
import type { Note, Space } from '../types';
import { RichTextEditor, RichTextEditorRef } from './RichTextEditor';

interface NotesViewProps {
  notes: Note[];
  loading: boolean;
  spaces: Space[];
  isAllView: boolean;
  onCreate: (title: string, overrideSpaceId?: string) => Promise<Note | null>;
  onUpdate: (id: string, updates: { title?: string; content?: string | null }) => void;
  onDelete: (id: string) => void;
}

export function NotesView({ notes, loading, spaces, isAllView, onCreate, onUpdate, onDelete }: NotesViewProps) {
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [contentValue, setContentValue] = useState('');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichTextEditorRef>(null);

  const activeNote = notes.find(n => n.id === activeNoteId) || null;

  useEffect(() => {
    if (activeNote) {
      setTitleValue(activeNote.title);
      setContentValue(activeNote.content || '');
    }
  }, [activeNoteId]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      const input = titleInputRef.current;
      input.focus();
      requestAnimationFrame(() => {
        input.setSelectionRange(input.value.length, input.value.length);
        input.style.height = 'auto';
        input.style.height = `${input.scrollHeight}px`;
      });
    }
  }, [editingTitle]);

  // If the active note was deleted externally, clear it
  useEffect(() => {
    if (activeNoteId && !notes.find(n => n.id === activeNoteId)) {
      setActiveNoteId(null);
    }
  }, [notes, activeNoteId]);

  const handleSaveTitle = () => {
    if (!activeNote) return;
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== activeNote.title) {
      onUpdate(activeNote.id, { title: trimmed });
    } else {
      setTitleValue(activeNote.title);
    }
    setEditingTitle(false);
  };

  const handleSaveContent = () => {
    if (!activeNote) return;
    const textContent = contentValue.replace(/<[^>]*>/g, '').trim();
    const newValue = textContent.length > 0 ? contentValue : null;
    if (newValue !== (activeNote.content || null)) {
      onUpdate(activeNote.id, { content: newValue });
    }
  };

  const handleAddNote = async () => {
    const title = newNoteTitle.trim() || 'Untitled';
    const defaultSpaceId = isAllView ? spaces[0]?.id : undefined;
    const note = await onCreate(title, defaultSpaceId);
    if (note) {
      setActiveNoteId(note.id);
      setNewNoteTitle('');
    }
  };

  const handleBack = () => {
    // Save pending changes
    if (activeNote) {
      const trimmedTitle = titleValue.trim();
      const textContent = contentValue.replace(/<[^>]*>/g, '').trim();
      const newContent = textContent.length > 0 ? contentValue : null;
      const updates: { title?: string; content?: string | null } = {};

      if (trimmedTitle && trimmedTitle !== activeNote.title) updates.title = trimmedTitle;
      if (newContent !== (activeNote.content || null)) updates.content = newContent;

      if (Object.keys(updates).length > 0) onUpdate(activeNote.id, updates);
    }
    setActiveNoteId(null);
    setEditingTitle(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getPreview = (content: string | null): string => {
    if (!content) return 'No content';
    const text = content.replace(/<[^>]*>/g, '').trim();
    if (!text) return 'No content';
    return text.length > 60 ? text.substring(0, 60) + '...' : text;
  };

  // Detail view
  if (activeNote) {
    return (
      <div className="notes-detail">
        <div className="notes-detail-header">
          <button className="notes-back-btn" onClick={handleBack}>
            <BackIcon />
          </button>
          <button
            className="notes-delete-btn"
            onClick={() => {
              onDelete(activeNote.id);
              setActiveNoteId(null);
            }}
          >
            <TrashIcon />
          </button>
        </div>

        <div className="notes-detail-content">
          {editingTitle ? (
            <textarea
              ref={titleInputRef}
              className="notes-title-input"
              value={titleValue}
              onChange={(e) => {
                setTitleValue(e.target.value);
                if (titleInputRef.current) {
                  titleInputRef.current.style.height = 'auto';
                  titleInputRef.current.style.height = `${titleInputRef.current.scrollHeight}px`;
                }
              }}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveTitle();
                  editorRef.current?.focus();
                }
                if (e.key === 'Escape') {
                  setTitleValue(activeNote.title);
                  setEditingTitle(false);
                }
              }}
            />
          ) : (
            <h2
              className="notes-title"
              onClick={() => setEditingTitle(true)}
            >
              {activeNote.title || 'Untitled'}
            </h2>
          )}

          <span className="notes-date">
            {formatDate(activeNote.updated_at)}
          </span>

          <RichTextEditor
            ref={editorRef}
            content={contentValue}
            onChange={setContentValue}
            onBlur={handleSaveContent}
            placeholder="Start writing..."
          />
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="notes-list-view">
      {loading ? (
        <div className="notes-loading">Loading notes...</div>
      ) : notes.length === 0 ? (
        <div className="notes-empty">
          <NotepadIcon />
          <p>No notes yet</p>
          <span>Create your first note below</span>
        </div>
      ) : (
        <div className="notes-list">
          {notes.map((note) => {
            const space = isAllView ? spaces.find(s => s.id === note.space_id) : undefined;
            return (
              <div
                key={note.id}
                className="notes-list-item"
                onClick={() => setActiveNoteId(note.id)}
              >
                <div className="notes-item-main">
                  <span className="notes-item-title">{note.title || 'Untitled'}</span>
                  <span className="notes-item-preview">{getPreview(note.content)}</span>
                </div>
                <div className="notes-item-meta">
                  <span className="notes-item-date">{formatDate(note.updated_at)}</span>
                  {space && (
                    <span
                      className="notes-item-space"
                      style={{ color: space.color, backgroundColor: `${space.color}20` }}
                    >
                      {space.name}
                    </span>
                  )}
                  <button
                    className="notes-item-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirmDeleteId === note.id) {
                        onDelete(note.id);
                        setConfirmDeleteId(null);
                      } else {
                        setConfirmDeleteId(note.id);
                        setTimeout(() => setConfirmDeleteId(null), 3000);
                      }
                    }}
                  >
                    {confirmDeleteId === note.id ? 'Sure?' : <TrashIcon />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="notes-add-bar">
        <input
          ref={addInputRef}
          type="text"
          className="notes-add-input"
          placeholder="New note title..."
          value={newNoteTitle}
          onChange={(e) => setNewNoteTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddNote();
            }
          }}
        />
        <button className="notes-add-btn" onClick={handleAddNote}>
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function NotepadIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}
