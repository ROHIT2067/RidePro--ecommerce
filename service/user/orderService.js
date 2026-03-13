import Order from "../../Models/OrderModel.js";
import Variant from "../../Models/VariantModel.js";
import User from "../../Models/UserModel.js";

const getOrders = async (userId, page = 1, limit = 10, search = "") => {
  const skip = (page - 1) * limit;

  let searchQuery = { user_id: userId };
  if (search) {
    searchQuery.$or = [
      { order_id: { $regex: search, $options: "i" } },
      { "items.productName": { $regex: search, $options: "i" } },
    ];
  }

  const orders = await Order.find(searchQuery)
    .populate({
      path: "items.variant_id",
      select: "color size images",
      populate: {
        path: "product_id",
        select: "productName",
      },
    })
    .sort({ order_date: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const totalOrders = await Order.countDocuments(searchQuery);
  const totalPages = Math.ceil(totalOrders / limit);

  return {
    orders,
    currentPage: page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

const getOrderDetails = async (userId, orderId) => {
  console.log("=== User Get Order Details Debug ===");
  console.log("UserId:", userId);
  console.log("OrderId:", orderId);

  const order = await Order.findOne({
    _id: orderId,
    user_id: userId,
  })
    .populate({
      path: "items.variant_id",
      select: "color size images",
      populate: {
        path: "product_id",
        select: "productName",
      },
    })
    .lean();

  if (order) {
    console.log("User order found:", order.order_id);
    console.log("User order status:", order.order_status);
    console.log("User ReturnRequests exists:", !!order.returnRequests);
    console.log("User ReturnRequests length:", order.returnRequests ? order.returnRequests.length : 0);
    console.log("User ReturnRequests content:", JSON.stringify(order.returnRequests, null, 2));
    
    // Check if returnRequests field exists but is undefined/null
    console.log("ReturnRequests field type:", typeof order.returnRequests);
    console.log("ReturnRequests is array:", Array.isArray(order.returnRequests));
    
    // Check the raw document structure
    const rawOrder = await Order.findOne({ _id: orderId, user_id: userId }).select('returnRequests').lean();
    console.log("Raw returnRequests from DB:", rawOrder.returnRequests);
  } else {
    console.log("User order not found");
  }
  console.log("=== End User Debug ===");

  return order;
};


const cancelOrderItem = async (userId, orderId, itemId, reason) => {
  const order = await Order.findOne({
    _id: orderId,
    user_id: userId,
  });

  if (!order) {
    throw new Error("Order not found");
  }

  if (!["Pending", "Confirmed"].includes(order.order_status)) {
    throw new Error(`Cannot cancel items when order status is: ${order.order_status}`);
  }

  const item = order.items.id(itemId);
  if (!item) {
    throw new Error("Item not found in order");
  }

  // Check if item is already cancelled
  if ((item.status || item.item_status) === "Cancelled") {
    throw new Error("Item is already cancelled");
  }

  // Restore stock
  await Variant.findByIdAndUpdate(item.variant_id, {
    $inc: { stock_quantity: item.quantity },
  });

  // Update item status
  item.status = item.status ? "Cancelled" : undefined;
  item.item_status = "Cancelled"; // Keep backward compatibility
  item.cancellationReason = reason || "Item cancelled by user";
  item.cancelledAt = new Date();

  // Add to status history if the field exists
  if (!item.statusHistory) {
    item.statusHistory = [];
  }
  item.statusHistory.push({
    status: "Cancelled",
    reason: reason || "Item cancelled by user",
  });

  // Add to cancelled items if the array exists
  if (!order.cancelledItems) {
    order.cancelledItems = [];
  }
  order.cancelledItems.push({
    itemId: item._id,
    reason: reason || "Item cancelled by user",
  });

  // Check if all items are cancelled
  const allCancelled = order.items.every((item) => (item.status || item.item_status) === "Cancelled");
  if (allCancelled) {
    order.order_status = "Cancelled";
  }

  await order.save();
  return order;
};

const cancelEntireOrder = async (userId, orderId, reason) => {
  const order = await Order.findOne({
    _id: orderId,
    user_id: userId,
  });

  if (!order) {
    throw new Error("Order not found");
  }

  if (!["Pending", "Confirmed"].includes(order.order_status)) {
    throw new Error(`Cannot cancel order when status is: ${order.order_status}`);
  }

  // Restore stock for all items
  for (const item of order.items) {
    if ((item.status || item.item_status) !== "Cancelled") {
      await Variant.findByIdAndUpdate(item.variant_id, {
        $inc: { stock_quantity: item.quantity },
      });
    }
  }

  // Update order status
  order.order_status = "Cancelled";
  order.items.forEach((item) => {
    if ((item.status || item.item_status) !== "Cancelled") {
      item.status = item.status ? "Cancelled" : undefined;
      item.item_status = "Cancelled"; // Keep backward compatibility
      item.cancellationReason = reason || "Order cancelled by user";
      item.cancelledAt = new Date();
      
      // Add to status history if the field exists
      if (!item.statusHistory) {
        item.statusHistory = [];
      }
      item.statusHistory.push({
        status: "Cancelled",
        reason: reason || "Order cancelled by user",
      });

      // Add to cancelled items if the array exists
      if (!order.cancelledItems) {
        order.cancelledItems = [];
      }
      order.cancelledItems.push({
        itemId: item._id,
        reason: reason || "Order cancelled by user",
      });
    }
  });

  await order.save();
  return order;
};

const cancelOrderItems = async (userId, orderId, itemIds, reason) => {
  const order = await Order.findOne({
    _id: orderId,
    user_id: userId,
  });

  if (!order) {
    throw new Error("Order not found");
  }

  if (!["Pending", "Confirmed"].includes(order.order_status)) {
    throw new Error(`Cannot cancel items when order status is: ${order.order_status}`);
  }

  let cancelledCount = 0;

  for (const itemId of itemIds) {
    const item = order.items.id(itemId);
    if (item && (item.status || item.item_status) !== "Cancelled") {
      // Restore stock
      await Variant.findByIdAndUpdate(item.variant_id, {
        $inc: { stock_quantity: item.quantity },
      });

      item.status = item.status ? "Cancelled" : undefined;
      item.item_status = "Cancelled"; // Keep backward compatibility
      item.cancellationReason = reason || "Item cancelled by user";
      item.cancelledAt = new Date();
      
      // Add to status history if the field exists
      if (!item.statusHistory) {
        item.statusHistory = [];
      }
      item.statusHistory.push({
        status: "Cancelled",
        reason: reason || "Item cancelled by user",
      });

      // Add to cancelled items if the array exists
      if (!order.cancelledItems) {
        order.cancelledItems = [];
      }
      order.cancelledItems.push({
        itemId: item._id,
        reason: reason || "Item cancelled by user",
      });
      
      cancelledCount++;
    }
  }

  // Check if all items are cancelled
  const allCancelled = order.items.every((item) => (item.status || item.item_status) === "Cancelled");
  if (allCancelled) {
    order.order_status = "Cancelled";
  }

  await order.save();
  return { order, cancelledCount };
};


const returnEntireOrder = async (userId, orderId, reason) => {
  console.log("=== Return Entire Order Debug ===");
  console.log("UserId:", userId);
  console.log("OrderId:", orderId);
  console.log("Reason:", reason);

  const order = await Order.findOne({
    _id: orderId,
    user_id: userId,
  });

  if (!order) {
    throw new Error("Order not found");
  }

  console.log("Order found:", order.order_id);
  console.log("Current order status:", order.order_status);
  console.log("Current returnRequests:", order.returnRequests);

  if (order.order_status !== "Delivered") {
    throw new Error("Only delivered orders can be returned");
  }

  if (!reason || reason.trim() === "") {
    throw new Error("Return reason is required");
  }

  // Update order status to "Return Requested" instead of "Returned"
  order.order_status = "Return Requested";
  
  // Collect return requests to add
  const returnRequestsToAdd = [];
  
  order.items.forEach((item) => {
    if ((item.status || item.item_status) === "Delivered") {
      item.status = item.status ? "Return Requested" : undefined;
      item.item_status = "Return Requested"; // Keep backward compatibility
      item.return_reason = reason;
      item.return_requested_at = new Date();
      
      // Add to status history if the field exists
      if (!item.statusHistory) {
        item.statusHistory = [];
      }
      item.statusHistory.push({
        status: "Return Requested",
        reason: reason,
      });

      // Prepare return request for this item
      returnRequestsToAdd.push({
        itemId: item._id,
        reason: reason,
        status: "pending",
        refundAmount: item.totalPrice || (item.price * item.quantity),
        requestedAt: new Date()
      });
      console.log("Prepared return request for item:", item._id);
    }
  });

  // Initialize returnRequests if it doesn't exist
  if (!order.returnRequests) {
    order.returnRequests = [];
    console.log("Initialized returnRequests array");
  }
  
  // Add all return requests
  order.returnRequests.push(...returnRequestsToAdd);
  console.log("Added return requests, total count:", order.returnRequests.length);

  console.log("Before save - returnRequests:", JSON.stringify(order.returnRequests, null, 2));
  
  try {
    await order.save();
    console.log("Order saved successfully");
  } catch (saveError) {
    console.error("Save error:", saveError);
    throw saveError;
  }
  
  // Verify the save worked by fetching fresh from DB
  const savedOrder = await Order.findById(orderId).lean();
  console.log("After save - returnRequests:", JSON.stringify(savedOrder.returnRequests, null, 2));
  console.log("After save - order status:", savedOrder.order_status);
  console.log("=== End Return Debug ===");

  return order;
};

const returnOrderItem = async (userId, orderId, itemId, reason) => {
  const order = await Order.findOne({
    _id: orderId,
    user_id: userId,
  });

  if (!order) {
    throw new Error("Order not found");
  }

  if (!reason || reason.trim() === "") {
    throw new Error("Return reason is required");
  }

  const item = order.items.id(itemId);
  if (!item) {
    throw new Error("Item not found in order");
  }

  if ((item.status || item.item_status) !== "Delivered") {
    throw new Error("Only delivered items can be returned");
  }

  // Set item status to "Return Requested" instead of "Returned"
  item.status = item.status ? "Return Requested" : undefined;
  item.item_status = "Return Requested"; // Keep backward compatibility

  // Create return request if the array exists
  if (!order.returnRequests) {
    order.returnRequests = [];
  }
  order.returnRequests.push({
    itemId: item._id,
    reason: reason,
    status: "pending",
    refundAmount: item.totalPrice || (item.price * item.quantity),
  });

  // Add to status history if the field exists
  if (!item.statusHistory) {
    item.statusHistory = [];
  }
  item.statusHistory.push({
    status: "Return Requested",
    reason: reason,
  });

  item.return_reason = reason;
  item.return_requested_at = new Date();

  // Check if all items have return requests
  const allReturnRequested = order.items.every(
    (item) => (item.status || item.item_status) === "Return Requested" || 
    (item.status || item.item_status) === "Returned" ||
    (order.returnRequests && order.returnRequests.some(req => req.itemId.toString() === item._id.toString()))
  );
  if (allReturnRequested) {
    order.order_status = "Return Requested";
  }

  await order.save();
  return order;
};

export default {
  getOrders,
  getOrderDetails,
  cancelOrderItem,
  cancelEntireOrder,
  cancelOrderItems,
  returnEntireOrder,
  returnOrderItem,
};
