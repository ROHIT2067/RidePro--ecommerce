import Product from "../../Models/ProductModel.js";
import Variant from "../../Models/VariantModel.js";
import Category from "../../Models/CategoryModel.js";
import cloudinary from "../../Config/cloudinary.js";
import mongoose from "mongoose";

const uploadToCloudinary = (buffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: "products" },
            (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
            }
        );
        stream.end(buffer);
    });
};

const getProducts = async (query) => {
    let search = query.search || "";
    let page = parseInt(query.page, 10) || 1;
    let limit = 3;

    const filter = search
        ? { productName: { $regex: "^" + search, $options: "i" } }
        : {};

    const productTable = await Product.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("category");

    const productIds = productTable.map((p) => p._id);
    const variantCounts = await Variant.aggregate([
        { $match: { product_id: { $in: productIds } } },
        { $group: { _id: "$product_id", count: { $sum: 1 } } },
    ]);

    const variantCountMap = {};
    variantCounts.forEach((v) => (variantCountMap[v._id.toString()] = v.count));

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    return {
        productTable,
        currentPage: page,
        searchQuery: search,
        totalPages,
        totalProducts,
        variantCountMap,
    };
};

const toggleProductStatus = async (productId) => {
    if (!productId) {
        throw new Error("Missing Data");
    }

    const updateProduct = await Product.findById(productId);
    if (!updateProduct) {
        throw new Error("Product Not Found");
    }

    const newStatus =
        updateProduct.status === "Available" ? "Out Of Stock" : "Available";

    await Product.findByIdAndUpdate(productId, { status: newStatus });
    return { success: true, newStatus };
};

const getAddProductData = async () => {
    const categories = await Category.find({ status: "Active" });
    return { categories };
};

const addProduct = async (body, files) => {
    const { productName, description, category } = body;
    const variants = body.variants;

    if (!productName?.trim() || !description?.trim() || !category?.trim()) {
        throw new Error("All fields are required");
    }

    if (!variants || Object.keys(variants).length === 0) {
        throw new Error("At least one variant is required");
    }

    const exists = await Product.findOne({
        productName: { $regex: "^" + productName + "$", $options: "i" },
    });
    if (exists) {
        throw new Error("Product with same name already exists");
    }

    const newProduct = new Product({
        productName,
        description,
        category,
    });
    const savedProduct = await newProduct.save();

    try {
        const imagesByVariant = {};
        if (files && files.length > 0) {
            for (const file of files) {
                const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
                if (match) {
                    const idx = match[1];
                    if (!imagesByVariant[idx]) imagesByVariant[idx] = [];
                    const url = await uploadToCloudinary(file.buffer);
                    imagesByVariant[idx].push(url);
                }
            }
        }

        const variantDocs = [];
        for (const key of Object.keys(variants)) {
            const v = variants[key];

            if (!v.price || !v.size || !v.color) {
                throw new Error(`Variant ${key} is missing required fields`);
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
        return { success: true, message: "Product added successfully" };
    } catch (error) {
        // Rollback product creation if variants fail
        await Product.findByIdAndDelete(savedProduct._id);
        throw error;
    }
};

const getEditProductData = async (productId) => {
    const updateProduct = await Product.findById(productId).populate("category");
    if (!updateProduct) {
        throw new Error("Product not found");
    }

    const categories = await Category.find({});
    const variants = await Variant.find({ product_id: productId });

    return {
        product: updateProduct,
        categories,
        variants,
    };
};

const editProduct = async (productId, body, files) => {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw new Error("Invalid Product ID");
    }

    const { productName, description, category } = body;
    const variants = body.variants || {};

    const product = await Product.findById(productId);

    if (!product) {
        throw new Error("Product not found");
    }

    const exist = await Product.findOne({
        productName: { $regex: "^" + productName + "$", $options: "i" },
        _id: { $ne: productId },
    });

    if (exist) {
        throw new Error("Product with the same name already exists");
    }

    const imagesByVariant = {};

    if (files && files.length > 0) {
        for (const file of files) {
            const match = file.fieldname.match(/variants\[(\d+)\]\[newImages\]/);
            if (match) {
                const idx = match[1];
                if (!imagesByVariant[idx]) imagesByVariant[idx] = [];

                const url = await uploadToCloudinary(file.buffer);
                imagesByVariant[idx].push(url);
            }
        }
    }

    const existingVariants = await Variant.find({ product_id: productId });

    const incoming = Object.values(variants || {});
    const incomingIds = incoming
        .filter((v) => v._id)
        .map((v) => v._id.toString());

    for (const key of Object.keys(variants)) {
        const v = variants[key];

        if (!v.price || !v.size || !v.color) {
            throw new Error(`Variant ${key} is missing required fields`);
        }

        await Product.findByIdAndUpdate(productId, {
            $set: { productName, description, category },
        });

        const uploadedImages = imagesByVariant[key] || [];
        const existingImages = v.existingImages || [];

        const finalImages = [
            ...(Array.isArray(existingImages)
                ? existingImages
                : existingImages
                    ? [existingImages]
                    : []),
            ...uploadedImages,
        ];

        const stockQty = Number(v.stock_quantity) || 0;

        if (v._id) {
            await Variant.findByIdAndUpdate(v._id, {
                size: v.size,
                color: v.color,
                price: Number(v.price),
                stock_quantity: stockQty,
                images: finalImages,
                status: stockQty > 0 ? "Available" : "Out Of Stock",
            });
        } else {
            await Variant.create({
                product_id: productId,
                size: v.size,
                color: v.color,
                price: Number(v.price),
                stock_quantity: stockQty,
                images: finalImages,
                status: stockQty > 0 ? "Available" : "Out Of Stock",
            });
        }
    }

    for (const dbVar of existingVariants) {
        if (!incomingIds.includes(dbVar._id.toString())) {
            await Variant.findByIdAndDelete(dbVar._id);
        }
    }

    return { success: true, message: "Product updated successfully!" };
};

export default {
    getProducts,
    toggleProductStatus,
    getAddProductData,
    addProduct,
    getEditProductData,
    editProduct,
};
