import checkoutService from "../../service/user/checkoutService.js";
import cartService from "../../service/user/cartService.js";
import addressService from "../../service/user/addressService.js";
import couponService from "../../service/admin/couponService.js";
import User from "../../Models/UserModel.js";
import { AddAddressSchema, EditAddressSchema } from "../../schemas/index.js";
import { createPayPalOrder, capturePayPalOrder } from "../../utils/payPal.js";

const checkoutGet = async (req, res) => {
  try {
    const userId = req.session.user;
    const selectedAddressId = req.query.address;

    if (!userId) {
      return res.redirect("/login");
    }

    // Get cart data first to check for stock issues
    const cartData = await cartService.getCart(userId);
    
    // Check if cart has unavailable items
    if (cartData.unavailableItems && cartData.unavailableItems.length > 0) {
      req.session.checkoutError = "Some items in your cart are no longer available in the requested quantity. Please review your cart.";
      return res.redirect("/cart");
    }

    // Check if cart has out of stock items
    if (cartData.hasOutOfStock) {
      req.session.checkoutError = "Some items in your cart are out of stock. Please review your cart.";
      return res.redirect("/cart");
    }

    // Validate cart before showing checkout page
    const { preCheckoutValidation } = await import("../../utils/orderValidationHooks.js");
    const validation = await preCheckoutValidation(userId);
    
    if (!validation.isValid) {
      req.session.checkoutError = validation.reason;
      return res.redirect("/cart");
    }

    const checkoutData = await checkoutService.getCheckoutData(userId, selectedAddressId);

    if (!checkoutData.success) {
      req.session.checkoutError = "Some items in your cart are no longer available in the requested quantity. Please review your cart.";
      return res.redirect("/cart");
    }

    // Additional safety check - ensure items are properly structured for template
    const safeItems = (checkoutData.items || []).filter(item => {
      const isValid = item && 
                     item.variant_id && 
                     item.variant_id.product_id && 
                     item.variant_id.product_id.productName &&
                     typeof item.quantity === 'number' &&
                     typeof item.price === 'number' &&
                     item.quantity > 0;
      
      return isValid;
    });

    // If no valid items remain, redirect to cart
    if (safeItems.length === 0) {
      req.session.checkoutError = "No valid items found in cart";
      return res.redirect("/cart");
    }

    // Get user's wallet balance
    const user = await User.findById(userId).select('wallet');
    let walletBalance = 0;
    
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

    // Get success message from session if any
    const addressSuccess = req.session.addressSuccess;
    delete req.session.addressSuccess; // Clear the message after reading

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
        delete req.session.appliedCoupon;
        appliedCoupon = null;
      }
    }

    return res.render("checkout", {
      items: safeItems,
      addresses: checkoutData.addresses || [],
      selectedAddress: checkoutData.selectedAddress,
      subtotal: checkoutData.subtotal || 0,
      shippingCost: checkoutData.shippingCost || 118,
      totalAmount: checkoutData.totalAmount || 118,
      appliedCoupon: appliedCoupon,
      finalTotal: finalTotal,
      walletBalance: walletBalance,
      addressSuccess: addressSuccess,
    });
  } catch (error) {
    console.error("Checkout Get Error:", error);
    
    // Handle specific address error
    if (error.message === "Please add a delivery address") {
      req.session.addressError = "Please add a delivery address to proceed with checkout.";
      return res.redirect("/account/address?fromCheckout=true");
    }
    
    // Handle other specific errors
    if (error.message === "Your cart is empty") {
      req.session.checkoutError = "Your cart is empty. Please add items to your cart before checkout.";
      return res.redirect("/products");
    }
    
    // Generic error for other cases
    req.session.checkoutError = "Unable to load checkout page. Please check your cart and try again.";
    return res.redirect("/cart");
  }
};

const addAddressPost = async (req, res) => {
  try {
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

    // Stock validation is already done by middleware, use validated items
    const validatedCartItems = req.validatedCartItems;

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
    
    // Handle specific stock-related errors
    if (error.message.includes("stock") || error.message.includes("unavailable") || error.message.includes("out of stock")) {
      req.session.checkoutError = error.message;
      return res.status(400).json({ 
        success: false, 
        message: error.message,
        redirectUrl: "/cart"
      });
    }
    
    return res.status(400).json({ success: false, message: error.message });
  }
};

const orderSuccessGet = async (req, res) => {
  try {
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
    // Debug session information
    console.log("PayPal Success - Session ID:", req.sessionID);
    console.log("PayPal Success - User in session:", !!req.session.user);
    console.log("PayPal Success - Pending PayPal order:", !!req.session.pendingPayPalOrder);
    
      if (!req.session.user) {
      req.session.returnTo = req.originalUrl;
      return req.session.save(() => res.redirect("/login"));
    }
    
    if (!req.session.pendingPayPalOrder) {
      console.log("PayPal Success - No pending PayPal order in session");
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

    // Critical: Validate stock before capturing PayPal payment
    const { prePayPalCaptureValidation } = await import("../../utils/orderValidationHooks.js");
    const stockValidation = await prePayPalCaptureValidation(pendingOrder);
    
    if (!stockValidation.isValid) {
      console.error("PayPal stock validation failed:", stockValidation.reason);
      // Clear session data
      delete req.session.pendingPayPalOrder;
      return res.redirect(`/payment-failed?reason=stock_unavailable&message=${encodeURIComponent(stockValidation.reason)}`);
    }

    // Capture PayPal payment
    const captureResult = await capturePayPalOrder(token);
    
    if (!captureResult.success) {
      console.error("PayPal capture failed:", captureResult.message);
      // Clear session data
      delete req.session.pendingPayPalOrder;
      return res.redirect("/payment-failed?reason=payment_failed");
    }

    // Create order in database with validated stock
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

    // Save session before redirect
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
      }
      return res.redirect(`/order-success?orderId=${order.order_id}`);
    });
  } catch (error) {
    console.error("PayPal Success Error:", error);
    // Clear session data
    if (req.session.pendingPayPalOrder) {
      delete req.session.pendingPayPalOrder;
    }
    
    // Handle stock-related errors specifically
    if (error.message.includes("stock") || error.message.includes("unavailable")) {
      return res.redirect(`/payment-failed?reason=stock_unavailable&message=${encodeURIComponent(error.message)}`);
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
