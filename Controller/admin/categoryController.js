import categoryService from "../../service/categoryService.js";

const categoryInfoGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const data = await categoryService.getCategories(req.query);

    return res.render("category", data);
  } catch (error) {
    console.error("Error in loading category:", error);
    return res.redirect("/admin/dashboard");
  }
};

const addCategoryPost = async (req, res) => {
  try {
    const result = await categoryService.addCategory(req.body);
    return res.json(result);
  } catch (error) {
    console.error("Error in adding category:", error);
    if (error.message === "Category already exist") {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const categoryDelete = async (req, res) => {
  try {
    await categoryService.toggleCategoryStatus(req.params.catId);
    return res.redirect("/admin/category");
  } catch (error) {
    console.error("Error in updating status:", error);
    if (error.message === "Missing Data") {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.message === "Category not Found") {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const categoryEditGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const data = await categoryService.getEditCategoryData(req.params.catId);

    return res.render("categoryEdit", data);
  } catch (error) {
    console.error("Category Edit Get Error:", error);
    return res.redirect("/admin/category");
  }
};

const categoryEditPost = async (req, res) => {
  try {
    const result = await categoryService.editCategory(
      req.params.catId,
      req.body,
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error in editing category:", error);
    if (
      error.message === "Category already exists" ||
      error.message === "Category not found"
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
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
