"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import FileDownloader from "@/components/FileDownloader";
import Link from "next/link";

export default function DownloadPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) {
      setError("Invalid share link: missing encryption key");
      return;
    }
    setEncryptionKey(hash);
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col">
        <header className="border-b border-[var(--border)]">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <span className="text-xl font-bold text-[var(--foreground)]">
                Keyway
              </span>
            </Link>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-[var(--error)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
              Invalid Link
            </h1>
            <p className="text-[var(--muted)] mb-6">{error}</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-hover)] transition-colors"
            >
              Go to homepage
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!encryptionKey) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <header className="border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <span className="text-xl font-bold text-[var(--foreground)]">
              Keyway
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
              Receiving file
            </h1>
            <p className="text-[var(--muted)]">
              Room:{" "}
              <code className="px-2 py-0.5 bg-[var(--card)] border border-[var(--border)] rounded text-sm">
                {roomId}
              </code>
            </p>
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6">
            <FileDownloader roomId={roomId} encryptionKey={encryptionKey} />
          </div>

          <p className="text-center text-sm text-[var(--muted)] mt-6">
            Your file is being transferred directly from the sender&apos;s
            device
          </p>
        </div>
      </main>
    </div>
  );
}
