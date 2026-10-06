jest.mock("expo-notifications", () => ({}));
jest.mock("expo-device", () => ({ isDevice: false }));
jest.mock("expo-constants", () => ({ expoConfig: {} }));

import { routeForNotification } from "../lib/push";

describe("tapping a message", () => {
  it("opens the order it was about", () => {
    expect(routeForNotification({ orderId: "06ac54a3-7eaf-75c8-8000-dd42d413941b" })).toBe(
      "/orders/06ac54a3-7eaf-75c8-8000-dd42d413941b"
    );
  });

  it("lands on the orders list for anything else, including something it shouldn't trust", () => {
    for (const data of [null, undefined, {}, { orderId: 42 }, { orderId: "../../etc/passwd" }, { orderId: "x" }, "text"]) {
      expect(routeForNotification(data)).toBe("/");
    }
  });
});
