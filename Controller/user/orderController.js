import orderService, { fixExistingOrders } from "../../service/user/orderService.js";
import Order from "../../Models/OrderModel.js";
import User from "../../Models/UserModel.js";
import Cart from "../../Models/CartModel.js";
import PDFDocument from "pdfkit";

const ordersGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user;
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search || "";

    const orderData = await orderService.getOrders(userId, page, 10, search);

    return res.render("orders", {
      orders: orderData.orders,
      currentPage: orderData.currentPage,
      totalPages: orderData.totalPages,
      hasNextPage: orderData.hasNextPage,
      hasPrevPage: orderData.hasPrevPage,
      search,
    });
  } catch (error) {
    console.error("Orders Get Error:", error);
    return res.redirect("/home");
  }
};

const orderDetailsGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user;
    const orderId = req.params.orderId;

    const order = await orderService.getOrderDetails(userId, orderId);

    if (!order) {
      return res.status(404).render("pagenotfound");
    }

    return res.render("order-details", {
      order,
    });
  } catch (error) {
    console.error("Order Details Get Error:", error);
    return res.redirect("/orders");
  }
};


const cancelOrderPost = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Please login" });
    }

    const userId = req.session.user;
    const orderId = req.params.orderId;
    const { reason } = req.body;

    await orderService.cancelEntireOrder(userId, orderId, reason);

    return res.json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel Order Error:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const cancelOrderItemPost = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Please login" });
    }

    const userId = req.session.user;
    const orderId = req.params.orderId;
    const itemId = req.params.itemId;
    const { reason } = req.body;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: "Item ID is required",
      });
    }

    await orderService.cancelOrderItem(userId, orderId, itemId, reason);

    return res.json({
      success: true,
      message: "Item cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel Order Item Error:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const cancelOrderItemsPost = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Please login" });
    }

    const userId = req.session.user;
    const orderId = req.params.orderId;
    const { itemIds, reason } = req.body;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No items specified",
      });
    }

    const result = await orderService.cancelOrderItems(userId, orderId, itemIds, reason);

    return res.json({
      success: true,
      message: `${result.cancelledCount} item(s) cancelled successfully`,
    });
  } catch (error) {
    console.error("Cancel Order Items Error:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const returnOrderItemPost = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Please login" });
    }

    const userId = req.session.user;
    const orderId = req.params.orderId;
    const { itemId, reason } = req.body;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: "Item ID is required",
      });
    }

    await orderService.returnOrderItem(userId, orderId, itemId, reason);

    return res.json({
      success: true,
      message: "Return request submitted successfully",
    });
  } catch (error) {
    console.error("Return Order Item Error:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const downloadInvoiceGet = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user;
    const orderId = req.params.orderId;

    const order = await Order.findOne({
      _id: orderId,
      user_id: userId,
    })
      .populate({
        path: "items.variant_id",
        populate: {
          path: "product_id",
          select: "productName",
        },
      })
      .populate("user_id", "username email");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="invoice-${order.order_id}.pdf"`
    );

    doc.pipe(res);

    // Header
    doc.fontSize(20).text("RIDEPRO", 50, 50);
    doc.fontSize(10).text("Motorcycle Gear Store", 50, 75);
    doc.text("Email: support@ridepro.com", 50, 90);

    // Invoice title
    doc.fontSize(16).text("INVOICE", 400, 50);
    doc.fontSize(10).text(`Invoice #: ${order.order_id}`, 400, 75);
    doc.text(`Date: ${order.order_date.toLocaleDateString()}`, 400, 90);

    // Customer details
    doc.fontSize(12).text("Bill To:", 50, 130);
    doc.fontSize(10).text(order.shipping_address.name, 50, 150);
    doc.text(order.shipping_address.area, 50, 165);
    doc.text(
      `${order.shipping_address.district}, ${order.shipping_address.state}`,
      50,
      180
    );
    doc.text(
      `${order.shipping_address.pincode}, ${order.shipping_address.country}`,
      50,
      195
    );
    doc.text(`Phone: ${order.shipping_address.mobile}`, 50, 210);

    // Order details table
    let yPosition = 250;
    doc.fontSize(12).text("Order Details:", 50, yPosition);
    yPosition += 20;

    // Table headers
    doc.fontSize(10);
    doc.text("Item", 50, yPosition);
    doc.text("Qty", 350, yPosition);
    doc.text("Price", 400, yPosition);
    doc.text("Total", 480, yPosition);
    yPosition += 20;

    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 10;

    // Order items
    let subtotalCalculated = 0;
    order.items.forEach((item) => {
      const productName = item.productName;
      const variant = item.variantDetails;
      const itemTotal = item.totalPrice || (item.price * item.quantity);
      const itemStatus = item.status || item.item_status || "Pending";
      const isCancelled = itemStatus === "Cancelled";

      // Show all items, but indicate cancelled ones
      const displayName = isCancelled 
        ? `${productName} (${variant.size || ""} ${variant.color || ""}) [CANCELLED]`
        : `${productName} (${variant.size || ""} ${variant.color || ""})`;

      doc.text(displayName, 50, yPosition, { width: 280 });
      doc.text(item.quantity.toString(), 350, yPosition);
      doc.text(`₹${item.price.toFixed(2)}`, 400, yPosition);
      
      if (isCancelled) {
        doc.text("₹0.00", 480, yPosition);
      } else {
        doc.text(`₹${itemTotal.toFixed(2)}`, 480, yPosition);
        subtotalCalculated += itemTotal;
      }
      
      yPosition += 25;
    });

    yPosition += 10;
    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 20;

    // Totals
    doc.text("Subtotal:", 380, yPosition);
    doc.text(`₹${subtotalCalculated.toFixed(2)}`, 480, yPosition);
    yPosition += 15;

    doc.text("Shipping:", 380, yPosition);
    doc.text(`₹${order.shipping_cost.toFixed(2)}`, 480, yPosition);
    yPosition += 15;

    doc.moveTo(380, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 10;

    const finalTotal = subtotalCalculated + order.shipping_cost;
    doc.fontSize(12).text("Total Amount:", 380, yPosition);
    doc.text(`₹${finalTotal.toFixed(2)}`, 480, yPosition);

    yPosition += 30;
    doc.fontSize(10).text(`Payment Method: ${order.payment_method}`, 50, yPosition);
    doc.text(`Order Status: ${order.order_status}`, 50, yPosition + 15);

    // Check if there are any cancelled items
    const hasCancelledItems = order.items.some(item => (item.status || item.item_status) === "Cancelled");
    if (hasCancelledItems) {
      yPosition += 30;
      doc.fontSize(9).text("Note: Items marked as [CANCELLED] are not included in the total amount.", 50, yPosition);
    }

    yPosition += 40;
    doc.text("Thank you for your business!", 50, yPosition);

    doc.end();
  } catch (error) {
    console.error("Download Invoice Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate invoice",
    });
  }
};

const fixOrdersGet = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Please login" });
    }

    const result = await fixExistingOrders();
    return res.json({
      success: true,
      message: `Fixed ${result.modifiedCount} orders`,
      result
    });
  } catch (error) {
    console.error("Fix Orders Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const testReturnRequestsGet = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Please login" });
    }

    const orderId = req.params.orderId;
    
    // Get raw order data from database
    const order = await Order.findById(orderId).lean();
    
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    return res.json({
      success: true,
      orderId: order.order_id,
      orderStatus: order.order_status,
      returnRequestsExists: !!order.returnRequests,
      returnRequestsCount: order.returnRequests ? order.returnRequests.length : 0,
      returnRequests: order.returnRequests || [],
      rawData: {
        hasReturnRequestsField: 'returnRequests' in order,
        returnRequestsType: typeof order.returnRequests,
        isArray: Array.isArray(order.returnRequests)
      }
    });
  } catch (error) {
    console.error("Test Return Requests Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export default {
  ordersGet,
  orderDetailsGet,
  cancelOrderPost,
  cancelOrderItemPost,
  cancelOrderItemsPost,
  returnOrderItemPost,
  downloadInvoiceGet,
  fixOrdersGet,
  testReturnRequestsGet,
};

