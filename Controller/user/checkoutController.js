import checkoutService from "../../service/user/checkoutService.js";
import addressService from "../../service/user/addressService.js";
import couponService from "../../service/admin/couponService.js";
import User from "../../Models/UserModel.js";
import { AddAddressSchema, EditAddressSchema } from "../../schemas/index.js";
import { createPayPalOrder, capturePayPalOrder } from "../../utils/payPal.js";

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

    // Get user's wallet balance
    const user = await User.findById(userId).select('wallet');
    let walletBalance = 0; // Start with 0, will be set based on actual wallet data
    
    if (user && user.wallet) {
      if (typeof user.wallet === 'number') {
        walletBalance = user.wallet;
        // Update user with new wallet structure
        await User.findByIdAndUpdate(userId, {
          wallet: {
            balance: user.wallet,
            transactions: []
          }
        });
      } else {
        walletBalance = user.wallet.balance || 0;
      }
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
      walletBalance: walletBalance,
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
    const { addressId, paymentMethod } = req.body;

    if (!addressId) {
      return res.status(400).json({ success: false, message: "Please select a delivery address" });
    }

    if (!paymentMethod) {
      return res.status(400).json({ success: false, message: "Please select a payment method" });
    }

    // Validate payment method
    if (!['COD', 'wallet', 'online', 'paypal'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Invalid payment method" });
    }

    // Get applied coupon from session
    const appliedCoupon = req.session.appliedCoupon || null;

    // Handle PayPal payment
    if (paymentMethod === 'paypal') {
      // Get checkout data to calculate total
      const checkoutData = await checkoutService.getCheckoutData(userId, addressId);
      if (!checkoutData.success) {
        return res.status(400).json({ success: false, message: "Unable to process checkout data" });
      }

      let finalTotal = checkoutData.totalAmount;
      if (appliedCoupon) {
        finalTotal = checkoutData.totalAmount - appliedCoupon.discountAmount;
      }

      // Create PayPal order
      const paypalResult = await createPayPalOrder(finalTotal);
      
      if (!paypalResult.success) {
        let errorReason = "paypal_error";
        if (paypalResult.errorCode) {
          switch (paypalResult.errorCode) {
            case 400:
              errorReason = "invalid_payment_method";
              break;
            case 422:
              errorReason = "insufficient_funds";
              break;
            default:
              errorReason = "paypal_error";
          }
        }
        return res.status(400).json({ 
          success: false, 
          message: "PayPal payment initialization failed",
          redirectUrl: `/payment-failed?reason=${errorReason}`
        });
      }

      // Store order details in session for completion after PayPal approval
      req.session.pendingPayPalOrder = {
        userId,
        addressId,
        appliedCoupon,
        paymentMethod: 'paypal',
        paypalOrderId: paypalResult.orderId,
        totalAmount: finalTotal
      };

      return res.json({
        success: true,
        paypalApprovalUrl: paypalResult.approvalUrl,
        paypalOrderId: paypalResult.orderId
      });
    }

    const order = await checkoutService.placeOrder(userId, addressId, appliedCoupon, paymentMethod);

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

const paypalSuccessGet = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }

    if (!req.session.pendingPayPalOrder) {
      return res.redirect("/payment-failed?reason=invalid_session");
    }

    const { token } = req.query;
    const pendingOrder = req.session.pendingPayPalOrder;

    if (!token) {
      return res.redirect("/payment-failed?reason=missing_token");
    }

    if (token !== pendingOrder.paypalOrderId) {
      return res.redirect("/payment-failed?reason=invalid_token");
    }

    // Capture PayPal payment
    const captureResult = await capturePayPalOrder(token);
    
    if (!captureResult.success) {
      console.error("PayPal capture failed:", captureResult.message);
      // Clear session data
      delete req.session.pendingPayPalOrder;
      return res.redirect("/payment-failed?reason=payment_failed");
    }

    // Create order in database
    const order = await checkoutService.placeOrder(
      pendingOrder.userId,
      pendingOrder.addressId,
      pendingOrder.appliedCoupon,
      'paypal',
      {
        paypalOrderId: token,
        captureId: captureResult.captureId,
        payerEmail: captureResult.payerEmail
      }
    );

    // Clear session data
    delete req.session.pendingPayPalOrder;
    if (pendingOrder.appliedCoupon) {
      delete req.session.appliedCoupon;
    }

    return res.redirect(`/order-success?orderId=${order.order_id}`);
  } catch (error) {
    console.error("PayPal Success Error:", error);
    // Clear session data
    if (req.session.pendingPayPalOrder) {
      delete req.session.pendingPayPalOrder;
    }
    return res.redirect("/payment-failed?reason=payment_processing_failed");
  }
};

const paypalCancelGet = async (req, res) => {
  try {
    // Clear pending PayPal order from session
    if (req.session.pendingPayPalOrder) {
      delete req.session.pendingPayPalOrder;
    }
    
    return res.redirect("/payment-failed?reason=payment_cancelled");
  } catch (error) {
    console.error("PayPal Cancel Error:", error);
    return res.redirect("/checkout");
  }
};

const paymentFailedGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    // Clear any pending PayPal order from session
    if (req.session.pendingPayPalOrder) {
      delete req.session.pendingPayPalOrder;
    }

    const { reason } = req.query;
    let failureReason = "Payment processing failed";

    // Map error codes to user-friendly messages
    switch (reason) {
      case 'payment_failed':
        failureReason = "PayPal payment could not be processed";
        break;
      case 'payment_cancelled':
        failureReason = "Payment was cancelled by user";
        break;
      case 'payment_processing_failed':
        failureReason = "Payment processing encountered an error";
        break;
      case 'insufficient_funds':
        failureReason = "Insufficient funds in PayPal account";
        break;
      case 'invalid_payment_method':
        failureReason = "Invalid or expired payment method";
        break;
      case 'paypal_error':
        failureReason = "PayPal service temporarily unavailable";
        break;
      case 'invalid_session':
        failureReason = "Payment session expired or invalid";
        break;
      case 'missing_token':
        failureReason = "Payment verification failed - missing token";
        break;
      case 'invalid_token':
        failureReason = "Payment verification failed - invalid token";
        break;
      default:
        if (reason) {
          failureReason = reason;
        }
    }

    return res.render("payment-failed", {
      reason: failureReason,
    });
  } catch (error) {
    console.error("Payment Failed Get Error:", error);
    return res.redirect("/checkout");
  }
};

export default {
  checkoutGet,
  addAddressPost,
  editAddressPost,
  placeOrderPost,
  orderSuccessGet,
  paypalSuccessGet,
  paypalCancelGet,
  paymentFailedGet,
};
