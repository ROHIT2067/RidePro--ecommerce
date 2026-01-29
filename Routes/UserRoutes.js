import express from "express"
const router=express.Router()
import session from "express-session"
import userController from "../Controller/UserController.js"

router.get('/home',userController.homeGet)
router.get('/login',userController.loginGet)
router.get('/signup',userController.signupGet)
router.post('/signup',userController.signUppost)
router.post('/login',userController.loginPost)
router.get('/verify-otp',userController.verifyOtpGet);
router.post('/verify-otp',userController.verifyOtpPost)
router.post('/resend-otp',userController.resendOtpPost)

export default router