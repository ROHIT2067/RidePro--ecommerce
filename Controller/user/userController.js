import userService from "../../service/user/userService.js";

const landingPageGet = async (req, res) => {
  try {
    if (req.session.admin) return res.redirect("/admin/dashboard");

    const data = await userService.getHomeData();
    return res.render("home", data);
  } catch (error) {
    console.error("Error loading landingPage:", error);
    return res.redirect("/pageNotFound");
  }
};

const loginGet = (req, res) => {
  if (req.session.user) {
    return res.redirect("/home");
  }
  if (!req.session.admin) {
    const loginErr = req.session.loginErr || null;
    const loginErr1 = req.session.loginErr1 || null;

    delete req.session.loginErr;
    delete req.session.loginErr1;

    res.render("login", {
      loginErr1: loginErr1,
      loginErr: loginErr,
    });
  } else {
    res.redirect("/admin/dashboard");
  }
};

const signupGet = (req, res) => {
  if (req.session.user) {
    return res.redirect("/home");
  }
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }

  const serverError = req.session.flash?.serverError || null;
  delete req.session.flash;

  res.render("signup", { serverError: serverError });
};

const homeGet = async (req, res) => {
  try {
    if (req.session.admin) return res.redirect("/admin/dashboard");
    if (!req.session.user) return res.redirect("/login");

    const data = await userService.getHomeData();
    return res.render("home", data);
  } catch (error) {
    console.error("Error loading home:", error);
    return res.redirect("/");
  }
};

const signUppost = async (req, res) => {
  try {
    const otp = await userService.signup(req.body);
    req.session.userOtp = otp;
    req.session.userData = req.body;

    res.redirect("/verify-otp");
  } catch (error) {
    console.error("Error in signup:", error);
    if (error.message === "User already exists") {
      req.session.flash = { serverError: error.message };
      return res.redirect("/signup");
    }
    res.render("signup", { serverError: error.message || "Error during signup" });
  }
};

const verifyOtpGet = (req, res) => {
  if (req.session.user) {
    return res.redirect("/home");
  }
  if (!req.session.admin) {
    return res.render("verify-otp");
  }
  return res.redirect("/admin/dashboard");
};

const verifyOtpPost = async (req, res) => {
  try {
    const { otp } = req.body;
    const user = await userService.verifyOtp(
      otp,
      req.session.userOtp,
      req.session.userData,
    );

    req.session.user = user._id;
    delete req.session.userOtp;
    delete req.session.userData;

    return res.json({ success: true, redirectUrl: "/" });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    if (error.message === "Invalid OTP, Please try again") {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const resendOtpPost = async (req, res) => {
  try {
    const otp = await userService.resendOtp(req.session.userData);
    req.session.userOtp = otp;

    res.status(200).json({ success: true, message: "OTP Send Successfully" });
  } catch (error) {
    console.error("Error resending OTP:", error);
    const status = error.message === "Email Not Found!" ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

const loginPost = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userService.authenticateUser(email, password);

    req.session.role = user.role;
    if (req.session.role === "admin") {
      req.session.admin = user._id;
      return res.redirect("/admin/dashboard");
    } else {
      req.session.user = user._id;
      return res.redirect("/home");
    }
  } catch (error) {
    console.error("Login error:", error);
    req.session.loginErr = error.message || "Server Error";
    return res.redirect("/login");
  }
};

const logOut = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error in destroying session:", err);
        return res.render("userprofile");
      }

      res.clearCookie("connect.sid");
      res.set("Cache-Control", "no-store");
      return res.redirect("/login");
    });
  } catch (error) {
    console.error("Error logging out:", error);
    return res.redirect("/user-profile");
  }
};

const forgotPasswordGet = (req, res) => {
  if (req.session.user) {
    return res.redirect("/home");
  }

  const serverError = req.session.flash?.serverError || null;
  delete req.session.flash;

  return res.render("SentEmail", { serverError });
};

const forgotPasswordPost = async (req, res) => {
  try {
    const { email } = req.body;
    const otp = await userService.forgotPassword(email);

    req.session.userOtp = otp;
    req.session.email = email;
    return res.redirect("/verify-password");
  } catch (error) {
    console.error("Forgot password error:", error);
    if (
      error.message === "User doesn't exist" ||
      error.message === "This account uses Google login"
    ) {
      req.session.loginErr = error.message;
      return res.redirect("/login");
    }
    return res.render("forgotPassOtp");
  }
};

const passwordVerifyGet = (req, res) => {
  if (req.session.user) {
    return res.redirect("/home");
  }
  if (!req.session.admin) {
    return res.render("forgotPassOtp");
  }
  return res.redirect("/admin/dashboard");
};

const passwordVerifyPost = async (req, res) => {
  try {
    const { otp } = req.body;
    await userService.verifyPasswordOtp(otp, req.session.userOtp);

    req.session.isverified = true;
    delete req.session.userOtp;

    return res.json({ success: true, redirectUrl: "/reset-password" });
  } catch (error) {
    console.error("Error verifying password OTP:", error);
    if (error.message === "Invalid OTP, Please try again") {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const resendOtpPassPost = async (req, res) => {
  try {
    const otp = await userService.resendPasswordOtp(req.session.email);
    req.session.userOtp = otp;

    res.status(200).json({ success: true, message: "OTP Send Successfully" });
  } catch (error) {
    console.error("Error resending password OTP:", error);
    const status = error.message === "Email Not Found!" ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

const resetPassGet = (req, res) => {
  if (req.session.user) {
    return res.redirect("/home");
  }

  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }

  if (req.session.isverified) {
    return res.render("reset-password");
  }
  return res.redirect("/forgot-password");
};

const resetPassPost = async (req, res) => {
  try {
    const { newPassword } = req.body;
    await userService.resetPassword(
      req.session.email,
      newPassword,
      req.session.isverified,
    );

    delete req.session.isverified;
    delete req.session.email;

    return res.redirect("/login");
  } catch (error) {
    console.error("Reset password error:", error);
    if (error.message === "Unauthorized access") {
      return res.redirect("/forgot-password");
    }
    res.render("reset-password", {
      error: "Something went wrong. Try again.",
    });
  }
};

export default {
  loginGet,
  loginPost,
  homeGet,
  signUppost,
  signupGet,
  verifyOtpPost,
  verifyOtpGet,
  resendOtpPost,
  logOut,
  forgotPasswordGet,
  forgotPasswordPost,
  passwordVerifyGet,
  passwordVerifyPost,
  resendOtpPassPost,
  resetPassGet,
  resetPassPost,
  landingPageGet,
};