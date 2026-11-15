import type { Metadata } from "next";
import "98.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura Scanner",
  description: "Windows NT-style aura camera scanner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
