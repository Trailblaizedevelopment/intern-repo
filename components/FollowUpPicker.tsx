'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

interface FollowUpPickerProps {
  currentDate: string;
  onSelect: (date: string | null) => void;
  onClose: () => void;
  isMobile: boolean;
}

export default function FollowUpPicker({ currentDate, onSelect, onClose, isMobile }: FollowUpPickerProps) {
  const [customDate, setCustomDate] = useState(currentDate || '');
  const [showCustom, setShowCustom] = useState(false);

  const presets = [
    { label: 'Today', value: addDays(0) },
    { label: 'Tomorrow', value: addDays(1) },
    { label: 'In 3 Days', value: addDays(3) },
    { label: 'Next Week', value: nextMonday() },
  ];

  if (isMobile) {
    return (
      <>
        <div className="fup-sheet-backdrop" onClick={onClose} />
        <div className="fup-sheet">
          <div className="fup-sheet-handle"><div className="fup-sheet-bar" /></div>
          <div className="fup-sheet-header">
            <span className="fup-sheet-title">Set Follow-up</span>
            <button className="fup-sheet-close" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="fup-sheet-body">
            {presets.map(p => (
              <button key={p.label} className="fup-preset" onClick={() => onSelect(p.value)}>
                {p.label}
              </button>
            ))}
            {!showCustom ? (
              <button className="fup-preset fup-preset-custom" onClick={() => setShowCustom(true)}>
                Custom...
              </button>
            ) : (
              <div className="fup-custom-row">
                <input
                  type="date"
                  className="fup-date-input"
                  value={customDate}
                  onChange={e => setCustomDate(e.target.value)}
                />
                <button className="fup-custom-ok" onClick={() => customDate && onSelect(customDate)}>Set</button>
              </div>
            )}
            {currentDate && (
              <button className="fup-preset fup-preset-clear" onClick={() => onSelect(null)}>
                Clear Follow-up
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  // Desktop: popover
  return (
    <div className="fup-popover">
      <div className="fup-popover-header">
        <span>Set Follow-up</span>
        <button className="fup-sheet-close" onClick={onClose}><X size={16} /></button>
      </div>
      {presets.map(p => (
        <button key={p.label} className="fup-preset" onClick={() => onSelect(p.value)}>
          {p.label}
        </button>
      ))}
      {!showCustom ? (
        <button className="fup-preset fup-preset-custom" onClick={() => setShowCustom(true)}>
          Custom...
        </button>
      ) : (
        <div className="fup-custom-row">
          <input
            type="date"
            className="fup-date-input"
            value={customDate}
            onChange={e => setCustomDate(e.target.value)}
          />
          <button className="fup-custom-ok" onClick={() => customDate && onSelect(customDate)}>Set</button>
        </div>
      )}
      {currentDate && (
        <button className="fup-preset fup-preset-clear" onClick={() => onSelect(null)}>
          Clear
        </button>
      )}
    </div>
  );
}
