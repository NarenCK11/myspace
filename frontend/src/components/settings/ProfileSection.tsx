import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage } from "@/lib/api";
import { updateProfile } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Theme } from "@/types/api";

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** A short list plus whatever the browser reports, so the common cases are one click. */
function timezoneOptions(current: string) {
  const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const common = [
    "UTC",
    browser,
    current,
    "Europe/London",
    "Europe/Berlin",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Australia/Sydney",
  ];
  return [...new Set(common.filter(Boolean))];
}

export function ProfileSection() {
  const { user, setUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [timezone, setTimezone] = useState(user?.timezone ?? "UTC");
  const [weekStart, setWeekStart] = useState(String(user?.week_starts_on ?? 1));

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updated) => {
      setUser(updated);
      queryClient.invalidateQueries();
      toast.success("Profile saved");
    },
    onError: (error) => toast.error("Could not save profile", { description: errorMessage(error) }),
  });

  function save(event: React.FormEvent) {
    event.preventDefault();
    mutation.mutate({
      display_name: displayName.trim() || "Owner",
      email: email.trim() || null,
      timezone,
      week_starts_on: Number(weekStart),
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How the portal greets you and interprets your days.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Display name</Label>
                <Input
                  id="profile-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneOptions(user?.timezone ?? "UTC").map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-2xs text-muted-foreground">
                  Decides what counts as &quot;today&quot; across the app.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Week starts on</Label>
                <Select value={weekStart} onValueChange={setWeekStart}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Monday</SelectItem>
                    <SelectItem value="0">Sunday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm" loading={mutation.isPending}>
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Applies immediately on this device.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTheme(value);
                  mutation.mutate({ theme: value });
                }}
                aria-pressed={theme === value}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border p-3 text-xs font-medium transition-all",
                  theme === value
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
