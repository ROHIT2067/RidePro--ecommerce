import Variant from "../Models/VariantModel.js";
import Product from "../Models/ProductModel.js";
import mongoose from "mongoose";

/**
 * Comprehensive stock validation utility
 * Ensures product quantity and availability are validated at every stage
 */

/**
 * Validates a single item's availability and stock
 * @param {string} variantId - The variant ID to validate
 * @param {number} requestedQuantity - The quantity being requested
 * @param {Object} session - MongoDB session for transactions (optional)
 * @returns {Object} Validation result with availability info
 */
export const validateItemStock = async (variantId, requestedQuantity, session = null) => {
  const variant = await Variant.findById(variantId)
    .populate({
      path: "product_id",
      populate: { path: "category" }
    })
    .session(session);

  if (!variant) {
    return {
      isValid: false,
      reason: "Product variant not found",
      availableStock: 0
    };
  }

  const product = variant.product_id;

  if (!product) {
    return {
      isValid: false,
      reason: "Product not found",
      availableStock: 0
    };
  }

  // Check product status
  if (product.status === "Out Of Stock") {
    return {
      isValid: false,
      reason: "Product is no longer available",
      availableStock: 0
    };
  }

  // Check category status
  if (product.category && product.category.status === "Inactive") {
    return {
      isValid: false,
      reason: "Product category is no longer active",
      availableStock: 0
    };
  }

  // Check variant status
  if (variant.status !== "Available") {
    return {
      isValid: false,
      reason: "Product variant is unavailable",
      availableStock: 0
    };
  }

  // Check stock quantity
  if (variant.stock_quantity === 0) {
    return {
      isValid: false,
      reason: "Product is out of stock",
      availableStock: 0
    };
  }

  if (requestedQuantity > variant.stock_quantity) {
    return {
      isValid: false,
      reason: `Only ${variant.stock_quantity} items available in stock`,
      availableStock: variant.stock_quantity
    };
  }

  return {
    isValid: true,
    reason: "Item is available",
    availableStock: variant.stock_quantity,
    variant,
    product
  };
};

/**
 * Validates multiple cart items for availability and stock
 * @param {Array} cartItems - Array of cart items with variant_id and quantity
 * @param {Object} session - MongoDB session for transactions (optional)
 * @returns {Object} Validation result with valid/invalid items
 */
export const validateCartItems = async (cartItems, session = null) => {
  const validItems = [];
  const invalidItems = [];

  for (const item of cartItems) {
    const validation = await validateItemStock(
      item.variant_id._id || item.variant_id,
      item.quantity,
      session
    );

    if (validation.isValid) {
      validItems.push({
        ...item,
        validation
      });
    } else {
      invalidItems.push({
        ...item,
        reason: validation.reason,
        availableStock: validation.availableStock
      });
    }
  }

  return {
    isValid: invalidItems.length === 0,
    validItems,
    invalidItems,
    hasStockIssues: invalidItems.length > 0
  };
};

/**
 * Atomically reserves stock for order items
 * @param {Array} orderItems - Array of items to reserve stock for
 * @param {Object} session - MongoDB session for transaction
 * @returns {Object} Reservation result
 */
export const reserveStock = async (orderItems, session) => {
  const reservations = [];

  try {
    for (const item of orderItems) {
      const variantId = item.variant_id._id || item.variant_id;
      const quantity = item.quantity;

      // Re-validate stock before reservation
      const validation = await validateItemStock(variantId, quantity, session);
      
      if (!validation.isValid) {
        throw new Error(`Cannot reserve stock for ${validation.product?.productName || 'product'}: ${validation.reason}`);
      }

      // Atomically update stock with optimistic locking
      const result = await Variant.findOneAndUpdate(
        {
          _id: variantId,
          stock_quantity: { $gte: quantity } // Ensure stock is still available
        },
        {
          $inc: { stock_quantity: -quantity }
        },
        {
          new: true,
          session
        }
      );

      if (!result) {
        throw new Error(`Failed to reserve stock for ${validation.product?.productName || 'product'}: Insufficient stock or concurrent modification`);
      }

      reservations.push({
        variantId,
        quantity,
        previousStock: result.stock_quantity + quantity,
        newStock: result.stock_quantity
      });
    }

    return {
      success: true,
      reservations
    };
  } catch (error) {
    // If any reservation fails, the transaction will be rolled back
    throw error;
  }
};

/**
 * Restores stock for cancelled/returned items
 * @param {Array} items - Array of items to restore stock for
 * @param {Object} session - MongoDB session for transaction (optional)
 * @returns {Object} Restoration result
 */
export const restoreStock = async (items, session = null) => {
  const restorations = [];

  try {
    for (const item of items) {
      const variantId = item.variant_id._id || item.variant_id;
      const quantity = item.quantity;

      const result = await Variant.findByIdAndUpdate(
        variantId,
        {
          $inc: { stock_quantity: quantity }
        },
        {
          new: true,
          session
        }
      );

      if (!result) {
        console.warn(`Warning: Could not restore stock for variant ${variantId} - variant not found`);
        continue;
      }

      restorations.push({
        variantId,
        quantity,
        previousStock: result.stock_quantity - quantity,
        newStock: result.stock_quantity
      });
    }

    return {
      success: true,
      restorations
    };
  } catch (error) {
    console.error("Error restoring stock:", error);
    throw error;
  }
};

/**
 * Validates and prepares order items with current stock check
 * @param {Array} cartItems - Cart items to validate
 * @param {Object} session - MongoDB session for transaction
 * @returns {Object} Prepared order items or validation errors
 */
export const validateAndPrepareOrderItems = async (cartItems, session) => {
  // First validate all items
  const validation = await validateCartItems(cartItems, session);
  
  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.invalidItems.map(item => ({
        productName: item.variant_id?.product_id?.productName || 'Unknown Product',
        reason: item.reason,
        availableStock: item.availableStock
      }))
    };
  }

  // Prepare order items with validated data
  const orderItems = validation.validItems.map(item => ({
    variant_id: item.variant_id._id || item.variant_id,
    quantity: item.quantity,
    product_id: item.validation.product._id,
    productName: item.validation.product.productName,
    price: item.price || item.validation.variant.price,
    totalPrice: (item.price || item.validation.variant.price) * item.quantity,
    variantDetails: {
      size: item.validation.variant.size,
      color: item.validation.variant.color,
      images: item.validation.variant.images
    }
  }));

  return {
    success: true,
    orderItems,
    validatedItems: validation.validItems
  };
};

export default {
  validateItemStock,
  validateCartItems,
  reserveStock,
  restoreStock,
  validateAndPrepareOrderItems
};