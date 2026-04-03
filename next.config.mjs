/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['ssh2', 'ssh2-sftp-client'],
};

export default nextConfig;
