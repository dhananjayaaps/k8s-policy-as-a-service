// API Configuration
// Switch between mock data and real REST endpoints

export const API_CONFIG = {
  // Set to true to use mock data, false to use real REST endpoints
  useMockData: false,  // Changed to false to use real API
  
  // Base URL for REST API endpoints (used when useMockData is false)
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001',
  
  // Request timeout in milliseconds
  timeout: 10000,
  
  // API version (removed from URL construction - backend already has version in routes if needed)
  version: '',
};

// Construct full API URL
export function getApiUrl(endpoint: string): string {
  // Endpoint already includes the leading slash
  return `${API_CONFIG.baseUrl}${endpoint}`;
}
