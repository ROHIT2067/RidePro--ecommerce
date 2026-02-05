export function blockIfLoggedIn(req, res, next) {
  if (req.session.user) {
    return res.redirect("/home");
  }
  next();
}