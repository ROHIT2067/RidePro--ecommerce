import Offer from "../../Models/OfferModel.js";
import Product from "../../Models/ProductModel.js";
import Category from "../../Models/CategoryModel.js";
import Variant from "../../Models/VariantModel.js";
import { generateReferralCode, generateReferralToken } from "../../utils/referralUtils.js";
import { offerSchema, productOfferSchema, categoryOfferSchema } from "../../schemas/index.js";

const getOffers = async (query) => {
    const page = parseInt(query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const offers = await Offer.find()
        .populate('targetId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const totalOffers = await Offer.countDocuments();
    const totalPages = Math.ceil(totalOffers / limit);

    return {
        offers,
        currentPage: page,
        totalPages,
        totalOffers,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1
    };
};

const getOfferById = async (offerId) => {
    const offer = await Offer.findById(offerId).populate('targetId');
    if (!offer) {
        throw new Error("Offer not found");
    }
    return offer;
};

const createOffer = async (offerData) => {
    // Validate input data with Zod schema
    const validation = offerSchema.safeParse(offerData);
    if (!validation.success) {
        const errors = validation.error.issues.map(err => err.message).join(', ');
        throw new Error(errors);
    }

    const validatedData = validation.data;

    // Additional business rule validations
    await validateOfferBusinessRules(validatedData);

    // Type-specific validations
    if (validatedData.type === 'product') {
        await validateProductOffer(validatedData);
    } else if (validatedData.type === 'category') {
        await validateCategoryOffer(validatedData);
    }

    // Create offer based on type
    const processedData = {
        name: validatedData.name,
        type: validatedData.type,
        discountType: validatedData.discountType,
        discountValue: validatedData.discountValue,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        maxUsage: validatedData.maxUsage,
        status: 'active',
        usageCount: 0
    };

    if (validatedData.type === 'product' || validatedData.type === 'category') {
        processedData.targetId = validatedData.targetId;
        processedData.targetModel = validatedData.type === 'product' ? 'Product' : 'Category';
    }

    if (validatedData.type === 'referral') {
        processedData.referralCode = generateReferralCode();
        processedData.referralToken = generateReferralToken();
        processedData.referrerReward = validatedData.referrerReward || 0;
        processedData.refereeReward = validatedData.refereeReward || 0;
    }

    const offer = new Offer(processedData);
    await offer.save();
    return offer;
};

// Validate product-specific offer requirements
const validateProductOffer = async (offerData, excludeOfferId = null) => {
    // Check if product exists and is active
    const product = await Product.findById(offerData.targetId).populate('category');
    if (!product) {
        throw new Error("Selected product does not exist");
    }

    if (product.status !== 'Available') {
        throw new Error("Cannot create offer for inactive product");
    }

    if (!product.category || product.category.status !== 'Active') {
        throw new Error("Cannot create offer for product with inactive category");
    }

    // Check for conflicting active offers on the same product
    const conflictQuery = {
        type: 'product',
        targetId: offerData.targetId,
        status: 'active',
        startDate: { $lte: offerData.endDate },
        endDate: { $gte: offerData.startDate }
    };

    // Exclude current offer if updating
    if (excludeOfferId) {
        conflictQuery._id = { $ne: excludeOfferId };
    }

    const existingProductOffer = await Offer.findOne(conflictQuery);

    if (existingProductOffer) {
        throw new Error(`An active offer "${existingProductOffer.name}" already exists for this product during the selected time period`);
    }

    // Check for conflicting category offers
    const conflictingCategoryOffer = await Offer.findOne({
        type: 'category',
        targetId: product.category._id,
        status: 'active',
        startDate: { $lte: offerData.endDate },
        endDate: { $gte: offerData.startDate }
    });

    if (conflictingCategoryOffer) {
        throw new Error(`Cannot create product offer. An active category offer "${conflictingCategoryOffer.name}" already exists for this product's category during the selected time period`);
    }

    // Check if discounted price doesn't go below minimum threshold
    await validateDiscountedPrice(product, offerData);
};

// Validate category-specific offer requirements
const validateCategoryOffer = async (offerData, excludeOfferId = null) => {
    // Check if category exists and is active
    const category = await Category.findById(offerData.targetId);
    if (!category) {
        throw new Error("Selected category does not exist");
    }

    if (category.status !== 'Active') {
        throw new Error("Cannot create offer for inactive category");
    }

    // Check for conflicting active offers on the same category
    const conflictQuery = {
        type: 'category',
        targetId: offerData.targetId,
        status: 'active',
        startDate: { $lte: offerData.endDate },
        endDate: { $gte: offerData.startDate }
    };

    // Exclude current offer if updating
    if (excludeOfferId) {
        conflictQuery._id = { $ne: excludeOfferId };
    }

    const existingCategoryOffer = await Offer.findOne(conflictQuery);

    if (existingCategoryOffer) {
        throw new Error(`An active offer "${existingCategoryOffer.name}" already exists for this category during the selected time period`);
    }

    // Check for conflicting product offers in this category
    const conflictingProductOffers = await Offer.find({
        type: 'product',
        status: 'active',
        startDate: { $lte: offerData.endDate },
        endDate: { $gte: offerData.startDate }
    }).populate({
        path: 'targetId',
        match: { category: offerData.targetId }
    });

    const activeProductOffers = conflictingProductOffers.filter(offer => offer.targetId);
    
    if (activeProductOffers.length > 0) {
        const productNames = activeProductOffers.map(offer => offer.targetId.productName).join(', ');
        throw new Error(`Cannot create category offer. Active product offers exist for products in this category: ${productNames}`);
    }

    // Validate discount doesn't make products unprofitable
    await validateCategoryDiscountProfitability(category, offerData);
};

// Validate that discounted price doesn't go below cost price
const validateDiscountedPrice = async (product, offerData) => {
    // Get product variants to check pricing
    const variants = await Variant.find({ product_id: product._id });
    
    if (variants.length === 0) {
        throw new Error("Product has no variants. Cannot create offer.");
    }

    // Check each variant's discounted price
    for (const variant of variants) {
        let discountedPrice = variant.price;
        
        if (offerData.discountType === 'percentage') {
            discountedPrice = variant.price * (1 - offerData.discountValue / 100);
        } else {
            discountedPrice = variant.price - offerData.discountValue;
        }

        // Ensure discounted price is not negative or too low
        const minimumPrice = Math.max(variant.price * 0.1, 50); // 10% of original price or ₹50, whichever is higher
        
        if (discountedPrice < minimumPrice) {
            throw new Error(`Discount is too high. Discounted price (₹${discountedPrice.toFixed(2)}) would be below minimum threshold (₹${minimumPrice.toFixed(2)}) for variant ${variant.size || variant.color || 'default'}`);
        }

        if (discountedPrice <= 0) {
            throw new Error(`Discount cannot exceed the product price. Please reduce the discount value.`);
        }

        // Additional check: ensure discount doesn't exceed 90% for individual products
        if (offerData.discountType === 'percentage' && offerData.discountValue > 90) {
            throw new Error("Product offers cannot exceed 90% discount to maintain profitability");
        }

        // For flat discounts, ensure it doesn't exceed 80% of product price
        if (offerData.discountType === 'flat' && offerData.discountValue > (variant.price * 0.8)) {
            throw new Error(`Flat discount (₹${offerData.discountValue}) cannot exceed 80% of product price (₹${(variant.price * 0.8).toFixed(2)})`);
        }
    }
};

// Validate category-wide discount profitability
const validateCategoryDiscountProfitability = async (category, offerData) => {
    // Get sample products from this category to validate pricing
    const sampleProducts = await Product.find({ 
        category: category._id, 
        status: 'Available' 
    }).limit(10); // Check more products for category offers

    if (sampleProducts.length === 0) {
        throw new Error("Category has no active products. Cannot create offer.");
    }

    // Additional check: ensure category discount doesn't exceed 80%
    if (offerData.discountType === 'percentage' && offerData.discountValue > 80) {
        throw new Error("Category offers cannot exceed 80% discount to maintain profitability across all products");
    }

    let problematicProducts = [];

    // Check if discount is reasonable for category products
    for (const product of sampleProducts) {
        const variants = await Variant.find({ product_id: product._id }).limit(3);
        
        for (const variant of variants) {
            let discountedPrice = variant.price;
            
            if (offerData.discountType === 'percentage') {
                discountedPrice = variant.price * (1 - offerData.discountValue / 100);
            } else {
                discountedPrice = variant.price - offerData.discountValue;
            }

            const minimumPrice = Math.max(variant.price * 0.05, 25); // 5% of original price or ₹25 for category offers
            
            if (discountedPrice < minimumPrice) {
                problematicProducts.push(`${product.productName} (₹${variant.price} → ₹${discountedPrice.toFixed(2)})`);
                break; // Only add product once
            }

            // For flat discounts on categories, check against lowest priced items
            if (offerData.discountType === 'flat' && offerData.discountValue > (variant.price * 0.7)) {
                problematicProducts.push(`${product.productName} (₹${variant.price} - flat discount too high)`);
                break;
            }
        }
    }

    if (problematicProducts.length > 0) {
        throw new Error(`Category discount is too high for these products: ${problematicProducts.slice(0, 3).join(', ')}${problematicProducts.length > 3 ? ` and ${problematicProducts.length - 3} more` : ''}. Consider reducing the discount value.`);
    }
};

const updateOffer = async (offerId, updateData) => {
    const offer = await Offer.findById(offerId);
    if (!offer) {
        throw new Error("Offer not found");
    }

    // Handle status toggle
    if (updateData.status === 'toggle') {
        offer.status = offer.status === 'active' ? 'inactive' : 'active';
    } else {
        // For full updates, run validations
        if (updateData.type === 'product') {
            await validateProductOffer(updateData, offerId);
        } else if (updateData.type === 'category') {
            await validateCategoryOffer(updateData, offerId);
        }

        // Update fields
        if (updateData.name) {
            // Check for duplicate name (excluding current offer) - all offers regardless of status
            const existingOffer = await Offer.findOne({
                name: { $regex: new RegExp(`^${updateData.name}$`, 'i') },
                _id: { $ne: offerId }
            });

            if (existingOffer) {
                const statusText = existingOffer.status === 'active' ? 'active' : 'inactive';
                throw new Error(`An offer with the name "${updateData.name}" already exists (${statusText}). Please choose a different name.`);
            }
            
            offer.name = updateData.name;
        }
        if (updateData.discountValue) {
            if (updateData.discountValue <= 0) {
                throw new Error("Discount value must be positive");
            }
            if (offer.discountType === 'percentage' && updateData.discountValue > 100) {
                throw new Error("Percentage discount cannot exceed 100%");
            }
            offer.discountValue = parseFloat(updateData.discountValue);
        }
        if (updateData.startDate) {
            const startDate = new Date(updateData.startDate);
            if (updateData.endDate) {
                const endDate = new Date(updateData.endDate);
                if (startDate >= endDate) {
                    throw new Error("Start date must be before end date");
                }
            }
            offer.startDate = startDate;
        }
        if (updateData.endDate) {
            const endDate = new Date(updateData.endDate);
            if (endDate <= new Date()) {
                throw new Error("End date must be in the future");
            }
            offer.endDate = endDate;
        }
        if (updateData.status) offer.status = updateData.status;
        if (updateData.maxUsage !== undefined) offer.maxUsage = updateData.maxUsage ? parseInt(updateData.maxUsage) : null;
    }

    await offer.save();
    return offer;
};

const deleteOffer = async (offerId) => {
    const offer = await Offer.findById(offerId);
    if (!offer) {
        throw new Error("Offer not found");
    }

    await Offer.findByIdAndDelete(offerId);
    return true;
};

// General business rule validations for all offers
const validateOfferBusinessRules = async (offerData, excludeOfferId = null) => {
    // Validate offer duration (minimum 1 day, maximum 1 year)
    const startDate = new Date(offerData.startDate);
    const endDate = new Date(offerData.endDate);
    const durationDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
    
    if (durationDays < 1) {
        throw new Error("Offer duration must be at least 1 day");
    }
    
    if (durationDays > 365) {
        throw new Error("Offer duration cannot exceed 1 year");
    }

    // Validate start date is not too far in the past (allow up to 1 day for scheduling)
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    if (startDate < oneDayAgo) {
        throw new Error("Offer start date cannot be more than 1 day in the past");
    }

    // Validate max usage if provided
    if (offerData.maxUsage && offerData.maxUsage < 1) {
        throw new Error("Maximum usage must be at least 1 if specified");
    }

    if (offerData.maxUsage && offerData.maxUsage > 100000) {
        throw new Error("Maximum usage cannot exceed 100,000 to prevent system overload");
    }

    // Validate offer name uniqueness for all offers (active and inactive)
    const nameQuery = {
        name: { $regex: new RegExp(`^${offerData.name}$`, 'i') }
    };

    // Exclude current offer if updating
    if (excludeOfferId) {
        nameQuery._id = { $ne: excludeOfferId };
    }

    const existingOffer = await Offer.findOne(nameQuery);

    if (existingOffer) {
        const statusText = existingOffer.status === 'active' ? 'active' : 'inactive';
        throw new Error(`An offer with the name "${offerData.name}" already exists (${statusText}). Please choose a different name.`);
    }
};

export default {
    getOffers,
    getOfferById,
    createOffer,
    updateOffer,
    deleteOffer
};