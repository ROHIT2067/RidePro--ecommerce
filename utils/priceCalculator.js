import Offer from "../Models/OfferModel.js";
import Coupon from "../Models/CouponModel.js";

export const calculateProductPrice = async (product, variantPrice, categoryId) => {
  try {
    const currentDate = new Date();
    
    // Get active product offers
    const productOffers = await Offer.find({
      type: 'product',
      targetId: product._id,
      status: 'active',
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate }
    });

    // Get active category offers
    const categoryOffers = await Offer.find({
      type: 'category',
      targetId: categoryId,
      status: 'active',
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate }
    });

    let bestDiscount = 0;
    let appliedOffer = null;
    let offerSource = null;
    
    // Calculate best product offer
    let bestProductOffer = null;
    let bestProductDiscount = 0;
    for (const offer of productOffers) {
      let discount = 0;
      if (offer.discountType === 'percentage') {
        discount = (variantPrice * offer.discountValue) / 100;
      } else {
        discount = offer.discountValue;
      }
      
      if (discount > bestProductDiscount) {
        bestProductDiscount = discount;
        bestProductOffer = {
          ...offer.toObject(),
          calculatedDiscount: discount,
          effectiveDiscountPercent: Math.round((discount / variantPrice) * 100)
        };
      }
    }

    // Calculate best category offer
    let bestCategoryOffer = null;
    let bestCategoryDiscount = 0;
    for (const offer of categoryOffers) {
      let discount = 0;
      if (offer.discountType === 'percentage') {
        discount = (variantPrice * offer.discountValue) / 100;
      } else {
        discount = offer.discountValue;
      }
      
      if (discount > bestCategoryDiscount) {
        bestCategoryDiscount = discount;
        bestCategoryOffer = {
          ...offer.toObject(),
          calculatedDiscount: discount,
          effectiveDiscountPercent: Math.round((discount / variantPrice) * 100)
        };
      }
    }

    // Determine which offer to apply (biggest discount)
    if (bestProductDiscount > bestCategoryDiscount) {
      bestDiscount = bestProductDiscount;
      appliedOffer = bestProductOffer;
      offerSource = 'product';
    } else if (bestCategoryDiscount > 0) {
      bestDiscount = bestCategoryDiscount;
      appliedOffer = bestCategoryOffer;
      offerSource = 'category';
    }

    const finalPrice = Math.max(0, variantPrice - bestDiscount);
    
    return {
      originalPrice: variantPrice,
      discountAmount: bestDiscount,
      finalPrice: finalPrice,
      appliedOffer: appliedOffer,
      offerSource: offerSource,
      hasDiscount: bestDiscount > 0,
      // Return both offers for display
      productOffer: bestProductOffer,
      categoryOffer: bestCategoryOffer,
      availableOffers: {
        product: bestProductOffer,
        category: bestCategoryOffer
      }
    };
  } catch (error) {
    console.error("Error calculating product price:", error);
    return {
      originalPrice: variantPrice,
      discountAmount: 0,
      finalPrice: variantPrice,
      appliedOffer: null,
      offerSource: null,
      hasDiscount: false,
      productOffer: null,
      categoryOffer: null,
      availableOffers: { product: null, category: null }
    };
  }
};

export const applyCouponDiscount = async (couponCode, orderAmount, userId) => {
  try {
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      status: 'active',
      expiryDate: { $gte: new Date() }
    });

    if (!coupon) {
      return {
        success: false,
        message: "Invalid or expired coupon code"
      };
    }

    // Check minimum order amount
    if (orderAmount < coupon.minimumOrderAmount) {
      return {
        success: false,
        message: `Minimum order amount of ₹${coupon.minimumOrderAmount} required`
      };
    }

    // Check usage limits
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return {
        success: false,
        message: "Coupon usage limit exceeded"
      };
    }

    // Check per-user limit
    const userUsage = coupon.usedBy.find(usage => usage.userId.toString() === userId);
    if (userUsage && userUsage.usageCount >= coupon.perUserLimit) {
      return {
        success: false,
        message: "You have already used this coupon maximum times"
      };
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
      success: true,
      discountAmount: discountAmount,
      finalAmount: orderAmount - discountAmount,
      coupon: coupon
    };
  } catch (error) {
    console.error("Error applying coupon:", error);
    return {
      success: false,
      message: "Error applying coupon"
    };
  }
};