/**
 * Get the API URL with consistent fallback logic
 * Works with Dokploy runtime environment variables
 */
export const getApiUrl = async (): Promise<string> => {
  // Try to fetch from server-side config endpoint
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    
    if (config.apiUrl) {
      return config.apiUrl;
    }
  } catch (error) {
    console.error('Failed to fetch API config:', error);
  }
  
  // Fallback: auto-detect from current hostname
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    // Use same hostname but assume backend is on same origin or port 8080
    // If frontend is on port 3000, backend is likely on 8080
    const port = window.location.port === '3000' ? '8080' : window.location.port || '';
    return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
  }
  
  // Last resort fallback
  return 'http://localhost:8080';
};

/**
 * Get API URL synchronously (for use in non-async contexts)
 * Uses window.location detection
 */
export const getApiUrlSync = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port === '3000' ? '8080' : window.location.port || '';
    return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
  }
  return 'http://localhost:8080';
};

