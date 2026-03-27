'use client';

import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Flame } from 'lucide-react';

interface FocusTimerProps {
  compact?: boolean;
}

export function FocusTimer({ compact = false }: FocusTimerProps) {
  const [focusTime, setFocusTime] = useState(25 * 60); // 25 minutes in seconds
  const [isRunning, setIsRunning] = useState(false);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRunning && focusTime > 0) {
      interval = setInterval(() => {
        setFocusTime(prev => prev - 1);
      }, 1000);
    } else if (focusTime === 0 && isRunning) {
      setIsRunning(false);
      setStreak(prev => prev + 1);
      // Play notification sound or show toast
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification('Focus session complete!', {
            body: 'Great work! Take a short break.',
            icon: '/logos/logo-icon-white.png'
          });
        }
      }
    }
    
    return () => clearInterval(interval);
  }, [isRunning, focusTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resetTimer = () => {
    setFocusTime(25 * 60);
    setIsRunning(false);
  };

  const progress = ((25 * 60 - focusTime) / (25 * 60)) * 100;

  if (compact) {
    return (
      <div className="ws-focus-compact">
        <div className="ws-focus-compact-display">
          <span className={`ws-focus-time ${isRunning ? 'running' : ''}`}>
            {formatTime(focusTime)}
          </span>
          {streak > 0 && (
            <span className="ws-focus-streak-compact">
              <Flame size={12} />
              {streak}
            </span>
          )}
        </div>
        <div className="ws-focus-compact-controls">
          <button 
            className={`ws-focus-btn-compact ${isRunning ? 'pause' : 'play'}`}
            onClick={() => setIsRunning(!isRunning)}
            aria-label={isRunning ? 'Pause' : 'Start'}
          >
            {isRunning ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button 
            className="ws-focus-btn-compact reset"
            onClick={resetTimer}
            aria-label="Reset timer"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ws-focus-card">
      <div className="ws-focus-header">
        <h3>Focus Time</h3>
        {streak > 0 && (
          <span className="ws-focus-streak">
            <Flame size={14} />
            {streak} streak
          </span>
        )}
      </div>

      <div className="ws-focus-content">
        <div className="ws-focus-timer-ring">
          <svg viewBox="0 0 100 100" className="ws-focus-progress-ring">
            <circle
              className="ws-focus-progress-bg"
              cx="50"
              cy="50"
              r="45"
              fill="none"
              strokeWidth="6"
            />
            <circle
              className="ws-focus-progress-fill"
              cx="50"
              cy="50"
              r="45"
              fill="none"
              strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 45}`}
              strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className={`ws-focus-display ${isRunning ? 'running' : ''}`}>
            {formatTime(focusTime)}
          </div>
        </div>

        <div className="ws-focus-controls">
          <button 
            className={`ws-focus-btn ${isRunning ? 'pause' : 'play'}`}
            onClick={() => setIsRunning(!isRunning)}
            aria-label={isRunning ? 'Pause' : 'Start'}
          >
            {isRunning ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button 
            className="ws-focus-btn reset"
            onClick={resetTimer}
            aria-label="Reset timer"
          >
            <RotateCcw size={18} />
          </button>
        </div>
        
        <p className="ws-focus-tip">25 minutes of focused work</p>
      </div>
    </div>
  );
}
