import type { Metadata, Viewport } from "next";
import { Providers } from "@/lib/providers";
import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "IronMan — Look Good. Feel Good.",
    template: "%s · IronMan",
  },
  description:
    "Book a pickup, track your order, and get your clothes pressed and delivered — IronMan.",
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
