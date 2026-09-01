"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/errors";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  totp_code: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function ConsoleLoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [needsMfa, setNeedsMfa] = useState(false);
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = (values: FormValues) => {
    setMfaSetupRequired(false);
    login.mutate(values, {
      onSuccess: () => router.replace("/console"),
      onError: (err) => {
        if (ApiError.isApiError(err)) {
          if (err.code === "invalid_mfa_code") setNeedsMfa(true);
          if (err.code === "mfa_setup_required") setMfaSetupRequired(true);
        }
      },
    });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg bg-brand-yellow text-text-on-brand">
            <Icon name="iron" className="size-6" />
          </div>
          <h1 className="font-display text-lg font-bold text-text-primary">IronMan Console</h1>
          <p className="text-sm text-text-secondary">Operations, billing and analytics</p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4 rounded-lg border border-border-default bg-surface-raised p-6 shadow-sm"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p id="email-error" className="text-xs text-status-danger">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/console/password-reset"
                className="text-xs font-medium text-text-secondary hover:text-text-primary"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-2 flex items-center text-text-muted hover:text-text-primary"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <Icon name={showPassword ? "eye-off" : "eye"} className="size-4" />
              </button>
            </div>
            {errors.password && (
              <p id="password-error" className="text-xs text-status-danger">
                {errors.password.message}
              </p>
            )}
          </div>

          {needsMfa && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="totp_code">Authentication code</Label>
              <Input
                id="totp_code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                {...register("totp_code")}
              />
              <p className="text-xs text-text-muted">From your authenticator app.</p>
            </div>
          )}

          {login.isError && !mfaSetupRequired && (
            <p className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger" role="alert">
              {ApiError.isApiError(login.error) ? login.error.message : "Couldn't log in."}
            </p>
          )}

          {mfaSetupRequired && (
            <p className="rounded-md bg-status-warning-bg px-3 py-2 text-sm text-status-warning" role="alert">
              Two-factor authentication is required for this account. Contact an admin to complete
              setup.
            </p>
          )}

          <Button type="submit" size="lg" loading={login.isPending} className="mt-1">
            Log in
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-text-muted">
          Field staff and customers use the{" "}
          <Link href="/" className="underline hover:text-text-primary">
            mobile booking link
          </Link>{" "}
          instead.
        </p>
      </div>
    </div>
  );
}
