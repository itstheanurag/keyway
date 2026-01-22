import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keyway - Secure File Sharing",
  description:
    "End-to-end encrypted file sharing. No accounts, no storage, just secure P2P transfer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
