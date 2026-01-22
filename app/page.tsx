import FileUploader from "@/components/FileUploader";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Keyway</h1>
          <p className="text-gray-600">Secure, encrypted file sharing</p>
          <p className="text-sm text-gray-500 mt-1">
            Files are encrypted before leaving your device
          </p>
        </div>

        <FileUploader />

        <div className="mt-8 text-center text-xs text-gray-400">
          <p>End-to-end encrypted • No accounts • No storage</p>
          <p className="mt-1">Files transfer directly between devices</p>
        </div>
      </div>
    </main>
  );
}
