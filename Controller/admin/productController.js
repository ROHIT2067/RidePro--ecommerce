import Product from "../../Models/ProductModel.js";
import Variant from "../../Models/VariantModel.js";
import Category from "../../Models/CategoryModel.js";
import cloudinary from "../../Config/cloudinary.js";

const productsGet = async (req, res) => {
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

    const productTable = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("category"); //replaces with actual category document it references.

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);
    const currentPage = page;

    return res.render("products", {
      productTable: productTable,
      currentPage,
      searchQuery: search,
      totalPages,
      totalProducts: totalProducts,
    });
  } catch (error) {
    console.log("Error in loading prodycts,", error);
    return res.redirect("/admin/dashboard");
  }
};

const toggleProductPost = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, message: "Missing Data" });
    }

    const updateProduct = await Product.findById(id);

    if (!updateProduct) {
      return res
        .status(404)
        .json({ success: false, message: "Product Not Found" });
    }

    const newStatus =
      updateProduct.status === "Available" ? "Out Of Stock" : "Available";

    await Product.findByIdAndUpdate(id, { status: newStatus });

    return res.status(200).json({ success: true, newStatus });
  } catch (error) {
    console.log("Error in updating status ", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const addProductGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/login");
    }

    const categories = await Category.find({ status: "Active" });

    return res.render("addProduct", { categories });
  } catch (error) {
    console.log("Error loading add product page:", error);
    return res.redirect("/admin/products");
  }
};

const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "products" },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
};

const addProductPost = async (req, res) => {
  try {
    const { productName, description, category } = req.body;
    const variants = req.body.variants;
    if (!productName || !description || !category) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (!variants || Object.keys(variants).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "At least one variant is required" });
    }
    const newProduct = new Product({
      productName,
      description,
      category,
    });
    const savedProduct = await newProduct.save();

    // Group uploaded images by variant index
    // req.files is an array of all uploaded files
    // field name is variants[1][images], variants[2][images] etc.
    const imagesByVariant = {};
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
        if (match) {
          const idx = match[1];
          if (!imagesByVariant[idx]) imagesByVariant[idx] = [];
          const url = await uploadToCloudinary(file.buffer); // upload buffer directly
          imagesByVariant[idx].push(url);
        }
      }
    }

    // ── Save each variant
    const variantDocs = [];
    for (const key of Object.keys(variants)) {
      const v = variants[key];

      if (!v.price || !v.size || !v.color) {
        // rollback product if variant data is bad
        await Product.findByIdAndDelete(savedProduct._id);
        return res.status(400).json({
          success: false,
          message: `Variant ${key} is missing required fields`,
        });
      }

      const newVariant = new Variant({
        product_id: savedProduct._id,
        size: v.size,
        color: v.color,
        price: Number(v.price),
        stock_quantity: Number(v.stock) || 0,
        images: imagesByVariant[key] || [],
        status: Number(v.stock) > 0 ? "Available" : "Out Of Stock",
      });

      variantDocs.push(newVariant);
    }

    await Variant.insertMany(variantDocs);

    return res
      .status(200)
      .json({ success: true, message: "Product added successfully" });
  } catch (error) {
    console.log("Error in addProductPost:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const editProductGet = async (req, res) => {
  const { id } = req.params;
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const updateProduct = await Product.findById(id).populate("category"); // current category's full details
    const categories = await Category.find({});
    const variants      = await Variant.find({ product_id: id });
//     console.log('Variants ', variants);
// console.log('ProductId ', id);

    if (!updateProduct) {
      return res.redirect("/admin/products");
    }

    return res.render("productEdit", { product: updateProduct, categories, variants});
  } catch (error) {
    console.log("Product Edit Get Error : ", error);
    return res.redirect("/admin/products");
  }
};

export default {
  productsGet,
  toggleProductPost,
  addProductGet,
  addProductPost,
  editProductGet,
};
