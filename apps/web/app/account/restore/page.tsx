"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { privacyApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";

type State = { kind: "working" } | { kind: "restored" } | { kind: "failed"; message: string };

/**
 * The link in the "your account will be deleted" message (docs/06 §6).
 * Opening it cancels the deletion straight away; there's nothing to fill in.
 */
export default function RestoreAccountPage() {
  const [state, setState] = useState<State>({ kind: "working" });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setState({
        kind: "failed",
        message: "This link is incomplete. Open it again from the message we sent you.",
      });
      return;
    }
    privacyApi
      .restore(token)
      .then(() => setState({ kind: "restored" }))
      .catch((err) =>
        setState({
          kind: "failed",
          message:
            err instanceof ApiError
              ? err.message
              : "Couldn't restore your account. Please try again.",
        })
      );
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div className="flex items-center gap-2">
        <Icon name="iron" className="size-5 text-brand-yellow" />
        <span className="font-display text-sm font-semibold text-text-primary">IronMan</span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {state.kind === "working" && "Restoring your account…"}
            {state.kind === "restored" && "Your account is back"}
            {state.kind === "failed" && "We couldn't restore your account"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state.kind === "working" && (
            <Icon name="spinner" className="size-5 animate-spin text-text-muted" />
          )}
          {state.kind === "restored" && (
            <>
              <p className="text-sm text-text-secondary">
                Nothing will be deleted. Sign in with your phone number to carry on.
              </p>
              <Button asChild className="self-start">
                <Link href="/account">Sign in</Link>
              </Button>
            </>
          )}
          {state.kind === "failed" && (
            <p className="text-sm text-text-secondary" role="alert">
              {state.message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
