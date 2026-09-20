import type {
  Activity,
  CalendarFeed,
  DashboardResponse,
  GoogleStatus,
  GoogleSyncResult,
  Note,
  Page,
  QuickAddPayload,
  Reminder,
  SearchResponse,
  SessionInfo,
  TagWithCount,
  Task,
  TodayResponse,
  User,
} from "@/types/api";

import { api } from "./api";

/** Centralised query keys so mutations can invalidate precisely. */
export const keys = {
  dashboard: ["dashboard"] as const,
  today: (day?: string) => ["today", day ?? "current"] as const,
  tasks: (params: Record<string, unknown>) => ["tasks", params] as const,
  reminders: (params: Record<string, unknown>) => ["reminders", params] as const,
  notes: (params: Record<string, unknown>) => ["notes", params] as const,
  activities: (params: Record<string, unknown>) => ["activities", params] as const,
  tags: ["tags"] as const,
  calendar: (params: Record<string, unknown>) => ["calendar", params] as const,
  google: ["google", "status"] as const,
  search: (q: string, kinds: string[]) => ["search", q, kinds] as const,
  sessions: ["auth", "sessions"] as const,
};

/** Every key that content mutations can invalidate in one go. */
export const CONTENT_KEYS = [
  ["dashboard"],
  ["today"],
  ["tasks"],
  ["reminders"],
  ["notes"],
  ["activities"],
  ["calendar"],
  ["search"],
  ["tags"],
];

const unwrap = <T,>(promise: Promise<{ data: T }>) => promise.then((r) => r.data);

export const fetchDashboard = () => unwrap<DashboardResponse>(api.get("/dashboard"));

export const fetchToday = (day?: string) =>
  unwrap<TodayResponse>(api.get("/today", { params: day ? { day } : undefined }));

export const fetchTasks = (params: Record<string, unknown>) =>
  unwrap<Page<Task>>(api.get("/tasks", { params }));

export const fetchReminders = (params: Record<string, unknown>) =>
  unwrap<Page<Reminder>>(api.get("/reminders", { params }));

export const fetchNotes = (params: Record<string, unknown>) =>
  unwrap<Page<Note>>(api.get("/notes", { params }));

export const fetchActivities = (params: Record<string, unknown>) =>
  unwrap<Page<Activity>>(api.get("/activities", { params }));

export const fetchTags = () => unwrap<TagWithCount[]>(api.get("/tags"));

export const fetchCalendar = (params: Record<string, unknown>) =>
  unwrap<CalendarFeed>(api.get("/calendar/events", { params }));

export const fetchGoogleStatus = () => unwrap<GoogleStatus>(api.get("/google/status"));

export const startGoogleConnect = () =>
  unwrap<{ authorization_url: string; state: string }>(api.post("/google/connect"));

export const syncGoogle = () => unwrap<GoogleSyncResult>(api.post("/google/sync"));

export const disconnectGoogle = () => unwrap<{ message: string }>(api.delete("/google/disconnect"));

export const toggleGoogleCalendar = (id: string, isEnabled: boolean) =>
  unwrap(api.patch(`/google/calendars/${id}`, { is_enabled: isEnabled }));

export const search = (q: string, kinds: string[], limit = 20) =>
  unwrap<SearchResponse>(
    api.get("/search", { params: { q, limit, ...(kinds.length ? { kind: kinds } : {}) } }),
  );

export const quickAdd = (payload: QuickAddPayload) =>
  unwrap<{ kind: string; id: string; title: string }>(api.post("/quick-add", payload));

export const fetchSessions = () => unwrap<SessionInfo[]>(api.get("/auth/sessions"));

export const revokeSession = (id: string) => api.delete(`/auth/sessions/${id}`);

export const updateProfile = (payload: Partial<User>) =>
  unwrap<User>(api.patch("/auth/me", payload));

export const changePassword = (current_password: string, new_password: string) =>
  unwrap<{ message: string }>(
    api.post("/auth/change-password", { current_password, new_password }),
  );
