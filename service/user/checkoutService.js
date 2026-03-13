import Order from "../../Models/OrderModel.js";
import Cart from "../../Models/CartModel.js";
import Address from "../../Models/AddressModel.js";
import Variant from "../../Models/VariantModel.js";

const getCheckoutData = async (userId, selectedAddressId) => {
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

  // Validate all items
  const validItems = [];
  const unavailableItems = [];

  for (const item of cart.items) {
    const variant = item.variant_id;
    const product = variant?.product_id;

    // Check if product exists and is available
    if (!variant || !product) {
      unavailableItems.push({
        productName: product?.productName || "Unknown Product",
        reason: "Product no longer exists",
      });
      continue;
    }

    // Check if product is unlisted
    if (product.status === "Out Of Stock") {
      unavailableItems.push({
        productName: product.productName,
        reason: "Product is no longer available",
      });
      continue;
    }

    // Check if category is inactive
    if (product.category && product.category.status === "Inactive") {
      unavailableItems.push({
        productName: product.productName,
        reason: "Product category is no longer active",
      });
      continue;
    }

    // Check variant availability
    if (variant.status !== "Available") {
      unavailableItems.push({
        productName: product.productName,
        reason: "Product variant is unavailable",
      });
      continue;
    }

    // Check stock
    if (variant.stock_quantity === 0 || item.quantity > variant.stock_quantity) {
      unavailableItems.push({
        productName: product.productName,
        reason: variant.stock_quantity === 0 
          ? "Product is out of stock" 
          : `Only ${variant.stock_quantity} items available`,
      });
      continue;
    }

    validItems.push(item);
  }

  if (unavailableItems.length > 0) {
    return {
      success: false,
      unavailableItems,
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

  // Calculate totals
  const subtotal = validItems.reduce((sum, item) => {
    return sum + item.price * item.quantity;
  }, 0);

  const shippingCost = 118;
  const totalAmount = subtotal + shippingCost;

  return {
    success: true,
    items: validItems,
    addresses,
    selectedAddress,
    subtotal,
    shippingCost,
    totalAmount,
    hasUnavailableItems: false,
  };
};

const generateOrderId = () => {
  // Generate a 6-7 digit order ID
  // Use current timestamp's last 3 digits + 3-4 random digits
  const timestampSuffix = Date.now().toString().slice(-3);
  const randomDigits = Math.floor(Math.random() * 9000) + 1000; // 4-digit random number (1000-9999)
  return `${timestampSuffix}${randomDigits}`;
};

const placeOrder = async (userId, addressId) => {
  // Get checkout data
  const checkoutData = await getCheckoutData(userId, addressId);

  if (!checkoutData.success) {
    throw new Error("Some items in your cart are unavailable");
  }

  const { items, selectedAddress, subtotal, shippingCost, totalAmount } = checkoutData;

  // Prepare order items with product details
  const orderItems = items.map((item) => {
    const variant = item.variant_id;
    const product = variant.product_id;

    return {
      product_id: product._id,
      variant_id: variant._id,
      quantity: item.quantity,
      price: item.price,
      totalPrice: item.price * item.quantity, // Add totalPrice calculation
      productName: product.productName,
      variantDetails: {
        size: variant.size,
        color: variant.color,
        images: variant.images,
      },
      status: "Pending", // Add default status
      statusHistory: [{
        status: "Pending",
        timestamp: new Date(),
        reason: "Order placed"
      }]
    };
  });

  // Create order
  const order = new Order({
    user_id: userId,
    order_id: generateOrderId(),
    items: orderItems,
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
    payment_method: "COD",
    payment_status: "Pending",
    order_status: "Pending",
    subtotal,
    shipping_cost: shippingCost,
    total_amount: totalAmount,
  });

  await order.save();

  // Update stock quantities
  for (const item of items) {
    await Variant.findByIdAndUpdate(item.variant_id._id, {
      $inc: { stock_quantity: -item.quantity },
    });
  }

  // Clear cart
  await Cart.findOneAndUpdate(
    { user_id: userId },
    { $set: { items: [] } }
  );

  return order;
};

export default {
  getCheckoutData,
  placeOrder,
};
