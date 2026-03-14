import Cart from "../../Models/CartModel.js";
import Product from "../../Models/ProductModel.js";
import Variant from "../../Models/VariantModel.js";

const MAX_QUANTITY_PER_ITEM = 5;

const getCart = async (userId) => {
  let cart = await Cart.findOne({ user_id: userId })
    .populate({
      path: "items.variant_id",
      populate: {
        path: "product_id",
        populate: { path: "category" },
      },
    });

  if (!cart) {
    cart = new Cart({ user_id: userId, items: [] });
    await cart.save();
    return { items: [], cartCount: 0, totalPrice: 0, hasOutOfStock: false };
  }

  const unavailableItems = [];
  const adjustmentWarnings = [];
  const validItems = [];
  let cartModified = false;

  for (let i = cart.items.length - 1; i >= 0; i--) {
    const item = cart.items[i];
    const variant = item.variant_id;
    const product = variant?.product_id;

    // If variant or product is completely deleted from database
    if (!variant || !product) {
      unavailableItems.push({
        productName: product?.productName || "Unknown Product",
        reason: "Product no longer exists",
      });
      cart.items.splice(i, 1);
      cartModified = true;
      continue;
    }

    // Check if product is unlisted (status is "Out Of Stock" at product level)
    if (product.status === "Out Of Stock") {
      unavailableItems.push({
        productName: product.productName,
        reason: "Product is no longer available",
      });
      cart.items.splice(i, 1);
      cartModified = true;
      continue;
    }

    // Check if category is inactive
    if (product.category && product.category.status === "Inactive") {
      unavailableItems.push({
        productName: product.productName,
        reason: "Product category is no longer active",
      });
      cart.items.splice(i, 1);
      cartModified = true;
      continue;
    }

    // Check if quantity needs adjustment due to stock changes
    if (item.quantity > variant.stock_quantity) {
      if (variant.stock_quantity === 0) {
        // Mark as out of stock but keep in cart
        item.isOutOfStock = true;
        adjustmentWarnings.push({
          productName: product.productName,
          reason: `Product is now out of stock`,
        });
       validItems.push(item);
  continue;
      } else {
        // Adjust quantity to available stock
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

    // Mark as out of stock if variant is unavailable
    if (variant.status !== "Available" || variant.stock_quantity === 0) {
      item.isOutOfStock = true;
      validItems.push(item);
      continue;
    }

    item.isOutOfStock = false;
    validItems.push(item);
  }

  // Save cart if modified
  if (cartModified) {
    await cart.save();
  }

  // Convert to plain objects for response
  const itemsLean = validItems.map(item => ({
    ...item.toObject(),
    variant_id: item.variant_id.toObject ? item.variant_id.toObject() : item.variant_id,
  }));

  const cartCount = validItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = validItems.reduce((sum, item) => {
    if (!item.isOutOfStock) {
      return sum + item.price * item.quantity;
    }
    return sum;
  }, 0);

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

  if (!variant) {
    throw new Error("Product variant not found");
  }

  const product = variant.product_id;

  if (!product) {
    throw new Error("Product not found");
  }

  // Check if product is unlisted
  if (product.status === "Out Of Stock") {
    throw new Error("This product is no longer available");
  }

  // Check if category is inactive
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

  const existingItem = cart.items.find(
    (item) => item.variant_id.toString() === variantId
  );

  if (existingItem) {
    const newQuantity = existingItem.quantity + quantity;

    if (newQuantity > MAX_QUANTITY_PER_ITEM) {
      throw new Error(`Maximum ${MAX_QUANTITY_PER_ITEM} items allowed per product`);
    }

    if (newQuantity > variant.stock_quantity) {
      throw new Error(`Only ${variant.stock_quantity} items available in stock`);
    }

    existingItem.quantity = newQuantity;
    existingItem.price = variant.price;
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
      price: variant.price,
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

  const variant = await Variant.findById(variantId);

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

  item.quantity = quantity;
  item.price = variant.price;

  await cart.save();

  // Calculate totals using the variant we already fetched
  const itemTotal = item.price * item.quantity;
  const cartTotal = cart.items.reduce((sum, cartItem) => {
    // For other items, use their stored price
    if (cartItem.variant_id.toString() === variantId) {
      return sum + item.price * item.quantity;
    }
    return sum + cartItem.price * cartItem.quantity;
  }, 0);

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
  );

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
