"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import FileDownloader from "@/components/FileDownloader";

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
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
        <div className="w-full max-w-xl text-center">
          <div className="text-4xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-red-600 mb-2">Invalid Link</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </main>
    );
  }

  if (!encryptionKey) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
        <div className="w-full max-w-xl text-center">
          <div className="text-4xl mb-4 animate-pulse">🔐</div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Keyway</h1>
          <p className="text-gray-600">Receiving encrypted file...</p>
        </div>

        <FileDownloader roomId={roomId} encryptionKey={encryptionKey} />

        <div className="mt-8 text-center text-xs text-gray-400">
          <p>End-to-end encrypted • Direct P2P transfer</p>
        </div>
      </div>
    </main>
  );
}
