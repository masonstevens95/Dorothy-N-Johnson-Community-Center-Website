import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Dorothy N. Johnson Community Center — neighborhood calendar",
    template: "%s — Dorothy N. Johnson Community Center calendar",
  },
  description:
    "A neighbor-maintained calendar of what's happening at the Dorothy N. Johnson Community Center. Not the center's official website.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
