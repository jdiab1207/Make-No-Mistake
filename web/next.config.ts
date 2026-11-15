import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: [
    "open-makeup-sdk",
    "three",
    "@mediapipe/face_mesh",
    "@mediapipe/camera_utils",
  ],
};

export default nextConfig;
