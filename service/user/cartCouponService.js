import Coupon from "../../Models/CouponModel.js";
import User from "../../Models/UserModel.js";

// Calculate coupon savings for a given cart total
const calculateCouponSavings = (coupon, cartTotal) => {
  if (cartTotal < coupon.minimumOrderAmount) {
    return 0;
  }
  
  if (coupon.maximumOrderAmount && cartTotal > coupon.maximumOrderAmount) {
    return 0;
  }
  
  let savings = 0;
  
  if (coupon.discountType === 'percentage') {
    savings = (cartTotal * coupon.discountValue) / 100;
  } else {
    // Flat discount
    savings = coupon.discountValue;
  }
  
  // Ensure savings don't exceed cart total
  return Math.min(savings, cartTotal);
};

// Check if user has reached per-user limit for a coupon
const hasUserReachedLimit = (coupon, userId) => {
  if (!coupon.perUserLimit) return false;
  
  const userUsage = coupon.usedBy.find(usage => usage.userId.toString() === userId.toString());
  return userUsage && userUsage.usageCount >= coupon.perUserLimit;
};

// Check if coupon is eligible for the current cart
const isCouponEligible = (coupon, cartTotal, userId) => {
  // Check if coupon is active
  if (coupon.status !== 'active') {
    return { eligible: false, reason: 'Coupon is inactive' };
  }
  
  // Check if coupon has expired
  if (new Date() > coupon.expiryDate) {
    return { eligible: false, reason: 'This code has expired' };
  }
  
  // Check if coupon has reached usage limit
  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    return { eligible: false, reason: 'Offer fully claimed' };
  }
  
  // Check if user has reached per-user limit
  if (hasUserReachedLimit(coupon, userId)) {
    return { eligible: false, reason: 'You have already used this coupon' };
  }
  
  // Check minimum order amount
  if (cartTotal < coupon.minimumOrderAmount) {
    const needed = coupon.minimumOrderAmount - cartTotal;
    return { 
      eligible: false, 
      reason: `Add ₹${needed.toLocaleString('en-IN')} more to unlock`,
      amountNeeded: needed
    };
  }
  
  // Check maximum order amount
  if (coupon.maximumOrderAmount && cartTotal > coupon.maximumOrderAmount) {
    return { 
      eligible: false, 
      reason: `Maximum order amount ₹${coupon.maximumOrderAmount.toLocaleString('en-IN')} exceeded` 
    };
  }
  
  return { eligible: true };
};

// Get discount headline text
const getDiscountHeadline = (coupon) => {
  if (coupon.discountType === 'percentage') {
    return `${coupon.discountValue}% off`;
  } else {
    return `₹${coupon.discountValue.toLocaleString('en-IN')} off`;
  }
};

// Get condition line text
const getConditionLine = (coupon) => {
  let conditions = [];
  
  if (coupon.minimumOrderAmount > 0) {
    conditions.push(`On orders above ₹${coupon.minimumOrderAmount.toLocaleString('en-IN')}`);
  }
  
  if (coupon.maximumOrderAmount) {
    conditions.push(`Up to ₹${coupon.maximumOrderAmount.toLocaleString('en-IN')}`);
  }
  
  
  return conditions.join(' • ') || 'No minimum order';
};

// Check if coupon expires within 72 hours
const isExpiringSoon = (coupon) => {
  const now = new Date();
  const expiryTime = new Date(coupon.expiryDate);
  const hoursUntilExpiry = (expiryTime - now) / (1000 * 60 * 60);
  
  if (hoursUntilExpiry <= 72 && hoursUntilExpiry > 0) {
    const daysUntilExpiry = Math.ceil(hoursUntilExpiry / 24);
    return {
      expiring: true,
      text: daysUntilExpiry === 1 ? 'Expires today' : `Expires in ${daysUntilExpiry} days`
    };
  }
  
  return { expiring: false };
};

// Check usage progress for limited coupons
const getUsageProgress = (coupon) => {
  if (!coupon.usageLimit) return null;
  
  const usagePercentage = (coupon.usageCount / coupon.usageLimit) * 100;
  
  if (usagePercentage >= 60) {
    return {
      percentage: Math.round(usagePercentage),
      text: `${Math.round(usagePercentage)}% claimed — limited uses left`
    };
  }
  
  return null;
};

// Get coupon badge based on properties
const getCouponBadge = (coupon, userId) => {
  // Check if it's a new user coupon (you can customize this logic)
  if (coupon.code.includes('WELCOME') || coupon.code.includes('NEW')) {
    return { text: 'New users', color: 'blue' };
  }
  
  // Check if it's a popular coupon (high usage)
  if (coupon.usageLimit && coupon.usageCount > coupon.usageLimit * 0.3) {
    return { text: 'Popular', color: 'orange' };
  }
  
  // Check if it's a member-only coupon (you can customize this logic)
  if (coupon.code.includes('MEMBER') || coupon.code.includes('VIP')) {
    return { text: 'Members only', color: 'purple' };
  }
  
  return null;
};

// Check if cart total is close to unlocking a coupon (within 15%)
const getNearbyUnlockableCoupons = async (cartTotal, userId) => {
  const coupons = await Coupon.find({
    status: 'active',
    expiryDate: { $gte: new Date() },
    minimumOrderAmount: { 
      $gt: cartTotal,
      $lte: cartTotal * 1.15 // Within 15% of current cart total
    }
  }).sort({ minimumOrderAmount: 1 }).limit(3);
  
  const unlockable = [];
  
  for (const coupon of coupons) {
    // Skip if user has reached limit
    if (hasUserReachedLimit(coupon, userId)) continue;
    
    // Skip if coupon is fully claimed
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) continue;
    
    const amountNeeded = coupon.minimumOrderAmount - cartTotal;
    const potentialSavings = calculateCouponSavings(coupon, coupon.minimumOrderAmount);
    
    unlockable.push({
      code: coupon.code,
      amountNeeded,
      potentialSavings,
      headline: getDiscountHeadline(coupon)
    });
  }
  
  return unlockable;
};

// Get all available coupons for cart display
const getCartCoupons = async (cartTotal, userId) => {
  // Get all active coupons
  const allCoupons = await Coupon.find({
    status: 'active',
    expiryDate: { $gte: new Date() }
  }).sort({ discountValue: -1 }); // Sort by discount value descending
  
  const eligibleCoupons = [];
  const ineligibleCoupons = [];
  
  for (const coupon of allCoupons) {
    const eligibilityCheck = isCouponEligible(coupon, cartTotal, userId);
    const savings = calculateCouponSavings(coupon, cartTotal);
    const expiryInfo = isExpiringSoon(coupon);
    const usageProgress = getUsageProgress(coupon);
    const badge = getCouponBadge(coupon, userId);
    
    const couponData = {
      _id: coupon._id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      headline: getDiscountHeadline(coupon),
      conditionLine: getConditionLine(coupon),
      savings: savings,
      expiryInfo: expiryInfo,
      usageProgress: usageProgress,
      badge: badge,
      eligible: eligibilityCheck.eligible,
      reason: eligibilityCheck.reason,
      amountNeeded: eligibilityCheck.amountNeeded
    };
    
    if (eligibilityCheck.eligible && savings > 0) {
      eligibleCoupons.push(couponData);
    } else {
      // Only show ineligible coupons that user could potentially qualify for
      if (eligibilityCheck.amountNeeded || eligibilityCheck.reason.includes('expired') || eligibilityCheck.reason.includes('claimed')) {
        ineligibleCoupons.push(couponData);
      }
    }
  }
  
  // Get nearby unlockable coupons
  const nearbyUnlockable = await getNearbyUnlockableCoupons(cartTotal, userId);
  
  return {
    eligible: eligibleCoupons,
    ineligible: ineligibleCoupons,
    nearbyUnlockable: nearbyUnlockable,
    totalEligible: eligibleCoupons.length
  };
};

// Apply coupon and return result
const applyCoupon = async (couponCode, cartTotal, userId) => {
  const coupon = await Coupon.findOne({ 
    code: couponCode.toUpperCase(),
    status: 'active'
  });
  
  if (!coupon) {
    throw new Error('Invalid coupon code');
  }
  
  const eligibilityCheck = isCouponEligible(coupon, cartTotal, userId);
  
  if (!eligibilityCheck.eligible) {
    throw new Error(eligibilityCheck.reason);
  }
  
  const savings = calculateCouponSavings(coupon, cartTotal);
  
  if (savings === 0) {
    throw new Error('This coupon is not applicable to your cart');
  }
  
  return {
    coupon: {
      _id: coupon._id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue
    },
    discountAmount: savings,
    finalAmount: cartTotal - savings
  };
};

export default {
  getCartCoupons,
  applyCoupon,
  calculateCouponSavings,
  isCouponEligible,
  getNearbyUnlockableCoupons
};