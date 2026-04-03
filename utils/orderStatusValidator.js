/**
 * Order Status Validation Utility
 * Prevents admin from reverting order status to previous stages
 * Ensures proper order status progression and maintains data integrity
 */

/**
 * Define the order status progression hierarchy
 * Each status has a numeric level - higher numbers represent later stages
 */
export const ORDER_STATUS_LEVELS = {
  "Pending": 1,
  "Confirmed": 2,
  "Processing": 3,
  "Shipped": 4,
  "Out for Delivery": 5,
  "Delivered": 6,
  // Terminal states (can't be changed)
  "Cancelled": 99,
  "Return Requested": 98,
  "Returned": 97,
  "Partially Returned": 96
};

/**
 * Valid status transitions map
 * Defines which statuses can transition to which other statuses
 */
export const VALID_STATUS_TRANSITIONS = {
  "Pending": ["Confirmed", "Cancelled"],
  "Confirmed": ["Processing", "Shipped", "Cancelled"],
  "Processing": ["Shipped", "Cancelled"],
  "Shipped": ["Out for Delivery", "Delivered"],
  "Out for Delivery": ["Delivered"],
  "Delivered": ["Return Requested"], // Only customers can request returns
  // Terminal states - no transitions allowed
  "Cancelled": [],
  "Return Requested": [], // Handled separately by return approval/rejection
  "Returned": [],
  "Partially Returned": []
};

/**
 * Statuses that cannot be changed once set (terminal states)
 */
export const TERMINAL_STATUSES = [
  "Cancelled", 
  "Return Requested", 
  "Returned", 
  "Partially Returned"
];

/**
 * Statuses that can only be set by customers, not admin
 */
export const CUSTOMER_ONLY_STATUSES = [
  "Return Requested"
];

/**
 * Validates if a status transition is allowed
 * @param {string} currentStatus - Current order status
 * @param {string} newStatus - Proposed new status
 * @param {boolean} isAdmin - Whether the change is being made by admin
 * @returns {Object} Validation result
 */
export const validateStatusTransition = (currentStatus, newStatus, isAdmin = true) => {
  // Check if statuses exist
  if (!ORDER_STATUS_LEVELS.hasOwnProperty(currentStatus)) {
    return {
      isValid: false,
      reason: `Invalid current status: ${currentStatus}`,
      errorCode: "INVALID_CURRENT_STATUS"
    };
  }

  if (!ORDER_STATUS_LEVELS.hasOwnProperty(newStatus)) {
    return {
      isValid: false,
      reason: `Invalid new status: ${newStatus}`,
      errorCode: "INVALID_NEW_STATUS"
    };
  }

  // Check if trying to set the same status
  if (currentStatus === newStatus) {
    return {
      isValid: false,
      reason: `Order is already in ${newStatus} status`,
      errorCode: "SAME_STATUS"
    };
  }

  // Check if current status is terminal
  if (TERMINAL_STATUSES.includes(currentStatus)) {
    return {
      isValid: false,
      reason: `Cannot change status from ${currentStatus} - this is a terminal state`,
      errorCode: "TERMINAL_STATUS"
    };
  }

  // Check if admin is trying to set customer-only status
  if (isAdmin && CUSTOMER_ONLY_STATUSES.includes(newStatus)) {
    return {
      isValid: false,
      reason: `Admin cannot set status to ${newStatus} - this can only be set by customers`,
      errorCode: "ADMIN_RESTRICTED_STATUS"
    };
  }

  // Check if the transition is in the valid transitions map
  const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowedTransitions.includes(newStatus)) {
    return {
      isValid: false,
      reason: `Cannot transition from ${currentStatus} to ${newStatus}. Valid transitions: ${allowedTransitions.join(', ')}`,
      errorCode: "INVALID_TRANSITION"
    };
  }

  // Check for backward progression (preventing status reversion)
  const currentLevel = ORDER_STATUS_LEVELS[currentStatus];
  const newLevel = ORDER_STATUS_LEVELS[newStatus];

  // Allow transitions to terminal states regardless of level
  if (!TERMINAL_STATUSES.includes(newStatus) && newLevel < currentLevel) {
    return {
      isValid: false,
      reason: `Cannot revert order status from ${currentStatus} (level ${currentLevel}) to ${newStatus} (level ${newLevel}). Status can only progress forward.`,
      errorCode: "BACKWARD_PROGRESSION"
    };
  }

  return {
    isValid: true,
    reason: `Valid transition from ${currentStatus} to ${newStatus}`,
    currentLevel,
    newLevel
  };
};

/**
 * Gets all valid next statuses for a given current status
 * @param {string} currentStatus - Current order status
 * @param {boolean} isAdmin - Whether the requester is admin
 * @returns {Array} Array of valid next statuses
 */
export const getValidNextStatuses = (currentStatus, isAdmin = true) => {
  if (!ORDER_STATUS_LEVELS.hasOwnProperty(currentStatus)) {
    return [];
  }

  if (TERMINAL_STATUSES.includes(currentStatus)) {
    return [];
  }

  let validStatuses = VALID_STATUS_TRANSITIONS[currentStatus] || [];

  // Filter out customer-only statuses if requester is admin
  if (isAdmin) {
    validStatuses = validStatuses.filter(status => !CUSTOMER_ONLY_STATUSES.includes(status));
  }

  return validStatuses;
};

/**
 * Validates if an order can be cancelled based on its current status
 * @param {string} currentStatus - Current order status
 * @returns {Object} Validation result
 */
export const validateCancellation = (currentStatus) => {
  const cancellableStatuses = ["Pending", "Confirmed", "Processing"];
  
  if (TERMINAL_STATUSES.includes(currentStatus)) {
    return {
      canCancel: false,
      reason: `Cannot cancel order with status ${currentStatus}`
    };
  }

  if (!cancellableStatuses.includes(currentStatus)) {
    return {
      canCancel: false,
      reason: `Cannot cancel order once it reaches ${currentStatus} status`
    };
  }

  return {
    canCancel: true,
    reason: `Order can be cancelled from ${currentStatus} status`
  };
};

/**
 * Validates if a return can be requested based on order status
 * @param {string} currentStatus - Current order status
 * @returns {Object} Validation result
 */
export const validateReturnRequest = (currentStatus) => {
  if (currentStatus !== "Delivered") {
    return {
      canReturn: false,
      reason: "Returns can only be requested for delivered orders"
    };
  }

  return {
    canReturn: true,
    reason: "Return can be requested for delivered order"
  };
};

/**
 * Creates a status history entry
 * @param {string} status - The status being set
 * @param {string} reason - Reason for the status change
 * @param {string} changedBy - Who made the change (admin/system/customer)
 * @returns {Object} Status history entry
 */
export const createStatusHistoryEntry = (status, reason = null, changedBy = "admin") => {
  return {
    status,
    timestamp: new Date(),
    reason: reason || `Status changed to ${status}`,
    changedBy,
    metadata: {
      userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : 'Server',
      timestamp: Date.now()
    }
  };
};

export default {
  ORDER_STATUS_LEVELS,
  VALID_STATUS_TRANSITIONS,
  TERMINAL_STATUSES,
  CUSTOMER_ONLY_STATUSES,
  validateStatusTransition,
  getValidNextStatuses,
  validateCancellation,
  validateReturnRequest,
  createStatusHistoryEntry
};