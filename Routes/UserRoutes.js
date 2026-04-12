import express from "express";
const router = express.Router();
import { 
  blockIfLoggedIn, 
  requireUser, 
  requireUserAPI, 
  redirectIfAdmin, 
  userPageAccess, 
  authPageAccess 
} from "../middlewares/authMiddleware.js";
import { validateCartStock, validateItemStock } from "../middlewares/stockValidationMiddleware.js";
import userController from "../Controller/user/userController.js";
import passport from "../Config/passport.js";
import upload from "../middlewares/multer.js";
import accountController from "../Controller/user/accountController.js";
import addressController from "../Controller/user/addressController.js";
import shoppingController from "../Controller/user/shoppingController.js";
import cartController from "../Controller/user/cartController.js";
import wishlistController from "../Controller/user/wishlistController.js";
import checkoutController from "../Controller/user/checkoutController.js";
import orderController from "../Controller/user/orderController.js";
import walletController from "../Controller/user/walletController.js";
import referralController from "../Controller/user/referralController.js";

router.get("/", blockIfLoggedIn, userController.landingPageGet);
router.get("/home", redirectIfAdmin, requireUser, userController.homeGet);
router.get("/login", authPageAccess, userController.loginGet);
router.get("/signup", authPageAccess, userController.signupGet);
router.post("/signup", userController.signUppost);
router.post("/login", userController.loginPost);
router.get("/verify-otp", authPageAccess, userController.verifyOtpGet);
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
    res.redirect("/home");
  },
);
router.get("/logout", userController.logOut);
router.get("/forgot-password", authPageAccess, userController.forgotPasswordGet);
router.post("/forgot-password", userController.forgotPasswordPost);
router.get("/verify-password", authPageAccess, userController.passwordVerifyGet);
router.post("/verify-password", userController.passwordVerifyPost);
router.post("/resend-otpPass", userController.resendOtpPassPost);
router.get("/reset-password", authPageAccess, userController.resetPassGet);
router.post("/reset-password", userController.resetPassPost);
router.get("/account/password", userPageAccess, accountController.changePassGet);
router.post("/account/password", requireUser, accountController.changePassPost);
router.get("/account", userPageAccess, accountController.accoutGet);
router.get("/account/edit", userPageAccess, accountController.accountEditGet);
router.get("/emailVerify", userPageAccess, accountController.emailVerifyGet);
router.post("/emailVerify", requireUser, accountController.emailVerifyPost);
router.get("/emailOtp", userPageAccess, accountController.emailOtpGet);
router.post("/emailOtp", requireUser, accountController.emailOtpPost);
router.get("/reset-email", userPageAccess, accountController.resetEmailGet);
router.post("/resendOtp", requireUser, accountController.resendEmailPost);
router.post("/reset-email", requireUser, accountController.resetEmailPost);
router.post("/account/edit", requireUser, accountController.accountEditPost);

// ProfilePhoto Upload
router.post(
  "/account/upload-avatar",
  requireUserAPI,
  upload.single("avatar"),
  accountController.uploadAvatar,
);
router.delete("/account/delete-avatar", requireUserAPI, accountController.deleteAvatar);

// Mobile number availability check
router.post("/account/check-mobile", requireUserAPI, accountController.checkMobileAvailability);

// Address Management
router.get("/account/address", userPageAccess, addressController.addressGet);
router.get("/account/address/add", userPageAccess, addressController.addressAddGet);
router.post("/account/address/add", requireUser, addressController.addressAddPost);
router.get("/account/address/edit/:id", userPageAccess, addressController.addressEditGet);
router.post("/account/address/edit/:id", requireUser, addressController.addressEditPost);
router.post("/account/address/delete/:id", requireUser, addressController.addressDeletePost);

// ListingPage
router.get('/products', redirectIfAdmin, shoppingController.productsGet)

// ProductPage
router.get('/product/:id', redirectIfAdmin, shoppingController.productDetailGet)

// Cart Management
router.get('/cart', userPageAccess, cartController.cartGet)
router.post('/cart/add', requireUserAPI, validateItemStock, cartController.addToCartPost)
router.post('/cart/update', requireUserAPI, validateItemStock, cartController.updateCartPost)
router.post('/cart/remove', requireUserAPI, cartController.removeFromCartPost)
router.post('/cart/clear', requireUserAPI, cartController.clearCartPost)
router.post('/cart/apply-coupon', requireUserAPI, cartController.applyCouponPost)
router.post('/cart/remove-coupon', requireUserAPI, cartController.removeCouponPost)

// Wishlist Management
router.get('/wishlist', userPageAccess, wishlistController.wishlistGet)
router.post('/wishlist/add', requireUserAPI, wishlistController.addToWishlistPost)
router.post('/wishlist/remove', requireUserAPI, wishlistController.removeFromWishlistPost)
router.post('/wishlist/move-to-cart', requireUserAPI, wishlistController.moveToCartPost)
router.post('/wishlist/clear', requireUserAPI, wishlistController.clearWishlistPost)
router.get('/wishlist/check/:variantId', wishlistController.checkWishlistItemGet)

// Checkout & Orders
router.get('/checkout', userPageAccess, checkoutController.checkoutGet)
router.post('/checkout/add-address', requireUserAPI, checkoutController.addAddressPost)
router.post('/checkout/edit-address', requireUserAPI, checkoutController.editAddressPost)
router.post('/checkout/place-order', requireUserAPI, validateCartStock, checkoutController.placeOrderPost)
router.get('/checkout/paypal/success', checkoutController.paypalSuccessGet)
router.get('/checkout/paypal/cancel', checkoutController.paypalCancelGet)
router.get('/payment-failed', redirectIfAdmin, checkoutController.paymentFailedGet)
router.get('/order-success', userPageAccess, checkoutController.orderSuccessGet)

// Order Management
router.get('/orders', userPageAccess, orderController.ordersGet)
router.get('/account/orders', userPageAccess, orderController.ordersGet)
router.get('/orders/:orderId', userPageAccess, orderController.orderDetailsGet)
router.post('/orders/:orderId/cancel', requireUserAPI, orderController.cancelOrderPost)
router.post('/orders/:orderId/items/:itemId/cancel', requireUserAPI, orderController.cancelOrderItemPost)
router.post('/orders/:orderId/cancel-items', requireUserAPI, orderController.cancelOrderItemsPost)
router.post('/orders/:orderId/return-item', requireUserAPI, orderController.returnOrderItemPost)
router.post('/orders/:orderId/return', requireUserAPI, orderController.returnEntireOrderPost)
router.get('/orders/:orderId/invoice', userPageAccess, orderController.downloadInvoiceGet)

// Wallet Management
router.get('/wallet', userPageAccess, walletController.walletGet)
router.get('/account/wallet', userPageAccess, walletController.walletGet)

// Referral Management
router.get('/referral', userPageAccess, referralController.referralPageGet)
router.get('/account/referral', userPageAccess, referralController.referralPageGet)
router.get('/api/referral/stats', requireUserAPI, referralController.getReferralStats)



export default router;
