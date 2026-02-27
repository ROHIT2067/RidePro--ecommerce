import Category from "../../Models/CategoryModel.js";

const categoryInfoGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    let page = 1;
    if (req.query.page) {
      page = Number(req.query.page);
    }

    let limit = 4;

    const categoryTable = await Category.find({})
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalCategories = await Category.countDocuments();
    const totalPages = Math.ceil(totalCategories / limit);
    const currentPage = page;

    return res.render("category", {
      categoryData: categoryTable,
      currentPage,
      totalPages,
      totalCategories: totalCategories,
    });
  } catch (error) {
    console.log("Error in loading category,", error);
    return res.redirect("/admin/dashboard");
  }
};

const addCategoryPost = async (req, res) => {
  const { name, description } = req.body;
  try {
    const exist = await Category.findOne({ name });

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

export default { categoryInfoGet, addCategoryPost };
