"use client";

import { motion } from "framer-motion";
import { Shield, Github } from "lucide-react";
import Link from "next/link";

export function Navbar() {
  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "circOut" }}
      className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100"
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-700">
            Keyway
          </span>
        </Link>

        <nav className="flex items-center gap-8">
          <Link
            href="https://github.com/itstheanurag/keyway"
            target="_blank"
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-orange-600 transition-colors"
          >
            <Github className="w-4 h-4" />
            <span>Source Code</span>
          </Link>
        </nav>
      </div>
    </motion.header>
  );
}
