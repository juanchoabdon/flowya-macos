import { useState, useRef, useEffect, useMemo } from 'react';
import type { Space } from '../types';
import { SPACE_COLORS } from '../types';
import { ALL_SPACES_ID } from '../hooks/useTodos';

interface GlassBarProps {
  spaces: Space[];
  selectedSpace: Space | null;
  selectedSpaceId: string | null;
  onSelectSpace: (id: string) => void;
  onCreateSpace: (name: string) => void;
  onUpdateSpace: (id: string, updates: Partial<Pick<Space, 'name' | 'color'>>) => void;
  onDeleteSpace: (id: string) => void;
  onMinimize: () => void;
}

export function GlassBar({
  spaces,
  selectedSpace,
  selectedSpaceId,
  onSelectSpace,
  onCreateSpace,
  onUpdateSpace,
  onDeleteSpace,
  onMinimize,
}: GlassBarProps) {
  const isAllSelected = selectedSpaceId === ALL_SPACES_ID;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showNewSpaceInput, setShowNewSpaceInput] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [colorPickerSpaceId, setColorPickerSpaceId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleBarRef = useRef<HTMLDivElement>(null);
  
  // Get header color from selected space
  const headerColor = selectedSpace?.color || '#C7CEEA';
  
  // Swipe gesture for changing spaces
  const lastSwipeTime = useRef(0);

  // Build list of space IDs including "All" - memoized
  const spaceIds = useMemo(() => [ALL_SPACES_ID, ...spaces.map(s => s.id)], [spaces]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
        setShowNewSpaceInput(false);
        setNewSpaceName('');
        setConfirmDeleteId(null);
        setColorPickerSpaceId(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when showing
  useEffect(() => {
    if (showNewSpaceInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNewSpaceInput]);

  const handleCreateSpace = () => {
    if (newSpaceName.trim()) {
      onCreateSpace(newSpaceName.trim());
      setNewSpaceName('');
      setShowNewSpaceInput(false);
      setDropdownOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateSpace();
    } else if (e.key === 'Escape') {
      setShowNewSpaceInput(false);
      setNewSpaceName('');
    }
  };

  // Handle wheel directly on the component
  const handleWheel = (e: React.WheelEvent) => {
    // Only handle vertical swipes
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    
    // Cooldown between swipes
    const now = Date.now();
    if (now - lastSwipeTime.current < 400) return;
    
    const threshold = 30; // Lower threshold for React event
    
    if (Math.abs(e.deltaY) > threshold) {
      const currentIndex = spaceIds.indexOf(selectedSpaceId || '');
      
      if (e.deltaY > 0 && currentIndex < spaceIds.length - 1) {
        // Swipe down -> next space
        onSelectSpace(spaceIds[currentIndex + 1]);
        lastSwipeTime.current = now;
      } else if (e.deltaY < 0 && currentIndex > 0) {
        // Swipe up -> previous space  
        onSelectSpace(spaceIds[currentIndex - 1]);
        lastSwipeTime.current = now;
      }
    }
  };

  const headerStyle = {
    background: isAllSelected 
      ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)'
      : `linear-gradient(180deg, ${headerColor}90 0%, ${headerColor}40 100%)`,
  };

  return (
    <div className="title-bar" ref={titleBarRef} onWheel={handleWheel} style={headerStyle}>
      {/* Drag layer for window dragging */}
      <div className="title-bar-swipe-layer" />
      <div className="title-bar-left">
        <span className="app-title">Juan Diego</span>
        
        <div className="dropdown" ref={dropdownRef}>
          <button
            className="space-selector no-drag"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span className="space-selector-text">
              {isAllSelected ? '📋 All' : (selectedSpace?.name || 'Select Space')}
            </span>
            <ChevronIcon />
          </button>
          
          {dropdownOpen && (
            <div className="dropdown-menu" onClick={() => setConfirmDeleteId(null)}>
              {/* "All" - All spaces combined */}
              <div
                className={`dropdown-item ${isAllSelected ? 'selected' : ''}`}
                onClick={() => {
                  onSelectSpace(ALL_SPACES_ID);
                  setDropdownOpen(false);
                }}
              >
                <span style={{ flex: 1 }}>📋 All</span>
              </div>
              
              <div className="dropdown-divider" />
              
              {spaces.map((space) => (
                <div key={space.id}>
                  <div
                    className={`dropdown-item ${!isAllSelected && space.id === selectedSpace?.id ? 'selected' : ''}`}
                    onClick={() => {
                      onSelectSpace(space.id);
                      setDropdownOpen(false);
                    }}
                  >
                    <button
                      className="color-dot"
                      style={{ background: space.color || '#C7CEEA' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setColorPickerSpaceId(colorPickerSpaceId === space.id ? null : space.id);
                      }}
                      title="Change color"
                    />
                    <span style={{ flex: 1 }}>{space.name}</span>
                    {spaces.length > 1 && (
                      confirmDeleteId === space.id ? (
                        <button
                          className="confirm-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSpace(space.id);
                            setConfirmDeleteId(null);
                          }}
                        >
                          Sure?
                        </button>
                      ) : (
                        <button
                          className="icon-btn"
                          style={{ width: 20, height: 20 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(space.id);
                          }}
                        >
                          <TrashIcon size={12} />
                        </button>
                      )
                    )}
                  </div>
                  {colorPickerSpaceId === space.id && (
                    <div className="color-picker" onClick={(e) => e.stopPropagation()}>
                      {SPACE_COLORS.map((color) => (
                        <button
                          key={color}
                          className={`color-option ${space.color === color ? 'selected' : ''}`}
                          style={{ background: color }}
                          onClick={() => {
                            onUpdateSpace(space.id, { color });
                            setColorPickerSpaceId(null);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
              
              <div className="dropdown-divider" />
              
              {showNewSpaceInput ? (
                <div style={{ padding: '4px 8px' }}>
                  <input
                    ref={inputRef}
                    type="text"
                    className="modal-input"
                    style={{ marginBottom: 0 }}
                    placeholder="Space name..."
                    value={newSpaceName}
                    onChange={(e) => setNewSpaceName(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              ) : (
                <div
                  className="dropdown-item"
                  onClick={() => setShowNewSpaceInput(true)}
                >
                  <PlusIcon size={14} />
                  <span>New Space</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="title-bar-right">
        <button className="icon-btn minimize-btn" onClick={onMinimize} title="Hide (⌘⇧Space or click Dock icon)">
          <HideIcon />
        </button>
      </div>
    </div>
  );
}

// Icons
function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 3V13M3 8H13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
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

function HideIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 8C2 8 4 4 8 4C12 4 14 8 14 8C14 8 12 12 8 12C4 12 2 8 2 8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 13L13 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
