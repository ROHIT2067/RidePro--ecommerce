import { validateCartItems } from "../utils/stockValidator.js";
import cartService from "../service/user/cartService.js";

/**
 * Middleware to validate cart stock before checkout operations
 * Ensures all items in cart are available and have sufficient stock
 */
export const validateCartStock = async (req, res, next) => {
  try {
    const userId = req.session.user;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }

    // Get current cart data
    const cartData = await cartService.getCart(userId);
    
    if (!cartData.items || cartData.items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Your cart is empty" 
      });
    }

    // Check if cart already has stock issues
    if (cartData.hasOutOfStock || cartData.unavailableItems?.length > 0) {
      req.session.checkoutError = "Some items in your cart are no longer available. Please review your cart.";
      return res.status(400).json({ 
        success: false, 
        message: "Some items in your cart are no longer available",
        redirectUrl: "/cart"
      });
    }

    // Perform comprehensive validation
    const validation = await validateCartItems(cartData.items);
    
    if (!validation.isValid) {
      const errorMessages = validation.invalidItems.map(item => 
        `${item.variant_id?.product_id?.productName || 'Unknown Product'}: ${item.reason}`
      );
      
      req.session.checkoutError = `Stock validation failed: ${errorMessages.join('; ')}`;
      
      return res.status(400).json({ 
        success: false, 
        message: "Some items in your cart have stock issues",
        errors: validation.invalidItems,
        redirectUrl: "/cart"
      });
    }

    // Store validated items in request for use by next middleware/controller
    req.validatedCartItems = validation.validItems;
    next();
    
  } catch (error) {
    console.error("Stock validation middleware error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Error validating cart stock" 
    });
  }
};

/**
 * Middleware to validate individual item stock before adding to cart
 */
export const validateItemStock = async (req, res, next) => {
  try {
    const { variantId, quantity } = req.body;
    
    if (!variantId) {
      return res.status(400).json({ 
        success: false, 
        message: "Product variant is required" 
      });
    }

    const qty = parseInt(quantity) || 1;
    
    if (qty < 1) {
      return res.status(400).json({ 
        success: false, 
        message: "Quantity must be at least 1" 
      });
    }

    // Import here to avoid circular dependency
    const { validateItemStock } = await import("../utils/stockValidator.js");
    
    const validation = await validateItemStock(variantId, qty);
    
    if (!validation.isValid) {
      return res.status(400).json({ 
        success: false, 
        message: validation.reason,
        availableStock: validation.availableStock
      });
    }

    // Store validation result for use by controller
    req.stockValidation = validation;
    next();
    
  } catch (error) {
    console.error("Item stock validation middleware error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Error validating item stock" 
    });
  }
};

export default {
  validateCartStock,
  validateItemStock
};