/**
 * Environment variable utility to safely access environment variables
 * with type checking and default values.
 */

// AI API Keys
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
export const STABILITY_AI_KEY = process.env.STABILITY_AI_KEY || '';
export const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY || '';
export const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || '';

// Configuration settings
export const AI_MODEL_TEMPERATURE = Number(process.env.AI_MODEL_TEMPERATURE || '0.7');
export const AI_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || '1024');
export const API_REQUEST_TIMEOUT = Number(process.env.API_REQUEST_TIMEOUT || '30000');

/**
 * Check if an API key is configured
 * @param key The API key to check
 * @returns boolean indicating if the key is configured
 */
export const isApiKeyConfigured = (key: string): boolean => {
  return !!key && key.length > 0;
};

/**
 * Get all configured AI providers
 * @returns Array of provider names that have API keys configured
 */
export const getConfiguredProviders = (): string[] => {
  const providers: string[] = [];
  
  if (isApiKeyConfigured(OPENAI_API_KEY)) providers.push('openai');
  if (isApiKeyConfigured(ANTHROPIC_API_KEY)) providers.push('anthropic');
  if (isApiKeyConfigured(STABILITY_AI_KEY)) providers.push('stability');
  if (isApiKeyConfigured(HUGGINGFACE_API_KEY)) providers.push('huggingface');
  if (isApiKeyConfigured(GOOGLE_AI_API_KEY)) providers.push('google');
  
  return providers;
}; 