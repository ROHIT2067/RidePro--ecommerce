import Order from "../../Models/OrderModel.js";
import Cart from "../../Models/CartModel.js";
import Address from "../../Models/AddressModel.js";
import Variant from "../../Models/VariantModel.js";
import User from "../../Models/UserModel.js";
import couponService from "../admin/couponService.js";
import { debitWallet } from "../../utils/walletHelper.js";
import { calculateProductPrice } from "../../utils/priceCalculator.js";
import { processReferralRewards } from "./referralService.js";
import { validateCartItems, reserveStock, validateAndPrepareOrderItems } from "../../utils/stockValidator.js";
import mongoose from "mongoose";

const getCheckoutData = async (userId, selectedAddressId) => {
  try {
    // Get cart with populated data
    const cart = await Cart.findOne({ user_id: userId })
      .populate({
        path: "items.variant_id",
        populate: {
          path: "product_id",
          populate: { path: "category" },
        },
      });

    if (!cart || cart.items.length === 0) {
      throw new Error("Your cart is empty");
    }

    // Use comprehensive validation
    const validation = await validateCartItems(cart.items);

    if (!validation.isValid) {
      return {
        success: false,
        unavailableItems: validation.invalidItems.map(item => ({
          productName: item.variant_id?.product_id?.productName || "Unknown Product",
          reason: item.reason,
          availableStock: item.availableStock
        })),
        hasUnavailableItems: true,
      };
    }

    // Get addresses
    const userAddresses = await Address.findOne({ user_id: userId }).lean();
    const addresses = userAddresses?.address || [];

    if (addresses.length === 0) {
      throw new Error("Please add a delivery address");
    }

    // Select address
    let selectedAddress = null;
    if (selectedAddressId) {
      selectedAddress = addresses.find((a) => a._id.toString() === selectedAddressId);
    }
    if (!selectedAddress) {
      selectedAddress = addresses.find((a) => a.is_default) || addresses[0];
    }

    // Calculate totals using current offer prices
    let subtotal = 0;
    for (const item of validation.validItems) {
      try {
        const variant = item.variant_id;
        const product = variant?.product_id;
        
        // Ensure variant and product exist with required properties
        if (!variant || !product || !variant.price) {
          continue;
        }
        
        // Get current offer price for each item
        let currentOfferPrice = variant.price; // Default to variant price
        
        if (product.category && product.category._id) {
          try {
            const priceCalc = await calculateProductPrice(product, variant.price, product.category._id);
            currentOfferPrice = priceCalc.finalPrice || variant.price;
          } catch (priceError) {
            console.warn("Error calculating offer price, using variant price:", priceError);
            currentOfferPrice = variant.price;
          }
        }
        
        subtotal += currentOfferPrice * item.quantity;
      } catch (error) {
        // Skip this item and continue with others
        continue;
      }
    }

    const shippingCost = 118;
    const totalAmount = subtotal + shippingCost;

    // Filter out any items that don't have proper structure before returning
    const safeItems = validation.validItems.map(item => {
      try {
        // Extract the actual data from Mongoose documents
        const itemDoc = item._doc || item;
        const variant = item.validation?.variant || itemDoc.variant_id;
        const product = item.validation?.product || variant?.product_id;

        // Ensure we have the required data
        if (!variant || !product || !product.productName) {
          return null;
        }

        // Return a clean, template-safe object
        return {
          _id: itemDoc._id,
          quantity: itemDoc.quantity || 0,
          price: itemDoc.price || variant.price || 0,
          variant_id: {
            _id: variant._id,
            size: variant.size || '',
            color: variant.color || '',
            price: variant.price || 0,
            images: variant.images || [],
            product_id: {
              _id: product._id,
              productName: product.productName || 'Unknown Product'
            }
          }
        };
      } catch (error) {
        return null;
      }
    }).filter(item => item !== null);

    return {
      success: true,
      items: safeItems,
      addresses,
      selectedAddress,
      subtotal,
      shippingCost,
      totalAmount,
      hasUnavailableItems: false,
    };
  } catch (error) {
    console.error("Error in getCheckoutData:", error);
    throw error;
  }
};

const generateOrderId = () => {
  // Generate a 6-7 digit order ID
  // Use current timestamp's last 3 digits + 3-4 random digits
  const timestampSuffix = Date.now().toString().slice(-3);
  const randomDigits = Math.floor(Math.random() * 9000) + 1000; // 4-digit random number (1000-9999)
  return `${timestampSuffix}${randomDigits}`;
};

const placeOrder = async (userId, addressId, appliedCoupon = null, paymentMethod = 'COD', paymentDetails = null) => {
  // Start a database transaction for atomic operations
  const session = await mongoose.startSession();
  
  try {
    return await session.withTransaction(async () => {
      // Get cart with populated data within transaction
      const cart = await Cart.findOne({ user_id: userId })
        .populate({
          path: "items.variant_id",
          populate: {
            path: "product_id",
            populate: { path: "category" },
          },
        })
        .session(session);

      if (!cart || cart.items.length === 0) {
        throw new Error("Your cart is empty");
      }

      // Validate and prepare order items with atomic stock validation
      const preparation = await validateAndPrepareOrderItems(cart.items, session);
      
      if (!preparation.success) {
        const errorMessages = preparation.errors.map(error => 
          `${error.productName}: ${error.reason}`
        ).join('; ');
        throw new Error(`Order cannot be placed due to stock issues: ${errorMessages}`);
      }

      // Get address data
      const userAddresses = await Address.findOne({ user_id: userId }).session(session);
      const addresses = userAddresses?.address || [];
      
      if (addresses.length === 0) {
        throw new Error("Please add a delivery address");
      }

      const selectedAddress = addresses.find((a) => a._id.toString() === addressId);
      if (!selectedAddress) {
        throw new Error("Selected address not found");
      }

      // Calculate totals using current offer prices
      let subtotal = 0;
      for (const item of preparation.orderItems) {
        subtotal += item.totalPrice;
      }

      const shippingCost = 118;
      const totalAmount = subtotal + shippingCost;

      // Calculate final amount with coupon discount
      let finalAmount = totalAmount;
      let couponDiscount = 0;
      let couponDetails = null;

      if (appliedCoupon) {
        couponDiscount = appliedCoupon.discountAmount;
        finalAmount = totalAmount - couponDiscount;
        couponDetails = {
          couponId: appliedCoupon.couponId,
          code: appliedCoupon.code,
          discountAmount: couponDiscount
        };

        // Mark coupon as used within transaction
        await couponService.useCoupon(appliedCoupon.couponId, userId, session);
      }

      // Handle wallet payment validation
      if (paymentMethod === 'wallet') {
        const user = await User.findById(userId).session(session);
        if (!user) {
          throw new Error("User not found");
        }

        if (user.wallet.balance < finalAmount) {
          throw new Error("Insufficient wallet balance");
        }
      }

      // Prepare payment details for order
      let orderPaymentDetails = {};
      if (paymentMethod === 'paypal' && paymentDetails) {
        orderPaymentDetails = {
          paypalOrderId: paymentDetails.paypalOrderId,
          captureId: paymentDetails.captureId,
          payerEmail: paymentDetails.payerEmail
        };
      }

      // Atomically reserve stock for all items
      await reserveStock(preparation.orderItems, session);

      // Prepare final order items with status tracking
      const finalOrderItems = preparation.orderItems.map(item => ({
        ...item,
        status: "Pending",
        statusHistory: [{
          status: "Pending",
          timestamp: new Date(),
          reason: "Order placed"
        }]
      }));

      // Create order
      const order = new Order({
        user_id: userId,
        order_id: generateOrderId(),
        items: finalOrderItems,
        cancelledItems: [], // Initialize empty array
        returnRequests: [], // Initialize empty array
        shipping_address: {
          name: selectedAddress.name,
          mobile: selectedAddress.mobile,
          area: selectedAddress.area,
          district: selectedAddress.district,
          state: selectedAddress.state,
          country: selectedAddress.country,
          pincode: selectedAddress.pincode,
        },
        payment_method: paymentMethod,
        payment_status: (paymentMethod === 'wallet' || paymentMethod === 'paypal') ? 'Paid' : 'Pending',
        payment_details: orderPaymentDetails,
        order_status: "Pending",
        subtotal,
        shipping_cost: shippingCost,
        total_amount: totalAmount,
        coupon_discount: couponDiscount,
        coupon_details: couponDetails,
        final_amount: finalAmount,
      });

      await order.save({ session });

      // Process wallet payment after order is saved
      if (paymentMethod === 'wallet') {
        await debitWallet(
          userId, 
          finalAmount, 
          `Payment for order #${order.order_id}`, 
          order._id,
          session
        );
      }

      // Clear cart within transaction
      await Cart.findOneAndUpdate(
        { user_id: userId },
        { $set: { items: [] } },
        { session }
      );

      // Process referral rewards for first purchase (outside transaction to avoid blocking)
      // This will be handled after transaction commits
      setImmediate(async () => {
        try {
          await processReferralRewards(userId);
        } catch (error) {
          // Silently handle referral processing errors
        }
      });

      return order;
    });
  } finally {
    await session.endSession();
  }
};

export default {
  getCheckoutData,
  placeOrder,
};
