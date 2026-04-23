'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Palette,
  Plus,
  X,
  Trash2,
  Edit2,
  Search,
  Upload,
  ImageIcon,
  Video,
  FileText,
  Layers,
  FolderOpen,
  BookOpen,
  Users,
  Megaphone,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Instagram,
  Linkedin,
  Link as LinkIcon,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type AssetCategory = 'Brand Kit' | 'Flyers' | 'Social Posts' | 'Chapter Collabs' | 'Videos' | 'Templates';
type Platform = 'Instagram' | 'LinkedIn' | 'TikTok' | 'Twitter/X' | 'YouTube' | 'Facebook';
type PostStatus = 'Draft' | 'Scheduled' | 'Posted';
type CollabStatus = 'Not Started' | 'In Design' | 'Scheduled' | 'Posted';
type CampaignStatus = 'Planning' | 'Active' | 'Complete';

interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  url: string;
  addedBy: string;
  addedAt: string;
  notes?: string;
}

interface CalendarEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  platform: Platform;
  status: PostStatus;
  link?: string;
  notes?: string;
}

interface ChapterCollab {
  id: string;
  chapterName: string;
  school: string;
  status: CollabStatus;
  postDate?: string;
  igLink?: string;
  likes?: number;
  comments?: number;
  notes?: string;
}

interface Campaign {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  platforms: Platform[];
  plannedPieces: number;
  publishedPieces: number;
  status: CampaignStatus;
  notes?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSET_CATEGORIES: AssetCategory[] = ['Brand Kit', 'Flyers', 'Social Posts', 'Chapter Collabs', 'Videos', 'Templates'];
const PLATFORMS: Platform[] = ['Instagram', 'LinkedIn', 'TikTok', 'Twitter/X', 'YouTube', 'Facebook'];
const POST_STATUSES: PostStatus[] = ['Draft', 'Scheduled', 'Posted'];
const COLLAB_STATUSES: CollabStatus[] = ['Not Started', 'In Design', 'Scheduled', 'Posted'];
const CAMPAIGN_STATUSES: CampaignStatus[] = ['Planning', 'Active', 'Complete'];

const CATEGORY_ICONS: Record<AssetCategory, React.ReactNode> = {
  'Brand Kit':      <BookOpen  size={18} />,
  'Flyers':         <FileText  size={18} />,
  'Social Posts':   <ImageIcon size={18} />,
  'Chapter Collabs':<Users     size={18} />,
  'Videos':         <Video     size={18} />,
  'Templates':      <Layers    size={18} />,
};

const CATEGORY_COLORS: Record<AssetCategory, { bg: string; color: string }> = {
  'Brand Kit':      { bg: '#ede9fe', color: '#7c3aed' },
  'Flyers':         { bg: '#fce7f3', color: '#be185d' },
  'Social Posts':   { bg: '#dbeafe', color: '#1d4ed8' },
  'Chapter Collabs':{ bg: '#d1fae5', color: '#065f46' },
  'Videos':         { bg: '#fee2e2', color: '#991b1b' },
  'Templates':      { bg: '#fef3c7', color: '#92400e' },
};

const PLATFORM_COLORS: Record<Platform, { bg: string; color: string; initials: string }> = {
  Instagram:   { bg: '#fce7f3', color: '#be185d', initials: 'IG' },
  LinkedIn:    { bg: '#dbeafe', color: '#1d4ed8', initials: 'LI' },
  TikTok:      { bg: '#f3f4f6', color: '#111827', initials: 'TT' },
  'Twitter/X': { bg: '#e0f2fe', color: '#0369a1', initials: 'X' },
  YouTube:     { bg: '#fee2e2', color: '#991b1b', initials: 'YT' },
  Facebook:    { bg: '#eff6ff', color: '#1e40af', initials: 'FB' },
};

const COLLAB_STATUS_COLORS: Record<CollabStatus, { bg: string; color: string }> = {
  'Not Started': { bg: '#f3f4f6', color: '#6b7280' },
  'In Design':   { bg: '#fef3c7', color: '#92400e' },
  'Scheduled':   { bg: '#dbeafe', color: '#1d4ed8' },
  'Posted':      { bg: '#d1fae5', color: '#065f46' },
};

const CAMPAIGN_STATUS_COLORS: Record<CampaignStatus, { bg: string; color: string }> = {
  'Planning': { bg: '#f3f4f6', color: '#6b7280' },
  'Active':   { bg: '#d1fae5', color: '#065f46' },
  'Complete': { bg: '#dbeafe', color: '#1d4ed8' },
};

const POST_STATUS_COLORS: Record<PostStatus, { bg: string; color: string }> = {
  'Draft':     { bg: '#f3f4f6', color: '#6b7280' },
  'Scheduled': { bg: '#dbeafe', color: '#1d4ed8' },
  'Posted':    { bg: '#d1fae5', color: '#065f46' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: Platform }) {
  const { bg, color, initials } = PLATFORM_COLORS[platform];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 9999,
      fontSize: '0.7rem', fontWeight: 700, background: bg, color,
    }}>
      {platform === 'Instagram' ? <Instagram size={10} /> : platform === 'LinkedIn' ? <Linkedin size={10} /> : <span style={{ fontSize: '0.6rem' }}>{initials}</span>}
      {platform}
    </span>
  );
}

function StatusBadge({ label, colors }: { label: string; colors: { bg: string; color: string } }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 10px', borderRadius: 9999,
      fontSize: '0.72rem', fontWeight: 600,
      background: colors.bg, color: colors.color,
    }}>
      {label}
    </span>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16,
        width: '100%', maxWidth: 540,
        maxHeight: '90vh', overflow: 'auto',
        padding: '1.5rem',
        boxShadow: '0 4px 32px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  border: '1px solid #E5E7EB', borderRadius: 8,
  fontSize: '0.875rem', outline: 'none', background: '#F9FAFB',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

// ─── Tab 1: Asset Library ─────────────────────────────────────────────────────

function AssetLibrary() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filterCategory, setFilterCategory] = useState<AssetCategory | 'All'>('All');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [form, setForm] = useState<Omit<Asset, 'id' | 'addedAt'>>({
    name: '', category: 'Brand Kit', url: '', addedBy: '', notes: '',
  });

  useEffect(() => {
    try { const s = localStorage.getItem('tb_studio_assets'); if (s) setAssets(JSON.parse(s)); } catch {}
  }, []);

  const save = useCallback((next: Asset[]) => {
    setAssets(next);
    localStorage.setItem('tb_studio_assets', JSON.stringify(next));
  }, []);

  function openAdd() {
    setForm({ name: '', category: 'Brand Kit', url: '', addedBy: '', notes: '' });
    setEditingAsset(null);
    setShowForm(true);
  }

  function openEdit(asset: Asset) {
    setForm({ name: asset.name, category: asset.category, url: asset.url, addedBy: asset.addedBy, notes: asset.notes || '' });
    setEditingAsset(asset);
    setShowForm(true);
  }

  function submit() {
    if (!form.name.trim() || !form.url.trim()) return;
    if (editingAsset) {
      save(assets.map(a => a.id === editingAsset.id ? { ...a, ...form } : a));
    } else {
      save([...assets, { id: uid(), addedAt: new Date().toISOString().slice(0, 10), ...form }]);
    }
    setShowForm(false);
    setEditingAsset(null);
  }

  function remove(id: string) {
    save(assets.filter(a => a.id !== id));
  }

  const filtered = assets.filter(a => {
    const matchCat = filterCategory === 'All' || a.category === filterCategory;
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.addedBy.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search assets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 32 }}
          />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value as AssetCategory | 'All')} style={{ ...selectStyle, flex: '0 0 auto', width: 'auto' }}>
          <option value="All">All Categories</option>
          {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={openAdd} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: '#0F172A', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={15} /> Add Asset
        </button>
      </div>

      {/* Category folders */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {(['All', ...ASSET_CATEGORIES] as (AssetCategory | 'All')[]).map(cat => {
          const count = cat === 'All' ? assets.length : assets.filter(a => a.category === cat).length;
          const active = filterCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 8,
                fontSize: '0.8125rem', fontWeight: 500,
                border: '1px solid',
                borderColor: active ? '#0F172A' : '#E5E7EB',
                background: active ? '#0F172A' : '#fff',
                color: active ? '#fff' : '#374151',
                cursor: 'pointer',
              }}
            >
              {cat !== 'All' && CATEGORY_ICONS[cat as AssetCategory]}
              {cat}
              <span style={{
                background: active ? 'rgba(255,255,255,0.2)' : '#F3F4F6',
                color: active ? '#fff' : '#6b7280',
                borderRadius: 9999, fontSize: '0.7rem', fontWeight: 700,
                padding: '1px 7px',
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Asset Grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
          <FolderOpen size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ margin: 0, fontWeight: 500 }}>{assets.length === 0 ? 'No assets yet. Add your first one!' : 'No assets match your filter.'}</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '1rem',
        }}>
          {filtered.map(asset => {
            const catColors = CATEGORY_COLORS[asset.category];
            return (
              <div key={asset.id} style={{
                background: '#fff', border: '1px solid #E5E7EB',
                borderRadius: 12, padding: '1rem',
                display: 'flex', flexDirection: 'column', gap: '0.6rem',
              }}>
                {/* Preview / icon */}
                <div style={{
                  width: '100%', height: 100,
                  background: catColors.bg, borderRadius: 8,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 6,
                  color: catColors.color,
                }}>
                  {CATEGORY_ICONS[asset.category]}
                  <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{asset.category}</span>
                </div>

                {/* Info */}
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: '#0F172A', lineHeight: 1.3 }}>{asset.name}</p>
                  {asset.notes && (
                    <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.4 }}>{asset.notes}</p>
                  )}
                </div>

                {/* Meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <StatusBadge label={asset.category} colors={catColors} />
                  {asset.addedBy && (
                    <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>by {asset.addedBy}</span>
                  )}
                  <span style={{ fontSize: '0.7rem', color: '#9ca3af', marginLeft: 'auto' }}>{formatDate(asset.addedAt)}</span>
                </div>

                {/* Link + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {asset.url && asset.url.startsWith('data:image') && (
                    <img src={asset.url} alt={asset.name} style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8, marginBottom: 8, border: '1px solid #E5E7EB' }} />
                  )}
                  {asset.url && !asset.url.startsWith('data:') && (
                    <a href={asset.url} target="_blank" rel="noopener noreferrer" style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: '0.75rem', color: '#3b82f6', textDecoration: 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      <ExternalLink size={12} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {asset.url}
                      </span>
                    </a>
                  )}
                  <button onClick={() => openEdit(asset)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => remove(asset.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <Modal title={editingAsset ? 'Edit Asset' : 'Add Asset'} onClose={() => { setShowForm(false); setEditingAsset(null); }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormRow label="Asset Name *">
              <input autoFocus type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Spring Rush Flyer 2026" style={inputStyle} />
            </FormRow>
            <FormRow label="Category *">
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as AssetCategory }))} style={selectStyle}>
                {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormRow>
            <FormRow label="URL / Link *">
              <input type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="Paste a link or upload a file below" style={inputStyle} />
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.gif,.mp4,.mov,.svg,.webp" onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const dataUrl = reader.result as string;
                    setForm(f => ({ ...f, url: dataUrl, name: f.name || file.name }));
                  };
                  reader.readAsDataURL(file);
                }
              }} style={{ fontSize: '0.8125rem', color: '#6B7280', marginTop: 4 }} />
            </FormRow>
            <FormRow label="Added By">
              <input type="text" value={form.addedBy} onChange={e => setForm(f => ({ ...f, addedBy: e.target.value }))} placeholder="e.g. Katie" style={inputStyle} />
            </FormRow>
            <FormRow label="Notes (optional)">
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Context, usage notes..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </FormRow>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: 4 }}>
              <button onClick={() => { setShowForm(false); setEditingAsset(null); }} style={{
                padding: '8px 16px', background: '#F9FAFB', color: '#374151',
                border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.875rem', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={submit} disabled={!form.name.trim() || !form.url.trim()} style={{
                padding: '8px 20px', background: form.name.trim() && form.url.trim() ? '#0F172A' : '#e5e7eb',
                color: form.name.trim() && form.url.trim() ? '#fff' : '#9ca3af',
                border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600,
                cursor: form.name.trim() && form.url.trim() ? 'pointer' : 'default',
              }}>
                {editingAsset ? 'Update' : 'Add Asset'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab 2: Content Calendar ──────────────────────────────────────────────────

function ContentCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [form, setForm] = useState<Omit<CalendarEntry, 'id'>>({
    date: '', title: '', platform: 'Instagram', status: 'Draft', link: '', notes: '',
  });

  useEffect(() => {
    try { const s = localStorage.getItem('tb_studio_calendar'); if (s) setEntries(JSON.parse(s)); } catch {}
  }, []);

  const save = useCallback((next: CalendarEntry[]) => {
    setEntries(next);
    localStorage.setItem('tb_studio_calendar', JSON.stringify(next));
  }, []);

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else { setMonth(m => m - 1); }
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else { setMonth(m => m + 1); }
  }

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function entriesForDay(day: number) {
    const d = dateStr(day);
    return entries.filter(e => e.date === d);
  }

  function openAdd(day: number) {
    const d = dateStr(day);
    setSelectedDate(d);
    setForm({ date: d, title: '', platform: 'Instagram', status: 'Draft', link: '', notes: '' });
    setEditingEntry(null);
    setShowForm(true);
  }

  function openEdit(entry: CalendarEntry) {
    setForm({ date: entry.date, title: entry.title, platform: entry.platform, status: entry.status, link: entry.link || '', notes: entry.notes || '' });
    setEditingEntry(entry);
    setSelectedDate(entry.date);
    setShowForm(true);
  }

  function submit() {
    if (!form.title.trim()) return;
    if (editingEntry) {
      save(entries.map(e => e.id === editingEntry.id ? { ...e, ...form } : e));
    } else {
      save([...entries, { id: uid(), ...form }]);
    }
    setShowForm(false);
    setEditingEntry(null);
  }

  function remove(id: string) {
    save(entries.filter(e => e.id !== id));
  }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        <button onClick={prevMonth} style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0F172A', flex: 1, textAlign: 'center' }}>
          {MONTH_NAMES[month]} {year}
        </span>
        <button onClick={nextMonth} style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer', padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Calendar grid */}
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
          {DAY_LABELS.map(d => (
            <div key={d} style={{ padding: '8px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>{d}</div>
          ))}
        </div>

        {/* Weeks */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {/* Empty cells before first day */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} style={{ minHeight: 90, borderRight: '1px solid #E5E7EB', borderBottom: '1px solid #E5E7EB', background: '#FAFAFA' }} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
            const dayEntries = entriesForDay(day);
            const isToday = dateStr(day) === todayStr;
            return (
              <div
                key={day}
                style={{
                  minHeight: 90, padding: '6px',
                  borderRight: '1px solid #E5E7EB', borderBottom: '1px solid #E5E7EB',
                  background: '#fff', cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onClick={() => openAdd(day)}
              >
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: isToday ? '#0F172A' : 'transparent',
                  color: isToday ? '#fff' : '#374151',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.8125rem', fontWeight: isToday ? 700 : 400, marginBottom: 4,
                }}>
                  {day}
                </div>
                {dayEntries.slice(0, 3).map(entry => {
                  const colors = POST_STATUS_COLORS[entry.status];
                  return (
                    <div
                      key={entry.id}
                      onClick={e => { e.stopPropagation(); openEdit(entry); }}
                      style={{
                        background: colors.bg, color: colors.color,
                        borderRadius: 4, padding: '2px 5px',
                        fontSize: '0.65rem', fontWeight: 600,
                        marginBottom: 2, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        cursor: 'pointer',
                      }}
                    >
                      {entry.title}
                    </div>
                  );
                })}
                {dayEntries.length > 3 && (
                  <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: 2 }}>+{dayEntries.length - 3} more</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        {POST_STATUSES.map(s => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: POST_STATUS_COLORS[s].bg, border: `1px solid ${POST_STATUS_COLORS[s].color}30` }} />
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{s}</span>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <Modal title={editingEntry ? 'Edit Calendar Entry' : `Add Content — ${selectedDate ? formatDate(selectedDate) : ''}`} onClose={() => { setShowForm(false); setEditingEntry(null); }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormRow label="Title *">
              <input autoFocus type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Spring Rush Kick-off Post" style={inputStyle} />
            </FormRow>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormRow label="Date">
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
              </FormRow>
              <FormRow label="Platform">
                <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value as Platform }))} style={selectStyle}>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </FormRow>
            </div>
            <FormRow label="Status">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as PostStatus }))} style={selectStyle}>
                {POST_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormRow>
            <FormRow label="Link (optional)">
              <input type="url" value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} placeholder="https://..." style={inputStyle} />
            </FormRow>
            <FormRow label="Notes (optional)">
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Details, caption draft..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </FormRow>

            {/* Existing entries for this day */}
            {selectedDate && entries.filter(e => e.date === selectedDate && (!editingEntry || e.id !== editingEntry.id)).length > 0 && (
              <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '0.75rem' }}>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 8px', fontWeight: 600 }}>Other entries this day:</p>
                {entries.filter(e => e.date === selectedDate && (!editingEntry || e.id !== editingEntry.id)).map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <PlatformBadge platform={e.platform} />
                    <span style={{ flex: 1, fontSize: '0.8125rem', color: '#374151' }}>{e.title}</span>
                    <StatusBadge label={e.status} colors={POST_STATUS_COLORS[e.status]} />
                    <button onClick={() => remove(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setEditingEntry(null); }} style={{ padding: '8px 16px', background: '#F9FAFB', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.875rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submit} disabled={!form.title.trim()} style={{ padding: '8px 20px', background: form.title.trim() ? '#0F172A' : '#e5e7eb', color: form.title.trim() ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600, cursor: form.title.trim() ? 'pointer' : 'default' }}>
                {editingEntry ? 'Update' : 'Add to Calendar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab 3: Chapter Collabs ───────────────────────────────────────────────────

function ChapterCollabs() {
  const [collabs, setCollabs] = useState<ChapterCollab[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCollab, setEditingCollab] = useState<ChapterCollab | null>(null);
  const [form, setForm] = useState<Omit<ChapterCollab, 'id'>>({
    chapterName: '', school: '', status: 'Not Started',
    postDate: '', igLink: '', likes: 0, comments: 0, notes: '',
  });

  useEffect(() => {
    try { const s = localStorage.getItem('tb_studio_collabs'); if (s) setCollabs(JSON.parse(s)); } catch {}
    // Also try to auto-populate from CS data
    try {
      const csData = localStorage.getItem('tb_cs_clients');
      if (csData) {
        const clients = JSON.parse(csData);
        const existing = JSON.parse(localStorage.getItem('tb_studio_collabs') || '[]') as ChapterCollab[];
        const existingNames = new Set(existing.map((c: ChapterCollab) => c.chapterName.toLowerCase()));
        const newCollabs: ChapterCollab[] = [];
        for (const client of clients) {
          if (client.status === 'active' && client.name && !existingNames.has(client.name.toLowerCase())) {
            newCollabs.push({
              id: uid(),
              chapterName: client.name,
              school: client.school || '',
              status: 'Not Started',
              postDate: '', igLink: '', likes: 0, comments: 0, notes: '',
            });
          }
        }
        if (newCollabs.length > 0) {
          const merged = [...existing, ...newCollabs];
          setCollabs(merged);
          localStorage.setItem('tb_studio_collabs', JSON.stringify(merged));
        }
      }
    } catch {}
  }, []);

  const save = useCallback((next: ChapterCollab[]) => {
    setCollabs(next);
    localStorage.setItem('tb_studio_collabs', JSON.stringify(next));
  }, []);

  function openAdd() {
    setForm({ chapterName: '', school: '', status: 'Not Started', postDate: '', igLink: '', likes: 0, comments: 0, notes: '' });
    setEditingCollab(null);
    setShowForm(true);
  }

  function openEdit(collab: ChapterCollab) {
    setForm({ chapterName: collab.chapterName, school: collab.school, status: collab.status, postDate: collab.postDate || '', igLink: collab.igLink || '', likes: collab.likes || 0, comments: collab.comments || 0, notes: collab.notes || '' });
    setEditingCollab(collab);
    setShowForm(true);
  }

  function submit() {
    if (!form.chapterName.trim()) return;
    if (editingCollab) {
      save(collabs.map(c => c.id === editingCollab.id ? { ...c, ...form } : c));
    } else {
      save([...collabs, { id: uid(), ...form }]);
    }
    setShowForm(false);
    setEditingCollab(null);
  }

  function remove(id: string) {
    save(collabs.filter(c => c.id !== id));
  }

  function cycleStatus(collab: ChapterCollab) {
    const idx = COLLAB_STATUSES.indexOf(collab.status);
    const next = COLLAB_STATUSES[(idx + 1) % COLLAB_STATUSES.length];
    save(collabs.map(c => c.id === collab.id ? { ...c, status: next } : c));
  }

  const notPosted = collabs.filter(c => c.status !== 'Posted');
  const posted = collabs.filter(c => c.status === 'Posted');

  const StatusIcon = ({ status }: { status: CollabStatus }) => {
    if (status === 'Posted') return <CheckCircle size={14} color="#065f46" />;
    if (status === 'Scheduled') return <Clock size={14} color="#1d4ed8" />;
    if (status === 'In Design') return <AlertCircle size={14} color="#92400e" />;
    return <AlertCircle size={14} color="#6b7280" />;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
            Every new chapter needs an intro collab post on Instagram. Track it here.
          </p>
        </div>
        <button onClick={openAdd} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: '#0F172A', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={15} /> New Collab
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {COLLAB_STATUSES.map(s => {
          const count = collabs.filter(c => c.status === s).length;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8 }}>
              <StatusIcon status={s} />
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>{count}</span>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{s}</span>
            </div>
          );
        })}
      </div>

      {/* Table */}
      {collabs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
          <Users size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ margin: 0, fontWeight: 500 }}>No chapter collabs yet. Add your first one!</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.8125rem' }}>Active chapters from Customer Success will auto-populate here.</p>
        </div>
      ) : (
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
          {/* Pending */}
          {notPosted.length > 0 && (
            <>
              <div style={{ padding: '10px 16px', background: '#FEF3C7', borderBottom: '1px solid #FDE68A', fontSize: '0.75rem', fontWeight: 600, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={13} /> {notPosted.length} pending collab post{notPosted.length !== 1 ? 's' : ''}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    {['Chapter', 'School', 'Status', 'Post Date', 'Instagram Link', 'Engagement', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {notPosted.map((collab, i) => (
                    <tr key={collab.id} style={{ borderBottom: i < notPosted.length - 1 ? '1px solid #E5E7EB' : 'none' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>{collab.chapterName}</td>
                      <td style={{ padding: '12px 14px', fontSize: '0.8125rem', color: '#6b7280' }}>{collab.school || '—'}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <button onClick={() => cycleStatus(collab)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          <StatusBadge label={collab.status} colors={COLLAB_STATUS_COLORS[collab.status]} />
                        </button>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.8125rem', color: '#374151' }}>{collab.postDate ? formatDate(collab.postDate) : '—'}</td>
                      <td style={{ padding: '12px 14px' }}>
                        {collab.igLink ? (
                          <a href={collab.igLink} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#3b82f6', textDecoration: 'none' }}>
                            <ExternalLink size={11} /> View Post
                          </a>
                        ) : <span style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.8125rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {collab.likes !== undefined && collab.likes > 0 ? `❤️ ${collab.likes}` : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => openEdit(collab)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><Edit2 size={14} /></button>
                          <button onClick={() => remove(collab.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Posted */}
          {posted.length > 0 && (
            <>
              <div style={{ padding: '10px 16px', background: '#D1FAE5', borderBottom: '1px solid #A7F3D0', borderTop: notPosted.length > 0 ? '1px solid #E5E7EB' : 'none', fontSize: '0.75rem', fontWeight: 600, color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={13} /> {posted.length} posted ✓
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    {['Chapter', 'School', 'Status', 'Post Date', 'Instagram Link', 'Engagement', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {posted.map((collab, i) => (
                    <tr key={collab.id} style={{ borderBottom: i < posted.length - 1 ? '1px solid #E5E7EB' : 'none', opacity: 0.75 }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>{collab.chapterName}</td>
                      <td style={{ padding: '12px 14px', fontSize: '0.8125rem', color: '#6b7280' }}>{collab.school || '—'}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusBadge label={collab.status} colors={COLLAB_STATUS_COLORS[collab.status]} />
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.8125rem', color: '#374151' }}>{collab.postDate ? formatDate(collab.postDate) : '—'}</td>
                      <td style={{ padding: '12px 14px' }}>
                        {collab.igLink ? (
                          <a href={collab.igLink} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#3b82f6', textDecoration: 'none' }}>
                            <ExternalLink size={11} /> View Post
                          </a>
                        ) : <span style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.8125rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {collab.likes ? `❤️ ${collab.likes}  💬 ${collab.comments || 0}` : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => openEdit(collab)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><Edit2 size={14} /></button>
                          <button onClick={() => remove(collab.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <Modal title={editingCollab ? 'Edit Chapter Collab' : 'New Chapter Collab'} onClose={() => { setShowForm(false); setEditingCollab(null); }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormRow label="Chapter Name *">
                <input autoFocus type="text" value={form.chapterName} onChange={e => setForm(f => ({ ...f, chapterName: e.target.value }))} placeholder="e.g. Alpha Beta Pi" style={inputStyle} />
              </FormRow>
              <FormRow label="School">
                <input type="text" value={form.school} onChange={e => setForm(f => ({ ...f, school: e.target.value }))} placeholder="e.g. University of Georgia" style={inputStyle} />
              </FormRow>
            </div>
            <FormRow label="Status">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as CollabStatus }))} style={selectStyle}>
                {COLLAB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormRow>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormRow label="Post Date">
                <input type="date" value={form.postDate} onChange={e => setForm(f => ({ ...f, postDate: e.target.value }))} style={inputStyle} />
              </FormRow>
              <FormRow label="Instagram Link">
                <input type="url" value={form.igLink} onChange={e => setForm(f => ({ ...f, igLink: e.target.value }))} placeholder="https://instagram.com/p/..." style={inputStyle} />
              </FormRow>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormRow label="Likes">
                <input type="number" value={form.likes || 0} onChange={e => setForm(f => ({ ...f, likes: parseInt(e.target.value) || 0 }))} style={inputStyle} />
              </FormRow>
              <FormRow label="Comments">
                <input type="number" value={form.comments || 0} onChange={e => setForm(f => ({ ...f, comments: parseInt(e.target.value) || 0 }))} style={inputStyle} />
              </FormRow>
            </div>
            <FormRow label="Notes">
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any context..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </FormRow>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setEditingCollab(null); }} style={{ padding: '8px 16px', background: '#F9FAFB', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.875rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submit} disabled={!form.chapterName.trim()} style={{ padding: '8px 20px', background: form.chapterName.trim() ? '#0F172A' : '#e5e7eb', color: form.chapterName.trim() ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600, cursor: form.chapterName.trim() ? 'pointer' : 'default' }}>
                {editingCollab ? 'Update' : 'Add Collab'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab 4: Campaigns ─────────────────────────────────────────────────────────

function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState<Omit<Campaign, 'id'>>({
    name: '', startDate: '', endDate: '', platforms: ['Instagram'],
    plannedPieces: 0, publishedPieces: 0, status: 'Planning', notes: '',
  });

  useEffect(() => {
    try { const s = localStorage.getItem('tb_studio_campaigns'); if (s) setCampaigns(JSON.parse(s)); } catch {}
  }, []);

  const save = useCallback((next: Campaign[]) => {
    setCampaigns(next);
    localStorage.setItem('tb_studio_campaigns', JSON.stringify(next));
  }, []);

  function openAdd() {
    setForm({ name: '', startDate: '', endDate: '', platforms: ['Instagram'], plannedPieces: 0, publishedPieces: 0, status: 'Planning', notes: '' });
    setEditingCampaign(null);
    setShowForm(true);
  }

  function openEdit(campaign: Campaign) {
    setForm({ name: campaign.name, startDate: campaign.startDate, endDate: campaign.endDate, platforms: campaign.platforms, plannedPieces: campaign.plannedPieces, publishedPieces: campaign.publishedPieces, status: campaign.status, notes: campaign.notes || '' });
    setEditingCampaign(campaign);
    setShowForm(true);
  }

  function submit() {
    if (!form.name.trim()) return;
    if (editingCampaign) {
      save(campaigns.map(c => c.id === editingCampaign.id ? { ...c, ...form } : c));
    } else {
      save([...campaigns, { id: uid(), ...form }]);
    }
    setShowForm(false);
    setEditingCampaign(null);
  }

  function remove(id: string) {
    save(campaigns.filter(c => c.id !== id));
  }

  function togglePlatform(platform: Platform) {
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(platform)
        ? f.platforms.filter(p => p !== platform)
        : [...f.platforms, platform],
    }));
  }

  const active = campaigns.filter(c => c.status === 'Active');
  const others = campaigns.filter(c => c.status !== 'Active');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
          Social and content marketing campaigns. Not sales — creative pushes, launch weeks, awareness.
        </p>
        <button onClick={openAdd} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', background: '#0F172A', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
        }}>
          <Plus size={15} /> New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
          <Megaphone size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ margin: 0, fontWeight: 500 }}>No campaigns yet. Create your first marketing campaign!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[...active, ...others].map(campaign => {
            const progress = campaign.plannedPieces > 0
              ? Math.round((campaign.publishedPieces / campaign.plannedPieces) * 100)
              : 0;
            const statusColors = CAMPAIGN_STATUS_COLORS[campaign.status];
            return (
              <div key={campaign.id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 4, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>{campaign.name}</h3>
                      <StatusBadge label={campaign.status} colors={statusColors} />
                    </div>
                    {(campaign.startDate || campaign.endDate) && (
                      <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={12} />
                        {campaign.startDate ? formatDate(campaign.startDate) : '?'} → {campaign.endDate ? formatDate(campaign.endDate) : '?'}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => openEdit(campaign)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><Edit2 size={14} /></button>
                    <button onClick={() => remove(campaign.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}><Trash2 size={14} /></button>
                  </div>
                </div>

                {/* Platforms */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  {campaign.platforms.map(p => <PlatformBadge key={p} platform={p} />)}
                </div>

                {/* Progress */}
                {campaign.plannedPieces > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280', marginBottom: 4 }}>
                      <span>Content Progress</span>
                      <span>{campaign.publishedPieces} / {campaign.plannedPieces} published ({progress}%)</span>
                    </div>
                    <div style={{ height: 6, background: '#F3F4F6', borderRadius: 9999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(progress, 100)}%`, background: progress === 100 ? '#10B981' : '#3B82F6', borderRadius: 9999, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )}

                {campaign.notes && (
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6b7280', lineHeight: 1.5, background: '#F9FAFB', borderRadius: 8, padding: '8px 10px' }}>{campaign.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <Modal title={editingCampaign ? 'Edit Campaign' : 'New Campaign'} onClose={() => { setShowForm(false); setEditingCampaign(null); }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormRow label="Campaign Name *">
              <input autoFocus type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Spring Rush Push" style={inputStyle} />
            </FormRow>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormRow label="Start Date">
                <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} style={inputStyle} />
              </FormRow>
              <FormRow label="End Date">
                <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} style={inputStyle} />
              </FormRow>
            </div>
            <FormRow label="Platforms">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {PLATFORMS.map(p => {
                  const selected = form.platforms.includes(p);
                  const { bg, color } = PLATFORM_COLORS[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      style={{
                        padding: '4px 10px', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 600,
                        border: '1px solid', cursor: 'pointer',
                        background: selected ? bg : '#fff',
                        color: selected ? color : '#9ca3af',
                        borderColor: selected ? color : '#E5E7EB',
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </FormRow>
            <FormRow label="Status">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as CampaignStatus }))} style={selectStyle}>
                {CAMPAIGN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormRow>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormRow label="Planned Pieces">
                <input type="number" value={form.plannedPieces} onChange={e => setForm(f => ({ ...f, plannedPieces: parseInt(e.target.value) || 0 }))} style={inputStyle} />
              </FormRow>
              <FormRow label="Published Pieces">
                <input type="number" value={form.publishedPieces} onChange={e => setForm(f => ({ ...f, publishedPieces: parseInt(e.target.value) || 0 }))} style={inputStyle} />
              </FormRow>
            </div>
            <FormRow label="Notes (optional)">
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Goals, strategy, context..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </FormRow>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setEditingCampaign(null); }} style={{ padding: '8px 16px', background: '#F9FAFB', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.875rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submit} disabled={!form.name.trim()} style={{ padding: '8px 20px', background: form.name.trim() ? '#0F172A' : '#e5e7eb', color: form.name.trim() ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600, cursor: form.name.trim() ? 'pointer' : 'default' }}>
                {editingCampaign ? 'Update Campaign' : 'Create Campaign'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'assets' | 'calendar' | 'collabs' | 'campaigns';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'assets',    label: 'Asset Library',    icon: <FolderOpen size={16} /> },
  { id: 'calendar',  label: 'Content Calendar', icon: <Calendar   size={16} /> },
  { id: 'collabs',   label: 'Chapter Collabs',  icon: <Users      size={16} /> },
  { id: 'campaigns', label: 'Campaigns',         icon: <Megaphone  size={16} /> },
];

export default function CreativeStudioPage() {
  const [activeTab, setActiveTab] = useState<Tab>('assets');

  return (
    <div className="module-page">
      {/* Header */}
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#ede9fe', color: '#7c3aed' }}>
              <Palette size={24} />
            </div>
            <div>
              <h1>Creative Studio</h1>
              <p>Marketing command center — assets, content calendar, chapter collabs, and campaigns</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '0.25rem', marginBottom: '1.5rem',
          borderBottom: '1px solid #E5E7EB', overflowX: 'auto',
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 16px', border: 'none', cursor: 'pointer',
                background: 'none', fontSize: '0.875rem', fontWeight: 600,
                color: activeTab === tab.id ? '#0F172A' : '#6b7280',
                borderBottom: `2px solid ${activeTab === tab.id ? '#0F172A' : 'transparent'}`,
                marginBottom: '-1px', whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'assets'    && <AssetLibrary />}
        {activeTab === 'calendar'  && <ContentCalendar />}
        {activeTab === 'collabs'   && <ChapterCollabs />}
        {activeTab === 'campaigns' && <Campaigns />}
      </main>
    </div>
  );
}
