import userCollection from "../Models/UserModel.js";
import dotenv, { decrypt } from "dotenv";
dotenv.config();
import bcrypt from "bcrypt"
import { generateOtp } from "../utils/otp.js";
import { sendVerificationEmail } from "../service/mailService.js";
import { securePassword } from "../utils/passwordHash.js";

const loginGet = (req, res) => {
  if (req.session.user) {
    return res.redirect("/home");  
  }
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
  if(req.session.user){
    // console.log('User session')
    return res.redirect('/home')
  }
  if(req.session.admin){
    return res.redirect('/admin/home')
  }

  const serverError=req.session.flash?.serverError || null

  delete req.session.flash

  res.render('signup',{serverError:serverError})
};

const profileGet= (req,res)=>{
  if(req.session.admin){
    return res.redirect('/admin/adminHome')
  }
  if(!req.session.user){
    return res.redirect('/login')
  }
  return res.render('userprofile.ejs')
}


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

const signUppost= async (req,res)=>{
  try {

    const {username, email, phoneNumber, password}=req.body

    const findUser= await userCollection.findOne({email})
    if(findUser){
        req.session.flash = { serverError: "User already exists" };
        return res.redirect("/signup");
    }

    const otp= generateOtp()

    const emailSent = await sendVerificationEmail(email,otp)

    if(!emailSent){
      req.session.flash = { serverError: "Failed to send email" };
      return res.redirect("/signup");
    }

    req.session.userOtp=otp
    req.session.userData={username, email, phoneNumber, password}

    res.redirect('/verify-otp')
    console.log("Otp is ",otp)
  } catch (error) {
    console.log("Error in sending otp,",error)
    res.render('signup',{serverError:"Error in sending OTP"})
  }
}

const verifyOtpGet=(req,res)=>{
  if(req.session.user){
    return res.redirect('/home')
  }
  if(!req.session.admin){
    if(!req.session.userData){
      return res.render("signup",{serverError:"Please Sign Up First"})
    }
    return res.render('verify-otp')
  }
  return res.redirect('/admin/home')
}

const verifyOtpPost=async (req,res)=>{
  try {
    const {otp}=req.body

  if(otp===req.session.userOtp){
    const user=req.session.userData
    const hashedPassword=await securePassword(user.password)

    const saveUser= new userCollection({
      username:user.username,
      email:user.email,
      phoneNumber:user.phoneNumber,
      password:hashedPassword
    })

    await saveUser.save()
    req.session.user=saveUser._id

    delete req.session.userOtp;
    delete req.session.userData;
    
    
    return res.json({ success: true, redirectUrl: "/" });
  }else{
    return res.status(400).json({ success: false, message: "Invalid OTP, Please try again" });
  }
  } catch (error) {
    console.error("error verifying Otp ",error)
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

const resendOtpPost= async (req,res)=>{
  try {
    const {email}=req.session.userData

    if(!email){
      return res.status(400).json({success:false,message:"Email Not Found!"})
    }

    const otp=generateOtp()
    req.session.userOtp=otp

    const emailSent=await sendVerificationEmail(email,otp)

    if(!emailSent){
      return res.status(500).json({success:false,message:"Failed to resend OTP"})
    }else{
      console.log("New Otp : ",otp)
      res.status(200).json({success:true,message:"OTP Send Successfully"})
    }
  } catch (error) {
    console.log("Error in sending otp ",error)
    return res.status(500).json({success:false,message:"Server Error"})
  }
}

const loginPost= async (req,res)=>{
  try {
    const {email, password}=req.body

  const findUser= await userCollection.findOne({email})

  if(!findUser){
    return res.render("login",{loginErr:"User doesnt Exist"})
  }

  if(!findUser.password){
    return res.render('login',{loginErr:"This account uses Google login "})
  }

  const passwordMatch= await bcrypt.compare(password,findUser.password)

  if(passwordMatch){
    req.session.user=findUser._id
    return res.redirect('/home')
  }else{
    return res.render('login',{loginErr:"Invalid credentials"})
  }
  } catch (error) {
    console.error("login error ",error)
    return res.render('login',{loginErr:"Server Error"})
  }

}

const logOut= async (req,res)=>{
  try {
    req.session.destroy(err=>{
      if(err){
        console.log("error in destroying session : ",err)
        return res.render("userprofile")
      }

      res.clearCookie("connect.sid")
      res.set('Cache-Control','no-store')
      return res.redirect("/login")
    })
  } catch (error) {
    console.log("Error in logging out : ",error)
    return res.redirect('/user-profile')
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
  resendOtpPost,
  profileGet,
  logOut
};
