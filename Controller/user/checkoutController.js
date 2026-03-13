import checkoutService from "../../service/user/checkoutService.js";

const checkoutGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user;
    const selectedAddressId = req.query.address;

    const checkoutData = await checkoutService.getCheckoutData(userId, selectedAddressId);

    if (!checkoutData.success) {
      return res.render("cart", {
        items: [],
        cartCount: 0,
        totalPrice: 0,
        hasOutOfStock: false,
        unavailableItems: checkoutData.unavailableItems || [],
        adjustmentWarnings: [],
      });
    }

    return res.render("checkout", {
      items: checkoutData.items,
      addresses: checkoutData.addresses,
      selectedAddress: checkoutData.selectedAddress,
      subtotal: checkoutData.subtotal,
      shippingCost: checkoutData.shippingCost,
      totalAmount: checkoutData.totalAmount,
    });
  } catch (error) {
    console.error("Checkout Get Error:", error);
    req.session.checkoutError = error.message;
    return res.redirect("/cart");
  }
};

const placeOrderPost = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: "Please login to place order" });
    }

    const userId = req.session.user;
    const { addressId } = req.body;

    if (!addressId) {
      return res.status(400).json({ success: false, message: "Please select a delivery address" });
    }

    const order = await checkoutService.placeOrder(userId, addressId);

    return res.json({
      success: true,
      message: "Order placed successfully",
      orderId: order.order_id,
    });
  } catch (error) {
    console.error("Place Order Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

const orderSuccessGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const orderId = req.query.orderId;

    if (!orderId) {
      return res.redirect("/home");
    }

    return res.render("order-success", {
      orderId,
    });
  } catch (error) {
    console.error("Order Success Get Error:", error);
    return res.redirect("/home");
  }
};

export default {
  checkoutGet,
  placeOrderPost,
  orderSuccessGet,
};
