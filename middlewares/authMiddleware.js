export function blockIfLoggedIn(req, res, next) {
  if (req.session.user) {
    return res.redirect("/home");
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  next();
}