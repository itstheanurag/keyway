"use client";

import { motion } from "framer-motion";
import { Lock, Shield, Github, ArrowRight, Zap } from "lucide-react";
import Link from "next/link";

export function FeaturesGrid() {
  return (
    <section className="max-w-7xl mx-auto px-6 mb-32">
      <div className="mb-20 text-center max-w-3xl mx-auto">
        <h2 className="text-4xl font-bold text-gray-900 mb-6">
          Security by Default
        </h2>
        <p className="text-gray-500 text-xl leading-relaxed">
          We don't trust servers. That's why your data is encrypted before it
          ever leaves your browser.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="bg-white p-10 rounded-[2rem] border border-gray-100 shadow-xl shadow-gray-200/50 col-span-1 md:col-span-2 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
          <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
            <Lock className="w-40 h-40 text-orange-500" />
          </div>
          <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mb-8 text-orange-600">
            <Shield className="w-7 h-7" />
          </div>
          <h3 className="text-3xl font-bold text-gray-900 mb-4">
            Client-Side Encryption
          </h3>
          <p className="text-gray-500 text-lg leading-relaxed max-w-md">
            Every file is encrypted with a unique AES-GCM 256-bit key generated
            in your browser. The key is part of the share link and is never sent
            to our servers. We physically cannot read your files.
          </p>
        </div>

        <div className="bg-gray-900 p-10 rounded-[2rem] border border-gray-800 shadow-xl text-white relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
          <div className="absolute -bottom-8 -right-8 opacity-20 transform rotate-12 group-hover:scale-110 transition-transform duration-500">
            <Code2 className="w-48 h-48 text-gray-500" />
          </div>
          <div className="w-14 h-14 bg-gray-800 rounded-2xl flex items-center justify-center mb-8 border border-gray-700">
            <Github className="w-7 h-7" />
          </div>
          <h3 className="text-2xl font-bold mb-4">100% Open Source</h3>
          <p className="text-gray-400 text-lg leading-relaxed mb-8">
            Trust, but verify. Our entire codebase is open source and available
            for audit. No hidden backdoors.
          </p>
          <Link
            href="#"
            className="inline-flex items-center gap-2 text-orange-400 hover:text-orange-300 font-medium text-lg"
          >
            View Repository <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        <div className="bg-orange-500 p-10 rounded-[2rem] shadow-xl shadow-orange-500/20 text-white md:col-span-3 flex flex-col md:flex-row items-center justify-between gap-10 hover:-translate-y-1 transition-transform duration-300">
          <div className="max-w-2xl">
            <h3 className="text-3xl font-bold mb-4">
              Direct Peer-to-Peer Transfer
            </h3>
            <p className="text-orange-100 text-xl leading-relaxed">
              Using WebRTC, files stream directly between devices. This means
              faster transfers, no storage limits, and better privacy. The
              server is only used for the initial handshake.
            </p>
          </div>
          <div className="flex-shrink-0 bg-white/10 backdrop-blur-sm p-6 rounded-3xl border border-white/20">
            <Zap className="w-16 h-16 text-white" />
          </div>
        </div>
      </div>
    </section>
  );
}

// Internal component for icons fix
function Code2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
