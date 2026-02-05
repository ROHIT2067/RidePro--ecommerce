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
router.get('/profile',userController.profileGet)
router.post('/logout',userController.logOut)


export default router