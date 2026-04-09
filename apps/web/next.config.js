/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@govtech-bb/form-types",
    "@govtech-bb/form-conditions",
  ],
};

module.exports = nextConfig;
