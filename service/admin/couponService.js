import Coupon from "../../Models/CouponModel.js";
import { couponSchema } from "../../schemas/index.js";

const getCoupons = async (query) => {
    const page = parseInt(query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const coupons = await Coupon.find() //No .populate() here because coupons don't reference other documents
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const totalCoupons = await Coupon.countDocuments();
    const totalPages = Math.ceil(totalCoupons / limit);

    return {
        coupons,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1
    }; 
};

const createCoupon = async (couponData) => {
    //Validate input data with Zod schema
    const validation = couponSchema.safeParse(couponData);

    //If validation fails, maps each Zod issue to a readable string
    if (!validation.success) {
        const errors = validation.error.errors.map(err => err.message).join(', ');
        throw new Error(errors);
    }

    const validatedData = validation.data;

    //Check if coupon code already exists (case-insensitive)
    const existingCoupon = await Coupon.findOne({ 
        code: validatedData.code 
    });
    
    if (existingCoupon) {
        throw new Error("Coupon code already exists. Please choose a different code.");
    }

    //Additional business logic validations
    await validateCouponBusinessRules(validatedData);

    //Create coupon with validated data
    const coupon = new Coupon({
        ...validatedData,   //Spreads all validated fields into the object.
        status: 'active',
        usageCount: 0,
        usedBy: []
    });

    await coupon.save();
    return coupon;
};

const updateCoupon = async (couponId, updateData) => {
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
        throw new Error("Coupon not found");
    }

    //Handle status toggle
    if (updateData.status === 'toggle') {
        coupon.status = coupon.status === 'active' ? 'inactive' : 'active';
    } else {
        //Validate updated data with Zod schema for full updates(safeParse never throws on failure)
        if (updateData.code || updateData.discountType || updateData.discountValue || updateData.expiryDate) {
            const validation = couponSchema.safeParse({
                code: updateData.code || coupon.code,
                discountType: updateData.discountType || coupon.discountType,
                discountValue: updateData.discountValue || coupon.discountValue,
                minimumOrderAmount: updateData.minimumOrderAmount !== undefined ? updateData.minimumOrderAmount : coupon.minimumOrderAmount,
                maximumOrderAmount: updateData.maximumOrderAmount !== undefined ? updateData.maximumOrderAmount : coupon.maximumOrderAmount,
                maximumDiscountCap: updateData.maximumDiscountCap !== undefined ? updateData.maximumDiscountCap : coupon.maximumDiscountCap,
                usageLimit: updateData.usageLimit !== undefined ? updateData.usageLimit : coupon.usageLimit,
                perUserLimit: updateData.perUserLimit || coupon.perUserLimit,
                expiryDate: updateData.expiryDate || coupon.expiryDate
            });

            //If validation failed, collects all error messages into a comma-separated string and throws it
            if (!validation.success) {
                const errors = validation.error.errors.map(err => err.message).join(', ');
                throw new Error(errors);
            }

            // Check for duplicate coupon code (excluding current coupon)
            if (updateData.code && updateData.code.toUpperCase() !== coupon.code) {
                const existingCoupon = await Coupon.findOne({ 
                    code: updateData.code.toUpperCase(),
                    _id: { $ne: couponId }
                });
                
                if (existingCoupon) {
                    throw new Error("Coupon code already exists. Please choose a different code.");
                }
            }
        }

        // Update fields with individual validations
        if (updateData.code) coupon.code = updateData.code.toUpperCase();
        if (updateData.discountValue) {
            if (updateData.discountValue <= 0) {
                throw new Error("Discount value must be positive");
            }
            if (coupon.discountType === 'percentage' && updateData.discountValue > 100) {
                throw new Error("Percentage discount cannot exceed 100%");
            }
            coupon.discountValue = parseFloat(updateData.discountValue);
        }
        if (updateData.minimumOrderAmount !== undefined) coupon.minimumOrderAmount = parseFloat(updateData.minimumOrderAmount) || 0;
        if (updateData.maximumOrderAmount !== undefined) coupon.maximumOrderAmount = updateData.maximumOrderAmount ? parseFloat(updateData.maximumOrderAmount) : null;
        if (updateData.maximumDiscountCap !== undefined) coupon.maximumDiscountCap = updateData.maximumDiscountCap ? parseFloat(updateData.maximumDiscountCap) : null;
        if (updateData.usageLimit !== undefined) coupon.usageLimit = updateData.usageLimit ? parseInt(updateData.usageLimit) : null;
        if (updateData.perUserLimit) coupon.perUserLimit = parseInt(updateData.perUserLimit);
        if (updateData.expiryDate) {
            const expiryDate = new Date(updateData.expiryDate);
            if (expiryDate <= new Date()) {
                throw new Error("Expiry date must be in the future");
            }
            coupon.expiryDate = expiryDate;
        }
        if (updateData.status) coupon.status = updateData.status;

        await validateCouponBusinessRules({
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          minimumOrderAmount: coupon.minimumOrderAmount,
          maximumOrderAmount: coupon.maximumOrderAmount,
          maximumDiscountCap: coupon.maximumDiscountCap,
          usageLimit: coupon.usageLimit,
          perUserLimit: coupon.perUserLimit,
          expiryDate: coupon.expiryDate
        });
    }

    await coupon.save();
    return coupon;
};

const deleteCoupon = async (couponId) => {
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
        throw new Error("Coupon not found");
    }

    // Check if coupon has been used
    if (coupon.usageCount > 0) {
        throw new Error("Cannot delete coupon that has already been used");
    }

    await Coupon.findByIdAndDelete(couponId);
    return true;
};

const applyCoupon = async (couponCode, orderAmount, userId) => {
    const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase(),
        status: 'active',
        expiryDate: { $gte: new Date() }
    });

    if (!coupon) {
        throw new Error("Invalid or expired coupon code");
    }

    // Check minimum order amount
    if (orderAmount < coupon.minimumOrderAmount) {
        throw new Error(`Minimum order amount of ₹${coupon.minimumOrderAmount} required`);
    }

    // Check maximum order amount
    if (coupon.maximumOrderAmount && orderAmount > coupon.maximumOrderAmount) {
        throw new Error(`Maximum order amount of ₹${coupon.maximumOrderAmount} exceeded`);
    }

    // Check usage limits
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
        throw new Error("Coupon usage limit exceeded");
    }

    // Check per-user limit
    const userUsage = coupon.usedBy.find(usage => usage.userId.toString() === userId);
    if (userUsage && userUsage.usageCount >= coupon.perUserLimit) {
        throw new Error("You have already used this coupon maximum times");
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
        discountAmount = (orderAmount * coupon.discountValue) / 100;
        if (coupon.maximumDiscountCap) {
            discountAmount = Math.min(discountAmount, coupon.maximumDiscountCap);
        }
    } else {
        discountAmount = coupon.discountValue;
    }

    discountAmount = Math.min(discountAmount, orderAmount);

    return {
        discountAmount: discountAmount,
        finalAmount: orderAmount - discountAmount,
        coupon: coupon
    };
};

const useCoupon = async (couponId, userId, session = null) => {
    const coupon = await Coupon.findById(couponId).session(session);
    if (!coupon) {
        throw new Error("Coupon not found");
    }

    // Update usage count
    coupon.usageCount += 1;

    // Update user usage
    const userUsageIndex = coupon.usedBy.findIndex(usage => usage.userId.toString() === userId);
    if (userUsageIndex >= 0) {
        coupon.usedBy[userUsageIndex].usageCount += 1;
        coupon.usedBy[userUsageIndex].usedAt = new Date();
    } else {
        coupon.usedBy.push({
            userId: userId,
            usageCount: 1,
            usedAt: new Date()
        });
    }

    await coupon.save({ session });
    return coupon;
};

const getCouponById = async (couponId) => {
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
        throw new Error("Coupon not found");
    }
    return coupon;
};


// Validate coupon business rules
const validateCouponBusinessRules = async (couponData) => {
    // Validate flat discount doesn't exceed max order amount
    if (couponData.discountType === 'flat' && couponData.maximumOrderAmount) {
        if (couponData.discountValue > couponData.maximumOrderAmount) {
            throw new Error("Flat discount value cannot exceed maximum order amount");
        }
    }

    // Validate coupon duration (minimum 1 day, maximum 2 years)
    const now = new Date();
    const expiryDate = new Date(couponData.expiryDate);
    const durationDays = (expiryDate - now) / (1000 * 60 * 60 * 24);
    
    if (durationDays < 1) {
        throw new Error("Coupon must be valid for at least 1 day");
    }
    
    if (durationDays > 730) { // 2 years
        throw new Error("Coupon validity cannot exceed 2 years");
    }

    // Validate usage limits are reasonable
    if (couponData.usageLimit && couponData.usageLimit > 50000) {
        throw new Error("Total usage limit cannot exceed 50,000 to prevent system abuse");
    }

    if (couponData.perUserLimit > 100) {
        throw new Error("Per user limit cannot exceed 100 uses");
    }

    // Validate discount caps for percentage discounts
    if (couponData.discountType === 'percentage' && couponData.maximumDiscountCap) {
        if (couponData.maximumDiscountCap < 10) {
            throw new Error("Maximum discount cap should be at least ₹10 for percentage discounts");
        }
        if (couponData.maximumDiscountCap > 10000) {
            throw new Error("Maximum discount cap cannot exceed ₹10,000");
        }
    }

    // Validate minimum order amount is reasonable
    if (couponData.minimumOrderAmount > 50000) {
        throw new Error("Minimum order amount cannot exceed ₹50,000");
    }

    // For flat discounts, ensure they're not too small or too large
    if (couponData.discountType === 'flat') {
        if (couponData.discountValue < 10) {
            throw new Error("Flat discount should be at least ₹10");
        }
        if (couponData.discountValue > 5000) {
            throw new Error("Flat discount cannot exceed ₹5,000");
        }
    }
};

export default {
    getCoupons,
    getCouponById,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    applyCoupon,
    useCoupon
};