import couponService from "../../service/admin/couponService.js";
import { couponSchema } from "../../schemas/index.js";

// Note: Coupons are displayed on the same page as offers (/admin/offers)
// So we don't need a separate couponsGet method here

const editCouponGet = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await couponService.getCouponById(id);
    
    if (!coupon) {
      req.session.errorMsg = "Coupon not found";
      return res.redirect("/admin/offers");
    }

    res.render("editCoupon", { coupon });
  } catch (error) {
    console.error("Error fetching coupon for edit:", error);
    req.session.errorMsg = "Failed to load coupon";
    res.redirect("/admin/offers");
  }
};

const editCouponPost = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, discountType, discountValue, minimumOrderAmount, maximumOrderAmount, maximumDiscountCap, expiryDate, usageLimit, perUserLimit } = req.body;

    // Validation
    if (!code || !discountType || !discountValue || !expiryDate) {
      req.session.errorMsg = "All required fields must be filled";
      return res.redirect(`/admin/coupons/edit/${id}`);
    }

    if (parseFloat(discountValue) <= 0) {
      req.session.errorMsg = "Discount value must be positive";
      return res.redirect(`/admin/coupons/edit/${id}`);
    }

    if (discountType === 'percentage' && parseFloat(discountValue) > 100) {
      req.session.errorMsg = "Percentage discount cannot exceed 100%";
      return res.redirect(`/admin/coupons/edit/${id}`);
    }

    if (new Date(expiryDate) <= new Date()) {
      req.session.errorMsg = "Expiry date must be in the future";
      return res.redirect(`/admin/coupons/edit/${id}`);
    }

    // Check if another coupon already has the same code (excluding current coupon)
    const existingCoupon = await couponService.getCouponByCode(code.toUpperCase());
    if (existingCoupon && existingCoupon._id.toString() !== id) {
      req.session.errorMsg = "Coupon code already exists";
      return res.redirect(`/admin/coupons/edit/${id}`);
    }

    const updateData = {
      code: code.toUpperCase(),
      discountType,
      discountValue: parseFloat(discountValue),
      minimumOrderAmount: parseFloat(minimumOrderAmount) || 0,
      maximumOrderAmount: maximumOrderAmount ? parseFloat(maximumOrderAmount) : null,
      maximumDiscountCap: maximumDiscountCap ? parseFloat(maximumDiscountCap) : null,
      usageLimit: usageLimit ? parseInt(usageLimit) : null,
      perUserLimit: parseInt(perUserLimit) || 1,
      expiryDate: new Date(expiryDate)
    };

    await couponService.updateCouponById(id, updateData);

    req.session.successMsg = "Coupon updated successfully";
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error updating coupon:", error);
    req.session.errorMsg = error.message || "Failed to update coupon";
    res.redirect(`/admin/coupons/edit/${req.params.id}`);
  }
};

const createCouponPost = async (req, res) => {
  try {
    // Validate request body
    const validation = couponSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors
      });
    }

    const coupon = await couponService.createCoupon(validation.data);

    res.json({
      success: true,
      message: "Coupon created successfully",
      coupon
    });
  } catch (error) {
    console.error("Error creating coupon:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create coupon"
    });
  }
};
const updateCouponPost = async (req, res) => {
  try {
    const { couponId } = req.params;
    
    // For status toggle, skip validation
    if (req.body.status === 'toggle') {
      const coupon = await couponService.updateCoupon(couponId, req.body);
      return res.json({
        success: true,
        message: "Coupon status updated successfully",
        coupon
      });
    }

    // For other updates, validate with Zod schema if it's a full update
    if (req.body.code || req.body.discountType || req.body.discountValue || req.body.expiryDate) {
      const validation = couponSchema.safeParse(req.body);
      if (!validation.success) {
        const errors = validation.error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors
        });
      }
    }

    const coupon = await couponService.updateCoupon(couponId, req.body);

    res.json({
      success: true,
      message: "Coupon updated successfully",
      coupon
    });
  } catch (error) {
    console.error("Error updating coupon:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update coupon"
    });
  }
};

const deleteCouponPost = async (req, res) => {
  try {
    const { couponId } = req.params;
    await couponService.deleteCoupon(couponId);

    res.json({
      success: true,
      message: "Coupon deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete coupon"
    });
  }
};

export default {
  editCouponGet,
  editCouponPost,
  createCouponPost,
  updateCouponPost,
  deleteCouponPost
};