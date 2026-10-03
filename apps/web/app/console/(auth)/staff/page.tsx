"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { AsyncBoundary } from "@/components/patterns/async-boundary";
import { DataTable } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Icon } from "@/components/icons/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import {
  useChangeStaffRole,
  useHubs,
  useInviteStaff,
  useMe,
  useRevokeInvite,
  useSetStaffActive,
  useTeam,
} from "@/lib/api/hooks";
import type { StaffInvite, StaffRole, TeamMember } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { canManageStaff } from "@/lib/permissions";

const ROLE_LABEL: Record<StaffRole, string> = {
  FIELD: "Rider",
  OPERATOR: "Store operator",
  ADMIN: "Admin",
  FOUNDER: "Founder",
  VIEWER: "Viewer (read-only)",
};

/** docs/06: the founder grants any role; an admin only riders, operators
 * and viewers — the server enforces the same rule. */
function grantableRoles(isFounder: boolean): StaffRole[] {
  return isFounder
    ? ["FIELD", "OPERATOR", "ADMIN", "VIEWER", "FOUNDER"]
    : ["FIELD", "OPERATOR", "VIEWER"];
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

export default function StaffPage() {
  const me = useMe();
  const roles = me.data?.roles;
  const team = useTeam();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [deactivating, setDeactivating] = useState<TeamMember | null>(null);
  const setActive = useSetStaffActive();

  if (me.data && !canManageStaff(roles)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Staff" />
        <EmptyState
          icon="lock"
          title="Admin and Founder only"
          body="Inviting and managing staff is available to Admin and Founder accounts."
        />
      </div>
    );
  }
  const isFounder = !!roles?.includes("FOUNDER");

  const columns: ColumnDef<TeamMember, unknown>[] = [
    {
      accessorKey: "full_name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">
            {row.original.full_name || row.original.email}
          </span>
          <span className="text-xs text-text-muted">
            {row.original.email ?? row.original.phone}
          </span>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          {row.original.roles.map((r) => (
            <span key={`${r.role}-${r.hub}`} className="text-text-secondary">
              {ROLE_LABEL[r.role]}
              {r.hub_name && <span className="text-text-muted"> · {r.hub_name}</span>}
            </span>
          ))}
        </div>
      ),
    },
    {
      accessorKey: "last_login",
      header: "Last signed in",
      cell: ({ row }) => (
        <span className="text-text-secondary tabular-nums">
          {row.original.last_login ? formatDateTime(row.original.last_login) : "Never"}
        </span>
      ),
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="neutral">Deactivated</Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <MemberActions
          member={row.original}
          isSelf={row.original.id === me.data?.id}
          onEdit={() => setEditing(row.original)}
          onDeactivate={() => setDeactivating(row.original)}
          onReactivate={() =>
            setActive.mutate(
              { userId: row.original.id, active: true },
              {
                onSuccess: () =>
                  toast.success(`${row.original.full_name || "They"} can sign in again`),
                onError: (err) => toast.error(errorMessage(err, "Couldn't reactivate them.")),
              }
            )
          }
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff"
        description="Invite people, set what they can do, and switch off access the moment someone leaves."
        actions={
          <Button onClick={() => setInviting(true)}>
            <Icon name="plus" />
            Invite staff
          </Button>
        }
      />

      <AsyncBoundary
        query={team}
        loading={<Skeleton className="h-64" />}
        isEmpty={(data) => data.members.length === 0 && data.invites.length === 0}
        empty={
          <EmptyState
            icon="users"
            title="No staff yet"
            body="Invite your riders, operators and admins. Each gets a link to set their own password."
          />
        }
      >
        {(data) => (
          <div className="flex flex-col gap-6">
            {data.invites.length > 0 && <InvitesCard invites={data.invites} />}
            <DataTable
              data={data.members}
              columns={columns}
              getRowId={(row) => row.id}
              mobileCard={(m) => (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-text-primary">{m.full_name || m.email}</span>
                    {m.is_active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="neutral">Deactivated</Badge>
                    )}
                  </div>
                  <span className="text-sm text-text-secondary">
                    {m.roles
                      .map((r) => `${ROLE_LABEL[r.role]}${r.hub_name ? ` · ${r.hub_name}` : ""}`)
                      .join(", ")}
                  </span>
                  <MemberActions
                    member={m}
                    isSelf={m.id === me.data?.id}
                    onEdit={() => setEditing(m)}
                    onDeactivate={() => setDeactivating(m)}
                    onReactivate={() => setActive.mutate({ userId: m.id, active: true })}
                  />
                </div>
              )}
            />
          </div>
        )}
      </AsyncBoundary>

      <InviteDialog open={inviting} onOpenChange={setInviting} isFounder={isFounder} />
      {editing && (
        <RoleDialog member={editing} isFounder={isFounder} onClose={() => setEditing(null)} />
      )}
      {deactivating && (
        <DeactivateDialog member={deactivating} onClose={() => setDeactivating(null)} />
      )}
    </div>
  );
}

function MemberActions({
  member,
  isSelf,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  member: TeamMember;
  isSelf: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  if (isSelf) return <span className="text-xs text-text-muted">You</span>;
  return (
    <div className="flex justify-end gap-2">
      {member.is_active ? (
        <>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Change role
          </Button>
          <Button variant="ghost" size="sm" onClick={onDeactivate}>
            Deactivate
          </Button>
        </>
      ) : (
        <Button variant="secondary" size="sm" onClick={onReactivate}>
          Reactivate
        </Button>
      )}
    </div>
  );
}

function inviteLink(token: string) {
  return `${window.location.origin}/console/invite?token=${encodeURIComponent(token)}`;
}

function InvitesCard({ invites }: { invites: StaffInvite[] }) {
  const revoke = useRevokeInvite();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Waiting to join</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border-subtle">
        {invites.map((inv) => (
          <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="flex flex-col">
              <span className="text-sm text-text-primary">{inv.email}</span>
              <span className="text-xs text-text-muted">
                {ROLE_LABEL[inv.role]}
                {inv.hub_name ? ` · ${inv.hub_name}` : ""} · link expires{" "}
                {formatDate(inv.expires_at)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                revoke.mutate(inv.id, {
                  onSuccess: () => toast.success("Invite cancelled"),
                  onError: (err) => toast.error(errorMessage(err, "Couldn't cancel the invite.")),
                })
              }
            >
              Cancel invite
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RoleAndHubFields({
  role,
  setRole,
  hub,
  setHub,
  isFounder,
}: {
  role: StaffRole;
  setRole: (r: StaffRole) => void;
  hub: string;
  setHub: (h: string) => void;
  isFounder: boolean;
}) {
  const hubs = useHubs().data?.results ?? [];
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="staff-role">Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
          <SelectTrigger id="staff-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {grantableRoles(isFounder).map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {role !== "FOUNDER" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="staff-hub">Hub</Label>
          <Select value={hub} onValueChange={setHub}>
            <SelectTrigger id="staff-hub">
              <SelectValue placeholder="Choose a hub" />
            </SelectTrigger>
            <SelectContent>
              {hubs.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  isFounder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isFounder: boolean;
}) {
  const hubs = useHubs().data?.results ?? [];
  const invite = useInviteStaff();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("FIELD");
  const [hub, setHub] = useState("");
  const [created, setCreated] = useState<StaffInvite | null>(null);
  const hubId = hub || (hubs.length === 1 ? hubs[0].id : "");

  function close(next: boolean) {
    if (!next) {
      setCreated(null);
      setEmail("");
    }
    onOpenChange(next);
  }

  if (created?.token) {
    const link = inviteLink(created.token);
    const message = `You're invited to the IronMan console as ${ROLE_LABEL[created.role]}. Set your password here (link valid 7 days): ${link}`;
    return (
      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this link to {created.email}</DialogTitle>
            <DialogDescription>
              They open it, set a password, and can sign in straight away. It works once and expires
              in 7 days. You won&rsquo;t be shown it again.
            </DialogDescription>
          </DialogHeader>
          <Input
            readOnly
            value={link}
            aria-label="Invite link"
            onFocus={(e) => e.target.select()}
          />
          <DialogFooter>
            <Button variant="secondary" asChild>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
              >
                Share on WhatsApp
              </a>
            </Button>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  toast.success("Link copied");
                } catch {
                  toast.error("Couldn't copy — select the link and copy it.");
                }
              }}
            >
              Copy link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite staff</DialogTitle>
          <DialogDescription>You&rsquo;ll get a link to send them.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate(
              { email, role, hub: role === "FOUNDER" ? null : hubId || null },
              {
                onSuccess: (inv) => setCreated(inv),
                onError: (err) => toast.error(errorMessage(err, "Couldn't create the invite.")),
              }
            );
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <RoleAndHubFields
            role={role}
            setRole={setRole}
            hub={hubId}
            setHub={setHub}
            isFounder={isFounder}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={invite.isPending}
              disabled={!email || (role !== "FOUNDER" && !hubId)}
            >
              Create invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({
  member,
  isFounder,
  onClose,
}: {
  member: TeamMember;
  isFounder: boolean;
  onClose: () => void;
}) {
  const current = member.roles[0];
  const change = useChangeStaffRole();
  const [role, setRole] = useState<StaffRole>(current?.role ?? "FIELD");
  const [hub, setHub] = useState(current?.hub ?? "");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change role for {member.full_name || member.email}</DialogTitle>
          <DialogDescription>Takes effect on their next page load.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <RoleAndHubFields
            role={role}
            setRole={setRole}
            hub={hub}
            setHub={setHub}
            isFounder={isFounder}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={change.isPending}
            disabled={role !== "FOUNDER" && !hub}
            onClick={() =>
              change.mutate(
                { userId: member.id, role, hub: role === "FOUNDER" ? null : hub },
                {
                  onSuccess: () => {
                    toast.success("Role updated");
                    onClose();
                  },
                  onError: (err) => toast.error(errorMessage(err, "Couldn't change the role.")),
                }
              )
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const setActive = useSetStaffActive();
  const [reason, setReason] = useState("");
  const name = member.full_name || member.email || "this person";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate {name}?</DialogTitle>
          <DialogDescription>
            They&rsquo;re signed out everywhere at once and can&rsquo;t sign in again until you
            reactivate them. Their orders, scans and cash records stay as they are.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deactivate-reason">Reason (optional, kept in the audit log)</Label>
          <Input
            id="deactivate-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={setActive.isPending}
            onClick={() =>
              setActive.mutate(
                { userId: member.id, active: false, reason },
                {
                  onSuccess: () => {
                    toast.success(`${name} is deactivated`);
                    onClose();
                  },
                  onError: (err) => toast.error(errorMessage(err, "Couldn't deactivate them.")),
                }
              )
            }
          >
            Deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
