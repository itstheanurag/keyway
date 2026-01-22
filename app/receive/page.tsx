"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Download, ArrowRight, Shield } from "lucide-react";

export default function ReceivePage() {
  const [roomId, setRoomId] = useState("");
  const router = useRouter();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      // Redirect to the download page
      // We don't have the key yet, so this will only work if the link has a hash or if we prompt for it
      // But for a simple "receive" page, usually people enter a code
      // We'll assume the code is the roomId and navigate there
      router.push(`/d/${roomId.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col selection:bg-orange-100 selection:text-orange-900">
      <Navbar />

      <main className="flex-1 pt-40 pb-20 px-6">
        <div className="max-w-xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="w-16 h-16 rounded-3xl bg-orange-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-500/20">
              <Download className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4 tracking-tight">
              Receive a File
            </h1>
            <p className="text-gray-500 text-lg">
              Enter the room code shared with you to start the secure P2P
              transfer.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-2xl shadow-orange-500/5"
          >
            <form onSubmit={handleJoin} className="space-y-6">
              <div>
                <label
                  htmlFor="room-id"
                  className="block text-sm font-bold text-gray-700 mb-2 px-1"
                >
                  Room Code
                </label>
                <input
                  id="room-id"
                  type="text"
                  placeholder="e.g. a1b2c3d4"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 text-lg font-mono transition-all"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={!roomId.trim()}
                className="w-full py-4 bg-orange-500 text-white font-bold rounded-2xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Connect to Sender</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-gray-50 flex items-center justify-center gap-6 text-sm text-gray-400 font-medium">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-500" />
                <span>P2P Secure</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-gray-200" />
              <span>No data stored</span>
            </div>
          </motion.div>

          <p className="text-center mt-8 text-sm text-gray-400">
            Don't have a code? Ask the sender to share the link or room code
            with you.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
