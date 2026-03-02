import userCollection from "../../Models/UserModel.js";
import bcrypt from "bcrypt";
import { generateOtp } from "../../utils/otp.js";
import { sendVerificationEmail } from "../../service/mailService.js";
import { securePassword } from "../../utils/passwordHash.js";
import cloudinary from "../../Config/cloudinary.js";

const changePassGet = (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }

  if (!req.session.user) {
    return res.redirect("/login");
  }
  // console.log(req.session.flash);

  const oldPassErr = req.session.flash?.oldPassErr || null;
  const newPassErr = req.session.flash?.newPassErr || null;

  delete req.session.flash;

  return res.render("change-password", { oldPassErr, newPassErr });
};

const accoutGet = async (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }

  if (!req.session.user) {
    return res.redirect("/login");
  }

  const findUser = await userCollection.findById(req.session.user).lean();

  if (!findUser) {
    return res.redirect("/login");
  }

  const initials = findUser.username
    ? findUser.username.substring(0, 2).toUpperCase()
    : ":)";

  const userData = {
    username: findUser.username || "",
    email: findUser.email || "",
    mobile: findUser.phoneNumber || "",
    initials: initials,
    avatar: findUser.avatar || { url: null, publicId: null },
  };

  return res.render("userprofile", { user: userData });
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

const accountEditGet = async (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }

  if (!req.session.user) {
    return res.redirect("/login");
  }

  const findUser = await userCollection.findById(req.session.user).lean();

  if (!findUser) {
    return res.redirect("/login");
  }
  const userData = {
    username: findUser.username || "",
    email: findUser.email || "",
    mobile: findUser.phoneNumber || "Not Provided",
    name: findUser.username || "",
    avatar: findUser.avatar || { url: null, publicId: null },
  };

  return res.render("edit-profile", { user: userData });
};

const emailVerifyGet = async (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }

  if (!req.session.user) {
    return res.redirect("/login");
  }
  const emailErr = null || req.session.emailErr;
  return res.render("emailChange", { emailErr: emailErr });
};

const emailVerifyPost = async (req, res) => {
  try {
    const { email } = req.body;

    const findUser = await userCollection.findById(req.session.user);
    // console.log(findUser)

    const noUser = await userCollection.findOne({ email });

    if (!noUser) {
      req.session.emailErr = "Incorrect Email";
      return res.redirect("/emailVerify");
    }
    if (email !== findUser.email) {
      req.session.emailErr = "Enter your current Email";
      return res.redirect("/emailVerify");
    }

    if (findUser.google_ID) {
      req.session.emailErr = "This account uses Google login";
      return res.redirect("/emailVerify");
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.redirect("/account");
    }

    req.session.userOtp = otp;
    req.session.email = email;
    console.log("Otp is ", otp);
    return res.redirect("/emailOtp");
  } catch (error) {
    console.log("Error : ", error);
    return res.render("edit-profile");
  }
};

const emailOtpGet = (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }

  if (!req.session.user) {
    return res.redirect("/login");
  }
  return res.render("emailOtp");
};

const emailOtpPost = async (req, res) => {
  try {
    const { otp } = req.body;

    if (otp === req.session.userOtp) {
      req.session.isverified = true;
      delete req.session.userOtp;

      // console.log("YES")
      return res.json({ success: true, redirectUrl: "/reset-email" });
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

const resetEmailGet = async (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }

  if (!req.session.user) {
    return res.redirect("/login");
  }
  const findUser = await userCollection.findById(req.session.user).lean();

  if (!findUser) {
    return res.redirect("/login");
  }

  const userData = {
    username: findUser.username || "",
  };

  const resetErr = null || req.session.resetErr;
  return res.render("resetEmail", { resetErr: resetErr, user: userData });
};

const resendEmailPost = async (req, res) => {
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

const resetEmailPost = async (req, res) => {
  try {
    const { newEmail, confirmEmail } = req.body;

    if (newEmail !== confirmEmail) {
      req.session.flash = { newPassErr: "Email do not match" };
      // console.log("password dont match");
      return res.redirect("/reset-email");
    }

    const findUser = await userCollection.findById(req.session.user);

    if (!findUser) {
      return res.redirect("/login");
    }

    await userCollection.findByIdAndUpdate(req.session.user, {
      $set: { email: newEmail },
    });

    return res.redirect("/account");
  } catch (error) {
    console.error("Change password error:", error);
    req.session.error = "Error in changing Email";
    return res.redirect("/reset-email");
  }
};

const accountEditPost = async (req, res) => {
  const { username, email, phone } = req.body;

  try {
    await userCollection.findByIdAndUpdate(req.session.user, {
      username,
      email,
      phoneNumber: phone,
    });

    return res.redirect("/account");
  } catch (error) {
    console.log("Account Edit Error : ", error);
    return res.redirect("/account");
  }
};

const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    const uploadToCloudinary = (fileBuffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "user-avatars",
            transformation: [
              { width: 300, height: 300, crop: "fill" },
              { quality: "auto", fetch_format: "auto" },
            ],
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          },
        );
        stream.end(fileBuffer);
      });
    };

    const result = await uploadToCloudinary(req.file.buffer);
    const user = await userCollection.findById(req.session.user);

    if (user.avatar && user.avatar.publicId) {
      await cloudinary.uploader.destroy(user.avatar.publicId);
    }

    user.avatar = {
      url: result.secure_url,
      publicId: result.public_id,
    };
    await user.save();

    res.json({
      success: true,
      message: "Profile picture updated successfully",
      avatar: user.avatar,
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    res.json({
      success: false,
      message: "Server error occurred. Please try again.",
    });
  }
};

const deleteAvatar = async (req, res) => {
  try {
    const user = await userCollection.findById(req.session.user);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Delete from Cloudinary if exists
    if (user.avatar && user.avatar.publicId) {
      await cloudinary.uploader.destroy(user.avatar.publicId);
    }

    // Remove avatar from user document
    user.avatar = {
      url: null,
      publicId: null,
    };
    await user.save();

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
};