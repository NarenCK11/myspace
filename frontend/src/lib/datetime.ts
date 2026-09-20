import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isSameDay,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
} from "date-fns";

export function toDate(value: string | Date): Date {
  return typeof value === "string" ? parseISO(value) : value;
}

/** "Today, 09:30" / "Tomorrow, 14:00" / "Fri 3 Oct, 14:00" */
export function formatDateTime(value: string | Date) {
  const date = toDate(value);
  const time = format(date, "HH:mm");
  if (isToday(date)) return `Today, ${time}`;
  if (isTomorrow(date)) return `Tomorrow, ${time}`;
  if (isYesterday(date)) return `Yesterday, ${time}`;
  return `${format(date, "EEE d MMM")}, ${time}`;
}

export function formatDay(value: string | Date) {
  const date = toDate(value);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEE d MMM");
}

export function formatTime(value: string | Date) {
  return format(toDate(value), "HH:mm");
}

export function formatLongDate(value: string | Date) {
  return format(toDate(value), "EEEE, d MMMM yyyy");
}

export function formatRelative(value: string | Date) {
  return `${formatDistanceToNowStrict(toDate(value))} ago`;
}

export function daysUntil(value: string | Date) {
  return differenceInCalendarDays(toDate(value), new Date());
}

export function isOverdue(value?: string | null) {
  if (!value) return false;
  return toDate(value).getTime() < Date.now();
}

export function sameDay(a: string | Date, b: string | Date) {
  return isSameDay(toDate(a), toDate(b));
}

/** Value for an <input type="datetime-local"> in the browser's own timezone. */
export function toLocalInputValue(value?: string | Date | null) {
  if (!value) return "";
  return format(toDate(value), "yyyy-MM-dd'T'HH:mm");
}

/** Converts a datetime-local input back to an ISO instant. */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function endOfDayISO(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 0, 0);
  return copy.toISOString();
}
