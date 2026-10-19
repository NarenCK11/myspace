import type { LabelTone, MealType } from "@/types/api";

/** Swatch colours for food labels. Keys match the backend's allowed list. */
export const LABEL_COLORS: Record<string, string> = {
  slate: "#64748b",
  emerald: "#10b981",
  teal: "#14b8a6",
  sky: "#0ea5e9",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  orange: "#f97316",
  rose: "#f43f5e",
};

export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS);

export function labelColor(name: string) {
  return LABEL_COLORS[name] ?? LABEL_COLORS.slate;
}

export const TONES: { value: LabelTone; label: string; hint: string; color: string }[] = [
  { value: "good", label: "Healthy side", hint: "Counts towards healthy meals", color: "emerald" },
  { value: "bad", label: "Unhealthy side", hint: "Counts towards unhealthy meals", color: "rose" },
  { value: "neutral", label: "Just a description", hint: "Describes a meal without judging it", color: "slate" },
];

export const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "drink", label: "Drink" },
  { value: "other", label: "Other" },
];

export function mealTypeLabel(value: MealType) {
  return MEAL_TYPES.find((item) => item.value === value)?.label ?? value;
}

/** A sensible default meal type for a given hour of the day. */
export function mealTypeForHour(hour: number): MealType {
  if (hour < 5) return "snack";
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 18) return "snack";
  if (hour < 22) return "dinner";
  return "snack";
}

/** Formats a weight or a signed change, e.g. "72.4" or "-0.3". */
export function formatKg(value: number | null | undefined, signed = false) {
  if (value === null || value === undefined) return "-";
  const fixed = Math.abs(value).toFixed(1);
  if (!signed) return value.toFixed(1);
  if (Math.abs(value) < 0.05) return "0.0";
  return `${value > 0 ? "+" : "-"}${fixed}`;
}
