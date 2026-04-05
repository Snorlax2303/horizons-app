// Service to handle system logging
// Stores logs in localStorage initially, designed to migrate to Supabase

const LOG_STORAGE_KEY = 'system_logs';

/**
 * Log levels
 */
export const LOG_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error'
};

/**
 * Log an event to the system logs
 * @param {string} level - one of LOG_LEVELS
 * @param {string} entityType - e.g., 'campanha', 'cliente', 'sistema'
 * @param {string|number} entityId - ID of the related entity
 * @param {string} message - Short description
 * @param {object} details - JSON object with full details (response body, headers, etc.)
 */
export const logEvent = (level, entityType, entityId, message, details = {}) => {
  const newLog = {
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    level,
    entity_type: entityType,
    entity_id: entityId,
    message,
    details_json: details
  };

  try {
    const existingLogs = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || '[]');
    // Keep only last 1000 logs to prevent localStorage overflow
    const updatedLogs = [newLog, ...existingLogs].slice(0, 1000);
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(updatedLogs));
    
    // In production, this would be:
    // supabase.from('logs').insert(newLog);
    
    console.log(`[LOG - ${level.toUpperCase()}] ${message}`, details);
  } catch (err) {
    console.error('Failed to save log:', err);
  }
};

/**
 * Retrieve logs with optional filtering
 */
export const getLogs = ({ entityType, entityId, level, startDate, endDate } = {}) => {
  try {
    let logs = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || '[]');

    if (entityType) {
      logs = logs.filter(l => l.entity_type === entityType);
    }
    if (entityId) {
      logs = logs.filter(l => String(l.entity_id) === String(entityId));
    }
    if (level) {
      logs = logs.filter(l => l.level === level);
    }
    if (startDate) {
      logs = logs.filter(l => new Date(l.timestamp) >= new Date(startDate));
    }
    if (endDate) {
      logs = logs.filter(l => new Date(l.timestamp) <= new Date(endDate));
    }

    return logs;
  } catch (err) {
    console.error('Failed to retrieve logs:', err);
    return [];
  }
};

/**
 * Clear all logs
 */
export const clearLogs = () => {
  localStorage.removeItem(LOG_STORAGE_KEY);
};