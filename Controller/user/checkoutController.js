import checkoutService from "../../service/user/checkoutService.js";
import addressService from "../../service/user/addressService.js";
import couponService from "../../service/admin/couponService.js";
import { AddAddressSchema, EditAddressSchema } from "../../schemas/index.js";

const checkoutGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user;
    const selectedAddressId = req.query.address;

    const checkoutData = await checkoutService.getCheckoutData(userId, selectedAddressId);

    if (!checkoutData.success) {
      return res.render("cart", {
        items: [],
        cartCount: 0,
        totalPrice: 0,
        hasOutOfStock: false,
        unavailableItems: checkoutData.unavailableItems || [],
        adjustmentWarnings: [],
      });
    }

    // Get applied coupon from session and validate it
    let appliedCoupon = req.session.appliedCoupon || null;
    let finalTotal = checkoutData.totalAmount;

    if (appliedCoupon) {
      try {
        const couponResult = await couponService.applyCoupon(appliedCoupon.code, checkoutData.totalAmount, userId);
        
        // Update coupon data if validation passes
        appliedCoupon = {
          code: couponResult.coupon.code,
          discountAmount: couponResult.discountAmount,
          couponId: couponResult.coupon._id
        };
        req.session.appliedCoupon = appliedCoupon;
        
        finalTotal = checkoutData.totalAmount - appliedCoupon.discountAmount;
      } catch (error) {
        // Coupon is no longer valid, remove it
        console.log("Removing invalid coupon at checkout:", error.message);
        delete req.session.appliedCoupon;
        appliedCoupon = null;
      }
    }

    return res.render("checkout", {
      items: checkoutData.items,
      addresses: checkoutData.addresses,
      selectedAddress: checkoutData.selectedAddress,
      subtotal: checkoutData.subtotal,
      shippingCost: checkoutData.shippingCost,
      totalAmount: checkoutData.totalAmount,
      appliedCoupon: appliedCoupon,
      finalTotal: finalTotal,
    });
  } catch (error) {
    console.error("Checkout Get Error:", error);
    req.session.checkoutError = error.message;
    return res.redirect("/cart");
  }
};

const addAddressPost = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Please login to add address" });
    }

    const result = AddAddressSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const firstError = Object.values(errors)[0]?.[0] || "Validation failed";
      return res.status(400).json({ success: false, message: firstError });
    }

    const userId = req.session.user;
    await addressService.addAddress(userId, result.data);

    return res.json({
      success: true,
      message: "Address added successfully",
    });
  } catch (error) {
    console.error("Add Address Error:", error);
    return res.status(400).json({ 
      success: false, 
      message: error.message || "Failed to add address" 
    });
  }
};

const editAddressPost = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Please login to edit address" });
    }

    const { addressId, ...addressData } = req.body;

    if (!addressId) {
      return res.status(400).json({ success: false, message: "Address ID is required" });
    }

    const validationData = { ...addressData, addressId };
    const result = EditAddressSchema.safeParse(validationData);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const firstError = Object.values(errors)[0]?.[0] || "Validation failed";
      return res.status(400).json({ success: false, message: firstError });
    }

    const userId = req.session.user;
    await addressService.updateAddress(userId, addressId, result.data);

    return res.json({
      success: true,
      message: "Address updated successfully",
    });
  } catch (error) {
    console.error("Edit Address Error:", error);
    return res.status(400).json({ 
      success: false, 
      message: error.message || "Failed to update address" 
    });
  }
};

const placeOrderPost = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Please login to place order" });
    }

    const userId = req.session.user;
    const { addressId } = req.body;

    if (!addressId) {
      return res.status(400).json({ success: false, message: "Please select a delivery address" });
    }

    // Get applied coupon from session
    const appliedCoupon = req.session.appliedCoupon || null;

    const order = await checkoutService.placeOrder(userId, addressId, appliedCoupon);

    // Clear applied coupon from session after successful order
    if (appliedCoupon) {
      delete req.session.appliedCoupon;
    }

    return res.json({
      success: true,
      message: "Order placed successfully",
      orderId: order.order_id,
    });
  } catch (error) {
    console.error("Place Order Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const orderSuccessGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const orderId = req.query.orderId;

    if (!orderId) {
      return res.redirect("/home");
    }

    return res.render("order-success", {
      orderId,
    });
  } catch (error) {
    console.error("Order Success Get Error:", error);
    return res.redirect("/home");
  }
};

export default {
  checkoutGet,
  addAddressPost,
  editAddressPost,
  placeOrderPost,
  orderSuccessGet,
};
