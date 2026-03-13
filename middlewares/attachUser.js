import userCollection from "../Models/UserModel.js";
import Cart from "../Models/CartModel.js";
import Wishlist from "../Models/WishlistModel.js";

export const attachUserToLocals = async (req, res, next) => {
  try {
    if (!req.session.user) {
      res.locals.currentUser = null;
      res.locals.cartCount = 0;
      res.locals.wishlistCount = 0;
      return next();
    }

    const user = await userCollection.findById(req.session.user).select("username");
    res.locals.currentUser = user;

    // Get cart count
    const cart = await Cart.findOne({ user_id: req.session.user }).lean();
    const cartCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;
    res.locals.cartCount = cartCount;

    // Get wishlist count
    const wishlist = await Wishlist.findOne({ user_id: req.session.user }).lean();
    const wishlistCount = wishlist?.items.length || 0;
    res.locals.wishlistCount = wishlistCount;

    next();
  } catch (err) {
    console.error("userContext error", err);
    res.locals.currentUser = null;
    res.locals.cartCount = 0;
    res.locals.wishlistCount = 0;
    next();
  }
};


