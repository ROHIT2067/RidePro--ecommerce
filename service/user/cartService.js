import Cart from "../../Models/CartModel.js";
import Product from "../../Models/ProductModel.js";
import Variant from "../../Models/VariantModel.js";
import { calculateProductPrice } from "../../utils/priceCalculator.js";
import { validateItemStock } from "../../utils/stockValidator.js";

const MAX_QUANTITY_PER_ITEM = 5;

// Helper function to get offer-discounted price for a variant
const getOfferPrice = async (variant) => {
  try {
    // Ensure variant exists and has required properties
    if (!variant || !variant.price) {
      console.warn("Invalid variant passed to getOfferPrice:", variant);
      return 0;
    }

    const product = variant.product_id;
    
    // If product is not populated or doesn't exist, return original price
    if (!product || !product.category) {
      return variant.price;
    }
    
    // Ensure product has required properties
    if (!product._id || !product.category._id) {
      return variant.price;
    }
    
    const priceCalc = await calculateProductPrice(product, variant.price, product.category._id);
    return priceCalc.finalPrice || variant.price;
  } catch (error) {
    console.error("Error calculating offer price:", error);
    // Return original price as fallback
    return variant?.price || 0;
  }
};

const getCart = async (userId) => {
  try {
    let cart = await Cart.findOne({ user_id: userId })
      .populate({
        path: "items.variant_id",
        populate: {
          path: "product_id",
          populate: { path: "category" },
        },
      });  // Nested population : needed to run availability checks on each item

    if (!cart) {
      cart = new Cart({ user_id: userId, items: [] });
      await cart.save();
      return { items: [], cartCount: 0, totalPrice: 0, hasOutOfStock: false };
    }

    const unavailableItems = [];
    const adjustmentWarnings = [];
    const validItems = [];
    let cartModified = false;

  //Needed to run availability checks on each item to safely splice items without messing up the loop index
  for (let i = cart.items.length - 1; i >= 0; i--) {
    const item = cart.items[i];
    const variant = item.variant_id;
    const product = variant?.product_id;

    //deleted product, unlisted product, inactive category are pushed unavailableItems
    if (!variant || !product) {
      unavailableItems.push({
        productName: product?.productName || "Unknown Product",
        reason: "Product no longer exists",
      });
      cart.items.splice(i, 1);
      cartModified = true;
      continue;
    }

    if (product.status === "Out Of Stock") {
      unavailableItems.push({
        productName: product.productName,
        reason: "Product is no longer available",
      });
      cart.items.splice(i, 1);
      cartModified = true;
      continue;
    }

    if (product.category && product.category.status === "Inactive") {
      unavailableItems.push({
        productName: product.productName,
        reason: "Product category is no longer active",
      });
      cart.items.splice(i, 1);
      cartModified = true;
      continue;
    }

    //Handles the case where stock dropped after the item was added to cart
    if (item.quantity > variant.stock_quantity) {
      if (variant.stock_quantity === 0) {
        unavailableItems.push({
          productName: product.productName,
          reason: `Product is now out of stock`,
          requestedQuantity: item.quantity,
          availableStock: 0
        });
        cart.items.splice(i, 1);
        cartModified = true;
        continue;
      } else {
        unavailableItems.push({
          productName: product.productName,
          reason: `Only ${variant.stock_quantity} items available, but you have ${item.quantity} in cart`,
          requestedQuantity: item.quantity,
          availableStock: variant.stock_quantity
        });
        cart.items.splice(i, 1);
        cartModified = true;
        continue;
      }
    }

    if (variant.status !== "Available" || variant.stock_quantity === 0) {
      unavailableItems.push({
        productName: product.productName,
        reason: "Product is currently unavailable",
        requestedQuantity: item.quantity,
        availableStock: 0
      });
      cart.items.splice(i, 1);
      cartModified = true;
      continue;
    }

    item.isOutOfStock = false;
    validItems.push(item);  //still keeps it in the valid items list,so user can see it and decide to remove it
  }

  if (cartModified) {
    await cart.save();
  }

  //Converts Mongoose documents to plain JS objects for safe use in the view
  const itemsLean = await Promise.all(validItems.map(async (item) => {
    try {
      // Ensure item and variant exist
      if (!item || !item.variant_id) {
        console.warn("Invalid item in cart:", item);
        return null;
      }

      const variant = item.variant_id;
      
      // Ensure variant has required properties
      if (!variant || !variant.price) {
        console.warn("Invalid variant in cart item:", variant);
        return null;
      }

      const offerPrice = await getOfferPrice(variant);
      
      // Update cart item price if it's different from current offer price
      if (Math.abs(item.price - offerPrice) > 0.01) {
        item.price = offerPrice;
        cartModified = true;
      }
      
      return {
        ...item.toObject(),
        variant_id: variant.toObject ? variant.toObject() : variant,
        offerPrice: offerPrice,
        originalPrice: variant.price || 0, // Use actual variant price as original
        finalPrice: offerPrice // Use offer price for calculations
      };
    } catch (error) {
      return null;
    }
  }));

  // Filter out any null items that failed processing
  const validItemsLean = itemsLean.filter(item => item !== null);

  const cartCount = validItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = await validItems.reduce(async (sumPromise, item) => {
    const sum = await sumPromise;
    if (!item.isOutOfStock && item.variant_id) {
      try {
        const offerPrice = await getOfferPrice(item.variant_id);
        return sum + offerPrice * item.quantity;
      } catch (error) {
        console.error("Error calculating price for item:", error, item);
        return sum;
      }
    }
    return sum;
  }, Promise.resolve(0));

  const hasOutOfStock = validItems.some((item) => item.isOutOfStock);
  const hasUnavailableItems = unavailableItems.length > 0;

  return {
    items: validItemsLean,
    cartCount,
    totalPrice,
    hasOutOfStock,
    hasUnavailableItems,
    unavailableItems,
    adjustmentWarnings,
  };
} catch (error) {
  console.error("Error in getCart:", error);
  // Return safe defaults if there's an error
  return {
    items: [],
    cartCount: 0,
    totalPrice: 0,
    hasOutOfStock: false,
    hasUnavailableItems: false,
    unavailableItems: [],
    adjustmentWarnings: [],
  };
}
};

const addToCart = async (userId, variantId, quantity = 1) => {
  // Use comprehensive validation
  const validation = await validateItemStock(variantId, quantity);
  
  if (!validation.isValid) {
    throw new Error(validation.reason);
  }

  const { variant, product } = validation;

  let cart = await Cart.findOne({ user_id: userId });

  if (!cart) {
    cart = new Cart({ user_id: userId, items: [] });
  }

  //If item already exists, increases the quantity
  const existingItem = cart.items.find(
    (item) => item.variant_id.toString() === variantId
  );

  const offerPrice = await getOfferPrice(variant);

  if (existingItem) {
    const newQuantity = existingItem.quantity + quantity;

    if (newQuantity > MAX_QUANTITY_PER_ITEM) {
      throw new Error(`Maximum ${MAX_QUANTITY_PER_ITEM} items allowed per product`);
    }

    // Re-validate with new total quantity
    const newValidation = await validateItemStock(variantId, newQuantity);
    if (!newValidation.isValid) {
      throw new Error(newValidation.reason);
    }

    existingItem.quantity = newQuantity;
    existingItem.price = offerPrice; // Store offer price
  } else {
    if (quantity > MAX_QUANTITY_PER_ITEM) {
      throw new Error(`Maximum ${MAX_QUANTITY_PER_ITEM} items allowed per product`);
    }

    cart.items.push({
      product_id: product._id,
      variant_id: variant._id,
      quantity,
      price: offerPrice, // Store offer price
    });
  }

  await cart.save();
  return cart;
};

const updateCartQuantity = async (userId, variantId, quantity) => {
  if (quantity < 1) {
    throw new Error("Quantity must be at least 1");
  }

  if (quantity > MAX_QUANTITY_PER_ITEM) {
    throw new Error(`Maximum ${MAX_QUANTITY_PER_ITEM} items allowed per product`);
  }

  // Use comprehensive validation
  const validation = await validateItemStock(variantId, quantity);
  
  if (!validation.isValid) {
    throw new Error(validation.reason);
  }

  const { variant } = validation;

  const cart = await Cart.findOne({ user_id: userId });

  if (!cart) {
    throw new Error("Cart not found");
  }

  const item = cart.items.find(
    (item) => item.variant_id.toString() === variantId
  );

  if (!item) {
    throw new Error("Item not found in cart");
  }

  const offerPrice = await getOfferPrice(variant);
  
  item.quantity = quantity;
  item.price = offerPrice; // Update with current offer price

  await cart.save();

  // Calculate totals using offer price
  const itemTotal = offerPrice * quantity;
  
  // Recalculate cart total with offer prices for all items
  let cartTotal = 0;
  for (const cartItem of cart.items) {
    if (cartItem.variant_id.toString() === variantId) {
      cartTotal += offerPrice * quantity;
    } else {
      // Get fresh offer price for other items too
      const otherVariant = await Variant.findById(cartItem.variant_id).populate({
        path: "product_id",
        populate: { path: "category" },
      });
      if (otherVariant) {
        const otherOfferPrice = await getOfferPrice(otherVariant);
        cartTotal += otherOfferPrice * cartItem.quantity;
      } else {
        cartTotal += cartItem.price * cartItem.quantity;
      }
    }
  }

  const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return { itemTotal, cartTotal, cartCount };
};

const removeFromCart = async (userId, variantId) => {
  const cart = await Cart.findOne({ user_id: userId });

  if (!cart) {
    throw new Error("Cart not found");
  }

  cart.items = cart.items.filter(
    (item) => item.variant_id.toString() !== variantId
  );  //creates a new array excluding the target item and saves

  await cart.save();
  return cart;
};

const clearCart = async (userId) => {
  const cart = await Cart.findOneAndUpdate(
    { user_id: userId },
    { $set: { items: [] } },
    { returnDocument: 'after' }
  );

  if (!cart) {
    throw new Error("Cart not found");
  }

  return cart;
};

export default {
  getCart,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
};
