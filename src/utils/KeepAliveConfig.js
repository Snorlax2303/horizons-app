/**
 * Configuration options for the Supabase Keep-Alive Service
 */

export const INTERVAL_1_DAY = 86400000;
export const INTERVAL_2_DAYS = 172800000;
export const INTERVAL_3_DAYS = 259200000;
export const INTERVAL_5_DAYS = 432000000;
export const INTERVAL_7_DAYS = 604800000;

const defaultConfig = {
  /** Enables or disables the keep-alive service globally */
  enabled: true,
  /** Interval between pings in milliseconds (updated to 2 days) */
  interval: INTERVAL_2_DAYS,
  /** Number of times to retry a failed ping */
  retryAttempts: 3,
  /** Base delay between retries in milliseconds (exponential backoff applies) */
  retryDelay: 5000,
  /** Maximum number of logs to keep in localStorage */
  logMaxEntries: 50,
  /** Whether to show the UI monitor component */
  showMonitor: false,
  /** Enables console logging and advanced debug info */
  debugMode: false
};

/**
 * Merges user configuration with default configuration
 * @param {Object} userConfig - Partial configuration object
 * @returns {Object} Merged configuration
 */
export const mergeConfig = (userConfig = {}) => {
  return { ...defaultConfig, ...userConfig };
};

export default defaultConfig;