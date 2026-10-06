import { expect, test } from "@playwright/test";
import { API, bookTwoShirts, newPhone, openAccountTab, signIn } from "./fixtures";

test("the name asked for at first sign-in is the name staff see", async ({ page, request }) => {
  const phone = newPhone();
  await signIn(page, request, phone, { name: "Meera Nair" });
  await bookTwoShirts(page);

  // Staff look the customer up by phone in the console's API.
  await request.post(`${API}/auth/login`, { data: { email: "operator@ironman.test", password: "IronMan@2026" } });
  const found = await (await request.get(`${API}/customers/`, { params: { search: phone } })).json();
  expect(found.results.map((c: { name: string }) => c.name)).toEqual(["Meera Nair"]);
});

test("changing your name changes it for staff too", async ({ page, request }) => {
  const phone = newPhone();
  await signIn(page, request, phone, { name: "Meera Nair" });
  await bookTwoShirts(page);

  await openAccountTab(page);
  await page.getByTestId("name-field").fill("Meera N. Rao");
  await page.getByTestId("save-name").click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await request.post(`${API}/auth/login`, { data: { email: "operator@ironman.test", password: "IronMan@2026" } });
  const found = await (await request.get(`${API}/customers/`, { params: { search: phone } })).json();
  expect(found.results.map((c: { name: string }) => c.name)).toEqual(["Meera N. Rao"]);
});

test("after a first booking the account tab offers a referral code to share", async ({ page, request }) => {
  await signIn(page, request);
  await bookTwoShirts(page);
  await openAccountTab(page);
  await expect(page.getByTestId("referral-code")).toHaveText(/^[A-Z0-9]{4,}$/);
  await expect(page.getByTestId("share-referral")).toBeVisible();
});

test("a name is required before anything else", async ({ page, request }) => {
  await page.goto("/");
  const phone = newPhone();
  await page.getByTestId("phone-input").fill(phone);
  await page.getByTestId("login-submit").click();
  // The code exists once the code screen is up.
  await expect(page.getByTestId("code-input")).toBeVisible();
  const { code } = await (await request.get(`${API}/auth/otp/debug`, { params: { phone: `+91${phone}` } })).json();
  await page.getByTestId("code-input").fill(code);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("name-input")).toBeVisible();
  await page.getByTestId("name-input").fill("A");
  await expect(page.getByTestId("name-continue")).toBeDisabled();
  await page.getByTestId("name-input").fill("Asha");
  await expect(page.getByTestId("name-continue")).toBeEnabled();
});
