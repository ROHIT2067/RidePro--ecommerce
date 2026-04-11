import productService from "../../service/admin/productService.js";

const productsGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const data = await productService.getProducts(req.query);

    return res.render("products", data);
  } catch (error) {
    console.error("Error in loading products:", error);
    return res.redirect("/admin/dashboard");
  }
};

const toggleProductPost = async (req, res) => {
  try {
    const result = await productService.toggleProductStatus(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error in updating status:", error);
    if (error.message === "Missing Data") {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.message === "Product Not Found") {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const addProductGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/login");
    }

    const data = await productService.getAddProductData();

    return res.render("addProduct", data);
  } catch (error) {
    console.error("Error loading add product page:", error);
    return res.redirect("/admin/products");
  }
};

const addProductPost = async (req, res) => {
  try {
    const result = await productService.addProduct(req.body, req.files);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error in addProductPost:", error);
    if (
      error.message === "All fields are required" ||
      error.message === "At least one variant is required" ||
      error.message === "Product with same name already exists" ||
      error.message.includes("is missing required fields")
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: validationErrors.join(', ') });
    }
    return res.status(500).json({ success: false, message: error.message || "Server error" });
  }
};

const editProductGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const data = await productService.getEditProductData(req.params.id);

    return res.render("productEdit", data);
  } catch (error) {
    console.error("Product Edit Get Error:", error);
    return res.redirect("/admin/products");
  }
};

const editProductPost = async (req, res) => {
  try {
    const result = await productService.editProduct(
      req.params.id,
      req.body,
      req.files,
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error editing product:", error);

    if (
      error.message === "Invalid Product ID" ||
      error.message === "Product not found"
    ) {
      return res.redirect("/admin/products");
    }

    if (error.message === "Product with the same name already exists") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes("is missing required fields")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: validationErrors.join(', ') });
    }

    return res.status(500).json({ success: false, message: error.message || "Internal server error" });
  }
};

export default {
  productsGet,
  toggleProductPost,
  addProductGet,
  addProductPost,
  editProductGet,
  editProductPost,
};
