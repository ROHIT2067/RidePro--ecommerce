import userCollection from "../Models/UserModel.js";

/**
 * In-memory cache for blocked user status
 * Structure: { userId: { isBlocked: boolean, timestamp: number } }
 */
const blockedUserCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache TTL (adjustable based on your needs)

/**
 * Clear cache entry for a specific user
 * Call this when admin blocks/unblocks a user
 */
export function clearBlockedUserCache(userId) {
  if (userId) {
    blockedUserCache.delete(userId.toString());
    console.log(`Cleared block status cache for user: ${userId}`);
  }
}

/**
 * Clear entire cache (useful for testing or manual refresh)
 */
export function clearAllBlockedUserCache() {
  blockedUserCache.clear();
  console.log("Cleared all blocked user cache");
}

/**
 * Check if cached data is still valid
 */
function isCacheValid(cacheEntry) {
  if (!cacheEntry) return false;
  return Date.now() - cacheEntry.timestamp < CACHE_TTL;
}

/**
 * Get user block status with caching
 */
async function getUserBlockStatus(userId) {
  const userIdStr = userId.toString();
  const cached = blockedUserCache.get(userIdStr);

  // Return cached value if valid
  if (cached && isCacheValid(cached)) {
    return cached.isBlocked;
  }

  // Fetch from database
  try {
    const user = await userCollection.findById(userId).select("is_blocked").lean();
    
    if (!user) {
      // User doesn't exist anymore
      blockedUserCache.delete(userIdStr);
      return null; // Will be handled as blocked
    }

    // Update cache
    blockedUserCache.set(userIdStr, {
      isBlocked: user.is_blocked,
      timestamp: Date.now()
    });

    return user.is_blocked;
  } catch (error) {
    console.error(`Error checking user block status:`, error);
    // On error, don't cache and return null (fail-safe)
    return null;
  }
}

/**
 * Destroy user session and clear cookies
 */
function destroyUserSession(req, res, callback) {
  const userId = req.session.user;
  
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    
    // Clear session cookie
    res.clearCookie("ridepro.session");
    res.clearCookie("connect.sid");
    
    // Set cache control headers
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    
    console.log(`Session destroyed for blocked user: ${userId}`);
    
    if (callback) callback();
  });
}

/**
 * Middleware to check if user is blocked (for page requests)
 * Redirects to login with error message
 */
export async function checkUserBlocked(req, res, next) {
  // Skip if no user session
  if (!req.session.user) {
    return next();
  }

  try {
    const isBlocked = await getUserBlockStatus(req.session.user);

    // User not found or blocked
    if (isBlocked === null || isBlocked === true) {
      console.log(`Blocked user attempted access: ${req.session.user}`);
      
      // Store error message before destroying session
      const errorMessage = isBlocked === null 
        ? "Your account no longer exists. Please contact support."
        : "Your account has been blocked. Please contact support for assistance.";
      
      // Store the error message in a variable before destroying session
      const userId = req.session.user;
      
      // Destroy session and redirect
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
        }
        
        // Clear session cookies
        res.clearCookie("ridepro.session");
        res.clearCookie("connect.sid");
        
        // Set cache control headers
        res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
        res.set("Pragma", "no-cache");
        res.set("Expires", "0");
        
        console.log(`Session destroyed for blocked user: ${userId}`);
        
        // Redirect to login with error message in query parameter
        const encodedMessage = encodeURIComponent(errorMessage);
        res.redirect(`/login?blocked=true&message=${encodedMessage}`);
      });
      
      return;
    }

    // User is active, continue
    next();
  } catch (error) {
    console.error("Error in checkUserBlocked middleware:", error);
    // On error, allow request to continue (fail-open for availability)
    // But log for monitoring
    next();
  }
}

/**
 * Middleware to check if user is blocked (for API requests)
 * Returns JSON error response
 */
export async function checkUserBlockedAPI(req, res, next) {
  // Skip if no user session
  if (!req.session.user) {
    return next();
  }

  try {
    const isBlocked = await getUserBlockStatus(req.session.user);

    // User not found or blocked
    if (isBlocked === null || isBlocked === true) {
      console.log(`Blocked user attempted API access: ${req.session.user}`);
      
      const errorMessage = isBlocked === null 
        ? "Your account no longer exists."
        : "Your account has been blocked. Please contact support.";
      
      const userId = req.session.user;
      
      // Destroy session and return JSON
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
        }
        
        res.clearCookie("ridepro.session");
        res.clearCookie("connect.sid");
        res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
        
        console.log(`Session destroyed for blocked user: ${userId}`);
        
        res.status(403).json({
          success: false,
          blocked: true,
          message: errorMessage,
          redirectUrl: "/login"
        });
      });
      
      return;
    }

    // User is active, continue
    next();
  } catch (error) {
    console.error("Error in checkUserBlockedAPI middleware:", error);
    // On error, allow request to continue (fail-open for availability)
    next();
  }
}

/**
 * Combined middleware: Require user AND check if blocked (for pages)
 */
export async function requireActiveUser(req, res, next) {
  // First check if user is logged in
  if (!req.session.user) {
    return res.redirect("/login");
  }

  // Then check if user is blocked
  try {
    const isBlocked = await getUserBlockStatus(req.session.user);

    if (isBlocked === null || isBlocked === true) {
      const errorMessage = isBlocked === null 
        ? "Your account no longer exists. Please contact support."
        : "Your account has been blocked. Please contact support for assistance.";
      
      const userId = req.session.user;
      
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
        }
        
        res.clearCookie("ridepro.session");
        res.clearCookie("connect.sid");
        res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
        
        console.log(`Session destroyed for blocked user: ${userId}`);
        
        const encodedMessage = encodeURIComponent(errorMessage);
        res.redirect(`/login?blocked=true&message=${encodedMessage}`);
      });
      
      return;
    }

    next();
  } catch (error) {
    console.error("Error in requireActiveUser middleware:", error);
    next();
  }
}

/**
 * Combined middleware: Require user AND check if blocked (for API)
 */
export async function requireActiveUserAPI(req, res, next) {
  // First check if user is logged in
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Please login to access this resource"
    });
  }

  // Then check if user is blocked
  try {
    const isBlocked = await getUserBlockStatus(req.session.user);

    if (isBlocked === null || isBlocked === true) {
      const errorMessage = isBlocked === null 
        ? "Your account no longer exists."
        : "Your account has been blocked. Please contact support.";
      
      const userId = req.session.user;
      
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session:", err);
        }
        
        res.clearCookie("ridepro.session");
        res.clearCookie("connect.sid");
        res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
        
        console.log(`Session destroyed for blocked user: ${userId}`);
        
        res.status(403).json({
          success: false,
          blocked: true,
          message: errorMessage,
          redirectUrl: "/login"
        });
      });
      
      return;
    }

    next();
  } catch (error) {
    console.error("Error in requireActiveUserAPI middleware:", error);
    // On error, return 500
    res.status(500).json({
      success: false,
      message: "Server error checking user status"
    });
  }
}

/**
 * Periodic cache cleanup (optional)
 * Removes stale entries to prevent memory leaks
 */
export function startCacheCleanup(intervalMs = 300000) { // 5 minutes default
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [userId, entry] of blockedUserCache.entries()) {
      if (now - entry.timestamp > CACHE_TTL * 2) {
        blockedUserCache.delete(userId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cleaned ${cleaned} stale cache entries`);
    }
  }, intervalMs);
}
