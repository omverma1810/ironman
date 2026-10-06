import { useEffect, useState } from "react";
import { Banner, Button, Card, Hint, SectionTitle } from "./ui";
import { pushState, registerForPush, type PushState } from "../lib/push";

/** Offered once the customer has an order worth hearing about, never at launch. */
export function PushPrompt() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState().then(setState).catch(() => setState("unavailable"));
  }, []);

  if (state === "ask") {
    return (
      <Card>
        <SectionTitle>Know when we're on the way</SectionTitle>
        <Hint>Get a message when your rider is coming and when your clothes are ready.</Hint>
        <Button
          label="Turn on notifications"
          testID="enable-push"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              setState(await registerForPush({ askIfNeeded: true }));
            } catch {
              setState("unavailable");
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>
    );
  }
  if (state === "on") return <Banner tone="success">Notifications are on. We'll message you as your order moves.</Banner>;
  return null;
}
