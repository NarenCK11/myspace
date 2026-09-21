export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type Priority = "low" | "medium" | "high" | "urgent";
export type ReminderStatus = "pending" | "done" | "dismissed";
export type RepeatRule = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type Theme = "light" | "dark" | "system";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: { field: string; message: string }[];
  };
}

export interface User {
  id: string;
  login_id: string;
  display_name: string;
  email: string | null;
  timezone: string;
  theme: Theme;
  week_starts_on: number;
  created_at: string;
  last_login_at: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface SessionInfo {
  id: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  user_agent: string | null;
  ip_address: string | null;
  is_current: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  description: string | null;
  created_at: string;
}

export interface TagWithCount extends Tag {
  task_count: number;
  note_count: number;
  reminder_count: number;
  activity_count: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  due_at: string | null;
  start_at: string | null;
  all_day: boolean;
  completed_at: string | null;
  estimate_minutes: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

export interface Reminder {
  id: string;
  title: string;
  notes: string | null;
  remind_at: string;
  status: ReminderStatus;
  repeat_rule: RepeatRule;
  completed_at: string | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

export interface Note {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  is_important: boolean;
  is_archived: boolean;
  color: string;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

export interface Activity {
  id: string;
  title: string;
  description: string | null;
  occurred_at: string;
  duration_minutes: number | null;
  source: "manual" | "system";
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  tags: Tag[];
}

export type CalendarItemKind = "google_event" | "task" | "reminder" | "activity";

export interface CalendarItem {
  id: string;
  kind: CalendarItemKind;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  url: string | null;
  color: string | null;
  status: string | null;
  calendar_id: string | null;
  calendar_name: string | null;
  source_id: string | null;
}

export interface CalendarFeed {
  start: string;
  end: string;
  items: CalendarItem[];
  google_connected: boolean;
  google_configured: boolean;
  last_synced_at: string | null;
}

export interface GoogleCalendarInfo {
  id: string;
  calendar_id: string;
  summary: string;
  description: string | null;
  time_zone: string | null;
  background_color: string | null;
  foreground_color: string | null;
  is_primary: boolean;
  is_enabled: boolean;
  access_role: string | null;
}

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  scopes: string[];
  connected_at: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  cached_event_count: number;
  calendars: GoogleCalendarInfo[];
}

export interface GoogleSyncResult {
  synced_at: string;
  calendars_synced: number;
  events_upserted: number;
  events_removed: number;
  window_start: string;
  window_end: string;
}

export interface TaskStats {
  total: number;
  open: number;
  completed_today: number;
  due_today: number;
  overdue: number;
  completed_this_week: number;
}

export interface DashboardCounts {
  tasks_open: number;
  tasks_due_today: number;
  tasks_overdue: number;
  tasks_completed_today: number;
  tasks_completed_this_week: number;
  reminders_pending: number;
  reminders_today: number;
  notes_total: number;
  activities_today: number;
  events_today: number;
}

export interface DashboardResponse {
  server_time: string;
  timezone: string;
  today: string;
  greeting_name: string;
  counts: DashboardCounts;
  task_stats: TaskStats;
  today_tasks: Task[];
  overdue_tasks: Task[];
  upcoming_tasks: Task[];
  today_events: CalendarItem[];
  upcoming_reminders: Reminder[];
  recent_activities: Activity[];
  important_notes: Note[];
  google_connected: boolean;
  google_configured: boolean;
  completion_rate: number;
  streak_days: number;
}

export interface TodayResponse {
  date: string;
  timezone: string;
  google_connected: boolean;
  google_configured: boolean;
  tasks: Task[];
  overdue_tasks: Task[];
  reminders: Reminder[];
  events: CalendarItem[];
  activities: Activity[];
  completed_tasks: Task[];
}

export interface SearchHit {
  id: string;
  kind: string;
  title: string;
  snippet: string | null;
  occurred_at: string | null;
  url: string;
  status: string | null;
  tags: string[];
}

export interface SearchResponse {
  query: string;
  total: number;
  counts: Record<string, number>;
  hits: SearchHit[];
}

export type QuickAddKind = "task" | "reminder" | "note" | "activity";

export interface QuickAddPayload {
  kind: QuickAddKind;
  title: string;
  body?: string | null;
  when?: string | null;
  priority?: Priority;
  tag_ids?: string[];
}
