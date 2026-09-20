/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@libsql/client'],
  // A production build writes somewhere else, so running `npm run build` while
  // `npm run dev` is up can no longer clobber the dev server's chunks.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
export default nextConfig;
