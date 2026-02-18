import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useImperativeHandle, forwardRef, useState, useRef } from 'react';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export interface RichTextEditorRef {
  focus: () => void;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ content, onChange, onBlur, placeholder, disabled }, ref) => {
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const linkInputRef = useRef<HTMLInputElement>(null);
    const [linkPopover, setLinkPopover] = useState<{ url: string; x: number; y: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          blockquote: false,
          horizontalRule: false,
        }),
        Link.configure({
          openOnClick: false, // We handle clicks manually
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: {
            class: 'editor-link',
          },
        }),
        Placeholder.configure({
          placeholder: placeholder || 'Add notes, details, or anything else...',
        }),
      ],
      content,
      editable: !disabled,
      onUpdate: ({ editor }) => {
        onChange(editor.getHTML());
      },
      onBlur: () => {
        onBlur?.();
      },
    });

    // Expose focus method
    useImperativeHandle(ref, () => ({
      focus: () => {
        editor?.commands.focus('start');
      },
    }));

    // Update content when prop changes (e.g., switching todos)
    useEffect(() => {
      if (editor && content !== editor.getHTML()) {
        editor.commands.setContent(content);
      }
      // Close any open popovers when content changes
      setLinkPopover(null);
      setShowLinkInput(false);
    }, [content, editor]);

    // Update editable state
    useEffect(() => {
      if (editor) {
        editor.setEditable(!disabled);
      }
    }, [disabled, editor]);

    // Handle clicks on links - use mousedown to intercept before browser handles navigation
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let clickTimeout: NodeJS.Timeout | null = null;
      let lastClickTime = 0;

      // Prevent default click behavior on links
      const handleClickPrevent = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const link = target.closest('a.editor-link');
        if (link) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      };

      // Handle mousedown for our custom behavior
      const handleMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const link = target.closest('a.editor-link') as HTMLAnchorElement;
        
        if (link && e.button === 0) { // Left click only
          e.preventDefault();
          e.stopPropagation();
          
          const url = link.getAttribute('href');
          if (!url) return;

          const now = Date.now();
          const isDoubleClick = (now - lastClickTime) < 350;
          lastClickTime = now;

          if (isDoubleClick) {
            // Double click - open link directly in system browser
            if (clickTimeout) {
              clearTimeout(clickTimeout);
              clickTimeout = null;
            }
            setLinkPopover(null);
            window.windowApi?.openExternal(url);
          } else {
            // Single click - show popover after delay
            if (clickTimeout) {
              clearTimeout(clickTimeout);
            }
            clickTimeout = setTimeout(() => {
              clickTimeout = null;
              const rect = link.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              setLinkPopover({
                url,
                x: rect.left - containerRect.left + rect.width / 2,
                y: rect.bottom - containerRect.top + 4,
              });
            }, 300);
          }
        }
      };

      // Add both listeners - mousedown for our logic, click to prevent default
      container.addEventListener('mousedown', handleMouseDown, true);
      container.addEventListener('click', handleClickPrevent, true);
      
      return () => {
        container.removeEventListener('mousedown', handleMouseDown, true);
        container.removeEventListener('click', handleClickPrevent, true);
        if (clickTimeout) clearTimeout(clickTimeout);
      };
    }, []);

    // Close link popover when clicking outside or pressing Escape
    useEffect(() => {
      if (!linkPopover) return;

      const handleClickOutside = (e: MouseEvent) => {
        const popoverEl = document.querySelector('.link-click-popover');
        if (popoverEl && !popoverEl.contains(e.target as Node)) {
          setLinkPopover(null);
        }
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setLinkPopover(null);
        }
      };

      // Small delay to avoid closing immediately on the same click that opened it
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
      }, 10);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [linkPopover]);

    if (!editor) {
      return null;
    }

    return (
      <div ref={containerRef} className={`rich-editor-container ${disabled ? 'disabled' : ''}`}>
        {/* Link click popover */}
        {linkPopover && (
          <div 
            className="link-click-popover"
            style={{ left: linkPopover.x, top: linkPopover.y }}
          >
            <button
              type="button"
              className="link-click-btn"
              onClick={() => {
                window.windowApi?.openExternal(linkPopover.url);
                setLinkPopover(null);
              }}
            >
              <ExternalLinkIcon />
              Open Link
            </button>
            <button
              type="button"
              className="link-click-btn danger"
              onClick={() => {
                editor.chain().focus().unsetLink().run();
                setLinkPopover(null);
              }}
            >
              <UnlinkIcon />
              Remove Link
            </button>
            <div className="link-click-url">{linkPopover.url}</div>
          </div>
        )}
        
        {/* Minimal toolbar */}
        {!disabled && (
          <div className="rich-editor-toolbar">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
              title="Bold (⌘B)"
            >
              <BoldIcon />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
              title="Italic (⌘I)"
            >
              <ItalicIcon />
            </button>
            <div className="toolbar-divider" />
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={`toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
              title="Bullet List"
            >
              <ListIcon />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={`toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
              title="Numbered List"
            >
              <OrderedListIcon />
            </button>
            <div className="toolbar-divider" />
            <div className="link-btn-wrapper">
              <button
                type="button"
                onClick={() => {
                  const previousUrl = editor.getAttributes('link').href || '';
                  setLinkUrl(previousUrl);
                  setShowLinkInput(!showLinkInput);
                  setTimeout(() => linkInputRef.current?.focus(), 0);
                }}
                className={`toolbar-btn ${editor.isActive('link') || showLinkInput ? 'active' : ''}`}
                title="Add Link (select text first)"
              >
                <LinkIcon />
              </button>
              
              {showLinkInput && (
                <div className="link-popover">
                  <input
                    ref={linkInputRef}
                    type="text"
                    className="link-input"
                    placeholder="Paste or type URL..."
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (linkUrl.trim()) {
                          const finalUrl = linkUrl.match(/^https?:\/\//) ? linkUrl : `https://${linkUrl}`;
                          editor.chain().focus().extendMarkRange('link').setLink({ href: finalUrl }).run();
                        }
                        setShowLinkInput(false);
                        setLinkUrl('');
                      } else if (e.key === 'Escape') {
                        setShowLinkInput(false);
                        setLinkUrl('');
                        editor.commands.focus();
                      }
                    }}
                  />
                  <div className="link-popover-actions">
                    <button
                      type="button"
                      className="link-popover-btn cancel"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setShowLinkInput(false);
                        setLinkUrl('');
                        editor.commands.focus();
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="link-popover-btn apply"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (linkUrl.trim()) {
                          const finalUrl = linkUrl.match(/^https?:\/\//) ? linkUrl : `https://${linkUrl}`;
                          editor.chain().focus().extendMarkRange('link').setLink({ href: finalUrl }).run();
                        }
                        setShowLinkInput(false);
                        setLinkUrl('');
                      }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
            {editor.isActive('link') && (
              <button
                type="button"
                onClick={() => editor.chain().focus().unsetLink().run()}
                className="toolbar-btn"
                title="Remove Link"
              >
                <UnlinkIcon />
              </button>
            )}
          </div>
        )}
        <EditorContent editor={editor} className="rich-editor-content" />
      </div>
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';

// Icons
function BoldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
      <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="4" x2="10" y2="4"/>
      <line x1="14" y1="20" x2="5" y2="20"/>
      <line x1="15" y1="4" x2="9" y2="20"/>
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <circle cx="4" cy="6" r="1" fill="currentColor"/>
      <circle cx="4" cy="12" r="1" fill="currentColor"/>
      <circle cx="4" cy="18" r="1" fill="currentColor"/>
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="6" x2="21" y2="6"/>
      <line x1="10" y1="12" x2="21" y2="12"/>
      <line x1="10" y1="18" x2="21" y2="18"/>
      <text x="3" y="7" fontSize="8" fill="currentColor" stroke="none">1</text>
      <text x="3" y="13" fontSize="8" fill="currentColor" stroke="none">2</text>
      <text x="3" y="19" fontSize="8" fill="currentColor" stroke="none">3</text>
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function UnlinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71"/>
      <line x1="2" y1="2" x2="22" y2="22"/>
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  );
}
