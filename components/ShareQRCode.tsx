"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface ShareQRCodeProps {
  url: string;
  size?: number;
  className?: string;
}

export default function ShareQRCode({
  url,
  size = 160,
  className = "",
}: ShareQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !url) return;

    QRCode.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#1f2937",
        light: "#ffffff",
      },
    }).catch((err) => console.error("QR generation failed:", err));
  }, [url, size]);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <canvas
        ref={canvasRef}
        className="rounded-xl border border-gray-200 bg-white p-2"
      />
      <p className="mt-2 text-xs text-gray-500 text-center">
        Scan to receive file
      </p>
    </div>
  );
}