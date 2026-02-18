import { useState, useEffect } from 'react';
import type { Todo } from '../types';
import { getAllTodos } from '../lib/supabase';

interface DailySummaryProps {
  onClose: () => void;
  showToday?: boolean; // If true, show today's stats instead of yesterday's
  streakBestToday?: number;
  streakBestYesterday?: number;
}

const STORAGE_KEY = 'flowya_last_summary_date';

// Check if we should show the summary (once per day, in the morning)
export function shouldShowDailySummary(): boolean {
  const now = new Date();
  const today = now.toDateString();
  const lastShown = localStorage.getItem(STORAGE_KEY);
  
  // Only show if we haven't shown today
  return lastShown !== today;
}

// Mark summary as shown for today
export function markSummaryShown(): void {
  const today = new Date().toDateString();
  localStorage.setItem(STORAGE_KEY, today);
}

// Get date range for a specific day
function getDateRange(daysAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const targetDay = new Date(now);
  targetDay.setDate(targetDay.getDate() - daysAgo);
  
  const start = new Date(targetDay);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(targetDay);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
}

// Calculate stats
function calculateStats(todos: Todo[], forToday: boolean = false) {
  const { start, end } = getDateRange(forToday ? 0 : 1);
  
  // Tasks created yesterday
  const createdYesterday = todos.filter(t => {
    const created = new Date(t.created_at);
    return created >= start && created <= end;
  }).length;
  
  // Tasks completed yesterday
  const completedYesterday = todos.filter(t => {
    if (!t.completed_at) return false;
    const completed = new Date(t.completed_at);
    return completed >= start && completed <= end;
  }).length;
  
  // Total pending (not done, not archived)
  const totalPending = todos.filter(t => t.status !== 'done' && !t.archived).length;
  
  // Total completed all time
  const totalCompleted = todos.filter(t => t.status === 'done').length;
  
  return {
    createdYesterday,
    completedYesterday,
    totalPending,
    totalCompleted,
  };
}

// Get message and emoji based on performance
function getMessage(completed: number, created: number, forToday: boolean): { emoji: string; title: string; subtitle: string } {
  const ratio = created > 0 ? completed / created : completed > 0 ? 2 : 0;
  const dayWord = forToday ? 'today' : 'yesterday';
  
  if (completed === 0 && created === 0) {
    return forToday ? {
      emoji: '🎯',
      title: 'Just getting started',
      subtitle: 'Your first task is waiting!'
    } : {
      emoji: '😴',
      title: 'Quiet day yesterday',
      subtitle: 'Ready to get things done today?'
    };
  }
  
  if (completed >= 5 && ratio >= 1) {
    return {
      emoji: '🚀',
      title: forToday ? 'You\'re on FIRE!' : 'You were a ROCKSTAR!',
      subtitle: `Crushed ${completed} tasks ${dayWord}!`
    };
  }
  
  if (completed >= 3 && ratio >= 0.8) {
    return {
      emoji: '⭐',
      title: forToday ? 'Amazing progress!' : 'Great job yesterday!',
      subtitle: 'You\'re on fire, keep it up!'
    };
  }
  
  if (completed >= 1 && ratio >= 0.5) {
    return {
      emoji: '👍',
      title: 'Good progress!',
      subtitle: 'Every completed task counts'
    };
  }
  
  if (completed >= 1) {
    return {
      emoji: '💪',
      title: forToday ? 'Making moves!' : 'You got some done!',
      subtitle: forToday ? 'Keep the momentum going' : 'Let\'s pick up the pace today'
    };
  }
  
  if (created > 0) {
    return {
      emoji: '📝',
      title: forToday ? 'Planning mode' : 'Lots of planning yesterday',
      subtitle: forToday ? 'Time to start executing!' : 'Time to execute today!'
    };
  }
  
  return {
    emoji: '🌅',
    title: 'Fresh start',
    subtitle: 'Let\'s make it count!'
  };
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function DailySummary({ onClose, showToday = false, streakBestToday = 0, streakBestYesterday = 0 }: DailySummaryProps) {
  const [visible, setVisible] = useState(true);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Only mark as shown if showing yesterday's summary (morning greeting)
    if (!showToday) {
      markSummaryShown();
    }
    
    getAllTodos()
      .then(data => {
        setTodos(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [showToday]);
  
  const stats = calculateStats(todos, showToday);
  const message = getMessage(stats.completedYesterday, stats.createdYesterday, showToday);
  const timeLabel = showToday ? 'today' : 'yesterday';
  
  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300); // Wait for animation
  };
  
  if (!visible) return null;
  
  return (
    <div className={`daily-summary-overlay ${visible ? 'visible' : ''}`}>
      <div className="daily-summary-modal">
        <button className="daily-summary-close" onClick={handleClose}>
          <CloseIcon />
        </button>
        
        {loading ? (
          <div className="daily-summary-content">
            <div className="daily-summary-emoji">⏳</div>
            <h1 className="daily-summary-title">Loading...</h1>
          </div>
        ) : (
          <div className="daily-summary-content">
            <div className="daily-summary-emoji">{message.emoji}</div>
            <h1 className="daily-summary-title">{message.title}</h1>
            <p className="daily-summary-subtitle">{message.subtitle}</p>
            
            <div className="daily-summary-stats">
              <div className="stat-card">
                <span className="stat-number">{stats.completedYesterday}</span>
                <span className="stat-label">Completed {timeLabel}</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">{stats.createdYesterday}</span>
                <span className="stat-label">Created {timeLabel}</span>
              </div>
            </div>
            
            {/* Streak section */}
            {(() => {
              const streakVal = showToday ? streakBestToday : streakBestYesterday;
              if (streakVal >= 2) {
                return (
                  <div className="daily-summary-streak">
                    <span className="streak-flame-big">🔥</span>
                    <span className="streak-summary-text">
                      Best streak {showToday ? 'today' : 'yesterday'}: <strong>{streakVal} tasks</strong> in a row!
                    </span>
                  </div>
                );
              }
              return null;
            })()}
            
            <div className="daily-summary-totals">
              <span>{stats.totalPending} pending</span>
              <span className="divider">•</span>
              <span>{stats.totalCompleted} completed total</span>
            </div>
          </div>
        )}
        
        <button className="daily-summary-btn" onClick={handleClose}>
          Let's go! 🎯
        </button>
      </div>
    </div>
  );
}
