import Order from "../../Models/OrderModel.js";
import User from "../../Models/UserModel.js";
import Variant from "../../Models/VariantModel.js";
import { creditWallet } from "../../utils/walletHelper.js";
import { validateStatusTransition, createStatusHistoryEntry, getValidNextStatuses } from "../../utils/orderStatusValidator.js";
import { restoreStock, validateItemStock } from "../../utils/stockValidator.js";
import mongoose from "mongoose";

const getOrders = async (query) => {
  let search = query.search || "";
  let page = parseInt(query.page, 10) || 1;
  let limit = 10;
  let sortBy = query.sortBy || "order_date";
  let sortOrder = query.sortOrder === "asc" ? 1 : -1;
  let statusFilter = query.status || "";

  let filter = {};

  //Search by order ID or user name
  if (search) {
    const users = await User.find({
      username: { $regex: search, $options: "i" },
    }).select("_id");  //Tells Mongoose to only return the _id field 

    const userIds = users.map((u) => u._id);  //makes an array of ids

  //Checks if search matches either order_id, or user_id 
    filter.$or = [
      { order_id: { $regex: search, $options: "i" } },
      { user_id: { $in: userIds } },
    ];
  }

  //Filter by status
  if (statusFilter) {
    filter.order_status = statusFilter;
  }  //Direct user input added to the MongoDB filter as an exact match

  const orders = await Order.find(filter)
    .sort({ [sortBy]: sortOrder })  //[]->telling JS to use the value of the variable as the key
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("user_id", "username email")
    .lean();   //returns plain JS objects instead of Mongoose documents

  const totalOrders = await Order.countDocuments(filter);
  const totalPages = Math.ceil(totalOrders / limit);

  return {
    orders,
    currentPage: page,
    totalPages,
    totalOrders,
    searchQuery: search,
    sortBy,
    sortOrder: query.sortOrder || "desc",
    statusFilter,
  };
};

const updateOrderStatus = async (orderId, newStatus) => {
  if (!orderId || !newStatus) {
    throw new Error("Order ID and status are required");
  }

  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  const currentStatus = order.order_status;

  // Validate the status transition using the comprehensive validator
  const validation = validateStatusTransition(currentStatus, newStatus, true);
  
  if (!validation.isValid) {
    throw new Error(validation.reason);
  }

  // Additional business logic validations
  if (currentStatus === "Delivered" && newStatus !== "Return Requested") {
    throw new Error("Delivered orders can only transition to Return Requested status, and only by customers");
  }

  // Update the order status
  order.order_status = newStatus;

  // Set delivery date if status is Delivered
  if (newStatus === "Delivered" && !order.delivery_date) {
    order.delivery_date = new Date();
  }

  // Set shipped date if status is Shipped
  if (newStatus === "Shipped" && !order.shipped_date) {
    order.shipped_date = new Date();
  }

  // Add status change to history
  const statusHistoryEntry = createStatusHistoryEntry(
    newStatus, 
    `Status updated by admin from ${currentStatus} to ${newStatus}`,
    "admin"
  );

  // Add to order-level status history if it exists
  if (!order.statusHistory) {
    order.statusHistory = [];
  }
  order.statusHistory.push(statusHistoryEntry);

  // Also update individual item statuses to match order status
  // (except for terminal item statuses like Cancelled, Returned)
  order.items.forEach(item => {
    const itemStatus = item.status || item.item_status;
    
    // Don't update items that are in terminal states
    if (!["Cancelled", "Returned", "Return Requested"].includes(itemStatus)) {
      item.status = newStatus;
      
      // Add to item status history
      if (!item.statusHistory) {
        item.statusHistory = [];
      }
      item.statusHistory.push(statusHistoryEntry);
    }
  });

  await order.save();

  return { 
    success: true, 
    newStatus,
    previousStatus: currentStatus,
    message: `Order status successfully updated from ${currentStatus} to ${newStatus}`,
    validNextStatuses: getValidNextStatuses(newStatus, true)
  };
};

const getOrderDetails = async (orderId) => {
  try {
    const order = await Order.findById(orderId)
      .populate("user_id", "username email phoneNumber")
      .populate("items.product_id", "productName") 
      .populate("items.variant_id", "color size price images")
      .lean();

    if (!order) return null;

   
    if (order.returnRequests && order.returnRequests.length > 0) {
      order.returnRequests = order.returnRequests.map(req => ({
        ...req,
        itemId: req.itemId?.toString()
      }));
    }   //Converts each itemId in returnRequests to a plain string, frontend will fail if not converted

    return order;
  } catch (error) {
    console.error("Error fetching order details:", error);
    return null;
  }
};

const approveReturn = async (itemId, addToInventory = true) => {
  if (!itemId) {
    throw new Error("Item ID is required");
  }

  const session = await mongoose.startSession();
  
  try {
    return await session.withTransaction(async () => {
      const order = await Order.findOne({ "items._id": itemId }).session(session);
      if (!order) {
        throw new Error("Order not found");
      }

      const item = order.items.id(itemId);
      if (!item) {
        throw new Error("Item not found");
      }

      const returnRequest = order.returnRequests.find(req => req.itemId.toString() === itemId);  
      if (!returnRequest) {
        throw new Error("Return request not found");
      }

      if (returnRequest.status !== "pending") {
        throw new Error("Return request is not pending");
      }

      // Only increment stock if addToInventory is true and validate the operation
      if (addToInventory) {
        // Validate that the variant still exists and can accept the stock
        const validation = await validateItemStock(item.variant_id, 0, session); // Check if variant exists
        if (!validation.isValid && validation.reason !== "Only 0 items available in stock") {
          // If variant doesn't exist or has other issues, log warning but continue
          console.warn(`Warning: Cannot restore stock for variant ${item.variant_id}: ${validation.reason}`);
        } else {
          // Use the stock restoration utility for atomic operation
          await restoreStock([{
            variant_id: item.variant_id,
            quantity: item.quantity
          }], session);
        }
      }

      // Calculate refund amount accounting for coupon discount
      const itemValue = item.totalPrice || (item.price * item.quantity);
      const totalOrderValue = order.items.reduce((sum, orderItem) => sum + (orderItem.totalPrice || (orderItem.price * orderItem.quantity)), 0);
      
      // Calculation for no coupon discount order
      const proportionalDiscount = (order.coupon_discount || 0) * (itemValue / totalOrderValue);
      const refundAmount = itemValue - proportionalDiscount;
      
      // Process refund for all paid orders (wallet, online, paypal)
      if (order.payment_method === 'wallet' || order.payment_method === 'online' || order.payment_method === 'paypal') {
        await creditWallet(
          order.user_id, 
          refundAmount, 
          `Refund for returned item in order #${order.order_id}`, 
          order._id,
          session
        );

        // Update order refund details
        order.refundAmount = (order.refundAmount || 0) + refundAmount;
        order.refundStatus = 'completed';
        order.refundedAt = new Date();
      }

      // Updates the item's status, records the return timestamp, and appends to its status history log
      item.status = item.status ? "Returned" : undefined;
      item.item_status = "Returned";
      item.returned_at = new Date();
     
      if (!item.statusHistory) {
        item.statusHistory = [];
      }
      item.statusHistory.push({
        status: "Returned",
        reason: addToInventory ? "Return approved by admin" : "Return approved by admin (no inventory update)",
      });

      returnRequest.status = "approved";
      returnRequest.processedAt = new Date();
      returnRequest.addedToInventory = addToInventory; // Track whether stock was incremented

      // Determine the correct order status based on actual item states
      const nonCancelledItems = order.items.filter(orderItem => 
        (orderItem.status || orderItem.item_status) !== "Cancelled"
      );
      
      const returnedItems = nonCancelledItems.filter(orderItem => 
        (orderItem.status || orderItem.item_status) === "Returned"
      );
      
      const deliveredItems = nonCancelledItems.filter(orderItem => 
        (orderItem.status || orderItem.item_status) === "Delivered"
      );
      
      const returnRequestedItems = nonCancelledItems.filter(orderItem => 
        (orderItem.status || orderItem.item_status) === "Return Requested"
      );

      // Determine order status based on item states
      if (returnedItems.length === nonCancelledItems.length) {
        // All non-cancelled items are returned
        order.order_status = "Returned";
        
        // Refund shipping cost for fully returned order
        const shippingRefund = order.shipping_cost;
        if (order.payment_method === 'wallet' || order.payment_method === 'online' || order.payment_method === 'paypal') {
          await creditWallet(
            order.user_id, 
            shippingRefund, 
            `Shipping refund for fully returned order #${order.order_id}`, 
            order._id,
            session
          );
          
          // Update order refund details
          order.refundAmount = (order.refundAmount || 0) + shippingRefund;
        }
      } else if (returnedItems.length > 0) {
        // Some items are returned, some are not
        order.order_status = "Partially Returned";
      } else if (returnRequestedItems.length > 0) {
        // Some items still have pending return requests
        order.order_status = "Return Requested";
      } else {
        // All items are delivered (no returns)
        order.order_status = "Delivered";
      }

      await order.save({ session });
      
      return { success: true, item, refundAmount: returnRequest.refundAmount, addedToInventory: addToInventory };
    });
  } finally {
    await session.endSession();
  }
};

const rejectReturn = async (itemId, reason) => {
  if (!itemId || !reason) {
    throw new Error("Item ID and reason are required");
  }

  const order = await Order.findOne({ "items._id": itemId });
  if (!order) {
    throw new Error("Order not found");
  }

  const returnRequest = order.returnRequests.find(req => req.itemId.toString() === itemId);
  if (!returnRequest) {
    throw new Error("Return request not found");
  }

  if (returnRequest.status !== "pending") {
    throw new Error("Return request is not pending");
  }

  // Update return request with rejection details
  returnRequest.status = "rejected";
  returnRequest.adminReason = reason.trim();
  returnRequest.processedAt = new Date();

  // Update the corresponding item status back to delivered
  const item = order.items.id(itemId);
  if (item && (item.status || item.item_status) === "Return Requested") {
    item.status = item.status ? "Delivered" : undefined;
    item.item_status = "Delivered";
    
    // Add to status history
    if (!item.statusHistory) {
      item.statusHistory = [];
    }
    item.statusHistory.push({
      status: "Delivered",
      reason: "Return request rejected by admin",
    });
  }

  // Determine the correct order status based on actual item states
  const nonCancelledItems = order.items.filter(orderItem => 
    (orderItem.status || orderItem.item_status) !== "Cancelled"
  );
  
  const returnedItems = nonCancelledItems.filter(orderItem => 
    (orderItem.status || orderItem.item_status) === "Returned"
  );
  
  const deliveredItems = nonCancelledItems.filter(orderItem => 
    (orderItem.status || orderItem.item_status) === "Delivered"
  );
  
  const returnRequestedItems = nonCancelledItems.filter(orderItem => 
    (orderItem.status || orderItem.item_status) === "Return Requested"
  );

  // Determine order status based on item states
  if (returnedItems.length === nonCancelledItems.length) {
    // All non-cancelled items are returned
    order.order_status = "Returned";
  } else if (returnedItems.length > 0) {
    // Some items are returned, some are not
    order.order_status = "Partially Returned";
  } else if (returnRequestedItems.length > 0) {
    // Some items still have pending return requests
    order.order_status = "Return Requested";
  } else {
    // All items are delivered (no returns)
    order.order_status = "Delivered";
  }

  await order.save();
  return { success: true };
};


const approveReturnWithInventory = async (itemId) => {
  return await approveReturn(itemId, true);
};

const approveReturnWithoutInventory = async (itemId) => {
  return await approveReturn(itemId, false);
};

const getOrderStatusInfo = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  const currentStatus = order.order_status;
  const validNextStatuses = getValidNextStatuses(currentStatus, true);

  return {
    orderId: order._id,
    orderNumber: order.order_id,
    currentStatus,
    validNextStatuses,
    canUpdate: validNextStatuses.length > 0,
    statusHistory: order.statusHistory || [],
    lastUpdated: order.updatedAt
  };
};

const getValidStatusOptions = (currentStatus) => {
  return getValidNextStatuses(currentStatus, true);
};

export default {
  getOrders,
  getOrderDetails,
  updateOrderStatus,
  approveReturn,
  approveReturnWithInventory,
  approveReturnWithoutInventory,
  rejectReturn,
  getOrderStatusInfo,
  getValidStatusOptions,
};
