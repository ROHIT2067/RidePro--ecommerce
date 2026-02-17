import userCollection from "../../Models/UserModel.js";
import address from "../../Models/AddressModel.js";
import bcrypt from "bcrypt";

const customerGet = async (req, res) => {
  try {
    let search = "";
    if (req.query.search) {
      search = req.query.search;
    }
    let page = 1;
    if (req.query.page) {
      page = Number(req.query.page);
    }

    let limit = 10;

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
      .skip((page - 1) * limit);

    const count = await userCollection.countDocuments(filter);

    return res.render("customerPage", {
      customers: userData,
      //   totalPages,
      //   currentPage,
      search,
    });
  } catch (error) {
    console.error("Error in loading customerPage ", error);
    return res.redirect("/admin/dashboard");
  }
};

export default { customerGet };
