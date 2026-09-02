"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api/endpoints";
import { useMutation } from "@tanstack/react-query";

const schema = z.object({ email: z.string().email("Enter a valid email address") });
type FormValues = z.infer<typeof schema>;

export default function PasswordResetPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const resetRequest = useMutation({
    mutationFn: (values: FormValues) => authApi.passwordResetRequest(values.email),
    // Always shows the same confirmation regardless of outcome — no
    // account enumeration (docs/06 §2.2).
    onSettled: () => setSent(true),
  });

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg bg-brand-yellow text-text-on-brand">
            <Icon name="lock" className="size-6" />
          </div>
          <h1 className="font-display text-lg font-bold text-text-primary">Reset your password</h1>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-border-default bg-surface-raised p-6 text-center shadow-sm">
            <Icon name="check-circle" className="size-8 text-status-success" />
            <p className="text-sm text-text-secondary">
              If an account exists for that email, a reset link is on its way. Check your inbox.
            </p>
            <Button asChild variant="secondary" size="sm">
              <Link href="/console/login">Back to login</Link>
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit((v) => resetRequest.mutate(v))}
            className="flex flex-col gap-4 rounded-lg border border-border-default bg-surface-raised p-6 shadow-sm"
            noValidate
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" invalid={!!errors.email} {...register("email")} />
              {errors.email && <p className="text-xs text-status-danger">{errors.email.message}</p>}
            </div>
            <Button type="submit" size="lg" loading={resetRequest.isPending}>
              Send reset link
            </Button>
            <Link
              href="/console/login"
              className="text-center text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              Back to login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
