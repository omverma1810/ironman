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
    default: "IronMan — Crisp ironing, picked up and delivered",
    template: "%s · IronMan",
  },
  description:
    "Crisp clothes, ready when you are. Ironing picked up from your door and delivered back on time in Hyderabad, plus laundry and dry cleaning on the same pickup.",
  openGraph: {
    title: "IronMan — Crisp ironing, picked up and delivered",
    description: "Crisp clothes, ready when you are. Free pickup and delivery in Hyderabad.",
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
