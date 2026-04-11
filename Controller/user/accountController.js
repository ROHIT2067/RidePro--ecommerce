import accountService from "../../service/user/accountService.js";
import { ChangePasswordSchema } from "../../schemas/index.js";

const changePassGet = (req, res) => {
  const oldPassErr = req.session.flash?.oldPassErr || null;
  const newPassErr = req.session.flash?.newPassErr || null;
  const success = req.session.flash?.success || null;

  delete req.session.flash;

  return res.render("change-password", { oldPassErr, newPassErr, success });
};

const accoutGet = async (req, res) => {
  try {
    const userData = await accountService.getProfileData(req.session.user);
    return res.render("userprofile", { user: userData });
  } catch (error) {
    console.error("Account Get Error:", error);
    return res.redirect("/login");
  }
};

const changePassPost = async (req, res) => {
  try {
    const result = ChangePasswordSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const firstError = Object.values(errors)[0]?.[0] || "Validation failed";
      req.session.flash = { newPassErr: firstError };
      return res.redirect("/account/password");
    }

    await accountService.updatePassword(req.session.user, result.data);
    req.session.flash = { success: "Password changed successfully!" };
    return res.redirect("/account/password");
  } catch (error) {
    console.error("Change password error:", error);
    if (error.message === "Passwords do not match") {
      req.session.flash = { newPassErr: error.message };
    } else if (
      error.message === "Cannot change password for Google accounts" ||
      error.message === "Current password is incorrect"
    ) {
      req.session.flash = { oldPassErr: error.message };
    } else if (error.message === "User not found") {
      return res.redirect("/login");
    } else {
      req.session.flash = { oldPassErr: "An error occurred" };
    }
    return res.redirect("/account/password");
  }
};

const accountEditGet = async (req, res) => {
  try {
    const userData = await accountService.getProfileData(req.session.user);
    const success = req.session.flash?.success || null;
    const error = req.session.flash?.error || null;
    
    delete req.session.flash;
    
    return res.render("edit-profile", { 
      user: userData, 
      success: success, 
      error: error 
    });
  } catch (error) {
    console.error("Account Edit Get Error:", error);
    return res.redirect("/login");
  }
};

const emailVerifyGet = async (req, res) => {
  const emailErr = req.session.emailErr || null;
  delete req.session.emailErr;
  return res.render("emailChange", { emailErr: emailErr });
};

const emailVerifyPost = async (req, res) => {
  try {
    const { email } = req.body;
    const otp = await accountService.initiateEmailChange(req.session.user, email);

    req.session.userOtp = otp;
    req.session.email = email;
    console.log("Generated OTP for email change:", otp);
    return res.redirect("/emailOtp");
  } catch (error) {
    console.error("Email verify post error:", error);
    if (
      error.message === "Incorrect Email" ||
      error.message === "Enter your current Email" ||
      error.message === "This account uses Google login"
    ) {
      req.session.emailErr = error.message;
      return res.redirect("/emailVerify");
    }
    return res.render("edit-profile");
  }
};

const emailOtpGet = (req, res) => {
  return res.render("emailOtp");
};

const emailOtpPost = async (req, res) => {
  try {
    const { otp } = req.body;
    await accountService.verifyEmailOtp(otp, req.session.userOtp);

    req.session.isverified = true;
    delete req.session.userOtp;

    return res.json({ success: true, redirectUrl: "/reset-email" });
  } catch (error) {
    console.error("Error verifying email OTP:", error);
    if (error.message === "Invalid OTP, Please try again") {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const resetEmailGet = async (req, res) => {
  try {
    const userData = await accountService.getProfileData(req.session.user);
    const resetErr = req.session.resetErr || null;
    delete req.session.resetErr;

    return res.render("resetEmail", { resetErr: resetErr, user: userData });
  } catch (error) {
    console.error("Reset Email Get Error:", error);
    return res.redirect("/login");
  }
};

const resendEmailPost = async (req, res) => {
  try {
    const otp = await accountService.resendEmailOtp(req.session.email);
    req.session.userOtp = otp;

    console.log("Resent OTP for email change:", otp);
    res.status(200).json({ success: true, message: "OTP Send Successfully" });
  } catch (error) {
    console.error("Error resending email OTP:", error);
    const status = error.message === "Email Not Found!" ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

const resetEmailPost = async (req, res) => {
  try {
    const { newEmail, confirmEmail } = req.body;
    await accountService.updateEmail(req.session.user, newEmail, confirmEmail);

    return res.redirect("/account");
  } catch (error) {
    console.error("Reset Email Post Error:", error);
    if (error.message === "Email do not match") {
      req.session.flash = { newPassErr: error.message };
      return res.redirect("/reset-email");
    }
    if (error.message === "User not found") {
      return res.redirect("/login");
    }
    req.session.resetErr = "Error in changing Email";
    return res.redirect("/reset-email");
  }
};

const accountEditPost = async (req, res) => {
  try {
    await accountService.updateProfile(req.session.user, req.body);
    req.session.flash = { success: "Profile updated successfully!" };
    return res.redirect("/account");
  } catch (error) {
    console.error("Account Edit Post Error:", error);
    req.session.flash = { error: error.message };
    return res.redirect("/account/edit");
  }
};

const uploadAvatar = async (req, res) => {
  try {
    const avatar = await accountService.uploadAvatar(req.session.user, req.file);

    res.json({
      success: true,
      message: "Profile picture updated successfully",
      avatar: avatar,
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    const status = error.message === "No file uploaded" ? 400 : 500;
    res.status(status).json({
      success: false,
      message: error.message || "Server error occurred. Please try again.",
    });
  }
};

const deleteAvatar = async (req, res) => {
  try {
    await accountService.deleteAvatar(req.session.user);
    res.json({
      success: true,
      message: "Profile picture removed successfully",
    });
  } catch (error) {
    console.error("Avatar delete error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove profile picture",
    });
  }
};

const checkMobileAvailability = async (req, res) => {
  try {
    const { mobile } = req.body;
    const userId = req.session.user;
    
    if (!mobile) {
      return res.status(400).json({ success: false, message: "Mobile number is required" });
    }
    
    // Check if mobile number is already taken by another user
    const existingUser = await accountService.checkMobileAvailability(mobile, userId);
    
    return res.json({ 
      success: true, 
      available: !existingUser,
      message: existingUser ? "Mobile number is already registered" : "Mobile number is available"
    });
  } catch (error) {
    console.error("Check mobile availability error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export default {
  changePassGet,
  accoutGet,
  changePassPost,
  accountEditGet,
  emailVerifyGet,
  emailVerifyPost,
  emailOtpPost,
  emailOtpGet,
  resetEmailGet,
  resendEmailPost,
  resetEmailPost,
  accountEditPost,
  uploadAvatar,
  deleteAvatar,
  checkMobileAvailability,
};