import Variant from "../../Models/VariantModel.js";
import Product from "../../Models/ProductModel.js";
import Category from "../../Models/CategoryModel.js";
import Coupon from "../../Models/CouponModel.js";
import { calculateProductPrice } from "../../utils/priceCalculator.js";

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

            // Calculate offer-discounted price for the minimum variant
            let discountedMinPrice = minVarPrice;
            let hasOffer = false;
            if (variants.length > 0 && minVarPrice > 0) {
                const minPriceVariant = variants.find(v => v.price === minVarPrice);
                if (minPriceVariant) {
                    const categoryId = product.category?._id || product.category;
                    const priceCalc = await calculateProductPrice(product, minVarPrice, categoryId);
                    discountedMinPrice = priceCalc.finalPrice;
                    hasOffer = priceCalc.hasDiscount;
                }
            }

            return { 
                product, 
                minVarPrice, 
                maxVarPrice, 
                firstImage,
                discountedMinPrice,
                hasOffer
            };
        }),
    );

    const priceFiltered = productsWithPrice.filter(
        ({ discountedMinPrice }) => discountedMinPrice >= minPrice && discountedMinPrice <= maxPrice,
    );

    if (sort === "priceLow")
        priceFiltered.sort((a, b) => a.discountedMinPrice - b.discountedMinPrice);
    if (sort === "priceHigh")
        priceFiltered.sort((a, b) => b.discountedMinPrice - a.discountedMinPrice);

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
    
    // Calculate offer prices for all variants
    const variantsWithOffers = await Promise.all(
        variants.map(async (variant) => {
            const priceCalc = await calculateProductPrice(product, variant.price, product.category._id);
            return {
                ...variant.toObject(),
                originalPrice: variant.price,
                finalPrice: priceCalc.finalPrice,
                discountAmount: priceCalc.discountAmount,
                appliedOffer: priceCalc.appliedOffer,
                offerSource: priceCalc.offerSource,
                hasDiscount: priceCalc.hasDiscount,
                productOffer: priceCalc.productOffer,
                categoryOffer: priceCalc.categoryOffer,
                availableOffers: priceCalc.availableOffers
            };
        })
    );

    const selectedVariantWithOffer = variantsWithOffers.find((v) => v.stock_quantity > 0) || variantsWithOffers[0] || null;
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
            const minVarPrice = prices.length ? Math.min(...prices) : 0;
            
            // Calculate offer-discounted price
            let discountedPrice = minVarPrice;
            let hasOffer = false;
            if (minVarPrice > 0) {
                const priceCalc = await calculateProductPrice(rp, minVarPrice, rp.category._id);
                discountedPrice = priceCalc.finalPrice;
                hasOffer = priceCalc.hasDiscount;
            }

            return {
                product: rp,
                minVarPrice,
                discountedPrice,
                hasOffer,
                firstImage: vars[0]?.images?.[0] || null,
            };
        }),
    );

    // Get the highest value active coupon (use final price after offers)
    const activeCoupons = await Coupon.find({
        status: 'active',
        expiryDate: { $gte: new Date() },
        $or: [
            { usageLimit: null },
            { $expr: { $lt: ['$usageCount', '$usageLimit'] } }
        ]
    }).sort({ discountValue: -1 });

    let bestCoupon = null;
    if (activeCoupons.length > 0 && selectedVariantWithOffer) {
        // Find the coupon with highest effective discount
        const productPrice = selectedVariantWithOffer.finalPrice; // Use discounted price
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
        variants: variantsWithOffers,
        selectedVariant: selectedVariantWithOffer,
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