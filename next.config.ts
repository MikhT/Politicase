import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Official parliament photo hosts
      { protocol: "https", hostname: "documenti.camera.it" },
      { protocol: "https", hostname: "www.senato.it" },
    ],
  },
};

export default nextConfig;
