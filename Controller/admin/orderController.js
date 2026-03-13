import orderService from "../../service/admin/orderService.js";

const ordersGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const data = await orderService.getOrders(req.query);

    return res.render("adminOrder", data);
  } catch (error) {
    console.error("Error loading orders:", error);
    return res.redirect("/admin/dashboard");
  }
};

const updateOrderStatusPost = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    const result = await orderService.updateOrderStatus(orderId, status);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error updating order status:", error);

    if (error.message === "Order ID and status are required") {
      return res.status(400).json({ success: false, message: error.message });
    }

    if (error.message === "Invalid status") {
      return res.status(400).json({ success: false, message: error.message });
    }

    if (error.message === "Order not found") {
      return res.status(404).json({ success: false, message: error.message });
    }

    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const orderDetailsGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const orderId = req.params.id;
    const orderDetails = await orderService.getOrderDetails(orderId);

    if (!orderDetails) {
      return res.redirect("/admin/orders");
    }

    return res.render("adminOrderDetails", { order: orderDetails });
  } catch (error) {
    console.error("Error loading order details:", error);
    return res.redirect("/admin/orders");
  }
};

const approveReturnPost = async (req, res) => {
  try {
    const { itemId } = req.params;

    const result = await orderService.approveReturn(itemId);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error approving return:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const rejectReturnPost = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { reason } = req.body;

    const result = await orderService.rejectReturn(itemId, reason);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error rejecting return:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const approveOrderReturnPost = async (req, res) => {
  try {
    const { orderId } = req.body;

    const result = await orderService.approveOrderReturn(orderId);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error approving order return:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const rejectOrderReturnPost = async (req, res) => {
  try {
    const { orderId, reason } = req.body;

    const result = await orderService.rejectOrderReturn(orderId, reason);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error rejecting order return:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

export default {
  ordersGet,
  orderDetailsGet,
  updateOrderStatusPost,
  approveOrderReturnPost,
  rejectOrderReturnPost,
  approveReturnPost,
  rejectReturnPost,
};
