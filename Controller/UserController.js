import userCollection from "../Models/UserModel.js";
import bcrypt from "bcrypt";
import { generateOtp } from "../utils/otp.js";
import { sendVerificationEmail } from "../service/mailService.js";
import { securePassword } from "../utils/passwordHash.js";

const loginGet = (req, res) => {
  if (req.session.user) {
    return res.redirect("/home");
  }
  if (!req.session.admin) {
    if (!req.session.user) {
      const loginErr = req.session.loginErr || null;
      const loginErr1 = req.session.loginErr1 || null;

      delete req.session.loginErr;
      delete req.session.loginErr1;

      res.render("login", {
        loginErr1: loginErr1,
        loginErr: loginErr,
      });
    } else {
      res.redirect("/home");
    }
  } else {
    res.redirect("/admin/adminHome");
  }
};

const signupGet = (req, res) => {
  if (req.session.user) {
    // console.log('User session')
    return res.redirect("/home");
  }
  if (req.session.admin) {
    return res.redirect("/admin/home");
  }

  const serverError = req.session.flash?.serverError || null;

  delete req.session.flash;

  res.render("signup", { serverError: serverError });
};

const homeGet = (req, res) => {
  if (!req.session.admin) {
    if (!req.session.user) {
      return res.redirect("/login");
    } else {
      return res.render("home");
    }
  }
  return res.redirect("/admin/adminHome");
};

const signUppost = async (req, res) => {
  try {
    const { username, email, phoneNumber, password } = req.body;

    const findUser = await userCollection.findOne({ email });
    if (findUser) {
      req.session.flash = { serverError: "User already exists" };
      return res.redirect("/signup");
    }

    const otp = generateOtp();

    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      req.session.flash = { serverError: "Failed to send email" };
      return res.redirect("/signup");
    }

    req.session.userOtp = otp;
    req.session.userData = { username, email, phoneNumber, password };

    res.redirect("/verify-otp");
    console.log("Otp is ", otp);
  } catch (error) {
    console.log("Error in sending otp,", error);
    res.render("signup", { serverError: "Error in sending OTP" });
  }
};

const verifyOtpGet = (req, res) => {
  if (req.session.user) {
    return res.redirect("/home");
  }
  if (!req.session.admin) {
    return res.render("verify-otp");
  }
  return res.redirect("/admin/home");
};

const verifyOtpPost = async (req, res) => {
  try {
    const { otp } = req.body;

    if (otp === req.session.userOtp) {
      const user = req.session.userData;
      const hashedPassword = await securePassword(user.password);

      const saveUser = new userCollection({
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        password: hashedPassword,
      });

      await saveUser.save();
      req.session.user = saveUser._id;

      delete req.session.userOtp;
      delete req.session.userData;

      return res.json({ success: true, redirectUrl: "/" });
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid OTP, Please try again" });
    }
  } catch (error) {
    console.error("error verifying Otp ", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const resendOtpPost = async (req, res) => {
  try {
    const { email } = req.session.userData;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email Not Found!" });
    }

    const otp = generateOtp();
    req.session.userOtp = otp;

    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res
        .status(500)
        .json({ success: false, message: "Failed to resend OTP" });
    } else {
      console.log("New Otp : ", otp);
      res.status(200).json({ success: true, message: "OTP Send Successfully" });
    }
  } catch (error) {
    console.log("Error in sending otp ", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

const loginPost = async (req, res) => {
  try {
    const { email, password } = req.body;

    const findUser = await userCollection.findOne({ email });

    if (!findUser) {
      req.session.loginErr = "User doesn't exist";
      return res.redirect("/login");
    }

    if (!findUser.password) {
      req.session.loginErr = "This account uses Google login";
      return res.redirect("/login");
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);

    if (passwordMatch) {
      req.session.user = findUser._id;
      return res.redirect("/home");
    } else {
      req.session.loginErr = "Invalid Credentials";
      return res.redirect("/login");
    }
  } catch (error) {
    console.error("login error ", error);
    req.session.loginErr = "Server Error";
    return res.redirect("/login");
  }
};

const logOut = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.log("error in destroying session : ", err);
        return res.render("userprofile");
      }

      res.clearCookie("connect.sid");
      res.set("Cache-Control", "no-store");
      return res.redirect("/login");
    });
  } catch (error) {
    console.log("Error in logging out : ", error);
    return res.redirect("/user-profile");
  }
};

const forgotPasswordGet = (req, res) => {
  // delete req.session.user

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

    const findUser = await userCollection.findOne({ email });
    // console.log(findUser)

    if (!findUser) {
      return res.redirect("/login");
    }

    if (findUser.google_ID) {
      req.session.loginErr = "This account uses Google login";
      return res.redirect("/login");
    }
    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.redirect("/forgot-password");
    }

    req.session.userOtp = otp;
    req.session.email = email;
    console.log("Otp is ", otp);
    return res.redirect("/verify-password");
  } catch (error) {
    console.log("Error : ", error);
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
  return res.redirect("/admin/home");
};

const passwordVerifyPost = async (req, res) => {
  try {
    const { otp } = req.body;

    if (otp === req.session.userOtp) {
      req.session.isverified = true;
      delete req.session.userOtp;

      return res.json({ success: true, redirectUrl: "/reset-password" });
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid OTP, Please try again" });
    }
  } catch (error) {
    console.error("error verifying Otp ", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const resendOtpPassPost = async (req, res) => {
  try {
    const email = req.session.email;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email Not Found!" });
    }

    const otp = generateOtp();
    req.session.userOtp = otp;

    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res
        .status(500)
        .json({ success: false, message: "Failed to resend OTP" });
    } else {
      console.log("New Otp : ", otp);
      res.status(200).json({ success: true, message: "OTP Send Successfully" });
    }
  } catch (error) {
    console.log("Error in sending otp ", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

const resetPassGet = (req, res) => {
  if (req.session.user) {
    return res.redirect("/home");
  }

  if (req.session.admin) {
    return res.redirect("/admin/home");
  }

  if (req.session.isverified) {
    return res.render("reset-password");
  }
  return res.redirect("/forgot-password");
};

const resetPassPost = async (req, res) => {
  try {
    if (!req.session.isverified || !req.session.email) {
      return res.redirect("/forgot-password");
    }

    const { newPassword } = req.body;

    const hashedPassword = await securePassword(newPassword);

    await userCollection.updateOne(
      { email: req.session.email },
      { $set: { password: hashedPassword } },
    );

    delete req.session.isverified;
    delete req.session.email;

    return res.redirect("/login");
  } catch (error) {
    console.error("Reset password error:", error);
    res.render("reset-password", {
      error: "Something went wrong. Try again.",
    });
  }
};

const changePassGet = (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin/home");
  }

  if (!req.session.user) {
    return res.redirect("/login");
  }
  console.log(req.session.flash);

  const oldPassErr = req.session.flash?.oldPassErr || null;
  const newPassErr = req.session.flash?.newPassErr || null;

  delete req.session.flash;

  return res.render("change-password",{oldPassErr,newPassErr});
};

const accoutGet = (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin/home");
  }

  if (!req.session.user) {
    return res.redirect("/login");
  }

  return res.render("userprofile");
};

const changePassPost = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      req.session.flash = { newPassErr: "Passwords do not match" };
      // console.log("password dont match");
      return res.redirect("/account/password");
    }

    const findUser = await userCollection.findById(req.session.user);

    if (!findUser) {
      return res.redirect("/login");
    }

    if (!findUser.password) {
      req.session.flash = {
        oldPassErr: "Cannot change password for Google accounts",
      };
      // console.log("Google");
      return res.redirect("/account/password");
    }

    const passwordMatch = await bcrypt.compare(
      currentPassword,
      findUser.password,
    );

    if (!passwordMatch) {
      req.session.flash = { oldPassErr: "Current password is incorrect" };
      // console.log("password Incorrect");
      return res.redirect("/account/password");
    }

    const hashedPassword = await securePassword(newPassword);

    await userCollection.findByIdAndUpdate(req.session.user, {
      $set: { password: hashedPassword },
    });

    return res.redirect("/account");
  } catch (error) {
    console.error("Change password error:", error);
    req.session.flash = { oldPassErr: "An error occurred" };
    return res.redirect("/account/password");
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
  changePassGet,
  accoutGet,
  changePassPost,
};
