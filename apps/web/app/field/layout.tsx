import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "IronMan Field", template: "%s · IronMan Field" },
  manifest: "/field-manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "IronMan Field" },
};

export const viewport: Viewport = {
  themeColor: "#F5C518",
  viewportFit: "cover",
  userScalable: false,
};

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
