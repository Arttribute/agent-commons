/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.ipfs.w3s.link",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "github.com",
      },
      {
        protocol: "https",
        hostname: "api.astria.ai",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "cdn1.iconfinder.com",
      },
      {
        protocol: "https",
        hostname: "oaidalleapiprodscus.blob.core.windows.net", // Dalle Imahges
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com", // Added domain for Google user images
      },
      {
        protocol: "https",
        hostname: "edenartlab-stage-data.s3.us-east-1.amazonaws.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com", // Added domain for Google user images
      },
      {
        protocol: "https",
        hostname: "edenartlab-stage-data.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "ipfs.io",
      },
    ],
  },
};

export default nextConfig;
