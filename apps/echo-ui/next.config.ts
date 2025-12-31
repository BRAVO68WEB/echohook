import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

console.log('process.env', process.env);
console.log('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL);

export default nextConfig;
