"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import FileUploader from "@/components/FileUploader";
import { Shield, Zap } from "lucide-react";

const fadeInUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export function HeroSection() {
  return (
    <section className="max-w-5xl mx-auto px-6 mb-40 pt-16 text-center">
      <motion.div
        initial="initial"
        animate="animate"
        variants={fadeInUp}
        className="flex flex-col items-center"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-50 text-orange-600 text-sm font-medium mb-12 border border-orange-100">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
          </span>
          Secure P2P File Transfer
        </div>

        <h1 className="text-6xl lg:text-8xl font-bold text-gray-900 leading-[1] mb-8 tracking-tight">
          Share files securely, <br />
          <span className="text-orange-500">keep them secret.</span>
        </h1>

        <p className="text-2xl text-gray-500 mb-16 leading-relaxed max-w-2xl">
          End-to-end encrypted file sharing that transmits directly between
          devices. No servers, no storage, no trace left behind.
        </p>

        <div className="relative w-full max-w-2xl mx-auto mb-20 z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-orange-100/50 to-transparent rounded-[3rem] transform scale-105 -z-10 blur-xl opacity-60" />

          <div className="relative bg-white border border-gray-100 shadow-2xl shadow-orange-500/10 rounded-[2.5rem] p-3 overflow-visible">
            <FileUploader />
          </div>

          <div className="absolute -bottom-16 left-0 right-0 flex justify-center gap-8 text-sm font-medium text-gray-500">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-500" />
              <span>AES-256 Encryption</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-green-500" />
              <span>Powered by WebRTC</span>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
