export interface RoadmapTicket {
  id: string;
  number: number;
  title: string;
  description: string | null;
  type: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low' | 'none' | null;
  status: string | null;
  assignee_id: string | null;
  project: string | null;
  project_id: string | null;
  due_date: string | null;
  created_at: string;
  sprint: string | null;
  labels: string[] | null;
  // Computed
  barStart: string; // YYYY-MM-DD
  barEnd: string;   // YYYY-MM-DD
}

export interface RoadmapProject {
  id: string;
  name: string;
  status: string | null;
}

export interface Employee {
  id: string;
  name: string;
}

export interface Filters {
  sprint: 'all' | 'sprint1' | 'sprint2';
  priority: string[];
  projectIds: string[];
  assigneeId: string;
}

export type SortKey = 'number' | 'title' | 'project' | 'priority' | 'status' | 'sprint' | 'due_date' | 'assignee';
export type SortDir = 'asc' | 'desc';
