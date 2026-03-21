import Variant from "../../Models/VariantModel.js";
import Product from "../../Models/ProductModel.js";
import Category from "../../Models/CategoryModel.js";
import Coupon from "../../Models/CouponModel.js";

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
    
    if (category) {
        // Check if category is a valid ObjectId or a category name
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(category);
        if (isObjectId) {
            productFilter.category = category;
        } else {
            // Find category by name (case-insensitive)
            const categoryDoc = activeCategories.find(
                cat => cat.name.toLowerCase() === category.toLowerCase()
            );
            if (categoryDoc) {
                productFilter.category = categoryDoc._id;
            }
        }
    }

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

    // Get the highest value active coupon
    const activeCoupons = await Coupon.find({
        status: 'active',
        expiryDate: { $gte: new Date() },
        $or: [
            { usageLimit: null },
            { $expr: { $lt: ['$usageCount', '$usageLimit'] } }
        ]
    }).sort({ discountValue: -1 });

    let bestCoupon = null;
    if (activeCoupons.length > 0) {
        // Find the coupon with highest effective discount
        const productPrice = selectedVariant ? selectedVariant.price : 0;
        const deliveryCost = 118;
        const totalOrderValue = productPrice + deliveryCost;
        let maxDiscount = 0;
        
        for (const coupon of activeCoupons) {
            // Check if total order value meets minimum and maximum order requirements
            if (totalOrderValue >= coupon.minimumOrderAmount && 
                (!coupon.maximumOrderAmount || totalOrderValue <= coupon.maximumOrderAmount)) {
                
                let effectiveDiscount = 0;
                
                if (coupon.discountType === 'percentage') {
                    // Calculate percentage discount on total order value
                    effectiveDiscount = (totalOrderValue * coupon.discountValue) / 100;
                    // Apply maximum discount cap if exists
                    if (coupon.maximumDiscountCap) {
                        effectiveDiscount = Math.min(effectiveDiscount, coupon.maximumDiscountCap);
                    }
                } else {
                    // Fixed amount discount
                    effectiveDiscount = coupon.discountValue;
                }
                
                // Ensure discount doesn't exceed total order value
                effectiveDiscount = Math.min(effectiveDiscount, totalOrderValue);
                
                if (effectiveDiscount > maxDiscount) {
                    maxDiscount = effectiveDiscount;
                    bestCoupon = {
                        code: coupon.code,
                        discountType: coupon.discountType,
                        discountValue: coupon.discountValue,
                        minimumOrderAmount: coupon.minimumOrderAmount,
                        maximumOrderAmount: coupon.maximumOrderAmount,
                        maximumDiscountCap: coupon.maximumDiscountCap,
                        effectiveDiscount: effectiveDiscount
                    };
                }
            }
        }
    }

    return {
        product,
        variants,
        selectedVariant,
        isAvailable,
        relatedProducts,
        bestCoupon,
        reviews: [], // Placeholder for later
    };
};

export default {
    getProductsList,
    getProductDetails,
};