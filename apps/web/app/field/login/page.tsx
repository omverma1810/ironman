"use client";

import { useState } from "react";
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
});

type FormValues = z.infer<typeof schema>;

export default function FieldLoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = (values: FormValues) => {
    login.mutate(values, { onSuccess: () => router.replace("/field") });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-yellow text-text-on-brand">
            <Icon name="truck" className="size-7" />
          </div>
          <h1 className="font-display text-xl font-bold text-text-primary">IronMan Field</h1>
          <p className="text-sm text-text-secondary">Today&apos;s pickups and deliveries</p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-5 rounded-xl border border-border-default bg-surface-raised p-6 shadow-sm"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              className="h-12 text-base"
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
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="h-12 text-base"
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
                <Icon name={showPassword ? "eye-off" : "eye"} className="size-5" />
              </button>
            </div>
            {errors.password && (
              <p id="password-error" className="text-xs text-status-danger">
                {errors.password.message}
              </p>
            )}
          </div>

          {login.isError && (
            <p className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger" role="alert">
              {ApiError.isApiError(login.error) ? login.error.message : "Couldn't log in."}
            </p>
          )}

          <Button type="submit" size="lg" loading={login.isPending} className="h-12 text-base">
            Log in
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-text-muted">
          Ops and admin staff use the{" "}
          <a href="/console/login" className="underline hover:text-text-primary">
            console
          </a>{" "}
          instead.
        </p>
      </div>
    </div>
  );
}
