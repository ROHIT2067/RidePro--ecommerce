import express from "express";
const router = express.Router();
import { blockIfLoggedIn } from "../middlewares/authMiddleware.js";
import userController from "../Controller/user/userController.js";
import passport from "../Config/passport.js";
import upload from "../middlewares/multer.js";
import accountController from "../Controller/user/accountController.js";
import addressController from "../Controller/user/addressController.js";
import shoppingController from "../Controller/user/shoppingController.js";

router.get("/", blockIfLoggedIn, userController.landingPageGet);
router.get("/home", userController.homeGet);
router.get("/login", userController.loginGet);
router.get("/signup", userController.signupGet);
router.post("/signup", userController.signUppost);
router.post("/login", userController.loginPost);
router.get("/verify-otp", userController.verifyOtpGet);
router.post("/verify-otp", userController.verifyOtpPost);
router.post("/resend-otp", userController.resendOtpPost);
router.get(
  "/auth/google",
  blockIfLoggedIn,
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  }),
);
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    if (req.user.is_blocked) {
      req.session.loginErr = "This account is blocked";
      return res.redirect("/login");
    }
    req.session.user = req.user._id;
    // console.log(req.session.user)
    res.redirect("/home");
  },
);
router.get("/logout", userController.logOut);
router.get("/forgot-password", userController.forgotPasswordGet);
router.post("/forgot-password", userController.forgotPasswordPost);
router.get("/verify-password", userController.passwordVerifyGet);
router.post("/verify-password", userController.passwordVerifyPost);
router.post("/resend-otpPass", userController.resendOtpPassPost);
router.get("/reset-password", userController.resetPassGet);
router.post("/reset-password", userController.resetPassPost);
router.get("/account/password", accountController.changePassGet);
router.post("/account/password", accountController.changePassPost);
router.get("/account", accountController.accoutGet);
router.get("/account/edit", accountController.accountEditGet);
router.get("/emailVerify", accountController.emailVerifyGet);
router.post("/emailVerify", accountController.emailVerifyPost);
router.get("/emailOtp", accountController.emailOtpGet);
router.post("/emailOtp", accountController.emailOtpPost);
router.get("/reset-email", accountController.resetEmailGet);
router.post("/resendOtp", accountController.resendEmailPost);
router.post("/reset-email", accountController.resetEmailPost);
router.post("/account/edit", accountController.accountEditPost);

// ProfilePhoto Upload
router.post(
  "/account/upload-avatar",
  upload.single("avatar"),
  accountController.uploadAvatar,
);
router.delete("/account/delete-avatar", accountController.deleteAvatar);

// Address Management
router.get("/account/address", addressController.addressGet);
router.get("/account/address/add", addressController.addressAddGet);
router.post("/account/address/add", addressController.addressAddPost);
router.get("/account/address/edit/:id", addressController.addressEditGet);
router.post("/account/address/edit/:id", addressController.addressEditPost);
router.post("/account/address/delete/:id", addressController.addressDeletePost);

// ListingPage
router.get('/products',shoppingController.productsGet)

export default router;
