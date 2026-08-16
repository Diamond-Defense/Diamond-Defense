import adapter from '@sveltejs/adapter-cloudflare';

const config = {
  kit: {
    adapter: adapter(),
    paths: {
      base: process.env.BASE_PATH || '',
    },
  },
};

export default config;
