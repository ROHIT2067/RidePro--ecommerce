import { success, z } from "zod";
import userCollection from "../Models/UserModel.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();
import bcrypt from "bcrypt";

const loginGet = (req, res) => {
  if (!req.session.admin) {
    if (!req.session.user) {
      res.render("login", {
        loginErr1: req.session.loginErr1,
        loginErr: req.session.loginErr,
      });
    } else {
      res.redirect("/home");
    }
  } else {
    res.redirect("/admin/adminHome");
  }
};

const signupGet = (req, res) => {
  if (!req.session.admin) {
    if (!req.session.user) {
      res.render("signup", {
        err: req.session.err,
        err1: req.session.err1,
        err2: req.session.err2,
      });
    } else {
      return res.redirect("/home");
    }
  }
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

const verifyOtpGet = (req, res) => {
  if (!req.session.userOtp) {
    return res.redirect("/signup");
  }

  res.render("verify-otp");
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Verify your account",
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP:${otp}</b>`,
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error sending email", error);
  }
}

const signUppost = async (req, res) => {
  const { username, email, phoneNumber, password } = req.body;

  const findUser = await userCollection.findOne({ email });

  if (findUser) {
    return res.render("signup", { err1: "User already exists" });
  }

  const otp = generateOtp();

  const emailSent = await sendVerificationEmail(email, otp);
  if (!emailSent) {
    return res.json("email-error");
  }

  req.session.userOtp = otp;
  req.session.userData = { username, email, phoneNumber, password };
  console.log("OTP : ",otp)
  return res.redirect("verify-otp");
  
};

const loginPost = async (req, res) => {
  // console.log("BODY", req.body);
  if (req.session.admin) {
    return res.redirect("/admin/adminHome");
  }

  const loginSchema = z.object({
    email: z.string().email("Invalid Email Format"),
    password: z.string().min(1, "Password Is Required"),
  });

  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    req.session.loginErr = result.error.format().email?._errors[0] || "";
    req.session.loginErr1 = result.error.format().password?._errors[0] || "";
    return res.redirect("/login");
  }

  const { email, password } = result.data;

  const user = await userCollection.findOne({ email });

  if (!user) {
    req.session.loginErr = "User Not Found";
    return res.redirect("/login");
  }

  if (user.password !== password) {
    req.session.loginErr1 = "Invalid Credentials";
    return res.redirect("/login");
  }

  req.session.user = user.username;
  return res.redirect("/home");
};

const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {
    console.error("Error hashing password:", error);
  }
};

const verifyOtpPost = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is required",
      });
    }

    if (otp !== req.session.userOtp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP, Please try again",
      });
    }

    const { username, email, phoneNumber, password } = req.session.userData;
    const passwordHash = await securePassword(password);

    const saveUserData = new userCollection({
      username,
      email,
      phoneNumber,
      password: passwordHash,
    });

    await saveUserData.save();

    req.session.user = saveUserData._id;

    req.session.userOtp = null;
    req.session.userData = null;

    return res.status(200).json({
      success: true,
      redirectUrl: "/home",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

const resendOtpPost= async (req,res)=>{
  try {
    const {email}=req.session.userData
    if(!email){
      return res.status(400).json({success:false,message:"Email not found"})
    }

    const otp=generateOtp()
    req.session.userOtp=otp

    const emailSent=await sendVerificationEmail(email,otp)

    if(emailSent){
      console.log("Resend OTP : ",otp)
      res.status(200).json({success:true,message:"OTP send success"})
    }else{
      res.status(500).json({success:false,message:"Failed to resend OTP. Please try again"})
    }
  } catch (error) {
    console.error("Error sending OTP",error)
    res.status(500).json({success:false,message:"Internal Sever Error.Please try again"})
  }
}

export default {
  loginGet,
  loginPost,
  homeGet,
  signUppost,
  signupGet,
  verifyOtpPost,
  verifyOtpGet,
  resendOtpPost
};
