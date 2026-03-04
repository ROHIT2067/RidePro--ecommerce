import Category from "../../Models/CategoryModel.js";
import mongoose from "mongoose";
import Product from "../../Models/ProductModel.js";

const categoryInfoGet = async (req, res) => {
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

    const filter = search
      ? { name: { $regex: "^" + search, $options: "i" } }
      : {}; // If search exists,it apply regex filter else fetch all categories

    const categoryTable = await Category.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

      const categoryIds = categoryTable.map(c => c._id);
const productCounts = await Product.aggregate([
  { $match: { category: { $in: categoryIds } } },
  { $group: { _id: "$category", count: { $sum: 1 } } }
]);
const productCountMap = {};
productCounts.forEach(p => productCountMap[p._id.toString()] = p.count);

    const totalCategories = await Category.countDocuments(filter);
    const totalPages = Math.ceil(totalCategories / limit);
    const currentPage = page;

    return res.render("category", {
      categoryData: categoryTable,
      currentPage,
      searchQuery: search,
      totalPages,
      totalCategories: totalCategories,
      productCountMap
    });
  } catch (error) {
    console.log("Error in loading category,", error);
    return res.redirect("/admin/dashboard");
  }
};

const addCategoryPost = async (req, res) => {
  const { name, description } = req.body;
  try {
    const exist = await Category.findOne({
      name: { $regex: "^" + name + "$", $options: "i" },
    });

    if (exist) {
      return res.status(400).json({ error: "Category already exist" });
    }

    const newCategory = new Category({
      name,
      description,
    });
    await newCategory.save();
    return res.json({ message: "Category added successfully" });
  } catch (error) {
    console.log("Error in adding category ", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const categoryDelete = async (req, res) => {
  try {
    const { catId } = req.params;

    if (!catId) {
      return res.status(400).json({ success: false, message: "Missing Data" });
    }

    const updateCategory = await Category.findById(catId);

    if (!updateCategory) {
      return res
        .status(404)
        .json({ success: false, message: "Category not Found" });
    }

    const newStatus = updateCategory.status === "Active" ? "Inactive" : "Active";

    await Category.findByIdAndUpdate(catId, { status: newStatus });

    return res.redirect('/admin/category');
  } catch (error) {
    console.log("Error in updating status ", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const categoryEditGet = async (req, res) => {
  const { catId } = req.params;

  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const updateCategory = await Category.findById(catId);

    if (!updateCategory) {
      return res.redirect("/admin/category");
    }

    if (updateCategory.status === "Inactive") {
      return res.redirect("/admin/category");
    }

    return res.render("categoryEdit", { category: updateCategory });
  } catch (error) {
    console.log("Category Edit Get Error : ", error);
    return res.redirect("/admin/category");
  }
};

const categoryEditPost = async (req, res) => {
  try {
    const { catId } = req.params;

    const { name, description } = req.body;

    const category = await Category.findById(catId);

    if (!category) {
      return res.redirect("/admin/category");
    }

    const exist = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      _id: { $ne: new mongoose.Types.ObjectId(catId) }, // ✅ convert to ObjectId
    });

    if (exist) {
      return res
        .status(400)
        .json({ success: false, message: "Category already exists" });
    }

    await Category.findByIdAndUpdate(catId, { $set: { name, description } });

    return res.status(200).json({ message: "Category updated successfully!" });
  } catch (error) {
    console.log("Error in editing category", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export default {
  categoryInfoGet,
  addCategoryPost,
  categoryDelete,
  categoryEditGet,
  categoryEditPost,
};
