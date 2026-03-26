import Order from "../../Models/OrderModel.js";
import Variant from "../../Models/VariantModel.js";
import User from "../../Models/UserModel.js";
import { creditWallet } from "../../utils/walletHelper.js";

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

  // Prevent individual item cancellation for orders with coupon discounts
  if (order.coupon_discount && order.coupon_discount > 0) {
    throw new Error("Individual item cancellation is not allowed for orders with coupon discounts. Please cancel the entire order instead.");
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

  // Calculate refund amount for this item (accounting for coupon discount)
  const itemValue = item.totalPrice || (item.price * item.quantity);
  const totalOrderValue = order.items.reduce((sum, orderItem) => sum + (orderItem.totalPrice || (orderItem.price * orderItem.quantity)), 0);
  
  // Calculate proportional coupon discount for this item
  const proportionalDiscount = (order.coupon_discount || 0) * (itemValue / totalOrderValue);
  const refundAmount = itemValue - proportionalDiscount;

  // Process refund if payment was made via wallet, online, or paypal
  if (order.payment_method === 'wallet' || order.payment_method === 'online' || order.payment_method === 'paypal') {
    await creditWallet(
      userId, 
      refundAmount, 
      `Refund for cancelled item in order #${order.order_id}`, 
      order._id
    );

    // Update order refund details
    order.refundAmount = (order.refundAmount || 0) + refundAmount;
    order.refundStatus = 'completed';
    order.refundedAt = new Date();
  }

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
    
    // If this was the last item and user paid for shipping, refund the shipping cost too
    if (order.payment_method === 'wallet' || order.payment_method === 'online' || order.payment_method === 'paypal') {
      const shippingRefund = order.shipping_cost;
      await creditWallet(
        userId, 
        shippingRefund, 
        `Shipping refund for fully cancelled order #${order.order_id}`, 
        order._id
      );
      
      // Update order refund details
      order.refundAmount = (order.refundAmount || 0) + shippingRefund;
    }
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

  // Calculate total refund amount for non-cancelled items
  let totalRefundAmount = 0;
  const itemsToCancel = order.items.filter(item => (item.status || item.item_status) !== "Cancelled");
  
  // Check if this is a full order cancellation
  const isFullOrderCancellation = itemsToCancel.length === order.items.length;
  
  if (isFullOrderCancellation) {
    // For full order cancellation, refund the final amount (what user actually paid)
    // Fallback to calculated amount if final_amount is not available
    totalRefundAmount = order.final_amount || (order.total_amount - (order.coupon_discount || 0));
  } else {
    // For partial cancellation, calculate proportional refund
    const totalItemsValue = order.items.reduce((sum, item) => sum + (item.totalPrice || (item.price * item.quantity)), 0);
    const cancelledItemsValue = itemsToCancel.reduce((sum, item) => sum + (item.totalPrice || (item.price * item.quantity)), 0);
    
    // Calculate proportional refund including coupon discount
    const proportionalDiscount = (order.coupon_discount || 0) * (cancelledItemsValue / totalItemsValue);
    totalRefundAmount = cancelledItemsValue - proportionalDiscount;
  }

  // Process refund if payment was made via wallet, online, or paypal
  if (totalRefundAmount > 0 && (order.payment_method === 'wallet' || order.payment_method === 'online' || order.payment_method === 'paypal')) {
    await creditWallet(
      userId, 
      totalRefundAmount, 
      `Refund for cancelled order #${order.order_id}`, 
      order._id
    );

    // Update order refund details
    order.refundAmount = totalRefundAmount;
    order.refundStatus = 'completed';
    order.refundedAt = new Date();
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

  // Prevent individual item cancellation for orders with coupon discounts
  if (order.coupon_discount && order.coupon_discount > 0) {
    throw new Error("Individual item cancellation is not allowed for orders with coupon discounts. Please cancel the entire order instead.");
  }

  let cancelledCount = 0;
  let totalItemsValue = 0;
  const totalOrderValue = order.items.reduce((sum, orderItem) => sum + (orderItem.totalPrice || (orderItem.price * orderItem.quantity)), 0);

  //Only processes items that exist and aren't already cancelled
  for (const itemId of itemIds) {
    const item = order.items.id(itemId);
    if (item && (item.status || item.item_status) !== "Cancelled") {
      //Restore stock
      await Variant.findByIdAndUpdate(item.variant_id, {
        $inc: { stock_quantity: item.quantity },
      });

      // Calculate item value for proportional discount calculation
      const itemValue = item.totalPrice || (item.price * item.quantity);
      totalItemsValue += itemValue;

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

  // Calculate total refund amount accounting for coupon discount
  let totalRefundAmount = 0;
  if (totalItemsValue > 0) {
    // Check if all items are being cancelled
    const allItemsValue = order.items.reduce((sum, orderItem) => sum + (orderItem.totalPrice || (orderItem.price * orderItem.quantity)), 0);
    const isAllItemsCancelled = Math.abs(totalItemsValue - allItemsValue) < 0.01;
    
    if (isAllItemsCancelled) {
      // If all items are cancelled, refund the full final amount
      // Fallback to calculated amount if final_amount is not available
      totalRefundAmount = order.final_amount || (order.total_amount - (order.coupon_discount || 0));
    } else {
      // For partial cancellation, calculate proportional refund (no shipping refund)
      const proportionalDiscount = (order.coupon_discount || 0) * (totalItemsValue / allItemsValue);
      totalRefundAmount = totalItemsValue - proportionalDiscount;
    }
  }

  // Process refund if payment was made via wallet, online, or paypal
  if (totalRefundAmount > 0 && (order.payment_method === 'wallet' || order.payment_method === 'online' || order.payment_method === 'paypal')) {
    await creditWallet(
      userId, 
      totalRefundAmount, 
      `Refund for cancelled items in order #${order.order_id}`, 
      order._id
    );

    // Update order refund details
    order.refundAmount = (order.refundAmount || 0) + totalRefundAmount;
    order.refundStatus = 'completed';
    order.refundedAt = new Date();
  }

  //Check if all items are cancelled after this operation
  const allCancelled = order.items.every((item) => (item.status || item.item_status) === "Cancelled");
  if (allCancelled) {
    order.order_status = "Cancelled";
    
    // If this operation resulted in all items being cancelled, but we calculated a partial refund
    // (meaning not all items were cancelled in this single call), we need to refund shipping
    const wasPartialCancellation = !isAllItemsCancelled;
    if (wasPartialCancellation && (order.payment_method === 'wallet' || order.payment_method === 'online' || order.payment_method === 'paypal')) {
      const shippingRefund = order.shipping_cost;
      await creditWallet(
        userId, 
        shippingRefund, 
        `Shipping refund for fully cancelled order #${order.order_id}`, 
        order._id
      );
      
      // Update order refund details
      order.refundAmount = (order.refundAmount || 0) + shippingRefund;
    }
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

  // Prevent individual item returns for orders with coupon discounts
  if (order.coupon_discount && order.coupon_discount > 0) {
    throw new Error("Individual item returns are not allowed for orders with coupon discounts. Please contact customer support for assistance.");
  }

  const item = order.items.id(itemId);
  if (!item) {
    throw new Error("Item not found in order");
  }

  // Check if item is cancelled or already returned
  const itemStatus = item.status || item.item_status || 'Pending';
  if (itemStatus === 'Cancelled') {
    throw new Error("Cannot return cancelled items");
  }

  if (itemStatus === 'Returned') {
    throw new Error("This item has already been returned");
  }

  // For delivered or partially returned orders, allow return of any non-cancelled item
  if (!["Delivered", "Partially Returned"].includes(order.order_status)) {
    throw new Error("Only items from delivered or partially returned orders can be returned");
  }

  // Check if this item already has a pending or approved return request
  const existingActiveReturnRequest = order.returnRequests && order.returnRequests.find(req => 
    req.itemId.toString() === itemId.toString() && 
    (req.status === 'pending' || req.status === 'approved')
  );

  if (existingActiveReturnRequest) {
    if (existingActiveReturnRequest.status === 'pending') {
      throw new Error("This item already has a pending return request. Please wait for it to be processed.");
    } else if (existingActiveReturnRequest.status === 'approved') {
      throw new Error("This item has already been approved for return.");
    }
  }

  // Check if this item has a rejected return request (permanently blocked)
  const rejectedReturnRequest = order.returnRequests && order.returnRequests.find(req => 
    req.itemId.toString() === itemId.toString() && 
    req.status === 'rejected'
  );

  if (rejectedReturnRequest) {
    throw new Error("Return request for this item has been rejected and cannot be returned.");
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

const returnEntireOrder = async (userId, orderId, reason) => {
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

  if (!["Delivered", "Partially Returned"].includes(order.order_status)) {
    throw new Error("Only delivered or partially returned orders can be returned");
  }

  // Get all non-cancelled, non-returned items that haven't been rejected (items that can still be returned)
  const returnableItems = order.items.filter(item => {
    const itemStatus = item.status || item.item_status || 'Pending';
    const hasRejectedReturnRequest = order.returnRequests && order.returnRequests.some(req => 
      req.itemId.toString() === item._id.toString() && 
      req.status === 'rejected'
    );
    return itemStatus !== 'Cancelled' && 
           itemStatus !== 'Returned' && 
           !hasRejectedReturnRequest;
  });

  if (returnableItems.length === 0) {
    throw new Error("No items available for return");
  }

  // Check if any of the returnable items already have pending or approved return requests
  const returnableItemIds = returnableItems.map(item => item._id.toString());
  const hasPendingOrApprovedReturns = order.returnRequests && order.returnRequests.some(req => 
    (req.status === 'pending' || req.status === 'approved') && 
    returnableItemIds.includes(req.itemId.toString())
  );

  if (hasPendingOrApprovedReturns) {
    throw new Error("Some items already have pending or approved return requests. Please wait for them to be processed or contact customer support.");
  }

  // Calculate refund amount for remaining items
  let totalRefundAmount;
  
  if (order.order_status === 'Delivered') {
    // For fully delivered orders, refund the final amount (what user actually paid)
    totalRefundAmount = order.final_amount || (order.total_amount - (order.coupon_discount || 0));
  } else {
    // For partially returned orders, calculate refund for remaining items
    const returnableItemsValue = returnableItems.reduce((sum, item) => 
      sum + (item.totalPrice || (item.price * item.quantity)), 0
    );
    
    const totalOrderValue = order.items.reduce((sum, item) => 
      sum + (item.totalPrice || (item.price * item.quantity)), 0
    );
    
    // Calculate proportional coupon discount for remaining items
    const proportionalDiscount = (order.coupon_discount || 0) * (returnableItemsValue / totalOrderValue);
    totalRefundAmount = returnableItemsValue - proportionalDiscount;
    
    // Add shipping cost if all remaining items are being returned
    const allRemainingItemsBeingReturned = returnableItems.length === order.items.filter(item => {
      const itemStatus = item.status || item.item_status || 'Pending';
      return itemStatus !== 'Cancelled' && itemStatus !== 'Returned';
    }).length;
    
    if (allRemainingItemsBeingReturned) {
      totalRefundAmount += order.shipping_cost;
    }
  }

  // Create return requests for all returnable items
  const returnRequests = returnableItems.map(item => ({
    itemId: item._id,
    reason: reason.trim(),
    status: "pending",
    refundAmount: totalRefundAmount, // Calculated refund amount for remaining items
    requestedAt: new Date()
  }));

  // Update order with return requests
  await Order.findByIdAndUpdate(
    orderId,
    {
      $push: { 
        returnRequests: { $each: returnRequests }
      },
      $set: {
        order_status: "Return Requested"
      }
    },
    { runValidators: true }
  );

  // Update all returnable items
  for (const item of returnableItems) {
    await Order.updateOne(
      { _id: orderId, "items._id": item._id },
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
  }

  const updatedOrder = await Order.findById(orderId);
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
  returnEntireOrder,
};
