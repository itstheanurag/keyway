import { Lock, Zap, Share2, Shield } from "lucide-react";

export function TrustSection() {
  return (
    <section className="border-y border-gray-100 bg-white py-20 mb-32">
      <div className="max-w-7xl mx-auto px-6">
        <p className="text-center text-sm font-semibold text-gray-400 uppercase tracking-widest mb-12">
          Powered by modern cryptography
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
          <div className="flex items-center justify-center gap-3 font-semibold text-2xl">
            <Lock className="w-8 h-8" /> WebCrypto
          </div>
          <div className="flex items-center justify-center gap-3 font-semibold text-2xl">
            <Zap className="w-8 h-8" /> WebRTC
          </div>
          <div className="flex items-center justify-center gap-3 font-semibold text-2xl">
            <Share2 className="w-8 h-8" /> Socket.io
          </div>
          <div className="flex items-center justify-center gap-3 font-semibold text-2xl">
            <Shield className="w-8 h-8" /> AES-256
          </div>
        </div>
      </div>
    </section>
  );
}
