import adminService from "../../service/admin/adminService.js";

const adminLoginGet = (req, res) => {
  if (!req.session.admin) {
    if (!req.session.user) {
      const loginErr = req.session.loginErr || null;
      const loginErr1 = req.session.loginErr1 || null;

      delete req.session.loginErr;
      delete req.session.loginErr1;

      res.render("adminLogin", {
        loginErr1: loginErr1,
        loginErr: loginErr,
      });
    } else {
      res.redirect("/home");
    }
  } else {
    res.redirect("/admin/dashboard");
  }
};

const adminLoginPost = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await adminService.authenticateAdmin(email, password);

    req.session.role = admin.role;
    req.session.admin = admin._id;
    return res.redirect("/admin/dashboard");
  } catch (error) {
    console.error("login error ", error);
    if (
      error.message === "You are not authorized to access the admin panel." ||
      error.message === "Invalid Credentials"
    ) {
      req.session.loginErr = error.message;
    } else {
      req.session.loginErr = "Server Error";
    }
    return res.redirect("/admin/login");
  }
};

const adminDashboardGet = (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/login");
  }

  return res.render("adminDashboard", {
    success_msg: req.session.success_msg || "",
    error_msg: req.session.error_msg || "",
  });
};

const logOut = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.error("error in destroying session : ", err);
        return res.render("adminDashboard");
      }

      res.clearCookie("connect.sid");
      res.set("Cache-Control", "no-store");
      return res.redirect("/login");
    });
  } catch (error) {
    console.error("Error in logging out : ", error);
    return res.redirect("/admin/dashboard");
  }
};

export default { adminDashboardGet, logOut, adminLoginGet, adminLoginPost };