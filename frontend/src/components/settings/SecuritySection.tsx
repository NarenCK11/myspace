import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, Monitor, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, ListSkeleton } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { changePassword, fetchSessions, keys, revokeSession } from "@/lib/queries";
import { useAuth } from "@/providers/AuthProvider";

const MIN_PASSWORD_LENGTH = 10;

export function SecuritySection() {
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const sessions = useQuery({ queryKey: keys.sessions, queryFn: fetchSessions });

  const change = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      void queryClient.invalidateQueries({ queryKey: keys.sessions });
      toast.success("Password updated", {
        description: "All other sessions have been signed out.",
      });
    },
    onError: (error) =>
      toast.error("Could not change password", { description: errorMessage(error) }),
  });

  const revoke = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.sessions });
      toast.success("Session revoked");
    },
    onError: (error) => toast.error("Could not revoke session", { description: errorMessage(error) }),
  });

  const signOutEverywhere = useMutation({
    mutationFn: () => api.post("/auth/logout-all"),
    onSuccess: () => {
      toast.success("Signed out everywhere");
      void logout();
    },
    onError: (error) => toast.error("Could not sign out", { description: errorMessage(error) }),
  });

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const canSubmit = current.length > 0 && next.length >= MIN_PASSWORD_LENGTH && next === confirm;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" />
              Change password
            </CardTitle>
            <CardDescription>Changing it signs out every other device immediately.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) change.mutate();
            }}
            className="space-y-4 sm:max-w-md"
          >
            <div className="space-y-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                autoComplete="new-password"
              />
              {tooShort && (
                <p className="text-2xs text-danger">
                  Use at least {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
              />
              {mismatch && <p className="text-2xs text-danger">The passwords do not match.</p>}
            </div>
            <Button type="submit" size="sm" disabled={!canSubmit} loading={change.isPending}>
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              Active sessions
            </CardTitle>
            <CardDescription>Every device currently holding a refresh token.</CardDescription>
          </div>
          <Button
            variant="danger-ghost"
            size="sm"
            loading={signOutEverywhere.isPending}
            onClick={() => {
              if (window.confirm("Sign out of every device, including this one?")) {
                signOutEverywhere.mutate();
              }
            }}
          >
            <LogOut /> Sign out everywhere
          </Button>
        </CardHeader>
        <CardContent>
          {sessions.isError ? (
            <ErrorState
              message={errorMessage(sessions.error)}
              onRetry={() => void sessions.refetch()}
            />
          ) : sessions.isLoading ? (
            <ListSkeleton rows={2} />
          ) : (
            <ul className="divide-y divide-border">
              {sessions.data?.map((session) => (
                <li key={session.id} className="flex items-center gap-3 py-3">
                  <Monitor className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {session.user_agent?.slice(0, 60) ?? "Unknown device"}
                    </p>
                    <p className="truncate text-2xs text-muted-foreground">
                      {session.ip_address ?? "unknown IP"} · started{" "}
                      {formatDateTime(session.issued_at)}
                    </p>
                  </div>
                  {session.is_current ? (
                    <Badge variant="success">This device</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revoke.mutate(session.id)}
                      loading={revoke.isPending}
                    >
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
