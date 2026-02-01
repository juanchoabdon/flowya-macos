import { useState } from 'react';
import type { FilterType, TaskStatus } from '../types';

interface FilterBarProps {
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  onDropTask?: (taskId: string, newStatus: TaskStatus) => void;
  doneCount: number;
  pendingCount: number;
}

export function FilterBar({
  filter,
  onFilterChange,
  onDropTask,
  doneCount,
  pendingCount,
}: FilterBarProps) {
  const [dragOverTab, setDragOverTab] = useState<FilterType | null>(null);

  const filters: { key: FilterType; label: string; status?: TaskStatus }[] = [
    { key: 'backlog', label: 'Backlog', status: 'backlog' },
    { key: 'in_progress', label: 'In Progress', status: 'in_progress' },
    { key: 'done', label: 'Done', status: 'done' },
  ];

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
      <span className="filter-count">{doneCount} / {doneCount + pendingCount}</span>
    </div>
  );
}
