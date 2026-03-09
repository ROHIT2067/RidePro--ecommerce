import Variant from "../Models/VariantModel.js";
import Product from "../Models/ProductModel.js";
import Category from "../Models/CategoryModel.js";

const getProductsList = async (query) => {
    let search = query.search || "";
    let page = parseInt(query.page, 10) || 1;
    let sort = query.sort || "newest";
    let category = query.category || "";
    let minPrice = Number(query.minPrice) || 0;
    let maxPrice = Number(query.maxPrice) || 999999;
    let limit = 8;

    const activeCategories = await Category.find({ status: "Active" });
    const activeCategoryIds = activeCategories.map((c) => c._id);

    const productFilter = {
        status: "Available",
        category: { $in: activeCategoryIds },
    };

    if (search)
        productFilter.productName = { $regex: "^" + search, $options: "i" };
    if (category) productFilter.category = category;

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        nameAZ: { productName: 1 },
        nameZA: { productName: -1 },
    };
    const sortObj = sortMap[sort] || sortMap.newest;

    const allProducts = await Product.find(productFilter)
        .populate("category")
        .sort(sortObj);

    const productsWithPrice = await Promise.all(
        allProducts.map(async (product) => {
            const variants = await Variant.find({ product_id: product._id });
            const prices = variants
                .map((v) => v.price)
                .filter((price) => price != null);
            const minVarPrice = prices.length ? Math.min(...prices) : 0;
            const maxVarPrice = prices.length ? Math.max(...prices) : 0;
            const firstImage = variants[0]?.images?.[0] || null;
            return { product, minVarPrice, maxVarPrice, firstImage };
        }),
    );

    const priceFiltered = productsWithPrice.filter(
        ({ minVarPrice }) => minVarPrice >= minPrice && minVarPrice <= maxPrice,
    );

    if (sort === "priceLow")
        priceFiltered.sort((a, b) => a.minVarPrice - b.minVarPrice);
    if (sort === "priceHigh")
        priceFiltered.sort((a, b) => b.minVarPrice - a.minVarPrice);

    const totalProducts = priceFiltered.length;
    const totalPages = Math.ceil(totalProducts / limit);
    const paginated = priceFiltered.slice((page - 1) * limit, page * limit);

    return {
        productsData: paginated,
        currentPage: page,
        totalPages,
        totalProducts,
        searchQuery: search,
        sortQuery: sort,
        categoryQuery: category,
        minPriceQuery: minPrice || "",
        maxPriceQuery: maxPrice === 999999 ? "" : maxPrice,
        categories: activeCategories,
    };
};

const getProductDetails = async (id) => {
    const product = await Product.findById(id).populate("category");

    if (!product) throw new Error("Product not found");
    if (product.status !== "Available") throw new Error("Product is not available");
    if (!product.category || product.category.status !== "Active")
        throw new Error("Category is not active");

    const variants = await Variant.find({ product_id: id });
    const selectedVariant =
        variants.find((v) => v.stock_quantity > 0) || variants[0] || null;
    const isAvailable =
        product.status === "Available" &&
        variants.some((v) => v.stock_quantity > 0);

    const relatedRaw = await Product.find({
        _id: { $ne: id },
        category: product.category._id,
        status: "Available",
    })
        .populate("category")
        .limit(4);

    const relatedProducts = await Promise.all(
        relatedRaw.map(async (rp) => {
            const vars = await Variant.find({ product_id: rp._id });
            const prices = vars.map((v) => v.price).filter(Boolean);
            return {
                product: rp,
                minVarPrice: prices.length ? Math.min(...prices) : 0,
                firstImage: vars[0]?.images?.[0] || null,
            };
        }),
    );

    return {
        product,
        variants,
        selectedVariant,
        isAvailable,
        relatedProducts,
        reviews: [], // Placeholder for later
    };
};

export default {
    getProductsList,
    getProductDetails,
};
