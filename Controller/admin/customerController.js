import customerService from "../../service/customerService.js";

const customerGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const data = await customerService.getCustomers(req.query);

    return res.render("customerPage", data);
  } catch (error) {
    console.error("Error in loading customerPage:", error);
    return res.redirect("/admin/dashboard");
  }
};

const updateCustomerStatusPost = async (req, res) => {
  try {
    const { userId, status } = req.body;
    const result = await customerService.updateCustomerStatus(userId, status);
    return res.json(result);
  } catch (error) {
    console.error("Error in updating status:", error);
    if (error.message === "Missing Data" || error.message === "Invalid Status") {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.message === "User not Found") {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export default { customerGet, updateCustomerStatusPost };
