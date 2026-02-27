import userCollection from "../../Models/UserModel.js";

const customerGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }
    let search = "";
    if (req.query.search) {
      search = req.query.search;
    }
    let page = 1;
    if (req.query.page) {
      page = Number(req.query.page);
    }

    let limit = 4;

    const filter = {
      role: "user",
      $or: [
        { username: { $regex: "^" + search, $options: "i" } },
        { email: { $regex: "^" + search, $options: "i" } },
      ],
    };

    const userData = await userCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit);  //skips previous pages

    const count = await userCollection.countDocuments(filter);

    const totalPages = Math.ceil(count / limit);
    const currentPage = page;

    return res.render("customerPage", {
      customers: userData,
      currentPage,
      search,
      totalPages,
    });
  } catch (error) {
    console.error("Error in loading customerPage ", error);
    return res.redirect("/admin/dashboard");
  }
};

const updateCustomerStatusPost = async (req, res) => {
  try {
    const { userId, status } = req.body;

    if (!userId || !status) {
      return res.status(400).json({ success: false, message: "Missing Data" });
    }

    if (!["block", "unblock"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Status" });
    }

    const isBlocked = status === "block";

    const updateUser = await userCollection.findByIdAndUpdate(
      userId,
      { is_blocked: isBlocked },
      { new: true },  //return the updated document instead of the old one.
    );

    if (!updateUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not Found" });
    }
    
    // console.log(userId,status)
    return res.json({ success: true });
  } catch (error) {
    console.log("Error in updating status ", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export default { customerGet, updateCustomerStatusPost };
