/** Frontend mirror of the shapes returned by the backend proxy. */

export interface CountBucket {
  key: string;
  count: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  state: string;
  lastUpdateTime: string | null;
}

export interface WorkItemSummary {
  id: number;
  title: string;
  state: string;
  type: string;
  project: string;
  assignedTo: string;
  iterationPath: string;
  storyPoints: number | null;
  tags: string[];
}

export interface WorkItemsReport {
  total: number;
  byState: CountBucket[];
  byType: CountBucket[];
  byAssignee: CountBucket[];
  byProject: CountBucket[];
  storyPointsByState: CountBucket[];
  items: WorkItemSummary[];
}

export interface Iteration {
  id: string;
  name: string;
  path: string;
  startDate: string | null;
  finishDate: string | null;
  timeFrame: string;
}

export interface SprintVelocity {
  iterationName: string;
  iterationPath: string;
  startDate: string | null;
  finishDate: string | null;
  planned: number;
  completed: number;
  incomplete: number;
}

export interface VelocityReport {
  project: string;
  team: string;
  sprints: SprintVelocity[];
  averageVelocity: number;
}

export interface ProjectVelocity {
  project: string;
  team: string;
  averageVelocity: number;
  lastSprintName: string | null;
  lastSprintCompleted: number;
  lastSprintPlanned: number;
}

export interface VelocityOverview {
  projects: ProjectVelocity[];
  skipped: string[];
}

export interface SourceInfo {
  id: string;
  label: string;
  org: string;
  defaultProject: string;
  primary: boolean;
}

export interface Meta {
  id: string;
  label: string;
  org: string;
  defaultProject: string;
}

/* --------------------------- User stories by client --------------------------- */

export interface ClientStoryCount {
  client: string;
  open: number;
  resolved: number;
  total: number;
}

export interface MonthCount {
  month: string;
  count: number;
}

export interface MonthClientMatrix {
  months: string[];
  series: { client: string; data: number[] }[];
}

export interface UserStoriesReport {
  totalStories: number;
  totalOpen: number;
  totalResolved: number;
  byClient: ClientStoryCount[];
  finishedByMonth: MonthCount[];
  openByMonthByClient: MonthClientMatrix;
}
