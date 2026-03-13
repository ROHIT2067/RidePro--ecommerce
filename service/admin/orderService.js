import Order from "../../Models/OrderModel.js";
import User from "../../Models/UserModel.js";

const getOrders = async (query) => {
  let search = query.search || "";
  let page = parseInt(query.page, 10) || 1;
  let limit = 10;
  let sortBy = query.sortBy || "order_date";
  let sortOrder = query.sortOrder === "asc" ? 1 : -1;
  let statusFilter = query.status || "";

  // Build filter
  let filter = {};

  // Search by order ID or user name
  if (search) {
    const users = await User.find({
      username: { $regex: search, $options: "i" },
    }).select("_id");

    const userIds = users.map((u) => u._id);

    filter.$or = [
      { order_id: { $regex: search, $options: "i" } },
      { user_id: { $in: userIds } },
    ];
  }

  // Filter by status
  if (statusFilter) {
    filter.order_status = statusFilter;
  }

  const orders = await Order.find(filter)
    .sort({ [sortBy]: sortOrder })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("user_id", "username email")
    .lean();

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

  // Prevent status updates for cancelled orders
  if (order.order_status === "Cancelled") {
    throw new Error("Cannot update status of a cancelled order");
  }

  // Prevent status updates for returned orders (Feature 5)
  if (order.order_status === "Returned" || order.order_status === "Return Requested") {
    throw new Error("Cannot update status of a returned or return requested order");
  }

  order.order_status = newStatus;

  // Set delivery date if status is Delivered
  if (newStatus === "Delivered" && !order.delivery_date) {
    order.delivery_date = new Date();
  }

  // Set shipped date if status is Shipped
  if (newStatus === "Shipped" && !order.shipped_date) {
    order.shipped_date = new Date();
  }

  await order.save();

  return { success: true, newStatus };
};

const getOrderDetails = async (orderId) => {
  try {
    console.log("=== Admin Get Order Details Debug ===");
    console.log("Fetching order:", orderId);

    const order = await Order.findById(orderId)
      .populate("user_id", "username email phoneNumber")
      .populate("items.product_id", "productName")
      .populate("items.variant_id", "color size price images")
      .lean();

    if (order) {
      console.log("Order found:", order.order_id);
      console.log("Order status:", order.order_status);
      console.log("ReturnRequests exists:", !!order.returnRequests);
      console.log("ReturnRequests length:", order.returnRequests ? order.returnRequests.length : 0);
      console.log("ReturnRequests content:", JSON.stringify(order.returnRequests, null, 2));
    } else {
      console.log("Order not found");
    }
    console.log("=== End Admin Debug ===");

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

  const order = await Order.findOne({ "items._id": itemId });
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

  // Update item status to "Returned"
  item.status = item.status ? "Returned" : undefined;
  item.item_status = "Returned"; // Keep backward compatibility
  item.returned_at = new Date();
  
  // Add to status history if the field exists
  if (!item.statusHistory) {
    item.statusHistory = [];
  }
  item.statusHistory.push({
    status: "Returned",
    reason: "Return approved by admin",
  });

  // Update return request
  returnRequest.status = "approved";
  returnRequest.processedAt = new Date();

  // Check if all items are returned to update order status
  const allItemsReturned = order.items.every(item => 
    (item.status || item.item_status) === "Returned" || 
    (item.status || item.item_status) === "Cancelled"
  );
  
  if (allItemsReturned) {
    order.order_status = "Returned";
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

  // Update return request
  returnRequest.status = "rejected";
  returnRequest.adminReason = reason;
  returnRequest.processedAt = new Date();

  await order.save();
  return { success: true };
};

const approveOrderReturn = async (orderId) => {
  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  if (order.order_status !== "Return Requested") {
    throw new Error("Order is not in return requested status");
  }

  // Update order status to "Returned"
  order.order_status = "Returned";
  
  // Update all items to "Returned" status
  order.items.forEach((item) => {
    item.status = item.status ? "Returned" : undefined;
    item.item_status = "Returned"; // Keep backward compatibility
    item.returned_at = new Date();
    
    // Add to status history if the field exists
    if (!item.statusHistory) {
      item.statusHistory = [];
    }
    item.statusHistory.push({
      status: "Returned",
      reason: "Order return approved by admin",
    });
  });

  // Update all return requests to approved
  if (!order.returnRequests) {
    order.returnRequests = [];
  }
  order.returnRequests.forEach(req => {
    if (req.status === "pending") {
      req.status = "approved";
      req.processedAt = new Date();
    }
  });

  await order.save();
  return { success: true };
};

const rejectOrderReturn = async (orderId, reason) => {
  if (!orderId || !reason) {
    throw new Error("Order ID and reason are required");
  }

  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  if (order.order_status !== "Return Requested") {
    throw new Error("Order is not in return requested status");
  }

  // Update order status back to "Delivered" (assuming it was delivered before return request)
  order.order_status = "Delivered";
  
  // Update all items back to "Delivered" status
  order.items.forEach((item) => {
    if ((item.status || item.item_status) === "Return Requested") {
      item.status = item.status ? "Delivered" : undefined;
      item.item_status = "Delivered"; // Keep backward compatibility
      
      // Add to status history if the field exists
      if (!item.statusHistory) {
        item.statusHistory = [];
      }
      item.statusHistory.push({
        status: "Delivered",
        reason: "Return request rejected by admin",
      });
    }
  });

  // Update all return requests to rejected
  if (!order.returnRequests) {
    order.returnRequests = [];
  }
  order.returnRequests.forEach(req => {
    if (req.status === "pending") {
      req.status = "rejected";
      req.adminReason = reason;
      req.processedAt = new Date();
    }
  });

  await order.save();
  return { success: true };
};

export default {
  getOrders,
  getOrderDetails,
  updateOrderStatus,
  approveOrderReturn,
  rejectOrderReturn,
  approveReturn,
  rejectReturn,
};
