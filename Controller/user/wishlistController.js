import wishlistService from "../../service/user/wishlistService.js";

const wishlistGet = async (req, res) => {
  try {
    const userId = req.session.user;
    const wishlistData = await wishlistService.getWishlist(userId);

    return res.render("wishlist", {
      items: wishlistData.items,
      wishlistCount: wishlistData.wishlistCount,
      removedItems: wishlistData.removedItems || [],
    });
  } catch (error) {
    console.error("Wishlist Get Error:", error);
    return res.redirect("/home");
  }
};

const addToWishlistPost = async (req, res) => {
  try {
    const userId = req.session.user;
    const { variantId } = req.body;

    if (!variantId) {
      return res.status(400).json({
        success: false,
        message: "Variant ID is required",
      });
    }

    const result = await wishlistService.addToWishlist(userId, variantId);

    return res.json({
      success: true,
      message: "Item added to wishlist",
      wishlistCount: result.wishlistCount,
    });
  } catch (error) {
    console.error("Add to Wishlist Error:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const removeFromWishlistPost = async (req, res) => {
  try {
    const userId = req.session.user;
    const { variantId } = req.body;

    if (!variantId) {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }

    const result = await wishlistService.removeFromWishlist(userId, variantId);

    return res.json({
      success: true,
      message: "Item removed from wishlist",
      wishlistCount: result.wishlistCount,
    });
  } catch (error) {
    console.error("Remove from Wishlist Error:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const moveToCartPost = async (req, res) => {
  try {
    const userId = req.session.user;
    const { variantId, quantity } = req.body;

    if (!variantId) {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }

    const qty = parseInt(quantity) || 1;
    const result = await wishlistService.moveToCart(userId, variantId, qty);

    return res.json({
      success: true,
      message: "Item moved to cart",
      cartCount: result.cartCount,
      wishlistCount: result.wishlistCount,
    });
  } catch (error) {
    console.error("Move to Cart Error:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const checkWishlistItemGet = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json({ success: true, inWishlist: false });
    }

    const userId = req.session.user;
    const { variantId } = req.params;

    const result = await wishlistService.checkWishlistItem(userId, variantId);

    return res.json({
      success: true,
      inWishlist: result.inWishlist,
    });
  } catch (error) {
    console.error("Check Wishlist Item Error:", error);
    return res.json({
      success: false,
      inWishlist: false,
    });
  }
};

const clearWishlistPost = async (req, res) => {
  try {
    const userId = req.session.user;
    const result = await wishlistService.clearWishlist(userId);

    return res.json({
      success: true,
      message: "Wishlist cleared",
      wishlistCount: result.wishlistCount,
    });
  } catch (error) {
    console.error("Clear Wishlist Error:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export default {
  wishlistGet,
  addToWishlistPost,
  removeFromWishlistPost,
  moveToCartPost,
  checkWishlistItemGet,
  clearWishlistPost,
};
