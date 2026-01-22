"use client";

import { Shield } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 pt-20 pb-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-16 mb-16">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-gray-900">Keyway</span>
            </div>
            <p className="text-gray-500 text-lg max-w-md leading-relaxed">
              Open source, end-to-end encrypted file sharing for everyone. Built
              with privacy as a fundamental right.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-gray-900 text-lg mb-6">Project</h4>
            <ul className="space-y-4 text-gray-500">
              <li>
                <a href="#" className="hover:text-orange-500 transition-colors">
                  Source Code
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-orange-500 transition-colors">
                  Issues
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-orange-500 transition-colors">
                  License
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-gray-900 text-lg mb-6">Legal</h4>
            <ul className="space-y-4 text-gray-500">
              <li>
                <a href="#" className="hover:text-orange-500 transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-orange-500 transition-colors">
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-8 flex flex-col md:flex-row items-center justify-between gap-6 text-gray-400">
          <p>© 2024 Keyway. All rights reserved.</p>
          <div className="flex items-center gap-8">
            <span>No Cookies</span>
            <span>No Tracking</span>
            <span>No Logs</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
