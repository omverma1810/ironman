import type { Metadata, Viewport } from "next";
import { Providers } from "@/lib/providers";
import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight/wght.css";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "IronMan — Premium Laundry & Dry Cleaning",
    template: "%s · IronMan",
  },
  description:
    "Doorstep pickup, expert garment care, and transparent digital billing — book a pickup on the web or WhatsApp and track your order in real time.",
  openGraph: {
    title: "IronMan — Premium Laundry & Dry Cleaning",
    description:
      "Doorstep pickup, expert garment care, and transparent digital billing from IronMan.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111114" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
