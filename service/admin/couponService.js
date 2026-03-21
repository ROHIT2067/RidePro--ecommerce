import Coupon from "../../Models/CouponModel.js";

const getCoupons = async (query) => {
    const page = parseInt(query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const coupons = await Coupon.find()
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
    // Validation
    if (!couponData.code || !couponData.discountType || !couponData.discountValue || !couponData.expiryDate) {
        throw new Error("All required fields must be filled");
    }

    if (new Date(couponData.expiryDate) <= new Date()) {
        throw new Error("Expiry date must be in the future");
    }

    if (couponData.discountValue <= 0) {
        throw new Error("Discount value must be positive");
    }

    if (couponData.discountType === 'percentage' && couponData.discountValue > 100) {
        throw new Error("Percentage discount cannot exceed 100%");
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ code: couponData.code.toUpperCase() });
    if (existingCoupon) {
        throw new Error("Coupon code already exists");
    }

    // Validate minimum vs maximum order amounts
    if (couponData.minimumOrderAmount && couponData.maximumOrderAmount) {
        if (parseFloat(couponData.minimumOrderAmount) >= parseFloat(couponData.maximumOrderAmount)) {
            throw new Error("Minimum order amount must be less than maximum order amount");
        }
    }

    const processedData = {
        code: couponData.code.toUpperCase(),
        discountType: couponData.discountType,
        discountValue: parseFloat(couponData.discountValue),
        minimumOrderAmount: parseFloat(couponData.minimumOrderAmount) || 0,
        maximumOrderAmount: couponData.maximumOrderAmount ? parseFloat(couponData.maximumOrderAmount) : null,
        maximumDiscountCap: couponData.maximumDiscountCap ? parseFloat(couponData.maximumDiscountCap) : null,
        usageLimit: couponData.usageLimit ? parseInt(couponData.usageLimit) : null,
        perUserLimit: parseInt(couponData.perUserLimit) || 1,
        expiryDate: new Date(couponData.expiryDate)
    };

    const coupon = new Coupon(processedData);
    await coupon.save();
    return coupon;
};

const updateCoupon = async (couponId, updateData) => {
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
        throw new Error("Coupon not found");
    }

    // Handle status toggle
    if (updateData.status === 'toggle') {
        coupon.status = coupon.status === 'active' ? 'inactive' : 'active';
    } else {
        // Update other fields
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
        if (updateData.maximumDiscountCap !== undefined) coupon.maximumDiscountCap = updateData.maximumDiscountCap ? parseFloat(updateData.maximumDiscountCap) : null;
        if (updateData.usageLimit !== undefined) coupon.usageLimit = updateData.usageLimit ? parseInt(updateData.usageLimit) : null;
        if (updateData.perUserLimit) coupon.perUserLimit = parseInt(updateData.perUserLimit);
        if (updateData.expiryDate) {
            if (new Date(updateData.expiryDate) <= new Date()) {
                throw new Error("Expiry date must be in the future");
            }
            coupon.expiryDate = new Date(updateData.expiryDate);
        }
        if (updateData.status) coupon.status = updateData.status;
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

const useCoupon = async (couponId, userId) => {
    const coupon = await Coupon.findById(couponId);
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

    await coupon.save();
    return coupon;
};

const getCouponById = async (couponId) => {
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
        throw new Error("Coupon not found");
    }
    return coupon;
};

const getCouponByCode = async (code) => {
    return await Coupon.findOne({ code: code.toUpperCase() });
};

const updateCouponById = async (couponId, updateData) => {
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
        throw new Error("Coupon not found");
    }

    // Update all fields
    Object.keys(updateData).forEach(key => {
        coupon[key] = updateData[key];
    });

    await coupon.save();
    return coupon;
};

export default {
    getCoupons,
    getCouponById,
    getCouponByCode,
    updateCouponById,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    applyCoupon,
    useCoupon
};