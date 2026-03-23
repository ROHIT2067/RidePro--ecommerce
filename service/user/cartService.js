import Cart from "../../Models/CartModel.js";
import Product from "../../Models/ProductModel.js";
import Variant from "../../Models/VariantModel.js";
import { calculateProductPrice } from "../../utils/priceCalculator.js";

const MAX_QUANTITY_PER_ITEM = 5;

// Helper function to get offer-discounted price for a variant
const getOfferPrice = async (variant) => {
  try {
    const product = variant.product_id;
    if (!product || !product.category) {
      return variant.price; // Return original price if no product/category info
    }
    
    const priceCalc = await calculateProductPrice(product, variant.price, product.category._id);
    return priceCalc.finalPrice;
  } catch (error) {
    console.error("Error calculating offer price:", error);
    return variant.price; // Fallback to original price
  }
};

const getCart = async (userId) => {
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
        item.isOutOfStock = true;
        adjustmentWarnings.push({
          productName: product.productName,
          reason: `Product is now out of stock`,
        });
       validItems.push(item);
  continue;
      } else {
        adjustmentWarnings.push({
          productName: product.productName,
          reason: `Quantity reduced from ${item.quantity} to ${variant.stock_quantity} (available stock)`,
        });
        item.quantity = variant.stock_quantity;
        item.isOutOfStock = false;
      }
      cartModified = true;
      validItems.push(item);
      continue;
    }

    if (variant.status !== "Available" || variant.stock_quantity === 0) {
      item.isOutOfStock = true;
      validItems.push(item);
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
    const offerPrice = await getOfferPrice(item.variant_id);
    return {
      ...item.toObject(),
      variant_id: item.variant_id.toObject ? item.variant_id.toObject() : item.variant_id,
      offerPrice: offerPrice,
      originalPrice: item.price,
      finalPrice: offerPrice // Use offer price for calculations
    };
  }));

  const cartCount = validItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = await validItems.reduce(async (sumPromise, item) => {
    const sum = await sumPromise;
    if (!item.isOutOfStock) {
      const offerPrice = await getOfferPrice(item.variant_id);
      return sum + offerPrice * item.quantity;
    }
    return sum;
  }, Promise.resolve(0));

  const hasOutOfStock = validItems.some((item) => item.isOutOfStock);

  return {
    items: itemsLean,
    cartCount,
    totalPrice,
    hasOutOfStock,
    unavailableItems,
    adjustmentWarnings,
  };
};

const addToCart = async (userId, variantId, quantity = 1) => {
  const variant = await Variant.findById(variantId).populate({
    path: "product_id",
    populate: { path: "category" },
  });

  //unlisted product, inactive category, unavailable variant, zero stock arent added
  if (!variant) {
    throw new Error("Product variant not found");
  }

  const product = variant.product_id;

  if (!product) {
    throw new Error("Product not found");
  }

  if (product.status === "Out Of Stock") {
    throw new Error("This product is no longer available");
  }

  if (product.category && product.category.status === "Inactive") {
    throw new Error("This product category is no longer active");
  }

  if (variant.status !== "Available") {
    throw new Error("This product is currently unavailable");
  }

  if (variant.stock_quantity === 0) {
    throw new Error("This product is out of stock");
  }

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

    if (newQuantity > variant.stock_quantity) {
      throw new Error(`Only ${variant.stock_quantity} items available in stock`);
    }

    existingItem.quantity = newQuantity;
    existingItem.price = offerPrice; // Store offer price
  } else {
    if (quantity > MAX_QUANTITY_PER_ITEM) {
      throw new Error(`Maximum ${MAX_QUANTITY_PER_ITEM} items allowed per product`);
    }

    if (quantity > variant.stock_quantity) {
      throw new Error(`Only ${variant.stock_quantity} items available in stock`);
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

  const variant = await Variant.findById(variantId).populate({
    path: "product_id",
    populate: { path: "category" },
  });

  if (!variant) {
    throw new Error("Product variant not found");
  }

  if (quantity > variant.stock_quantity) {
    throw new Error(`Only ${variant.stock_quantity} items available in stock`);
  }

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
    { new: true }
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
