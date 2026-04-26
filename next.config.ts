import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",      // static export for Tauri
  images: { unoptimized: true }, // required for static export
};

export default nextConfig;
