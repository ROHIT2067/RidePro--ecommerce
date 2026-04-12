// Redirect if user is already logged in (for auth pages like login, signup)
export function blockIfLoggedIn(req, res, next) {
  if (req.session.user) {
    return res.redirect("/home");
  }
  next();
}

// Require admin session for admin routes
export function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  next();
}

// Require user session for user routes (redirects to login)
export function requireUser(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

// Require user session for API routes (returns 401 JSON)
export function requireUserAPI(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ 
      success: false, 
      message: "Please login to access this resource" 
    });
  }
  next();
}

// Redirect admin to dashboard if they try to access user pages
export function redirectIfAdmin(req, res, next) {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }
  next();
}

// Redirect user to home if they try to access auth pages (login, signup, etc.)
export function redirectIfUser(req, res, next) {
  if (req.session.user) {
    return res.redirect("/home");
  }
  next();
}

// Combined middleware for user pages that should redirect admin and require user
export function userPageAccess(req, res, next) {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

// Combined middleware for auth pages that should redirect both admin and user
export function authPageAccess(req, res, next) {
  if (req.session.user) {
    return res.redirect("/home");
  }
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }
  next();
}

// use this ONLY on the PayPal success route
export function requireUserSoft(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    req.session.save((err) => {
      if (err) console.error("Session save error:", err);
      res.redirect("/login");
    });
    return; // ← return here, outside the callback, stops next() from firing
  }
  next();
}