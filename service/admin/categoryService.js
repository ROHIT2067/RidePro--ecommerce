import Category from "../../Models/CategoryModel.js";
import Product from "../../Models/ProductModel.js";

const getCategories = async (query) => {
    let search = query.search || "";
    let page = parseInt(query.page, 10) || 1;
    let limit = 4;

    const filter = search
        ? { name: { $regex: "^" + search, $options: "i" } }
        : {};

    const categoryTable = await Category.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

    const categoryIds = categoryTable.map((c) => c._id);
    const productCounts = await Product.aggregate([
        { $match: { category: { $in: categoryIds } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);

    const productCountMap = {};
    productCounts.forEach((p) => (productCountMap[p._id.toString()] = p.count));

    const totalCategories = await Category.countDocuments(filter);
    const totalPages = Math.ceil(totalCategories / limit);

    return {
        categoryData: categoryTable,
        currentPage: page,
        searchQuery: search,
        totalPages,
        totalCategories,
        productCountMap,
    };
};

const addCategory = async (body) => {
    const { name, description } = body;
    const exist = await Category.findOne({
        name: { $regex: "^" + name + "$", $options: "i" },
    });

    if (exist) {
        throw new Error("Category already exist");
    }

    const newCategory = new Category({
        name,
        description,
    });
    await newCategory.save();
    return { message: "Category added successfully" };
};

const toggleCategoryStatus = async (catId) => {
    if (!catId) {
        throw new Error("Missing Data");
    }

    const updateCategory = await Category.findById(catId);
    if (!updateCategory) {
        throw new Error("Category not Found");
    }

    const newStatus = updateCategory.status === "Active" ? "Inactive" : "Active";
    await Category.findByIdAndUpdate(catId, { status: newStatus });
    return { success: true, newStatus };
};

const getEditCategoryData = async (catId) => {
    const updateCategory = await Category.findById(catId);
    if (!updateCategory) {
        throw new Error("Category not found");
    }

    if (updateCategory.status === "Inactive") {
        throw new Error("Category is Inactive");
    }

    return { category: updateCategory };
};

const editCategory = async (catId, body) => {
    const { name, description } = body;

    const category = await Category.findById(catId);
    if (!category) {
        throw new Error("Category not found");
    }

    const exist = await Category.findOne({
        name: { $regex: "^" + name + "$", $options: "i" },
        _id: { $ne: catId },
    });

    if (exist) {
        throw new Error("Category already exists");
    }

    await Category.findByIdAndUpdate(catId, { $set: { name, description } });
    return { message: "Category updated successfully!" };
};

export default {
    getCategories,
    addCategory,
    toggleCategoryStatus,
    getEditCategoryData,
    editCategory,
};
