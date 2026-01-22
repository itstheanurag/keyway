"use client";

import { motion } from "framer-motion";
import { Github } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

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
          <div className="relative w-10 h-10 rounded-xl bg-orange-50 overflow-hidden flex items-center justify-center border border-orange-100">
            <Image
              src="/mascot.png"
              alt="Keyway Logo"
              width={40}
              height={40}
              className="object-contain"
            />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-700">
            Keyway
          </span>
        </Link>

        <nav className="flex items-center gap-8">
          <Link
            href="/receive"
            className="text-sm font-medium text-gray-600 hover:text-orange-600 transition-colors"
          >
            Receive File
          </Link>
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
