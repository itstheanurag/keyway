import FileUploader from "@/components/FileUploader";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
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
          </div>

          <nav className="flex items-center gap-6">
            <Link
              href="https://github.com/yourusername/keyway"
              target="_blank"
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                />
              </svg>
              GitHub
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-light)] text-[var(--accent)] text-sm font-medium mb-4">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            End-to-end encrypted
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-[var(--foreground)] mb-4">
            Share files securely
          </h1>
          <p className="text-lg text-[var(--muted)] max-w-xl mx-auto">
            Encrypted peer-to-peer file transfers. No accounts, no storage, no
            tracking. Your files go directly from your device to theirs.
          </p>
        </div>

        {/* File Upload Card */}
        <div className="max-w-xl mx-auto bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
          <FileUploader />
        </div>

        {/* Features */}
        <div className="mt-16 grid md:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl bg-[var(--card)] border border-[var(--border)]">
            <div className="w-10 h-10 rounded-lg bg-[var(--primary-light)] flex items-center justify-center mb-4">
              <svg
                className="w-5 h-5 text-[var(--primary)]"
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
            <h3 className="font-semibold text-[var(--foreground)] mb-2">
              Client-side encryption
            </h3>
            <p className="text-sm text-[var(--muted)]">
              Files are encrypted with AES-256 before leaving your device. The
              key never touches our servers.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-[var(--card)] border border-[var(--border)]">
            <div className="w-10 h-10 rounded-lg bg-[var(--accent-light)] flex items-center justify-center mb-4">
              <svg
                className="w-5 h-5 text-[var(--accent)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-[var(--foreground)] mb-2">
              Direct P2P transfer
            </h3>
            <p className="text-sm text-[var(--muted)]">
              Files transfer directly between browsers via WebRTC. No middleman,
              no storage.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-[var(--card)] border border-[var(--border)]">
            <div className="w-10 h-10 rounded-lg bg-[var(--primary-light)] flex items-center justify-center mb-4">
              <svg
                className="w-5 h-5 text-[var(--primary)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-[var(--foreground)] mb-2">
              Open source
            </h3>
            <p className="text-sm text-[var(--muted)]">
              Fully open source and auditable. Verify the security yourself on
              GitHub.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold text-[var(--foreground)] text-center mb-8">
            How it works
          </h2>
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-4 mb-6">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-semibold text-sm">
                1
              </div>
              <div>
                <h3 className="font-semibold text-[var(--foreground)]">
                  Select your file
                </h3>
                <p className="text-sm text-[var(--muted)]">
                  Choose any file from your device. It&apos;s encrypted
                  instantly in your browser.
                </p>
              </div>
            </div>
            <div className="flex gap-4 mb-6">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-semibold text-sm">
                2
              </div>
              <div>
                <h3 className="font-semibold text-[var(--foreground)]">
                  Share the link
                </h3>
                <p className="text-sm text-[var(--muted)]">
                  Copy the secure link and send it to your recipient. Optionally
                  protect with a password.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-semibold text-sm">
                3
              </div>
              <div>
                <h3 className="font-semibold text-[var(--foreground)]">
                  They download
                </h3>
                <p className="text-sm text-[var(--muted)]">
                  When they open the link, a direct connection is established
                  and the file transfers securely.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] mt-16">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <span>Built with privacy in mind</span>
              <span>•</span>
              <Link
                href="https://github.com/yourusername/keyway"
                className="hover:text-[var(--foreground)]"
              >
                View source
              </Link>
            </div>
            <div className="text-sm text-[var(--muted)]">
              No cookies • No tracking • No accounts
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
