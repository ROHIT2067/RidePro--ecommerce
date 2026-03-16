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

  const item = order.items.id(itemId);  //finds a specific subdocument inside the items array by its _id
  if (!item) {
    throw new Error("Item not found in order");
  }

  if ((item.status || item.item_status) === "Cancelled") {
    throw new Error("Item is already cancelled");
  }

  await Variant.findByIdAndUpdate(item.variant_id, {
    $inc: { stock_quantity: item.quantity },
  });

  //Update item status
  item.status = item.status ? "Cancelled" : undefined;
  item.item_status = "Cancelled"; 
  item.cancellationReason = reason || "Item cancelled by user";
  item.cancelledAt = new Date();

  //Add to status history if the field exists
  if (!item.statusHistory) {
    item.statusHistory = [];
  }
  item.statusHistory.push({
    status: "Cancelled",
    reason: reason || "Item cancelled by user",
  });

  //Add to cancelled items if the array exists
  if (!order.cancelledItems) {
    order.cancelledItems = [];
  }
  order.cancelledItems.push({
    itemId: item._id,
    reason: reason || "Item cancelled by user",
  });

  //After cancelling one item, checks if all items are now cancelled. If yes, marks the entire order as Cancelled too 
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

  //Skips items already cancelled & restores the stock
  for (const item of order.items) {
    if ((item.status || item.item_status) !== "Cancelled") {
      await Variant.findByIdAndUpdate(item.variant_id, {
        $inc: { stock_quantity: item.quantity },
      });
    }
  }

  //updates every non-cancelled item's status.
  order.order_status = "Cancelled";
  order.items.forEach((item) => {
    if ((item.status || item.item_status) !== "Cancelled") {
      item.status = item.status ? "Cancelled" : undefined;
      item.item_status = "Cancelled"; // Keep backward compatibility
      item.cancellationReason = reason || "Order cancelled by user";
      item.cancelledAt = new Date();
      
      //Add to status history if the field exists
      if (!item.statusHistory) {
        item.statusHistory = [];
      }
      item.statusHistory.push({
        status: "Cancelled",
        reason: reason || "Order cancelled by user",
      });

      //Add to cancelled items if the array exists
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

  //Only processes items that exist and aren't already cancelled
  for (const itemId of itemIds) {
    const item = order.items.id(itemId);
    if (item && (item.status || item.item_status) !== "Cancelled") {
      //Restore stock
      await Variant.findByIdAndUpdate(item.variant_id, {
        $inc: { stock_quantity: item.quantity },
      });

      item.status = item.status ? "Cancelled" : undefined;
      item.item_status = "Cancelled"; // Keep backward compatibility
      item.cancellationReason = reason || "Item cancelled by user";
      item.cancelledAt = new Date();
      
      //Add to status history if the field exists
      if (!item.statusHistory) {
        item.statusHistory = [];
      }
      item.statusHistory.push({
        status: "Cancelled",
        reason: reason || "Item cancelled by user",
      });

      //Add to cancelled items if the array exists
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

  //Check if all items are cancelled
  const allCancelled = order.items.every((item) => (item.status || item.item_status) === "Cancelled");
  if (allCancelled) {
    order.order_status = "Cancelled";
  }

  await order.save();
  return { order, cancelledCount };
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

  // Check if item is cancelled
  const itemStatus = item.status || item.item_status || 'Pending';
  if (itemStatus === 'Cancelled') {
    throw new Error("Cannot return cancelled items");
  }

  // For delivered orders, allow return of any non-cancelled item
  if (order.order_status !== "Delivered") {
    throw new Error("Only items from delivered orders can be returned");
  }



  // Create return request using atomic operation
  const returnRequest = {
    itemId: item._id,
    reason: reason.trim(),
    status: "pending",
    refundAmount: item.totalPrice || (item.price * item.quantity),
    requestedAt: new Date()
  };

  // Update order with return request
  await Order.findByIdAndUpdate(
    orderId,
    {
      $push: { 
        returnRequests: returnRequest
      }
    },
    { runValidators: true }
  );

  // Update the specific item
  await Order.updateOne(
    { _id: orderId, "items._id": itemId },
    {
      $set: {
        "items.$.status": "Return Requested",
        "items.$.item_status": "Return Requested",
        "items.$.return_reason": reason,
        "items.$.return_requested_at": new Date()
      },
      $push: {
        "items.$.statusHistory": {
          status: "Return Requested",
          reason: reason,
          timestamp: new Date()
        }
      }
    }
  );

  // Check if all non-cancelled items have return requests to update order status
  const updatedOrder = await Order.findById(orderId);
  const nonCancelledItems = updatedOrder.items.filter(item => 
    (item.status || item.item_status) !== 'Cancelled'
  );
  
  const allNonCancelledItemsReturnRequested = nonCancelledItems.every(
    (item) => (item.status || item.item_status) === "Return Requested" || 
    (item.status || item.item_status) === "Returned" ||
    (updatedOrder.returnRequests && updatedOrder.returnRequests.some(req => req.itemId.toString() === item._id.toString()))
  );
  
  if (allNonCancelledItemsReturnRequested && nonCancelledItems.length > 0) {
    await Order.findByIdAndUpdate(orderId, { order_status: "Return Requested" });
  }


  return updatedOrder;
};

// Migration function to fix existing orders without returnRequests field
const fixExistingOrders = async () => {
  try {
    const result = await Order.updateMany(
      { returnRequests: { $exists: false } },
      { $set: { returnRequests: [] } }
    );
  
    return result;
  } catch (error) {
    console.error("Error fixing existing orders:", error);
    throw error;
  }
};

export default {
  getOrders,
  getOrderDetails,
  cancelOrderItem,
  cancelEntireOrder,
  cancelOrderItems,
  returnOrderItem,
};
