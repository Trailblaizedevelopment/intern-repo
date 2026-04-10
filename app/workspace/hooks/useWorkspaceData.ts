'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase, Employee } from '@/lib/supabase';

export interface EmployeeTask {
  id: string;
  employee_id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'done';
  due_date: string | null;
  ticket_id?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PersonalLead {
  id: string;
  employee_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  lead_type: 'alumni' | 'chapter' | 'sponsor' | 'other';
  status: 'new' | 'contacted' | 'responding' | 'meeting_set' | 'converted' | 'lost';
  notes: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PortalMessage {
  id: string;
  subject: string;
  sender_name?: string;
  sent_at: string;
  is_read: boolean;
}

export interface WorkspaceStats {
  openTasks: number;
  overdueTasks: number;
  completedTasks: number;
  activeLeads: number;
  unreadMessages: number;
  needsFollowUp: number;
}

export interface UseWorkspaceDataReturn {
  currentEmployee: Employee | null;
  tasks: EmployeeTask[];
  leads: PersonalLead[];
  messages: PortalMessage[];
  teamMembers: Employee[];
  stats: WorkspaceStats;
  loading: boolean;
  tasksLoading: boolean;
  leadsLoading: boolean;
  error: string | null;
  refreshTasks: () => Promise<void>;
  refreshLeads: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  createTask: (task: Partial<EmployeeTask>) => Promise<EmployeeTask | null>;
  updateTask: (taskId: string, updates: Partial<EmployeeTask>) => Promise<EmployeeTask | null>;
  toggleTask: (task: EmployeeTask) => Promise<void>;
  deleteTask: (taskId: string) => Promise<boolean>;
  createLead: (lead: Partial<PersonalLead>) => Promise<PersonalLead | null>;
  updateLead: (leadId: string, updates: Partial<PersonalLead>) => Promise<PersonalLead | null>;
  updateLeadStatus: (lead: PersonalLead, status: PersonalLead['status']) => Promise<void>;
  deleteLead: (leadId: string) => Promise<boolean>;
  setViewAsEmployee: (employee: Employee | null) => void;
  viewAsEmployee: Employee | null;
}

/**
 * Hook to manage all workspace data fetching and mutations
 * Uses API routes for CRUD operations with optimistic updates
 */
export function useWorkspaceData(): UseWorkspaceDataReturn {
  const { user, profile } = useAuth();
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [viewAsEmployee, setViewAsEmployee] = useState<Employee | null>(null);
  const [tasks, setTasks] = useState<EmployeeTask[]>([]);
  const [leads, setLeads] = useState<PersonalLead[]>([]);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [teamMembers, setTeamMembers] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track if component is mounted for async operations
  const isMounted = useRef(true);

  // The active employee (either current user or "view as" employee for founders)
  const activeEmployee = viewAsEmployee || currentEmployee;

  // Fetch employee data
  const fetchEmployeeData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Find employee by auth user email
      const res = await fetch(`/api/employees?email=${encodeURIComponent(user.email ?? '')}`);
      const result = await res.json();
      let data = result.data?.[0] ?? null;

      if (!data) {
        // Fallback: get first active employee (demo mode)
        const fallbackRes = await fetch('/api/employees?status=active');
        const fallbackResult = await fallbackRes.json();
        data = fallbackResult.data?.[0] ?? null;
      }

      if (data && isMounted.current) {
        setCurrentEmployee(data);
      }
    } catch (err) {
      console.error('Error fetching employee:', err);
      if (isMounted.current) {
        setError('Failed to load employee data');
      }
    }
    if (isMounted.current) {
      setLoading(false);
    }
  }, [user]);

  // Fetch team members (for founders to switch views)
  const fetchTeamMembers = useCallback(async () => {
    if (profile?.role !== 'founder' && profile?.role !== 'cofounder') return;

    const res = await fetch('/api/employees?status=active');
    const result = await res.json();
    if (isMounted.current) {
      setTeamMembers(result.data || []);
    }
  }, [profile?.role]);

  // ============================================
  // TASKS CRUD OPERATIONS
  // ============================================

  // Fetch tasks for active employee
  const fetchTasks = useCallback(async () => {
    if (!activeEmployee) return;
    
    setTasksLoading(true);
    try {
      const response = await fetch(`/api/workspace/tasks?employee_id=${activeEmployee.id}`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Error fetching tasks:', result.error);
        setError(result.error.message);
      } else if (isMounted.current) {
        setTasks(result.data || []);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
      if (isMounted.current) {
        setError('Failed to load tasks');
      }
    } finally {
      if (isMounted.current) {
        setTasksLoading(false);
      }
    }
  }, [activeEmployee]);

  // Create a new task
  const createTask = async (task: Partial<EmployeeTask>): Promise<EmployeeTask | null> => {
    if (!activeEmployee) return null;

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const optimisticTask: EmployeeTask = {
      id: tempId,
      employee_id: activeEmployee.id,
      title: task.title || '',
      description: task.description || null,
      priority: task.priority || 'medium',
      status: task.status || 'todo',
      category: task.category || null,
      due_date: task.due_date || null,
      created_at: new Date().toISOString(),
    };
    
    setTasks(prev => [optimisticTask, ...prev]);

    try {
      const response = await fetch('/api/workspace/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: activeEmployee.id,
          title: task.title,
          description: task.description,
          priority: task.priority || 'medium',
          status: task.status || 'todo',
          category: task.category,
          due_date: task.due_date,
        }),
      });

      const result = await response.json();
      
      if (result.error) {
        // Revert optimistic update
        setTasks(prev => prev.filter(t => t.id !== tempId));
        setError(result.error.message);
        return null;
      }

      // Replace temp task with real one
      if (isMounted.current) {
        setTasks(prev => prev.map(t => t.id === tempId ? result.data : t));
      }
      return result.data;
    } catch (err) {
      console.error('Error creating task:', err);
      setTasks(prev => prev.filter(t => t.id !== tempId));
      setError('Failed to create task');
      return null;
    }
  };

  // Update a task
  const updateTask = async (taskId: string, updates: Partial<EmployeeTask>): Promise<EmployeeTask | null> => {
    // Store original for rollback
    const originalTask = tasks.find(t => t.id === taskId);
    if (!originalTask) return null;

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));

    try {
      const response = await fetch(`/api/workspace/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const result = await response.json();
      
      if (result.error) {
        // Revert optimistic update
        setTasks(prev => prev.map(t => t.id === taskId ? originalTask : t));
        setError(result.error.message);
        return null;
      }

      // Update with server response
      if (isMounted.current) {
        setTasks(prev => prev.map(t => t.id === taskId ? result.data : t));
      }
      return result.data;
    } catch (err) {
      console.error('Error updating task:', err);
      setTasks(prev => prev.map(t => t.id === taskId ? originalTask : t));
      setError('Failed to update task');
      return null;
    }
  };

  // Toggle task status
  const toggleTask = async (task: EmployeeTask) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    await updateTask(task.id, { status: newStatus });
  };

  // Delete a task
  const deleteTask = async (taskId: string): Promise<boolean> => {
    // Store original for rollback
    const originalTasks = [...tasks];

    // Optimistic update
    setTasks(prev => prev.filter(t => t.id !== taskId));

    try {
      const response = await fetch(`/api/workspace/tasks/${taskId}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      
      if (result.error) {
        // Revert optimistic update
        setTasks(originalTasks);
        setError(result.error.message);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error deleting task:', err);
      setTasks(originalTasks);
      setError('Failed to delete task');
      return false;
    }
  };

  // ============================================
  // LEADS CRUD OPERATIONS
  // ============================================

  // Fetch leads for active employee
  const fetchLeads = useCallback(async () => {
    if (!activeEmployee) return;
    
    setLeadsLoading(true);
    try {
      const response = await fetch(`/api/workspace/leads?employee_id=${activeEmployee.id}`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Error fetching leads:', result.error);
        setError(result.error.message);
      } else if (isMounted.current) {
        setLeads(result.data || []);
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
      if (isMounted.current) {
        setError('Failed to load leads');
      }
    } finally {
      if (isMounted.current) {
        setLeadsLoading(false);
      }
    }
  }, [activeEmployee]);

  // Create a new lead
  const createLead = async (lead: Partial<PersonalLead>): Promise<PersonalLead | null> => {
    if (!activeEmployee) return null;

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const optimisticLead: PersonalLead = {
      id: tempId,
      employee_id: activeEmployee.id,
      name: lead.name || '',
      email: lead.email || null,
      phone: lead.phone || null,
      organization: lead.organization || null,
      lead_type: lead.lead_type || 'other',
      status: lead.status || 'new',
      notes: lead.notes || null,
      created_at: new Date().toISOString(),
    };
    
    setLeads(prev => [optimisticLead, ...prev]);

    try {
      const response = await fetch('/api/workspace/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: activeEmployee.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          organization: lead.organization,
          lead_type: lead.lead_type || 'other',
          status: lead.status || 'new',
          notes: lead.notes,
        }),
      });

      const result = await response.json();
      
      if (result.error) {
        // Revert optimistic update
        setLeads(prev => prev.filter(l => l.id !== tempId));
        setError(result.error.message);
        return null;
      }

      // Replace temp lead with real one
      if (isMounted.current) {
        setLeads(prev => prev.map(l => l.id === tempId ? result.data : l));
      }
      return result.data;
    } catch (err) {
      console.error('Error creating lead:', err);
      setLeads(prev => prev.filter(l => l.id !== tempId));
      setError('Failed to create lead');
      return null;
    }
  };

  // Update a lead
  const updateLead = async (leadId: string, updates: Partial<PersonalLead>): Promise<PersonalLead | null> => {
    // Store original for rollback
    const originalLead = leads.find(l => l.id === leadId);
    if (!originalLead) return null;

    // Optimistic update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...updates } : l));

    try {
      const response = await fetch(`/api/workspace/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const result = await response.json();
      
      if (result.error) {
        // Revert optimistic update
        setLeads(prev => prev.map(l => l.id === leadId ? originalLead : l));
        setError(result.error.message);
        return null;
      }

      // Update with server response
      if (isMounted.current) {
        setLeads(prev => prev.map(l => l.id === leadId ? result.data : l));
      }
      return result.data;
    } catch (err) {
      console.error('Error updating lead:', err);
      setLeads(prev => prev.map(l => l.id === leadId ? originalLead : l));
      setError('Failed to update lead');
      return null;
    }
  };

  // Update lead status (convenience method)
  const updateLeadStatus = async (lead: PersonalLead, status: PersonalLead['status']) => {
    await updateLead(lead.id, { status });
  };

  // Delete a lead
  const deleteLead = async (leadId: string): Promise<boolean> => {
    // Store original for rollback
    const originalLeads = [...leads];

    // Optimistic update
    setLeads(prev => prev.filter(l => l.id !== leadId));

    try {
      const response = await fetch(`/api/workspace/leads/${leadId}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      
      if (result.error) {
        // Revert optimistic update
        setLeads(originalLeads);
        setError(result.error.message);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error deleting lead:', err);
      setLeads(originalLeads);
      setError('Failed to delete lead');
      return false;
    }
  };

  // ============================================
  // MESSAGES
  // ============================================

  // Fetch messages for active employee (using existing portal_messages table)
  const fetchMessages = useCallback(async () => {
    if (!supabase || !activeEmployee) return;

    try {
      const { data } = await supabase
        .from('portal_messages')
        .select('*, sender:sender_id(name)')
        .eq('recipient_id', activeEmployee.id)
        .eq('is_read', false)
        .eq('is_draft', false)
        .order('sent_at', { ascending: false })
        .limit(10);
      
      if (isMounted.current) {
        setMessages(data?.map(m => ({
          ...m,
          sender_name: (m.sender as { name: string } | null)?.name || 'Unknown'
        })) || []);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  }, [activeEmployee]);

  // ============================================
  // REALTIME SUBSCRIPTIONS
  // ============================================

  useEffect(() => {
    if (!supabase || !activeEmployee) return;

    // Subscribe to task changes
    const tasksChannel = supabase
      .channel('workspace_tasks_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workspace_tasks',
          filter: `employee_id=eq.${activeEmployee.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks(prev => {
              // Avoid duplicates from optimistic updates
              if (prev.some(t => t.id === (payload.new as EmployeeTask).id)) return prev;
              return [payload.new as EmployeeTask, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            setTasks(prev => prev.map(t => 
              t.id === (payload.new as EmployeeTask).id ? payload.new as EmployeeTask : t
            ));
          } else if (payload.eventType === 'DELETE') {
            setTasks(prev => prev.filter(t => t.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe();

    // Subscribe to lead changes
    const leadsChannel = supabase
      .channel('workspace_leads_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workspace_leads',
          filter: `employee_id=eq.${activeEmployee.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setLeads(prev => {
              // Avoid duplicates from optimistic updates
              if (prev.some(l => l.id === (payload.new as PersonalLead).id)) return prev;
              return [payload.new as PersonalLead, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            setLeads(prev => prev.map(l => 
              l.id === (payload.new as PersonalLead).id ? payload.new as PersonalLead : l
            ));
          } else if (payload.eventType === 'DELETE') {
            setLeads(prev => prev.filter(l => l.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(tasksChannel);
        supabase.removeChannel(leadsChannel);
      }
    };
  }, [activeEmployee]);

  // ============================================
  // LIFECYCLE
  // ============================================

  // Initial data fetch
  useEffect(() => {
    fetchEmployeeData();
  }, [fetchEmployeeData]);

  // Fetch team members when employee is loaded
  useEffect(() => {
    if (currentEmployee) {
      fetchTeamMembers();
    }
  }, [currentEmployee, fetchTeamMembers]);

  // Fetch all data when active employee changes
  useEffect(() => {
    if (activeEmployee) {
      fetchTasks();
      fetchLeads();
      fetchMessages();
    }
  }, [activeEmployee, fetchTasks, fetchLeads, fetchMessages]);

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // ============================================
  // STATS
  // ============================================

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const stats: WorkspaceStats = {
    openTasks: tasks.filter(t => t.status !== 'done').length,
    overdueTasks: tasks.filter(t => t.due_date && new Date(t.due_date) < today && t.status !== 'done').length,
    completedTasks: tasks.filter(t => t.status === 'done').length,
    activeLeads: leads.filter(l => !['converted', 'lost'].includes(l.status)).length,
    unreadMessages: messages.length,
    needsFollowUp: leads.filter(l => l.status === 'contacted').length,
  };

  return {
    currentEmployee,
    tasks,
    leads,
    messages,
    teamMembers,
    stats,
    loading,
    tasksLoading,
    leadsLoading,
    error,
    refreshTasks: fetchTasks,
    refreshLeads: fetchLeads,
    refreshMessages: fetchMessages,
    createTask,
    updateTask,
    toggleTask,
    deleteTask,
    createLead,
    updateLead,
    updateLeadStatus,
    deleteLead,
    setViewAsEmployee,
    viewAsEmployee,
  };
}
