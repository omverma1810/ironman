import { test as base, expect } from "@playwright/test";

/** Shared demo credentials, seeded by `manage.py seed_demo` (docs/api README). */
export const DEMO_USERS = {
  operator: { email: "operator@ironman.test", password: "IronMan@2026" },
  founder: { email: "founder@ironman.test", password: "IronMan@2026" },
} as const;

export async function loginAs(page: import("@playwright/test").Page, user: { email: string; password: string }) {
  await page.goto("/console/login");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/console");
}

export const test = base;
export { expect };
