import { test as base, expect } from "@playwright/test";

/** Shared demo credentials, seeded by `manage.py seed_demo` (docs/api README). */
export const DEMO_USERS = {
  operator: { email: "operator@ironman.test", password: "IronMan@2026" },
  admin: { email: "admin@ironman.test", password: "IronMan@2026" },
  founder: { email: "founder@ironman.test", password: "IronMan@2026" },
  field: { email: "field@ironman.test", password: "IronMan@2026" },
} as const;

export async function loginAs(page: import("@playwright/test").Page, user: { email: string; password: string }) {
  await page.goto("/console/login");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/console");
}

/** Field staff have their own login route (`/field/login`), not the ops
 * console's — a FIELD-only account has no console screens to land on. */
export async function loginAsField(
  page: import("@playwright/test").Page,
  user: { email: string; password: string }
) {
  await page.goto("/field/login");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/field");
}

export const test = base;
export { expect };
