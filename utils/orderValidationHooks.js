import { validateCartItems, validateItemStock } from "./stockValidator.js";
import cartService from "../service/user/cartService.js";

/**
 * Pre-order validation hooks to ensure data integrity
 * These hooks run before critical order operations to prevent issues
 */

/**
 * Validates cart before checkout page load
 * Ensures user sees accurate stock information
 */
export const preCheckoutValidation = async (userId) => {
  try {
    const cartData = await cartService.getCart(userId);
    
    if (!cartData.items || cartData.items.length === 0) {
      return {
        isValid: false,
        reason: "Cart is empty",
        redirectTo: "/home"
      };
    }

    // Check for any stock issues
    if (cartData.hasOutOfStock || cartData.unavailableItems?.length > 0) {
      return {
        isValid: false,
        reason: "Some items in your cart are no longer available",
        redirectTo: "/cart",
        warnings: cartData.unavailableItems || []
      };
    }

    // Perform comprehensive validation
    const validation = await validateCartItems(cartData.items);
    
    if (!validation.isValid) {
      return {
        isValid: false,
        reason: "Stock validation failed",
        redirectTo: "/cart",
        errors: validation.invalidItems
      };
    }

    return {
      isValid: true,
      cartData,
      validatedItems: validation.validItems
    };
  } catch (error) {
    console.error("Pre-checkout validation error:", error);
    return {
      isValid: false,
      reason: "Validation error occurred",
      redirectTo: "/cart"
    };
  }
};

/**
 * Validates individual item before cart operations
 */
export const preCartOperationValidation = async (variantId, quantity, operation = 'add') => {
  try {
    const validation = await validateItemStock(variantId, quantity);
    
    if (!validation.isValid) {
      return {
        isValid: false,
        reason: validation.reason,
        availableStock: validation.availableStock,
        operation
      };
    }

    return {
      isValid: true,
      validation,
      operation
    };
  } catch (error) {
    console.error(`Pre-${operation} validation error:`, error);
    return {
      isValid: false,
      reason: "Validation error occurred",
      operation
    };
  }
};

/**
 * Validates order before payment processing
 * Critical validation before money is charged
 */
export const prePaymentValidation = async (userId, orderItems) => {
  try {
    // Re-validate all items one final time
    const validation = await validateCartItems(orderItems);
    
    if (!validation.isValid) {
      return {
        isValid: false,
        reason: "Final stock validation failed",
        errors: validation.invalidItems.map(item => ({
          productName: item.variant_id?.product_id?.productName || 'Unknown Product',
          reason: item.reason,
          availableStock: item.availableStock
        }))
      };
    }

    return {
      isValid: true,
      validatedItems: validation.validItems
    };
  } catch (error) {
    console.error("Pre-payment validation error:", error);
    return {
      isValid: false,
      reason: "Payment validation error occurred"
    };
  }
};

/**
 * Validates PayPal order completion
 * Ensures stock is still available when PayPal payment is captured
 */
export const prePayPalCaptureValidation = async (pendingOrder) => {
  try {
    // Get fresh cart data to validate against current stock
    const cartData = await cartService.getCart(pendingOrder.userId);
    
    if (!cartData.items || cartData.items.length === 0) {
      return {
        isValid: false,
        reason: "Cart is empty - order cannot be completed"
      };
    }

    // Validate current cart items
    const validation = await validateCartItems(cartData.items);
    
    if (!validation.isValid) {
      return {
        isValid: false,
        reason: "Stock has changed since PayPal order was created",
        errors: validation.invalidItems.map(item => ({
          productName: item.variant_id?.product_id?.productName || 'Unknown Product',
          reason: item.reason,
          availableStock: item.availableStock
        }))
      };
    }

    return {
      isValid: true,
      validatedItems: validation.validItems
    };
  } catch (error) {
    console.error("Pre-PayPal capture validation error:", error);
    return {
      isValid: false,
      reason: "PayPal validation error occurred"
    };
  }
};

export default {
  preCheckoutValidation,
  preCartOperationValidation,
  prePaymentValidation,
  prePayPalCaptureValidation
};