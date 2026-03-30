import Order from "../../Models/OrderModel.js";
import User from "../../Models/UserModel.js";
import Variant from "../../Models/VariantModel.js";
import { creditWallet } from "../../utils/walletHelper.js";

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

  const validStatuses = ["Pending", "Confirmed", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Return Requested"];
  if (!validStatuses.includes(newStatus)) {
    throw new Error("Invalid status");
  }

  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  if (order.order_status === "Cancelled") {
    throw new Error("Cannot update status of a cancelled order");
  }

  if (order.order_status === "Returned" || order.order_status === "Return Requested") {
    throw new Error("Cannot update status of a returned or return requested order");
  }

  order.order_status = newStatus;

  //Set delivery date if status is Delivered
  if (newStatus === "Delivered" && !order.delivery_date) {
    order.delivery_date = new Date();
  }

  //Set shipped date if status is Shipped
  if (newStatus === "Shipped" && !order.shipped_date) {
    order.shipped_date = new Date();
  }

  await order.save();

  return { success: true, newStatus };
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

const approveReturn = async (itemId) => {
  if (!itemId) {
    throw new Error("Item ID is required");
  }

  const order = await Order.findOne({ "items._id": itemId });  //queries inside the nested items array
  if (!order) {
    throw new Error("Order not found");
  }

  const item = order.items.id(itemId);   //finds the specific subdocument inside the  array by _id
  if (!item) {
    throw new Error("Item not found");
  }

  const returnRequest = order.returnRequests.find(req => req.itemId.toString() === itemId);  
  if (!returnRequest) {
    throw new Error("Return request not found");
  }

  if (returnRequest.status !== "pending") {
    throw new Error("Return request is not pending");
  }//if already approved/rejected, throws an error

  await Variant.findByIdAndUpdate(item.variant_id, {
    $inc: { stock_quantity: item.quantity }
  });//automically increments stock_quantity by item.quantity

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
      order._id
    );

    // Update order refund details
    order.refundAmount = (order.refundAmount || 0) + refundAmount;
    order.refundStatus = 'completed';
    order.refundedAt = new Date();
  }

  //Updates the item's status, records the return timestamp, and appends to its status history log
  item.status = item.status ? "Returned" : undefined;
  item.item_status = "Returned";
  item.returned_at = new Date();
 
  if (!item.statusHistory) {
    item.statusHistory = [];
  }
  item.statusHistory.push({
    status: "Returned",
    reason: "Return approved by admin",
  });

  returnRequest.status = "approved";
  returnRequest.processedAt = new Date();

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
        order._id
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

  await order.save();
  
  return { success: true, item, refundAmount: returnRequest.refundAmount };
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


export default {
  getOrders,
  getOrderDetails,
  updateOrderStatus,
  approveReturn,
  rejectReturn,
};
