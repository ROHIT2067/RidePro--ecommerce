import orderService from "../../service/admin/orderService.js";
import PDFDocument from "pdfkit";
import Order from "../../Models/OrderModel.js";

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

const downloadInvoiceGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const orderId = req.params.id;

    const order = await Order.findById(orderId)
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

const approveReturnPost = async (req, res) => {
  try {
    const { itemId } = req.params;

    // Default approve behavior: DON'T add to inventory
    const result = await orderService.approveReturnWithoutInventory(itemId);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error approving return:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const approveReturnWithInventoryPost = async (req, res) => {
  try {
    const { itemId } = req.params;

    // New behavior: ADD to inventory
    const result = await orderService.approveReturnWithInventory(itemId);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error approving return with inventory:", error);
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

export default {
  ordersGet,
  orderDetailsGet,
  updateOrderStatusPost,
  downloadInvoiceGet,
  approveReturnPost,
  approveReturnWithInventoryPost,
  rejectReturnPost,
};
