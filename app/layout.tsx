import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keyway - Secure P2P File Sharing",
  description:
    "Private, end-to-end encrypted file sharing that transmits directly between devices. No servers, no storage, no trace.",
  keywords: [
    "file sharing",
    "P2P",
    "WebRTC",
    "encryption",
    "privacy",
    "secure transfer",
  ],
  authors: [{ name: "Keyway Team" }],
  icons: {
    icon: "/mascot.png",
    apple: "/mascot.png",
  },
  openGraph: {
    title: "Keyway - Secure P2P File Sharing",
    description:
      "The most private way to share files directly between devices.",
    images: [{ url: "/mascot.png" }],
  },
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
