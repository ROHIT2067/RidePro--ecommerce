import cartService from "../../service/user/cartService.js";
import couponService from "../../service/admin/couponService.js";
import { validateItemStock } from "../../middlewares/stockValidationMiddleware.js";

const cartGet = async (req, res) => {
  try {
    const userId = req.session.user;
    
    if (!userId) {
      return res.redirect("/login");
    }

    const cartData = await cartService.getCart(userId);

    const checkoutError = req.session.checkoutError;
    delete req.session.checkoutError;

    // Get applied coupon from session
    let appliedCoupon = req.session.appliedCoupon || null;
    let finalTotal = cartData.totalPrice + 118; // Add delivery charge
    let couponDiscount = 0;

    // Validate applied coupon if it exists
    if (appliedCoupon) {
      try {
        const orderAmount = cartData.totalPrice + 118;
        const couponResult = await couponService.applyCoupon(appliedCoupon.code, orderAmount, userId);
        
        // Update coupon data if validation passes
        appliedCoupon = {
          code: couponResult.coupon.code,
          discountAmount: couponResult.discountAmount,
          couponId: couponResult.coupon._id
        };
        req.session.appliedCoupon = appliedCoupon;
        
        couponDiscount = appliedCoupon.discountAmount;
        finalTotal = orderAmount - couponDiscount;
      } catch (error) {
        // Coupon is no longer valid, remove it
        console.log("Removing invalid coupon:", error.message);
        delete req.session.appliedCoupon;
        appliedCoupon = null;
      }
    }

    // Get available coupons for the user
    let availableCoupons = [];
    if (cartData.totalPrice > 0) {
      const orderAmount = cartData.totalPrice + 118; // Include delivery charge
      availableCoupons = await couponService.getAvailableCoupons(userId, orderAmount);
    }

    return res.render("cart", {
      items: cartData.items || [],
      cartCount: cartData.cartCount || 0,
      totalPrice: cartData.totalPrice || 0,
      finalTotal: finalTotal,
      appliedCoupon: appliedCoupon,
      couponDiscount: couponDiscount,
      hasOutOfStock: cartData.hasOutOfStock || false,
      unavailableItems: cartData.unavailableItems || [],
      adjustmentWarnings: cartData.adjustmentWarnings || [],
      checkoutError: checkoutError || null,
      hasUnavailableItems: (cartData.unavailableItems && cartData.unavailableItems.length > 0),
      availableCoupons: availableCoupons,
    });
  } catch (error) {
    console.error("Cart Get Error:", error);
    
    // Set a user-friendly error message
    req.session.checkoutError = "There was an error loading your cart. Please try again.";
    
    // Render cart with empty data to prevent crashes
    return res.render("cart", {
      items: [],
      cartCount: 0,
      totalPrice: 0,
      finalTotal: 118, // Just delivery charge
      appliedCoupon: null,
      couponDiscount: 0,
      hasOutOfStock: false,
      unavailableItems: [],
      adjustmentWarnings: [],
      checkoutError: "There was an error loading your cart. Please try again.",
      availableCoupons: [],
    });
  }
};

const addToCartPost = async (req, res) => {
  try {
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

    // Re-validate applied coupon if it exists
    if (req.session.appliedCoupon) {
      try {
        const orderAmount = result.cartTotal + 118; // Add delivery cost
        await couponService.applyCoupon(req.session.appliedCoupon.code, orderAmount, userId);
      } catch (error) {
        // Coupon is no longer valid, remove it
        console.log("Removing invalid coupon after cart update:", error.message);
        delete req.session.appliedCoupon;
      }
    }

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
    const userId = req.session.user;
    await cartService.clearCart(userId);

    return res.json({ success: true, message: "Cart cleared" });
  } catch (error) {
    console.error("Clear Cart Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const applyCouponPost = async (req, res) => {
  try {
    const userId = req.session.user;
    const { couponCode } = req.body;

    if (!couponCode) {
      return res.status(400).json({ success: false, message: "Coupon code is required" });
    }

    // Get cart total
    const cartData = await cartService.getCart(userId);
    const orderAmount = cartData.totalPrice + 118; // Add delivery charge

    // Apply coupon
    const couponResult = await couponService.applyCoupon(couponCode, orderAmount, userId);

    // Store coupon in session
    req.session.appliedCoupon = {
      code: couponResult.coupon.code,
      discountAmount: couponResult.discountAmount,
      couponId: couponResult.coupon._id
    };

    return res.json({
      success: true,
      message: `Coupon applied! You saved ₹${couponResult.discountAmount}`,
      discountAmount: couponResult.discountAmount,
      finalAmount: couponResult.finalAmount,
      warning: "Note: Orders with coupon discounts do not allow individual item cancellation or returns. Only full order cancellation/return is available to ensure fair refund calculation."
    });
  } catch (error) {
    console.error("Apply Coupon Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const removeCouponPost = async (req, res) => {
  try {
    // Remove coupon from session
    delete req.session.appliedCoupon;

    return res.json({ success: true, message: "Coupon removed" });
  } catch (error) {
    console.error("Remove Coupon Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

export default {
  cartGet,
  addToCartPost,
  updateCartPost,
  removeFromCartPost,
  clearCartPost,
  applyCouponPost,
  removeCouponPost,
};
