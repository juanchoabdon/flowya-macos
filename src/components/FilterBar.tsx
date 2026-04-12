import { useState, useRef, useEffect } from 'react';
import type { FilterType, TaskStatus, Priority } from '../types';
import * as analytics from '../lib/analytics';

interface FilterBarProps {
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  onDropTask?: (taskId: string, newStatus: TaskStatus) => void;
  doneCount: number;
  pendingCount: number;
  priorityFilter: Priority | null;
  onPriorityFilterChange: (priority: Priority | null) => void;
  urgencyByStatus?: Record<TaskStatus, { hasOverdue: boolean; hasDueSoon: boolean }>;
}

const PRIORITIES: (Priority | null)[] = [null, 'P0', 'P1', 'P2', 'P3'];

export function FilterBar({
  filter,
  onFilterChange,
  onDropTask,
  doneCount,
  pendingCount,
  priorityFilter,
  onPriorityFilterChange,
}: FilterBarProps) {
  const [dragOverTab, setDragOverTab] = useState<FilterType | null>(null);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const priorityMenuRef = useRef<HTMLDivElement>(null);

  const filters: { key: FilterType; label: string; status?: TaskStatus }[] = [
    { key: 'backlog', label: 'Backlog', status: 'backlog' },
    { key: 'in_progress', label: 'In Progress', status: 'in_progress' },
    { key: 'done', label: 'Done', status: 'done' },
  ];

  // Close priority menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (priorityMenuRef.current && !priorityMenuRef.current.contains(e.target as Node)) {
        setShowPriorityMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDragOver = (e: React.DragEvent, key: FilterType) => {
    e.preventDefault();
    if (key !== 'all') {
      setDragOverTab(key);
    }
  };

  const handleDragLeave = () => {
    setDragOverTab(null);
  };

  const handleDrop = (e: React.DragEvent, filterKey: FilterType, status?: TaskStatus) => {
    e.preventDefault();
    setDragOverTab(null);
    
    if (status && onDropTask) {
      const taskId = e.dataTransfer.getData('taskId');
      if (taskId) {
        onDropTask(taskId, status);
        onFilterChange(filterKey); // Switch to the target tab
      }
    }
  };

  return (
    <div className="filter-bar">
      <div className="filter-buttons">
        {filters.map(({ key, label, status }) => (
            <button
              key={key}
              className={`filter-btn ${filter === key ? 'active' : ''} ${dragOverTab === key ? 'drag-over' : ''}`}
              onClick={() => onFilterChange(key)}
              onDragOver={(e) => handleDragOver(e, key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, key, status)}
            >
              {label}
            </button>
        ))}
      </div>
      
      <div className="filter-bar-right">
        {/* Priority Filter */}
        {filter !== 'done' && (
          <div className="priority-filter" ref={priorityMenuRef}>
            <button 
              className={`priority-filter-btn ${priorityFilter ? 'active' : ''}`}
              onClick={() => setShowPriorityMenu(!showPriorityMenu)}
              title={priorityFilter ? `Filtering: ${priorityFilter}` : 'Filter by priority'}
            >
              <FilterIcon />
            </button>
            
            {showPriorityMenu && (
              <div className="priority-filter-menu">
                {PRIORITIES.map((p) => (
                  <button
                    key={p || 'all'}
                    className={`priority-filter-item ${priorityFilter === p ? 'active' : ''}`}
                    onClick={() => {
                      analytics.trackFilterByPriority(p);
                      onPriorityFilterChange(p);
                      setShowPriorityMenu(false);
                    }}
                  >
                    {p || 'All'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        
        <span className="filter-count">{doneCount} / {doneCount + pendingCount}</span>
      </div>
    </div>
  );
}

function FilterIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
      <path
        d="M1.5 3.5H12.5M3.5 7H10.5M5.5 10.5H8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
