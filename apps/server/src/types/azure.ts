/** Shared shapes for the Azure DevOps data we expose to the frontend. */

export interface WorkItemFields {
  'System.Id': number;
  'System.Title': string;
  'System.State': string;
  'System.WorkItemType': string;
  'System.AssignedTo'?: { displayName: string; uniqueName: string } | string;
  'System.IterationPath'?: string;
  'System.Tags'?: string;
  'Microsoft.VSTS.Scheduling.StoryPoints'?: number;
  'System.CreatedDate'?: string;
  'System.ChangedDate'?: string;
  [key: string]: unknown;
}

export interface WorkItem {
  id: number;
  url: string;
  fields: WorkItemFields;
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

export interface CountBucket {
  key: string;
  count: number;
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
  timeFrame: 'past' | 'current' | 'future' | string;
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

/** One row per project for the organization-wide velocity comparison. */
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
  /** Projects skipped because they have no team iterations or errored. */
  skipped: string[];
}

/* --------------------------- User stories by client --------------------------- */

export interface ClientStoryCount {
  client: string;
  open: number;
  resolved: number;
  total: number;
}

/** A single work item row for the detail listings (open stories, bugs). */
export interface StoryListItem {
  id: number;
  client: string;
  title: string;
  type: string;
  createdDate: string | null;
  createdBy: string;
  state: string;
  /** Whether the item is flagged urgent (see UserStoriesConfig.urgentField). */
  urgent: boolean;
  /** Scheduled delivery date (ISO), used for the traffic-light indicator. */
  scheduledDate: string | null;
}

export interface MonthCount {
  /** ISO month, e.g. "2026-08". */
  month: string;
  count: number;
}

/** Months on the x-axis, one stacked series per client. `data` aligns to `months`. */
export interface MonthClientMatrix {
  months: string[];
  series: { client: string; data: number[] }[];
}

/**
 * Clients on the axis, one stacked series per "Tipo". `data` aligns to `clients`.
 * Clients are sorted by total volume (descending).
 */
export interface ClientTypeMatrix {
  clients: string[];
  series: { type: string; data: number[] }[];
}

export interface UserStoriesReport {
  totalStories: number;
  totalOpen: number;
  totalResolved: number;
  /** Non-removed stories flagged urgent (see UserStoriesConfig.urgentField). */
  totalUrgent: number;
  /** Count of Bug-type work items in the source's project scope. */
  totalBugs: number;
  byClient: ClientStoryCount[];
  finishedByMonth: MonthCount[];
  openByMonthByClient: MonthClientMatrix;
  /** Client × Tipo breakdown over open US + Bugs (for "Requerimientos por cliente"). */
  byClientByType: ClientTypeMatrix;
  /** Open (non-resolved, non-removed) user stories, newest first. */
  openStories: StoryListItem[];
  /** Bug-type work items in scope, newest first. */
  bugs: StoryListItem[];
}
