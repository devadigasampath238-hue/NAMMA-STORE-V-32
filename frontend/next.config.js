/** @type {import('next').NextConfig} */

// All storefront images render through <SafeImage> (a plain <img>), which
// does not need this list. It is kept complete so that any future use of
// next/image works with Cloudinary and the local backend too.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

let apiPattern = null;
try {
  const u = new URL(apiUrl);
  apiPattern = {
    protocol: u.protocol.replace(":", ""),
    hostname: u.hostname,
    port: u.port,
    pathname: "/**",
  };
} catch {
  // invalid NEXT_PUBLIC_API_URL - ignore, the other patterns still apply
}

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost", port: "8080", pathname: "/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "8080", pathname: "/**" },
      apiPattern,
    ].filter(Boolean),
  },
};
module.exports = nextConfig;
