import Wishlist from "../../Models/WishlistModel.js";
import Variant from "../../Models/VariantModel.js";
import Cart from "../../Models/CartModel.js";

const MAX_QUANTITY_PER_PRODUCT = 5;

const getWishlist = async (userId) => {
  const wishlist = await Wishlist.findOne({ user_id: userId })
    .populate({
      path: "items.variant_id",
      populate: {
        path: "product_id",
        populate: { path: "category" },
      },
    });

  if (!wishlist) {
    return { items: [], wishlistCount: 0, removedItems: [] };
  }

  // Filter out invalid items (blocked/unlisted products)
  const validItems = [];
  const removedItems = [];
  let itemsRemoved = false;

  for (let i = wishlist.items.length - 1; i >= 0; i--) {
    const item = wishlist.items[i];
    const variant = item.variant_id;
    const product = variant?.product_id;
    const category = product?.category;

    // Check if variant/product doesn't exist
    if (!variant || !product) {
      removedItems.push({
        productName: product?.productName || "Unknown Product",
        reason: "Product no longer exists",
      });
      wishlist.items.splice(i, 1);
      itemsRemoved = true;
      continue;
    }

    // Check if product is unlisted
    if (product.status === "Out Of Stock") {
      removedItems.push({
        productName: product.productName,
        reason: "Product is no longer available",
      });
      wishlist.items.splice(i, 1);
      itemsRemoved = true;
      continue;
    }

    // Check if category is inactive
    if (category && category.status === "Inactive") {
      removedItems.push({
        productName: product.productName,
        reason: "Product category is no longer active",
      });
      wishlist.items.splice(i, 1);
      itemsRemoved = true;
      continue;
    }

    validItems.unshift(item);
  }

  // Save if items were removed
  if (itemsRemoved) {
    await wishlist.save();
  }

  return {
    items: validItems,
    wishlistCount: validItems.length,
    removedItems,
  };
};

const addToWishlist = async (userId, variantId) => {
  // Get variant with product and category details
  const variant = await Variant.findById(variantId).populate({
    path: "product_id",
    populate: { path: "category" },
  });

  if (!variant) {
    throw new Error("Product variant not found");
  }

  const product = variant.product_id;
  const category = product?.category;

  // Check if product is unlisted
  if (product.status === "Out Of Stock") {
    throw new Error("This product is currently unavailable");
  }

  // Check if category is inactive
  if (category && category.status === "Inactive") {
    throw new Error("This product category is currently unavailable");
  }

  // Find or create wishlist
  let wishlist = await Wishlist.findOne({ user_id: userId });

  if (!wishlist) {
    wishlist = new Wishlist({ user_id: userId, items: [] });
  }

  // Check if item already exists
  const existingItem = wishlist.items.find(
    (item) => item.variant_id.toString() === variantId.toString()
  );

  if (existingItem) {
    throw new Error("Item already in wishlist");
  }

  // Add item to wishlist
  wishlist.items.push({ variant_id: variantId });
  await wishlist.save();

  return { wishlistCount: wishlist.items.length };
};

const removeFromWishlist = async (userId, variantId) => {
  const wishlist = await Wishlist.findOne({ user_id: userId });

  if (!wishlist) {
    throw new Error("Wishlist not found");
  }

  // Remove item
  wishlist.items = wishlist.items.filter(
    (item) => item.variant_id.toString() !== variantId.toString()
  );

  await wishlist.save();

  return { wishlistCount: wishlist.items.length };
};

const moveToCart = async (userId, variantId, quantity = 1) => {
  // Get variant with product and category details
  const variant = await Variant.findById(variantId).populate({
    path: "product_id",
    populate: { path: "category" },
  });

  if (!variant) {
    throw new Error("Product variant not found");
  }

  const product = variant.product_id;
  const category = product?.category;

  // Check if product is unlisted
  if (product.status === "Out Of Stock") {
    throw new Error("This product is currently unavailable");
  }

  // Check if category is inactive
  if (category && category.status === "Inactive") {
    throw new Error("This product category is currently unavailable");
  }

  // Check stock availability
  if (variant.stock_quantity < quantity) {
    throw new Error(`Only ${variant.stock_quantity} items available in stock`);
  }

  // Add to cart
  let cart = await Cart.findOne({ user_id: userId });

  if (!cart) {
    cart = new Cart({ user_id: userId, items: [] });
  }

  const existingCartItem = cart.items.find(
    (item) => item.variant_id.toString() === variantId.toString()
  );

  if (existingCartItem) {
    const newQuantity = existingCartItem.quantity + parseInt(quantity);
    if (newQuantity > MAX_QUANTITY_PER_PRODUCT) {
      existingCartItem.quantity = MAX_QUANTITY_PER_PRODUCT;
    } else {
      existingCartItem.quantity = newQuantity;
    }
  } else {
    cart.items.push({
      product_id: product._id,
      variant_id: variantId,
      quantity: parseInt(quantity),
      price: variant.price,
    });
  }

  await cart.save();

  // Remove from wishlist
  const wishlist = await Wishlist.findOne({ user_id: userId });
  if (wishlist) {
    wishlist.items = wishlist.items.filter(
      (item) => item.variant_id.toString() !== variantId.toString()
    );
    await wishlist.save();
  }

  const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const wishlistCount = wishlist ? wishlist.items.length : 0;

  return { cartCount, wishlistCount };
};

const checkWishlistItem = async (userId, variantId) => {
  const wishlist = await Wishlist.findOne({ user_id: userId });
  const inWishlist = wishlist ? wishlist.hasItem(variantId) : false;
  return { inWishlist };
};

const clearWishlist = async (userId) => {
  const wishlist = await Wishlist.findOneAndUpdate(
    { user_id: userId },
    { $set: { items: [] } },
    { new: true }
  );

  if (!wishlist) {
    throw new Error("Wishlist not found");
  }

  return { wishlistCount: 0 };
};

export default {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  moveToCart,
  checkWishlistItem,
  clearWishlist,
};
