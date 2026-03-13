import cartService from "../../service/user/cartService.js";

const cartGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user;
    const cartData = await cartService.getCart(userId);

    const checkoutError = req.session.checkoutError;
    delete req.session.checkoutError;

    return res.render("cart", {
      items: cartData.items,
      cartCount: cartData.cartCount,
      totalPrice: cartData.totalPrice,
      hasOutOfStock: cartData.hasOutOfStock,
      unavailableItems: cartData.unavailableItems || [],
      adjustmentWarnings: cartData.adjustmentWarnings || [],
      checkoutError: checkoutError || null,
    });
  } catch (error) {
    console.error("Cart Get Error:", error);
    return res.redirect("/home");
  }
};

const addToCartPost = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Please login to add items to cart" });
    }

    const userId = req.session.user;
    const { variantId, quantity } = req.body;

    if (!variantId) {
      return res.status(400).json({ success: false, message: "Product variant is required" });
    }

    const qty = parseInt(quantity) || 1;

    await cartService.addToCart(userId, variantId, qty);

    return res.json({ success: true, message: "Item added to cart" });
  } catch (error) {
    console.error("Add to Cart Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const updateCartPost = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userId = req.session.user;
    const { variantId, quantity } = req.body;

    if (!variantId || !quantity) {
      return res.status(400).json({ success: false, message: "Invalid request" });
    }

    const qty = parseInt(quantity);

    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({ success: false, message: "Invalid quantity" });
    }

    const result = await cartService.updateCartQuantity(userId, variantId, qty);

    return res.json({
      success: true,
      message: "Cart updated",
      itemTotal: result.itemTotal,
      cartTotal: result.cartTotal,
      cartCount: result.cartCount,
    });
  } catch (error) {
    console.error("Update Cart Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const removeFromCartPost = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userId = req.session.user;
    const { variantId } = req.body;

    if (!variantId) {
      return res.status(400).json({ success: false, message: "Invalid request" });
    }

    await cartService.removeFromCart(userId, variantId);

    return res.json({ success: true, message: "Item removed from cart" });
  } catch (error) {
    console.error("Remove from Cart Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const clearCartPost = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userId = req.session.user;
    await cartService.clearCart(userId);

    return res.json({ success: true, message: "Cart cleared" });
  } catch (error) {
    console.error("Clear Cart Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

export default {
  cartGet,
  addToCartPost,
  updateCartPost,
  removeFromCartPost,
  clearCartPost,
};
