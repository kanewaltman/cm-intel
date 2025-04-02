export const config = {
  // API call frequency in milliseconds
  // Default: 24 hours (for production)
  // Can be set to lower values for testing
  UPDATE_INTERVAL: 24 * 60 * 60 * 1000,
  
  // Maximum retries for failed API calls
  MAX_RETRIES: 3,
  
  // Maximum number of historical summaries to display
  MAX_HISTORICAL_SUMMARIES: 30,
  
  // Cache duration in milliseconds (24 hours)
  CACHE_DURATION: 24 * 60 * 60 * 1000,
} as const;