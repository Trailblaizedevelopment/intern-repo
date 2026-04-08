'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { ChevronRight, Edit2, User, AlertTriangle, Phone } from 'lucide-react';
import { Deal, DealStage, STAGE_CONFIG } from '@/lib/supabase';
import { getConferenceForDeal } from '@/lib/conference-map';
import { useToast } from '@/components/Toast';

/** Tree color by stage (family tree spec) */
const TREE_STAGE_COLORS: Partial<Record<DealStage, string>> = {
  closed_won: '#10b981',
  contract_sent: '#3b82f6',
  demo_booked: '#eab308',
  first_demo: '#eab308',
  second_call: '#eab308',
  lead: '#6b7280',
  closed_lost: '#9ca3af',
  hold_off: '#9ca3af',
};

function getTreeStageColor(stage: DealStage): string {
  return TREE_STAGE_COLORS[stage] ?? '#6b7280';
}

export type SchoolPipelineStatus = 'Active Client' | 'Pipeline' | 'IFC Pipeline' | 'New Target';

function getSchoolPipelineStatus(deals: Deal[]): SchoolPipelineStatus {
  const hasClosedWon = deals.some(d => d.stage === 'closed_won');
  const hasContractOrClosed = deals.some(d => ['contract_sent', 'closed_won'].includes(d.stage));
  const hasDemoStages = deals.some(d => ['demo_booked', 'first_demo', 'second_call'].includes(d.stage));
  if (hasClosedWon) return 'Active Client';
  if (hasContractOrClosed) return 'Pipeline';
  if (hasDemoStages) return 'IFC Pipeline';
  return 'New Target';
}

/** Abbreviated stage labels for mobile */
const MOBILE_STAGE_LABELS: Partial<Record<string, string>> = {
  'Pipeline': 'PIPE',
  'IFC Pipeline': 'IFC',
  'New Target': 'NEW',
  'Active Client': 'ACTIVE',
};

/** Check if any deal in a set has an overdue follow-up */
function hasOverdueFollowups(deals: Deal[]): boolean {
  const now = new Date();
  return deals.some(d => d.next_followup && new Date(d.next_followup) < now);
}

interface TreeChapter {
  key: string;
  name: string;
  deals: Deal[];
}

interface TreeSchool {
  key: string;
  name: string;
  chapters: Map<string, TreeChapter>;
  deals: Deal[];
}

interface TreeConference {
  key: string;
  name: string;
  schools: Map<string, TreeSchool>;
  deals: Deal[];
}

function buildTree(deals: Deal[]): Map<string, TreeConference> {
  const byConference = new Map<string, TreeConference>();
  for (const deal of deals) {
    const confName = getConferenceForDeal(deal);
    if (!byConference.has(confName)) {
      byConference.set(confName, { key: `conf-${confName}`, name: confName, schools: new Map(), deals: [] });
    }
    const conf = byConference.get(confName)!;
    conf.deals.push(deal);

    const schoolName = deal.organization?.trim() || 'Unknown School';
    if (!conf.schools.has(schoolName)) {
      conf.schools.set(schoolName, { key: `school-${schoolName}`, name: schoolName, chapters: new Map(), deals: [] });
    }
    const school = conf.schools.get(schoolName)!;
    school.deals.push(deal);

    const chapterName = deal.fraternity?.trim() || 'Unknown Chapter';
    if (!school.chapters.has(chapterName)) {
      school.chapters.set(chapterName, { key: `chapter-${schoolName}-${chapterName}`, name: chapterName, deals: [] });
    }
    const chapter = school.chapters.get(chapterName)!;
    chapter.deals.push(deal);
  }
  return byConference;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

/** Detect mobile viewport for accordion behavior */
function useIsMobile(breakpoint = 1024): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

interface PipelineTreeViewProps {
  deals: Deal[];
  onEditDeal: (deal: Deal) => void;
  onCallDeal?: (deal: Deal) => void;
  onStageChanged?: () => void;
  filterStage: DealStage | 'all';
  filterConference: string;
  filterSchool: string;
  filterDateFrom: string;
  searchQuery: string;
}

export default function PipelineTreeView({
  deals,
  onEditDeal,
  onCallDeal,
  onStageChanged,
  filterStage,
  filterConference,
  filterSchool,
  filterDateFrom,
  searchQuery,
}: PipelineTreeViewProps) {
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [stageDropdownDeal, setStageDropdownDeal] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const filteredDeals = useMemo(() => {
    let list = deals.filter(d => d.stage !== 'closed_lost');
    if (filterStage !== 'all') list = list.filter(d => d.stage === filterStage);
    if (filterConference) list = list.filter(d => getConferenceForDeal(d) === filterConference);
    if (filterSchool) list = list.filter(d => (d.organization?.trim() || '').toLowerCase() === filterSchool.toLowerCase());
    if (filterDateFrom) list = list.filter(d => d.created_at && d.created_at >= filterDateFrom);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        d =>
          (d.organization?.toLowerCase().includes(q)) ||
          (d.fraternity?.toLowerCase().includes(q)) ||
          (d.contact_name?.toLowerCase().includes(q)) ||
          (d.name?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [deals, filterStage, filterConference, filterSchool, filterDateFrom, searchQuery]);

  const tree = useMemo(() => buildTree(filteredDeals), [filteredDeals]);

  const stats = useMemo(() => {
    const schools = new Set(filteredDeals.map(d => d.organization?.trim()).filter(Boolean));
    const chapters = new Set(filteredDeals.map(d => `${d.organization?.trim() || ''}|${d.fraternity?.trim() || ''}`));
    const pipelineValue = filteredDeals
      .filter(d => !['closed_won', 'hold_off'].includes(d.stage))
      .reduce((s, d) => s + (Number(d.value) || 0), 0);
    const closedArr = filteredDeals
      .filter(d => d.stage === 'closed_won')
      .reduce((s, d) => s + (Number(d.value) || 0), 0);
    const totalDeals = filteredDeals.length;
    const closedCount = filteredDeals.filter(d => d.stage === 'closed_won').length;
    const closeRate = totalDeals ? Math.round((closedCount / totalDeals) * 100) : 0;
    return {
      schools: schools.size,
      chapters: chapters.size,
      pipelineValue,
      closedArr,
      closeRate,
    };
  }, [filteredDeals]);

  /** Toggle with accordion behavior on mobile for conferences */
  const toggleConference = useCallback((confId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(confId)) {
        // Collapse this conference and all its children
        next.delete(confId);
        // Remove all school/chapter keys under this conference
        for (const key of prev) {
          if (key.startsWith('school-') || key.startsWith('chapter-')) {
            // We need to check if the school/chapter belongs to this conference
            // For simplicity, just keep them — they won't render since parent is collapsed
          }
        }
      } else {
        if (isMobile) {
          // Accordion: collapse all other conferences first
          for (const key of prev) {
            if (key.startsWith('conf-')) {
              next.delete(key);
            }
          }
        }
        next.add(confId);
      }
      return next;
    });
  }, [isMobile]);

  const toggleSchool = useCallback((schoolId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(schoolId)) {
        next.delete(schoolId);
      } else {
        next.add(schoolId);
      }
      return next;
    });
  }, []);

  const toggleChapter = useCallback((chapterId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }, []);

  async function changeStageInline(dealId: string, newStage: DealStage) {
    setStageDropdownDeal(null);
    const res = await fetch(`/api/pipeline/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    });

    if (!res.ok) {
      showToast('Failed to update stage. Please try again.', 'error');
    } else {
      showToast(`Stage updated to ${STAGE_CONFIG[newStage]?.label}`, 'success');
      onStageChanged?.();
    }
  }

  const conferenceNames = useMemo(() => Array.from(tree.keys()).sort().reverse(), [tree]);
  const hasExpandedDefault = useRef(false);
  useEffect(() => {
    if (conferenceNames.length > 0 && !hasExpandedDefault.current) {
      hasExpandedDefault.current = true;
      setExpanded(prev => {
        const next = new Set(prev);
        if (isMobile) {
          // On mobile, expand only the first conference by default
          next.add(`conf-${conferenceNames[0]}`);
        } else {
          conferenceNames.forEach(c => next.add(`conf-${c}`));
        }
        return next;
      });
    }
  }, [conferenceNames, isMobile]);

  return (
    <div className="pipeline-tree-view">
      <div className="pipeline-tree-stats">
        <div className="pipeline-tree-stat-card">
          <span className="pipeline-tree-stat-value">{stats.schools}</span>
          <span className="pipeline-tree-stat-label">Schools</span>
        </div>
        <div className="pipeline-tree-stat-card">
          <span className="pipeline-tree-stat-value">{stats.chapters}</span>
          <span className="pipeline-tree-stat-label">Chapters</span>
        </div>
        <div className="pipeline-tree-stat-card">
          <span className="pipeline-tree-stat-value">{formatCurrency(stats.pipelineValue)}</span>
          <span className="pipeline-tree-stat-label">Pipeline</span>
        </div>
        <div className="pipeline-tree-stat-card pipeline-tree-stat-card-highlight">
          <span className="pipeline-tree-stat-value">{formatCurrency(stats.closedArr)}</span>
          <span className="pipeline-tree-stat-label">Closed ARR</span>
        </div>
        <div className="pipeline-tree-stat-card pipeline-tree-stat-card-closerate">
          <span className="pipeline-tree-stat-value">{stats.closeRate}%</span>
          <span className="pipeline-tree-stat-label">Close Rate</span>
        </div>
      </div>

      <div className="pipeline-tree-nodes">
        {conferenceNames.length === 0 ? (
          <div className="pipeline-tree-empty">
            <p>No deals match the current filters.</p>
          </div>
        ) : (
          <div className="pipeline-tree-list">
            {conferenceNames.map(confName => {
              const conf = tree.get(confName)!;
              const confId = conf.key;
              const isConfOpen = expanded.has(confId);
              const schoolCount = conf.schools.size;
              const totalChapters = Array.from(conf.schools.values()).reduce((s, sch) => s + sch.chapters.size, 0);
              const confArr = conf.deals.filter(d => d.stage === 'closed_won').reduce((s, d) => s + (Number(d.value) || 0), 0);
              const confOverdue = hasOverdueFollowups(conf.deals);

              return (
                <div key={confId} className="pipeline-tree-branch pipeline-tree-branch-conference">
                  <button
                    type="button"
                    className="pipeline-tree-node pipeline-tree-node-conference"
                    onClick={() => toggleConference(confId)}
                  >
                    <span className={`pipeline-tree-chevron ${isConfOpen ? 'rotated' : ''}`}>
                      <ChevronRight size={18} />
                    </span>
                    <span className="pipeline-tree-node-main">
                      <span className="pipeline-tree-node-label">{conf.name}</span>
                      <span className="pipeline-tree-node-badges">
                        <span className="pipeline-tree-badge">{schoolCount} schools</span>
                        <span className="pipeline-tree-badge">{totalChapters} chapters</span>
                        <span className="pipeline-tree-badge pipeline-tree-badge-arr">{formatCurrency(confArr)} ARR</span>
                        {confOverdue && (
                          <span className="pipeline-tree-badge pipeline-tree-badge-warning" title="Has overdue follow-ups">
                            <AlertTriangle size={11} />
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                  {isConfOpen && (
                    <div className="pipeline-tree-children pipeline-tree-children-school">
                      {Array.from(conf.schools.entries())
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([, school]) => {
                          const schoolId = school.key;
                          const isSchoolOpen = expanded.has(schoolId);
                          const schoolStatus = getSchoolPipelineStatus(school.deals);
                          const schoolArr = school.deals.filter(d => d.stage === 'closed_won').reduce((s, d) => s + (Number(d.value) || 0), 0);
                          const isSchoolActive = schoolStatus === 'Active Client';
                          const statusLabel = isMobile
                            ? (MOBILE_STAGE_LABELS[schoolStatus] ?? schoolStatus.toUpperCase())
                            : schoolStatus.toUpperCase();

                          return (
                            <div key={schoolId} className="pipeline-tree-branch pipeline-tree-branch-school">
                              <button
                                type="button"
                                className={`pipeline-tree-node pipeline-tree-node-school ${isSchoolActive ? 'pipeline-tree-node-school-active' : ''}`}
                                onClick={() => toggleSchool(schoolId)}
                              >
                                <span className={`pipeline-tree-chevron ${isSchoolOpen ? 'rotated' : ''}`}>
                                  <ChevronRight size={16} />
                                </span>
                                <span className="pipeline-tree-node-main">
                                  <span className="pipeline-tree-node-label">{school.name}</span>
                                  <span className={`pipeline-tree-status pipeline-tree-status-${schoolStatus.replace(/\s+/g, '-').toLowerCase()}`}>
                                    {statusLabel}
                                  </span>
                                  {schoolArr > 0 && (
                                    <span className="pipeline-tree-node-value">{formatCurrency(schoolArr)} ARR</span>
                                  )}
                                  <span className="pipeline-tree-badge pipeline-tree-badge-count">{school.chapters.size} ch</span>
                                </span>
                              </button>
                              {isSchoolOpen && (
                                <div className="pipeline-tree-children pipeline-tree-children-chapter">
                                  {Array.from(school.chapters.entries())
                                    .sort(([a], [b]) => a.localeCompare(b))
                                    .map(([, chapter]) => {
                                      const chapterId = chapter.key;
                                      const isChapterOpen = expanded.has(chapterId);
                                      const primaryDeal = chapter.deals[0];
                                      const stage = primaryDeal?.stage ?? 'lead';
                                      const color = getTreeStageColor(stage);
                                      const value = chapter.deals.reduce((s, d) => s + (Number(d.value) || 0), 0);
                                      const isClosed = stage === 'closed_won';

                                      return (
                                        <div key={chapterId} className="pipeline-tree-branch pipeline-tree-branch-chapter">
                                          <button
                                            type="button"
                                            className={`pipeline-tree-node pipeline-tree-node-chapter ${isClosed ? 'pipeline-tree-node-chapter-closed' : ''}`}
                                            style={{ ['--stage-color' as string]: color }}
                                            onClick={() => toggleChapter(chapterId)}
                                          >
                                            <span className={`pipeline-tree-chevron ${isChapterOpen ? 'rotated' : ''}`}>
                                              <ChevronRight size={14} />
                                            </span>
                                            <span className="pipeline-tree-node-main">
                                              <span className="pipeline-tree-node-label">{chapter.name}</span>
                                              <span className="pipeline-tree-stage-badge" style={!isClosed ? { backgroundColor: `${color}20`, color } : undefined}>
                                                {STAGE_CONFIG[stage]?.label ?? stage}
                                              </span>
                                              {value > 0 && <span className="pipeline-tree-node-value">{formatCurrency(value)}</span>}
                                              <span className="pipeline-tree-badge pipeline-tree-badge-count">{chapter.deals.length} leads</span>
                                            </span>
                                          </button>
                                          {isChapterOpen && (
                                            <div className="pipeline-tree-children pipeline-tree-children-contact">
                                              {chapter.deals.map(deal => (
                                                <div
                                                  key={deal.id}
                                                  className="pipeline-tree-node pipeline-tree-node-contact"
                                                  style={{ ['--stage-color' as string]: getTreeStageColor(deal.stage) }}
                                                >
                                                  <span className="pipeline-tree-chevron pipeline-tree-chevron-placeholder" />
                                                  <span className="pipeline-tree-node-main">
                                                    <User size={14} className="pipeline-tree-contact-icon" />
                                                    <span className="pipeline-tree-node-label">{deal.contact_name || deal.name}</span>
                                                    {deal.expected_close && (
                                                      <span className="pipeline-tree-stage-badge pipeline-tree-stage-badge-date">
                                                        Estimated Close: {deal.expected_close}
                                                      </span>
                                                    )}
                                                    <span
                                                      className="pipeline-tree-stage-badge pipeline-tree-stage-badge-clickable"
                                                      style={{
                                                        backgroundColor: deal.stage === 'closed_won' ? '#10b981' : `${getTreeStageColor(deal.stage)}30`,
                                                        color: deal.stage === 'closed_won' ? 'white' : getTreeStageColor(deal.stage),
                                                        cursor: 'pointer',
                                                        position: 'relative',
                                                      }}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setStageDropdownDeal(stageDropdownDeal === deal.id ? null : deal.id);
                                                      }}
                                                    >
                                                      {STAGE_CONFIG[deal.stage]?.label ?? deal.stage}
                                                    </span>
                                                    {stageDropdownDeal === deal.id && (
                                                      <div className="tree-stage-dropdown" onClick={e => e.stopPropagation()}>
                                                        {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
                                                          <button
                                                            key={key}
                                                            className={`tree-stage-option ${key === deal.stage ? 'active' : ''}`}
                                                            onClick={() => changeStageInline(deal.id, key as DealStage)}
                                                          >
                                                            {cfg.emoji} {cfg.label}
                                                          </button>
                                                        ))}
                                                      </div>
                                                    )}
                                                    {deal.phone && (
                                                      <button
                                                        type="button"
                                                        className="pipeline-tree-call-btn"
                                                        onClick={(e) => { e.stopPropagation(); onCallDeal?.(deal); }}
                                                        title="Call"
                                                      >
                                                        <Phone size={12} />
                                                      </button>
                                                    )}
                                                    <button
                                                      type="button"
                                                      className="pipeline-tree-edit-btn"
                                                      onClick={(e) => { e.stopPropagation(); onEditDeal(deal); }}
                                                      title="Edit in CRM"
                                                    >
                                                      <Edit2 size={14} />
                                                      <span>Edit</span>
                                                    </button>
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
