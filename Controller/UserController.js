import { z } from "zod";
import userCollection from "../Models/UserModel.js";
import nodemailer from "nodemailer"
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

// const signUppost = async (req, res) => {
//   // console.log("BODY:", req.body);

//   if (req.session.admin) {
//     return res.redirect("/admin/adminHome");
//   }
//   const signupSchema = z.object({
//     username: z
//       .string()
//       .min(3, "Username must be at least 3 characters")
//       .max(20, "Username must be at most 20 characters")
//       .regex(
//         /^[a-zA-Z][a-zA-Z0-9_]*$/,
//         "Username must start with a letter and contain only letters, numbers, underscores",
//       ),
//     email: z.string().email("Invalid email format"),
//     phoneNumber: z
//       .string()
//       .regex(/^\d{10}$/, "Phone number must be exactly 10 digits"),
//     password: z
//       .string()
//       .min(6, "Password must be at least 6 characters")
//       .max(15, "Password must be at most 20 characters")
//       .regex(
//         /^[a-zA-Z0-9_]+$/,
//         "Password can contain only letters, numbers, underscores",
//       ),
//   });
//   // console.log(req.body)

//   const result = signupSchema.safeParse(req.body);

//   if (!result.success) {
//     console.log(result.error.format());
//     return res.redirect("/signup");
//   }

//   const { username, email, phoneNumber, password } = result.data;

//   const existEmail = await userCollection.findOne({ email });

//   if (existEmail) {
//     req.session.err2 = "User already exists";
//     return res.redirect("/signup");
//   }

//   req.session.user = username;

//   await userCollection.create({
//     username,
//     email,
//     phoneNumber,
//     password,
//   });
//   // console.log("HI");
//   return res.redirect("/home");
// };

function generateOtp(){
  return Math.floor(100000+Math.random()*900000).toString()
}

async function sendVerificationEmail(email,otp){
  try {
    const transporter=nodemailer.createTransport({
      service:'gmail',
      port:587,
      secure:false,
      requireTLS:true,
      auth:{
        user:process.env.NODEMAILER_EMAIL,
        pass:process.env.NODEMAILER_PASSWORD
      }
    })

    const info= await transporter.sendMail({
      from:process.env.NODEMAILER_EMAIL,
      to:email,
      subject:"Verify your account",
      text:`Your OTP is ${otp}`,
      html:`<b>Your OTP:${otp}</b>`
    })

    return info.accepted.length>0
  } catch (error) {
    console.error("Error sending email",error)
  }
}

const signUppost= async (req,res)=>{
  const {username,email,phoneNumber,password}=req.body

  const findUser=await userCollection.findOne({email})

  if(findUser){
    return res.render('signup',{message:"User already exists"})
  }

  const otp=generateOtp()

  const emailSent=await sendVerificationEmail(email,otp)
  if(!emailSent){
    return res.json("email-error")
  }

  req.session.userOtp=otp
  req.session.userData={username,email,phoneNumber,password}
  res.render("verify-otp")
  console.log("OTP SEND ",otp)
}

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

const securePassword=async (password)=>{
  try {
    const passwordHash= await bcrypt.hash(password,10)
    return passwordHash
  } catch (error) {
    console.error("Error hashing password:", error)
  }
}
const verifyOtpPost= async (req,res)=>{
  const {otp}=req.body

  if(otp==req.session.userOtp){
    const { username, email, phoneNumber, password } = req.session.userData
    const passwordHash= await securePassword(password)

    const saveUserData= new userCollection({
      username,
      email,
      phoneNumber,
      password:passwordHash
    })
    await saveUserData.save()
    req.session.user=saveUserData._id
    return res.redirect('/home')
  }else{
    res.status(400).json({success:false,message:"Invalid OTP, Please try again"})
  }
}

export default { loginGet, loginPost, homeGet, signUppost, signupGet, verifyOtpPost };
