import express from "express"
const router=express.Router()
import { blockIfLoggedIn } from "../middlewares/authMiddleware.js"
import userController from "../Controller/UserController.js"
import passport from "../Config/passport.js"

router.get('/home',userController.homeGet)
router.get('/login',userController.loginGet)
router.get('/signup',userController.signupGet)
router.post('/signup',userController.signUppost)
router.post('/login',userController.loginPost)
router.get('/verify-otp',userController.verifyOtpGet);
router.post('/verify-otp',userController.verifyOtpPost)
router.post('/resend-otp',userController.resendOtpPost)
router.get("/auth/google",blockIfLoggedIn,passport.authenticate("google",{scope:["profile", "email"],prompt: 'select_account'}))
router.get("/auth/google/callback",passport.authenticate("google",{failureRedirect:"/login"}),(req,res)=>{
    req.session.user=req.user._id;
    // console.log(req.session.user)
    res.redirect("/home");
  })
router.get('/logout',userController.logOut)
router.get('/forgot-password',userController.forgotPasswordGet)
router.post('/forgot-password',userController.forgotPasswordPost)
router.get('/verify-password',userController.passwordVerifyGet)
router.post('/verify-password',userController.passwordVerifyPost)
router.post('/resend-otpPass',userController.resendOtpPassPost)
router.get('/reset-password',userController.resetPassGet)
router.post('/reset-password',userController.resetPassPost)
router.get('/account/password',userController.changePassGet)
router.post('/account/password',userController.changePassPost)
router.get('/account',userController.accoutGet)
router.get('/account/edit',userController.profileEditGet)
router.get('/emailVerify',userController.emailVerifyGet)
router.post('/emailVerify',userController.emailVerifyPost)
router.get('/emailOtp',userController.emailOtpGet)
router.post('/emailOtp',userController.emailOtpPost)
router.get('/reset-email',userController.resetEmailGet)
router.post('/resendOtp',userController.resendEmailPost)
router.post('/reset-email',userController.resetEmailPost)
router.post('/account/edit',userController.accountEditPost)

export default router