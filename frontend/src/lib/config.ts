// API Configuration
// Switch between mock data and real REST endpoints

export const API_CONFIG = {
  // Set to true to use mock data, false to use real REST endpoints
  useMockData: true,
  
  // Base URL for REST API endpoints (used when useMockData is false)
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api',
  
  // Request timeout in milliseconds
  timeout: 10000,
  
  // API version
  version: 'v1',
};

// Construct full API URL
export function getApiUrl(endpoint: string): string {
  return `${API_CONFIG.baseUrl}/${API_CONFIG.version}${endpoint}`;
}
