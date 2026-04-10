'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase, Employee } from '@/lib/supabase';
import { Trash2, X, Send, Plus } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';

interface WhiteboardEntry {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  author_id: string | null;
  author_name: string;
  font_size: number;
  created_at: string;
}

interface PresenceUser {
  name: string;
  color: string;
  lastActive: number;
}

const MARKER_COLORS = [
  { id: 'black', hex: '#1a1a1a', label: 'Black' },
  { id: 'blue',  hex: '#2563eb', label: 'Blue'  },
  { id: 'red',   hex: '#dc2626', label: 'Red'   },
  { id: 'green', hex: '#16a34a', label: 'Green' },
  { id: 'purple',hex: '#9333ea', label: 'Purple'},
];

const BOARD_WIDTH  = 4000;
const BOARD_HEIGHT = 3000;

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return mobile;
}

export function Whiteboard() {
  const { user, profile } = useAuth();
  const isMobile = useIsMobile();

  const [entries,           setEntries          ] = useState<WhiteboardEntry[]>([]);
  const [inputText,         setInputText        ] = useState('');
  const [selectedColor,     setSelectedColor    ] = useState(MARKER_COLORS[0].hex);
  const [loading,           setLoading          ] = useState(true);
  const [currentEmployee,   setCurrentEmployee  ] = useState<Employee | null>(null);
  const [presenceUsers,     setPresenceUsers    ] = useState<Map<string, PresenceUser>>(new Map());
  const [placementTarget,   setPlacementTarget  ] = useState<{ x: number; y: number } | null>(null);
  const [showClearConfirm,  setShowClearConfirm ] = useState(false);
  const [animatingEntries,  setAnimatingEntries ] = useState<Set<string>>(new Set());
  const [deletingId,        setDeletingId       ] = useState<string | null>(null);
  const [showMobileInput,   setShowMobileInput  ] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const boardRef  = useRef<HTMLDivElement>(null);

  // Viewport pan state
  const [viewport,         setViewport        ] = useState({ x: 0, y: 0 });
  const [isPanning,        setIsPanning       ] = useState(false);
  const [panStart,         setPanStart        ] = useState({ x: 0, y: 0 });
  const [panViewportStart, setPanViewportStart] = useState({ x: 0, y: 0 });

  // Touch pan state
  const touchStartRef        = useRef<{ x: number; y: number } | null>(null);
  const touchViewportStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapRef           = useRef<number>(0);

  /* ─── Fetch employee ─── */
  useEffect(() => {
    async function fetchEmployee() {
      if (!user) { setLoading(false); return; }
      const res = await fetch(`/api/employees?email=${encodeURIComponent(user.email ?? '')}`);
      const result = await res.json();
      const data = result.data?.[0] ?? null;
      if (data) setCurrentEmployee(data);
      setLoading(false);
    }
    fetchEmployee();
  }, [user]);

  /* ─── Fetch entries ─── */
  useEffect(() => { fetchAllEntries(); }, []);

  async function fetchAllEntries() {
    try {
      const res = await fetch('/api/whiteboard');
      const { data } = await res.json();
      if (data) setEntries(data);
    } catch (err) {
      console.error('Failed to fetch whiteboard entries:', err);
    }
  }

  /* ─── Realtime ─── */
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('whiteboard-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whiteboard_entries' },
        (payload) => {
          const newEntry = payload.new as WhiteboardEntry;
          setEntries(prev => prev.some(e => e.id === newEntry.id) ? prev : [...prev, newEntry]);
          setAnimatingEntries(prev => new Set(prev).add(newEntry.id));
          setTimeout(() => setAnimatingEntries(prev => { const n = new Set(prev); n.delete(newEntry.id); return n; }), 600);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'whiteboard_entries' },
        () => fetchAllEntries())
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, []);

  /* ─── Presence ─── */
  useEffect(() => {
    if (!supabase || !currentEmployee) return;
    const ch = supabase.channel('whiteboard-presence', { config: { presence: { key: currentEmployee.id } } });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const users = new Map<string, PresenceUser>();
      Object.entries(state).forEach(([key, presences]) => {
        const p = (presences as unknown as Array<{ name: string; color: string; lastActive: number }>)[0];
        if (p && key !== currentEmployee.id) users.set(key, p);
      });
      setPresenceUsers(users);
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ name: currentEmployee.name, color: selectedColor, lastActive: Date.now() });
      }
    });
    return () => { supabase!.removeChannel(ch); };
  }, [currentEmployee]);

  /* ─── Position logic ─── */
  function findNextPosition(): { x: number; y: number } {
    if (placementTarget) { const t = placementTarget; setPlacementTarget(null); return t; }
    if (entries.length === 0) return { x: 80, y: 80 };
    const sorted = [...entries].sort((a, b) => Math.abs(a.y - b.y) < 40 ? a.x - b.x : a.y - b.y);
    const last = sorted[sorted.length - 1];
    let nextY = last.y + 52, nextX = 80;
    if (nextY > BOARD_HEIGHT - 100) { nextX = Math.max(...entries.map(e => e.x)) + 400; nextY = 80; }
    return { x: nextX, y: nextY };
  }

  /* ─── Submit ─── */
  const handleSubmit = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    const pos = findNextPosition();
    setInputText('');
    setShowMobileInput(false);
    try {
      const res = await fetch('/api/whiteboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text, x: pos.x, y: pos.y, color: selectedColor,
          author_id: currentEmployee?.id || null,
          author_name: currentEmployee?.name || profile?.name || 'Unknown',
          font_size: 28,
        }),
      });
      const { data } = await res.json();
      if (data) {
        setEntries(prev => prev.some(e => e.id === data.id) ? prev : [...prev, data]);
        setAnimatingEntries(prev => new Set(prev).add(data.id));
        setTimeout(() => setAnimatingEntries(prev => { const n = new Set(prev); n.delete(data.id); return n; }), 600);
      }
    } catch (err) { console.error('Failed to create entry:', err); }
    inputRef.current?.focus();
  }, [inputText, selectedColor, currentEmployee, profile, entries, placementTarget]);

  /* ─── Delete single entry ─── */
  async function handleDeleteEntry(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/whiteboard/${id}`, { method: 'DELETE' });
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch {
      // fallback: refetch
      await fetchAllEntries();
    } finally {
      setDeletingId(null);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  /* ─── Desktop: Board click (place marker) ─── */
  const handleBoardClick = (e: React.MouseEvent) => {
    if (isPanning) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    setPlacementTarget({ x: (e.clientX - rect.left) - viewport.x, y: (e.clientY - rect.top) - viewport.y });
    inputRef.current?.focus();
  };

  /* ─── Desktop: Mouse pan (alt+drag or middle button) ─── */
  const handlePanStart = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2 || e.altKey) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      setPanViewportStart({ x: viewport.x, y: viewport.y });
    }
  };

  const handlePanMove = useCallback((e: MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    setViewport({
      x: Math.min(0, Math.max(panViewportStart.x + dx, -(BOARD_WIDTH  - window.innerWidth  + 240))),
      y: Math.min(0, Math.max(panViewportStart.y + dy, -(BOARD_HEIGHT - window.innerHeight + 100))),
    });
  }, [isPanning, panStart, panViewportStart]);

  const handlePanEnd = useCallback(() => setIsPanning(false), []);

  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handlePanMove);
      window.addEventListener('mouseup', handlePanEnd);
      return () => { window.removeEventListener('mousemove', handlePanMove); window.removeEventListener('mouseup', handlePanEnd); };
    }
  }, [isPanning, handlePanMove, handlePanEnd]);

  /* ─── Touch: pan the canvas ─── */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
      touchViewportStartRef.current = { x: viewport.x, y: viewport.y };
    }
  }, [viewport]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !touchStartRef.current) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    setViewport({
      x: Math.min(0, Math.max(touchViewportStartRef.current.x + dx, -(BOARD_WIDTH  - window.innerWidth  + 240))),
      y: Math.min(0, Math.max(touchViewportStartRef.current.y + dy, -(BOARD_HEIGHT - window.innerHeight + 100))),
    });
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null;
  }, []);

  /* ─── Clear board ─── */
  async function clearBoard() {
    try {
      await fetch('/api/whiteboard?confirm=true', { method: 'DELETE' });
      setEntries([]);
      setShowClearConfirm(false);
    } catch (err) { console.error('Failed to clear board:', err); }
  }

  const activeUsers = Array.from(presenceUsers.entries())
    .filter(([, u]) => Date.now() - u.lastActive < 120000)
    .map(([id, u]) => ({ id, ...u }));

  if (loading) {
    return (
      <div className="wb-loading">
        <div className="wb-loading-spinner" />
        <p>Loading whiteboard...</p>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
     MOBILE VIEW — note feed
  ════════════════════════════════════════════════════════ */
  if (isMobile) {
    const sortedEntries = [...entries].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return (
      <div className="wb-mobile">
        {/* Header */}
        <div className="wb-mobile-header">
          <span className="wb-mobile-title">Whiteboard</span>
          <div className="wb-mobile-header-right">
            {activeUsers.length > 0 && (
              <div className="wb-presence">
                {activeUsers.map(u => (
                  <div key={u.id} className="wb-presence-dot" style={{ background: u.color }} title={u.name}>
                    <span className="wb-presence-label">{u.name.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="wb-clear-btn" onClick={() => setShowClearConfirm(true)} title="Clear board">
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Note feed */}
        <div className="wb-mobile-feed">
          {sortedEntries.length === 0 ? (
            <div className="wb-mobile-empty">
              <p>Nothing on the board yet.</p>
              <p>Tap <strong>+</strong> to add your first note.</p>
            </div>
          ) : (
            sortedEntries.map(entry => (
              <div
                key={entry.id}
                className={`wb-mobile-note ${animatingEntries.has(entry.id) ? 'wb-mobile-note--new' : ''}`}
                style={{ borderLeftColor: entry.color }}
              >
                <div className="wb-mobile-note-text" style={{ color: entry.color }}>
                  {entry.text}
                </div>
                <div className="wb-mobile-note-meta">
                  <span className="wb-mobile-note-author">{entry.author_name?.split(' ')[0]}</span>
                  <button
                    className="wb-mobile-note-delete"
                    onClick={() => handleDeleteEntry(entry.id)}
                    disabled={deletingId === entry.id}
                    aria-label="Delete note"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add note input sheet */}
        {showMobileInput && (
          <div className="wb-mobile-input-overlay" onClick={() => setShowMobileInput(false)}>
            <div className="wb-mobile-input-sheet" onClick={e => e.stopPropagation()}>
              <div className="wb-mobile-sheet-handle" />
              <p className="wb-mobile-sheet-label">Add to whiteboard</p>
              <textarea
                className="wb-mobile-textarea"
                placeholder="Type your note..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                rows={3}
                autoFocus
              />
              {/* Color picker */}
              <div className="wb-color-selector" style={{ marginBottom: 12 }}>
                {MARKER_COLORS.map(c => (
                  <button
                    key={c.id}
                    className={`wb-color-dot ${selectedColor === c.hex ? 'wb-color-active' : ''}`}
                    style={{ background: c.hex }}
                    onClick={() => setSelectedColor(c.hex)}
                    aria-label={c.label}
                  />
                ))}
              </div>
              <button
                className="wb-mobile-submit"
                onClick={handleSubmit}
                disabled={!inputText.trim()}
              >
                <Send size={16} /> Post Note
              </button>
            </div>
          </div>
        )}

        {/* FAB */}
        <button
          className="wb-mobile-fab"
          onClick={() => { setShowMobileInput(true); setInputText(''); }}
          aria-label="Add note"
        >
          <Plus size={22} />
        </button>

        {/* Clear confirmation */}
        {showClearConfirm && (
          <ModalOverlay className="wb-modal-overlay" onClose={() => setShowClearConfirm(false)}>
            <div className="wb-modal" onClick={e => e.stopPropagation()}>
              <div className="wb-modal-header">
                <h3>Clear Whiteboard</h3>
                <button onClick={() => setShowClearConfirm(false)}><X size={18} /></button>
              </div>
              <p className="wb-modal-body">This will erase everything. This cannot be undone.</p>
              <div className="wb-modal-actions">
                <button className="wb-modal-cancel" onClick={() => setShowClearConfirm(false)}>Cancel</button>
                <button className="wb-modal-confirm" onClick={clearBoard}>Clear Board</button>
              </div>
            </div>
          </ModalOverlay>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
     DESKTOP VIEW — infinite canvas
  ════════════════════════════════════════════════════════ */
  return (
    <div className="wb-container">
      {/* Top bar */}
      <div className="wb-topbar">
        <span className="wb-topbar-title">Whiteboard</span>
        <div className="wb-topbar-right">
          {activeUsers.length > 0 && (
            <div className="wb-presence">
              {activeUsers.map(u => (
                <div key={u.id} className="wb-presence-dot" style={{ background: u.color }} title={u.name}>
                  <span className="wb-presence-label">{u.name.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          )}
          <button className="wb-clear-btn" onClick={() => setShowClearConfirm(true)} title="Clear board">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="wb-canvas"
        style={{ cursor: isPanning ? 'grabbing' : 'crosshair' }}
        onMouseDown={handlePanStart}
        onClick={handleBoardClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={boardRef}
          className="wb-board"
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px)`, width: BOARD_WIDTH, height: BOARD_HEIGHT }}
        >
          {placementTarget && (
            <div className="wb-placement-marker" style={{ left: placementTarget.x, top: placementTarget.y }} />
          )}
          {entries.map(entry => (
            <div
              key={entry.id}
              className={`wb-entry ${animatingEntries.has(entry.id) ? 'wb-entry-animate' : ''}`}
              style={{ left: entry.x, top: entry.y, color: entry.color, fontSize: entry.font_size }}
            >
              <span className="wb-entry-text">
                {animatingEntries.has(entry.id) ? <WriteOnText text={entry.text} /> : entry.text}
              </span>
              <span className="wb-entry-author">{entry.author_name?.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Input bar */}
      <div className="wb-input-bar">
        <div className="wb-color-selector">
          {MARKER_COLORS.map(c => (
            <button
              key={c.id}
              className={`wb-color-dot ${selectedColor === c.hex ? 'wb-color-active' : ''}`}
              style={{ background: c.hex }}
              onClick={() => setSelectedColor(c.hex)}
              title={c.label}
              aria-label={`${c.label} marker`}
            />
          ))}
        </div>
        <div className="wb-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="wb-input"
            placeholder={placementTarget ? 'Type and press Enter to place…' : 'Click the board to place, then type…'}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={500}
          />
          <button className="wb-send-btn" onClick={handleSubmit} disabled={!inputText.trim()} aria-label="Add to board">
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Clear confirmation */}
      {showClearConfirm && (
        <ModalOverlay className="wb-modal-overlay" onClose={() => setShowClearConfirm(false)}>
          <div className="wb-modal" onClick={e => e.stopPropagation()}>
            <div className="wb-modal-header">
              <h3>Clear Whiteboard</h3>
              <button onClick={() => setShowClearConfirm(false)}><X size={18} /></button>
            </div>
            <p className="wb-modal-body">This will erase everything on the whiteboard. This action cannot be undone.</p>
            <div className="wb-modal-actions">
              <button className="wb-modal-cancel" onClick={() => setShowClearConfirm(false)}>Cancel</button>
              <button className="wb-modal-confirm" onClick={clearBoard}>Clear Board</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function WriteOnText({ text }: { text: string }) {
  const [visibleChars, setVisibleChars] = useState(0);
  useEffect(() => {
    const charDelay = Math.max(15, Math.min(40, 400 / text.length));
    let frame: ReturnType<typeof setTimeout>;
    let count = 0;
    function tick() { count++; setVisibleChars(count); if (count < text.length) frame = setTimeout(tick, charDelay); }
    frame = setTimeout(tick, 50);
    return () => clearTimeout(frame);
  }, [text]);
  return <><span>{text.slice(0, visibleChars)}</span><span className="wb-cursor-blink">|</span></>;
}
