import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for reliable Netlify hosting (UI is client-side; API is separate).
  output: "export",
  images: { unoptimized: true },
  transpilePackages: [
    "open-makeup-sdk",
    "three",
    "@mediapipe/face_mesh",
    "@mediapipe/camera_utils",
  ],
};

export default nextConfig;
