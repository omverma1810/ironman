import Link from "next/link";
import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface-sunken px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-brand-yellow text-text-on-brand">
        <Icon name="search" className="size-8" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold text-text-primary">Page not found</h1>
        <p className="max-w-sm text-sm text-text-secondary">
          That page doesn&apos;t exist, or you don&apos;t have access to it. Let&apos;s get you back
          somewhere useful.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href="/console">
            <Icon name="dashboard" /> Go to dashboard
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/console/orders">
            <Icon name="bag" /> View orders
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">
            <Icon name="home" /> Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
