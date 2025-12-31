/**
 * Get the API URL from Redis via server-side config endpoint
 * Always reads from Redis - no localhost fallback
 */
export const getApiUrl = async (): Promise<string> => {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    
    if (config.apiUrl) {
      return config.apiUrl;
    }
    
    throw new Error('API URL not found in Redis');
  } catch (error) {
    console.error('Failed to fetch API URL from Redis:', error);
    throw new Error('Backend API URL not configured. Please ensure the backend is running and connected to Redis.');
  }
};

/**
 * Get API URL synchronously (for use in non-async contexts)
 * Returns empty string - should use async getApiUrl instead
 */
export const getApiUrlSync = (): string => {
  // This should not be used - always use getApiUrl() async version
  console.warn('getApiUrlSync() called - API URL should be fetched asynchronously from Redis');
  return '';
};

