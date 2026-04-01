import userService from "../../service/user/userService.js";
import { SignUpSchema, ForgotPasswordSchema, ResetPasswordSchema, VerifyOtpSchema, LoginSchema } from "../../schemas/index.js";

const landingPageGet = async (req, res) => {
  try {
    const data = await userService.getHomeData();
    return res.render("home", data);
  } catch (error) {
    console.error("Error loading landingPage:", error);
    return res.redirect("/pageNotFound");
  }
};

const loginGet = (req, res) => {
  const loginErr = req.session.loginErr || null;
  const loginErr1 = req.session.loginErr1 || null;

  delete req.session.loginErr;
  delete req.session.loginErr1;

  res.render("login", {
    loginErr1: loginErr1,
    loginErr: loginErr,
  });
};

const signupGet = (req, res) => {
  const serverError = req.session.flash?.serverError || null;
  delete req.session.flash;

  res.render("signup", { serverError: serverError });
};

const homeGet = async (req, res) => {
  try {
    const data = await userService.getHomeData();
    return res.render("home", data);
  } catch (error) {
    console.error("Error loading home:", error);
    return res.redirect("/");
  }
};

const signUppost = async (req, res) => {
  try {
    const result = SignUpSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const firstError = Object.values(errors)[0]?.[0] || "Validation failed";
      req.session.flash = { serverError: firstError };
      return res.redirect("/signup");
    }

    const signupResult = await userService.signup(result.data);
    console.log("Generated OTP for signup:", signupResult.otp || signupResult);
    
    // Handle both old and new return formats
    if (typeof signupResult === 'object' && signupResult.otp) {
      req.session.userOtp = signupResult.otp;
      req.session.referrer = signupResult.referrer;
    } else {
      req.session.userOtp = signupResult;
    }
    
    req.session.userData = result.data;

    res.redirect("/verify-otp?new=1");
  } catch (error) {
    console.error("Error in signup:", error);
    if (error.message === "User already exists" || 
        error.message.includes("referral code") || 
        error.message.includes("Referral code")) {
      req.session.flash = { serverError: error.message };
      return res.redirect("/signup");
    }
    res.render("signup", { serverError: error.message || "Error during signup" });
  }
};

const verifyOtpGet = (req, res) => {
  return res.render("verify-otp");
};

const verifyOtpPost = async (req, res) => {
  try {
    const result = VerifyOtpSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const firstError = Object.values(errors)[0]?.[0] || "Validation failed";
      return res.status(400).json({ success: false, message: firstError });
    }

    const { otp } = result.data;
    const user = await userService.verifyOtp(
      otp,
      req.session.userOtp,
      req.session.userData,
      req.session.referrer
    );

    req.session.user = user._id;
    delete req.session.userOtp;
    delete req.session.userData;
    delete req.session.referrer;

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
    console.log("Resent OTP:", otp);
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
    const result = LoginSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const firstError = Object.values(errors)[0]?.[0] || "Validation failed";
      req.session.loginErr = firstError;
      return res.redirect("/login");
    }

    const { email, password } = result.data;
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
  const serverError = req.session.flash?.serverError || null;
  delete req.session.flash;

  return res.render("SentEmail", { serverError });
};

const forgotPasswordPost = async (req, res) => {
  try {
    const result = ForgotPasswordSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const firstError = Object.values(errors)[0]?.[0] || "Validation failed";
      req.session.loginErr = firstError;
      return res.redirect("/login");
    }

    const { email } = result.data;
    const otp = await userService.forgotPassword(email);
    console.log("Generated OTP for forgot password:", otp);
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
  return res.render("forgotPassOtp");
};

const passwordVerifyPost = async (req, res) => {
  try {
    const result = VerifyOtpSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const firstError = Object.values(errors)[0]?.[0] || "Validation failed";
      return res.status(400).json({ success: false, message: firstError });
    }

    const { otp } = result.data;
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
    console.log("Resent OTP for forgot password:", otp);
    req.session.userOtp = otp;

    res.status(200).json({ success: true, message: "OTP Send Successfully" });
  } catch (error) {
    console.error("Error resending password OTP:", error);
    const status = error.message === "Email Not Found!" ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

const resetPassGet = (req, res) => {
  if (req.session.isverified) {
    return res.render("reset-password");
  }
  return res.redirect("/forgot-password");
};

const resetPassPost = async (req, res) => {
  try {
    const result = ResetPasswordSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const firstError = Object.values(errors)[0]?.[0] || "Validation failed";
      return res.render("reset-password", { error: firstError });
    }

    const { newPassword } = result.data;
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