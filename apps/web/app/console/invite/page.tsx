"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { identityApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";

/**
 * Where a staff invite link lands (docs/06 §2.2: console sign-up is invite
 * only). The new staff member picks their name and password; their email,
 * role and hub come from the invite.
 */
export default function AcceptInvitePage() {
  const [token, setToken] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  const accept = useMutation({
    mutationFn: () =>
      identityApi.acceptInvite({ token: token ?? "", full_name: fullName, password }),
  });

  const error =
    accept.error instanceof ApiError
      ? accept.error.fieldErrors.password?.join(" ") || accept.error.message
      : accept.error
        ? "Couldn't create your account. Please try again."
        : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg bg-brand-yellow text-text-on-brand">
            <Icon name="iron" className="size-6" />
          </div>
          <h1 className="font-display text-lg font-bold text-text-primary">Join IronMan</h1>
          <p className="text-sm text-text-secondary">Set up your console account</p>
        </div>

        {accept.isSuccess ? (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-border-default bg-surface-raised p-6 text-center shadow-sm">
            <Icon name="check-circle" className="size-8 text-status-success" />
            <p className="text-sm text-text-secondary">
              Your account for <strong className="text-text-primary">{accept.data.email}</strong> is
              ready.
            </p>
            <Button asChild>
              <Link href="/console/login">Sign in</Link>
            </Button>
          </div>
        ) : token === "" ? (
          <p
            className="rounded-lg border border-border-default bg-surface-raised p-6 text-center text-sm text-text-secondary shadow-sm"
            role="alert"
          >
            This link is incomplete. Open it again from the message you were sent, or ask your admin
            for a new invite.
          </p>
        ) : (
          <form
            className="flex flex-col gap-4 rounded-lg border border-border-default bg-surface-raised p-6 shadow-sm"
            onSubmit={(e) => {
              e.preventDefault();
              accept.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-name">Your name</Label>
              <Input
                id="invite-name"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-password">Choose a password</Label>
              <div className="relative">
                <Input
                  id="invite-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <Icon name="eye" className="size-4" />
                </button>
              </div>
              <p className="text-xs text-text-muted">At least 8 characters, not all numbers.</p>
            </div>
            {error && (
              <p className="text-sm text-status-danger" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              loading={accept.isPending}
              disabled={!token || !fullName.trim() || password.length < 8}
            >
              Create my account
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
