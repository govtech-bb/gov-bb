/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@govtech-bb/form-types", "@govtech-bb/form-conditions"],
};

export default nextConfig;
