"use client";

import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMe } from "@/lib/api/hooks";
import { roleLabel } from "@/lib/permissions";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsPage() {
  const me = useMe();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Your account." />
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {me.isPending || !me.data ? (
            <Skeleton className="h-20" />
          ) : (
            <>
              <Row label="Name" value={me.data.full_name || "—"} />
              <Row label="Email" value={me.data.email || "—"} />
              <Row label="Phone" value={me.data.phone || "—"} />
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Roles</span>
                <div className="flex gap-1">
                  {me.data.roles.map((r) => (
                    <Badge key={r} variant="outline">
                      {roleLabel(r)}
                    </Badge>
                  ))}
                </div>
              </div>
              <Row label="Two-factor auth" value={me.data.mfa_enabled ? "Enabled" : "Not set up"} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}
