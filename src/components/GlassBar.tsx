import { useState, useRef, useEffect, useMemo } from 'react';
import type { Space, Settings } from '../types';
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
  settings: Settings | null;
  onUpdateSettings: (updates: Partial<Settings>) => void;
  onSignOut?: () => void;
  userEmail?: string;
  windowFocused?: boolean;
}

export function GlassBar({
  spaces,
  selectedSpace,
  selectedSpaceId,
  onSelectSpace,
  onCreateSpace,
  onUpdateSpace,
  onDeleteSpace,
  settings,
  onUpdateSettings,
  onSignOut,
  userEmail,
  windowFocused = true,
}: GlassBarProps) {
  const isAllSelected = selectedSpaceId === ALL_SPACES_ID;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showNewSpaceInput, setShowNewSpaceInput] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [colorPickerSpaceId, setColorPickerSpaceId] = useState<string | null>(null);
  const [showAllColorPicker, setShowAllColorPicker] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleBarRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  
  // Listen for update events
  useEffect(() => {
    if (window.windowApi?.onUpdateDownloaded) {
      const unsubscribe = window.windowApi.onUpdateDownloaded((version) => {
        setUpdateAvailable(version);
      });
      return unsubscribe;
    }
  }, []);
  
  // Get header color from selected space or "All" color from settings
  const allSpacesColor = settings?.all_spaces_color || '#64B5F6';
  const headerColor = isAllSelected ? allSpacesColor : (selectedSpace?.color || '#C7CEEA');
  
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
        setShowAllColorPicker(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown when space changes (e.g., via keyboard shortcut)
  useEffect(() => {
    setDropdownOpen(false);
    setShowNewSpaceInput(false);
    setNewSpaceName('');
    setConfirmDeleteId(null);
    setColorPickerSpaceId(null);
    setShowAllColorPicker(false);
  }, [selectedSpaceId]);

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
    background: windowFocused 
      ? `linear-gradient(135deg, ${headerColor}D0 0%, ${headerColor}B8 25%, ${headerColor}D0 50%, ${headerColor}B8 75%, ${headerColor}D0 100%)`
      : `${headerColor}70`,
  };

  const handleTitleBarClick = (e: React.MouseEvent) => {
    // Close dropdown if clicking on the title bar but not on the dropdown itself
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setDropdownOpen(false);
      setShowNewSpaceInput(false);
      setNewSpaceName('');
      setConfirmDeleteId(null);
      setColorPickerSpaceId(null);
      setShowAllColorPicker(false);
    }
  };

  return (
    <div className="title-bar" ref={titleBarRef} onWheel={handleWheel} onClick={handleTitleBarClick} style={headerStyle}>
      {/* Drag layer for window dragging */}
      <div className="title-bar-swipe-layer" />
      <div className="title-bar-left">
        <span className="app-title">{settings?.nickname || 'Flowya'}</span>
        
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
              <div>
                <div
                  className={`dropdown-item ${isAllSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onSelectSpace(ALL_SPACES_ID);
                    setDropdownOpen(false);
                  }}
                >
                  <button
                    className="color-dot"
                    style={{ background: allSpacesColor }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAllColorPicker(!showAllColorPicker);
                      setColorPickerSpaceId(null);
                    }}
                    title="Change color"
                  />
                  <span style={{ flex: 1 }}>All</span>
                </div>
                {showAllColorPicker && (
                  <div className="color-picker" onClick={(e) => e.stopPropagation()}>
                    {SPACE_COLORS.map((color) => (
                      <button
                        key={color}
                        className={`color-option ${allSpacesColor === color ? 'selected' : ''}`}
                        style={{ background: color }}
                        onClick={() => {
                          onUpdateSettings({ all_spaces_color: color });
                          setShowAllColorPicker(false);
                        }}
                      />
                    ))}
                  </div>
                )}
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
        <div className="dropdown" ref={accountMenuRef}>
          <button 
            className={`icon-btn account-btn ${updateAvailable ? 'has-update' : ''}`}
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            title={updateAvailable ? `Update v${updateAvailable} available` : 'Settings'}
          >
            <SettingsIcon />
            {updateAvailable && <span className="update-dot" />}
          </button>
          
          {accountMenuOpen && (
            <div className="dropdown-menu account-menu">
              <div className="account-info">
                <input
                  type="text"
                  className="account-name-input"
                  placeholder="Nickname..."
                  value={settings?.nickname || ''}
                  onChange={(e) => onUpdateSettings({ nickname: e.target.value })}
                />
                <div className="account-email">{userEmail}</div>
              </div>
              
              <div className="dropdown-divider" />
              
              {onSignOut && (
                <div
                  className="dropdown-item danger"
                  onClick={() => {
                    onSignOut();
                    setAccountMenuOpen(false);
                  }}
                >
                  <LogoutIcon size={14} />
                  <span>Sign Out</span>
                </div>
              )}
              
              <div className="dropdown-divider" />
              
              {updateAvailable ? (
                <div
                  className="dropdown-item update-item"
                  onClick={() => {
                    window.windowApi?.installUpdate();
                    setAccountMenuOpen(false);
                  }}
                >
                  <UpdateIcon size={14} />
                  <span>Update to v{updateAvailable}</span>
                </div>
              ) : (
                <div className="version-info">
                  v{__APP_VERSION__}
                </div>
              )}
            </div>
          )}
        </div>
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

function LogoutIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path
        d="M5 2H3C2.44772 2 2 2.44772 2 3V11C2 11.5523 2.44772 12 3 12H5M9 10L12 7M12 7L9 4M12 7H5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M13.5 8C13.5 7.66 13.47 7.33 13.42 7L14.92 5.83C15.07 5.71 15.11 5.5 15.01 5.32L13.61 2.88C13.51 2.7 13.31 2.63 13.11 2.7L11.36 3.39C10.95 3.08 10.5 2.82 10.01 2.63L9.75 0.78C9.72 0.57 9.53 0.41 9.32 0.41H6.52C6.31 0.41 6.13 0.57 6.1 0.78L5.84 2.63C5.35 2.82 4.9 3.08 4.49 3.39L2.74 2.7C2.54 2.62 2.34 2.7 2.24 2.88L0.84 5.32C0.73 5.5 0.78 5.71 0.93 5.83L2.43 7C2.38 7.33 2.35 7.66 2.35 8C2.35 8.34 2.38 8.67 2.43 9L0.93 10.17C0.78 10.29 0.74 10.5 0.84 10.68L2.24 13.12C2.34 13.3 2.54 13.37 2.74 13.3L4.49 12.61C4.9 12.92 5.35 13.18 5.84 13.37L6.1 15.22C6.13 15.43 6.31 15.59 6.52 15.59H9.32C9.53 15.59 9.71 15.43 9.74 15.22L10 13.37C10.49 13.18 10.94 12.92 11.35 12.61L13.1 13.3C13.3 13.38 13.5 13.3 13.6 13.12L15 10.68C15.1 10.5 15.06 10.29 14.91 10.17L13.41 9C13.47 8.67 13.5 8.34 13.5 8Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UpdateIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path
        d="M7 2V8M7 8L4 5M7 8L10 5M2 10V11C2 11.5523 2.44772 12 3 12H11C11.5523 12 12 11.5523 12 11V10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
