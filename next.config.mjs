/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    AI_MODEL_TEMPERATURE: process.env.AI_MODEL_TEMPERATURE,
    AI_MAX_TOKENS: process.env.AI_MAX_TOKENS,
    API_REQUEST_TIMEOUT: process.env.API_REQUEST_TIMEOUT
  }
};

export default nextConfig;
