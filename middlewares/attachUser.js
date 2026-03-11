import userCollection from "../Models/UserModel.js";
import Cart from "../Models/CartModel.js";

export const attachUserToLocals = async (req, res, next) => {
  try {
    if (!req.session.user) {
      res.locals.currentUser = null;
      res.locals.cartCount = 0;
      return next();
    }

    const user = await userCollection.findById(req.session.user).select("username");
    res.locals.currentUser = user;

    // Get cart count
    const cart = await Cart.findOne({ user_id: req.session.user }).lean();
    const cartCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;
    res.locals.cartCount = cartCount;

    next();
  } catch (err) {
    console.error("userContext error", err);
    res.locals.currentUser = null;
    res.locals.cartCount = 0;
    next();
  }
};


