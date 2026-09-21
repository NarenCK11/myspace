import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Link2,
  Link2Off,
  RefreshCw,
} from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import {
  CONTENT_KEYS,
  disconnectGoogle,
  fetchGoogleStatus,
  keys,
  startGoogleConnect,
  syncGoogle,
  toggleGoogleCalendar,
} from "@/lib/queries";

export function GoogleSection() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.google,
    queryFn: fetchGoogleStatus,
  });

  // The OAuth callback redirects back here with a result flag.
  useEffect(() => {
    const result = searchParams.get("google");
    if (!result) return;

    if (result === "connected") {
      toast.success("Google Calendar connected");
      CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      void queryClient.invalidateQueries({ queryKey: keys.google });
    } else {
      toast.error("Could not connect Google Calendar", {
        description: searchParams.get("reason") ?? undefined,
      });
    }

    const next = new URLSearchParams(searchParams);
    next.delete("google");
    next.delete("reason");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, queryClient]);

  const connect = useMutation({
    mutationFn: startGoogleConnect,
    onSuccess: (result) => {
      // Full-page redirect: Google will not render inside an iframe.
      window.location.href = result.authorization_url;
    },
    onError: (caught) =>
      toast.error("Could not start the connection", { description: errorMessage(caught) }),
  });

  const sync = useMutation({
    mutationFn: syncGoogle,
    onSuccess: (result) => {
      CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      void queryClient.invalidateQueries({ queryKey: keys.google });
      toast.success("Calendar synced", {
        description: `${result.events_upserted} event(s) updated across ${result.calendars_synced} calendar(s).`,
      });
    },
    onError: (caught) => {
      void queryClient.invalidateQueries({ queryKey: keys.google });
      toast.error("Sync failed", { description: errorMessage(caught) });
    },
  });

  const disconnect = useMutation({
    mutationFn: disconnectGoogle,
    onSuccess: () => {
      CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      void queryClient.invalidateQueries({ queryKey: keys.google });
      toast.success("Google Calendar disconnected");
    },
    onError: (caught) => toast.error("Could not disconnect", { description: errorMessage(caught) }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      toggleGoogleCalendar(id, enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.google });
      CONTENT_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
    onError: (caught) => toast.error("Could not update calendar", { description: errorMessage(caught) }),
  });

  if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <ListSkeleton rows={3} />;

  // Not an error state: the portal is fully usable without Google. This is an
  // optional integration, so it reads as "available when you want it" and
  // spells out the three steps to switch it on.
  if (!data.configured) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              Google Calendar
              <Badge variant="outline">Optional</Badge>
            </CardTitle>
            <CardDescription>
              Turned off. Everything else in the portal works without it.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your calendar already shows tasks, reminders and logged activities. Switch this on
            whenever you want your Google events alongside them.
          </p>

          <div className="rounded-lg border border-border bg-surface-sunken p-4">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              To enable it
            </p>
            <ol className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-muted-foreground/60">1.</span>
                <span>
                  Create an OAuth client in Google Cloud (see{" "}
                  <span className="font-medium text-foreground">README &sect; 5</span>).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-muted-foreground/60">2.</span>
                <span>
                  Set <code className="kbd">GOOGLE_CLIENT_ID</code>,{" "}
                  <code className="kbd">GOOGLE_CLIENT_SECRET</code> and{" "}
                  <code className="kbd">GOOGLE_REDIRECT_URI</code> on the backend.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-muted-foreground/60">3.</span>
                <span>Restart the backend, then come back here and press Connect.</span>
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data.connected) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Google Calendar</CardTitle>
            <CardDescription>
              Bring your events in alongside tasks, reminders and activities.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={CalendarCheck}
            title="Not connected"
            description="You will be sent to Google to approve read-only access to your calendars. Your credentials never touch this app."
            action={
              <Button size="sm" loading={connect.isPending} onClick={() => connect.mutate()}>
                <Link2 /> Connect Google Calendar
              </Button>
            }
            className="border-0"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              Google Calendar
              <Badge variant="success">
                <CheckCircle2 className="size-2.5" /> Connected
              </Badge>
            </CardTitle>
            <CardDescription>{data.email}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={sync.isPending}
              onClick={() => sync.mutate()}
            >
              <RefreshCw /> Sync now
            </Button>
            <Button
              variant="danger-ghost"
              size="sm"
              loading={disconnect.isPending}
              onClick={() => {
                if (window.confirm("Disconnect Google Calendar and remove cached events?")) {
                  disconnect.mutate();
                }
              }}
            >
              <Link2Off /> Disconnect
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-2xs uppercase tracking-wide text-muted-foreground">Last sync</dt>
              <dd>{data.last_synced_at ? formatDateTime(data.last_synced_at) : "Never"}</dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-muted-foreground">Cached events</dt>
              <dd className="tabular-nums">{data.cached_event_count}</dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wide text-muted-foreground">Connected</dt>
              <dd>{data.connected_at ? formatDateTime(data.connected_at) : "-"}</dd>
            </div>
          </dl>

          {data.last_sync_error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Last sync failed: {data.last_sync_error}
                <br />
                If this keeps happening, disconnect and connect again to refresh access.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Calendars</CardTitle>
            <CardDescription>Choose which calendars appear in your portal.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {data.calendars.length ? (
            <ul className="divide-y divide-border">
              {data.calendars.map((calendar) => (
                <li key={calendar.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: calendar.background_color ?? "#4285F4" }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{calendar.summary}</p>
                    <p className="truncate text-2xs text-muted-foreground">
                      {calendar.is_primary ? "Primary · " : ""}
                      {calendar.time_zone ?? calendar.calendar_id}
                    </p>
                  </div>
                  <Switch
                    checked={calendar.is_enabled}
                    onCheckedChange={(checked) =>
                      toggle.mutate({ id: calendar.id, enabled: checked })
                    }
                    aria-label={`Show ${calendar.summary}`}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={CalendarCheck} title="No calendars found" className="border-0" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
