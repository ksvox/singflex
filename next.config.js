/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false,
  async headers() {
    return [{ source: '/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  }
};
