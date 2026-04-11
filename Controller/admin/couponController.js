import couponService from "../../service/admin/couponService.js";
import { couponSchema } from "../../schemas/index.js";

const editCouponGet = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await couponService.getCouponById(id);
    
    if (!coupon) {
      req.session.errorMsg = "Coupon not found";
      return res.redirect("/admin/offers");
    }

    // Get session messages and clear them
    const successMsg = req.session.successMsg;
    const errorMsg = req.session.errorMsg;
    delete req.session.successMsg;
    delete req.session.errorMsg;

    res.render("editCoupon", { 
      coupon,
      successMsg,
      errorMsg
    });
  } catch (error) {
    console.error("Error fetching coupon for edit:", error);
    req.session.errorMsg = error.message || "Failed to load coupon";
    res.redirect("/admin/offers");
  }
};

const editCouponPost = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Transform form data to proper types and handle arrays
    const formData = { ...req.body };
    
    // Ensure single values for fields that might come as arrays
    Object.keys(formData).forEach(key => {
      if (Array.isArray(formData[key])) {
        formData[key] = formData[key][0]; // Take first value if array
      }
    });

    const updateData = {
      code: formData.code ? formData.code.toUpperCase() : undefined,
      discountType: formData.discountType,
      discountValue: formData.discountValue ? parseFloat(formData.discountValue) : undefined,
      minimumOrderAmount: formData.minimumOrderAmount ? parseFloat(formData.minimumOrderAmount) : 0,
      maximumOrderAmount: formData.maximumOrderAmount ? parseFloat(formData.maximumOrderAmount) : null,
      usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null,
      perUserLimit: formData.perUserLimit ? parseInt(formData.perUserLimit) : 1,
      expiryDate: formData.expiryDate ? new Date(formData.expiryDate) : undefined
    };

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Validate with Zod schema
    const validation = couponSchema.safeParse(updateData);
    if (!validation.success) {
      const errors = validation.error.issues.map(err => err.message);
      
      // Get coupon data and render form with errors
      const coupon = await couponService.getCouponById(id);
      
      return res.render("editCoupon", { 
        coupon: { ...coupon.toObject(), ...formData }, // Preserve user input
        errorMsg: errors.join(', ')
      });
    }

    await couponService.updateCoupon(id, validation.data);

    req.session.successMsg = "Coupon updated successfully";
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error updating coupon:", error);
    
    // Handle different types of errors
    let errorMessage = "Failed to update coupon";
    
    if (error.name === 'ValidationError') {
      // Handle Mongoose validation errors
      const validationErrors = Object.values(error.errors).map(err => err.message);
      errorMessage = validationErrors.join(', ');
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    try {
      // Try to get coupon data and render form with error
      const coupon = await couponService.getCouponById(req.params.id);
      
      // Transform form data to proper types for preservation
      const formData = { ...req.body };
      Object.keys(formData).forEach(key => {
        if (Array.isArray(formData[key])) {
          formData[key] = formData[key][0];
        }
      });
      
      return res.render("editCoupon", { 
        coupon: { ...coupon.toObject(), ...formData }, // Preserve user input
        errorMsg: errorMessage
      });
    } catch (renderError) {
      // If we can't render the form, redirect with session message
      console.error("Error rendering edit coupon form:", renderError);
      req.session.errorMsg = errorMessage;
      res.redirect("/admin/offers");
    }
  }
};

const createCouponPost = async (req, res) => {
  try {
    // Transform form data to handle arrays
    const formData = { ...req.body };
    Object.keys(formData).forEach(key => {
      if (Array.isArray(formData[key])) {
        formData[key] = formData[key][0]; // Take first value if array
      }
    });

    // Validate request body (schema will handle string-to-number conversion)
    const validation = couponSchema.safeParse(formData);
    if (!validation.success) {
      const errors = validation.error?.issues?.map(err => err.message) || ['Validation failed'];
      return res.status(400).json({
        success: false,
        message: errors.join(', ')
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
    
    // Handle different types of errors
    let errorMessage = "Failed to create coupon";
    
    if (error.name === 'ValidationError') {
      // Handle Mongoose validation errors
      const validationErrors = Object.values(error.errors).map(err => err.message);
      errorMessage = validationErrors.join(', ');
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};
const updateCouponPost = async (req, res) => {
  try {
    const { couponId } = req.params;
    
    // Transform form data to handle arrays
    const formData = { ...req.body };
    Object.keys(formData).forEach(key => {
      if (Array.isArray(formData[key])) {
        formData[key] = formData[key][0]; // Take first value if array
      }
    });
    
    // For status toggle, skip validation
    if (formData.status === 'toggle') {
      const coupon = await couponService.updateCoupon(couponId, formData);
      return res.json({
        success: true,
        message: "Coupon status updated successfully",
        coupon
      });
    }

    // For other updates, validate with Zod schema if it's a full update
    if (formData.code || formData.discountType || formData.discountValue || formData.expiryDate) {
      const validation = couponSchema.safeParse(formData);
      if (!validation.success) {
        const errors = validation.error?.issues?.map(err => err.message) || ['Validation failed'];
        return res.status(400).json({
          success: false,
          message: errors.join(', ')
        });
      }
    }

    const coupon = await couponService.updateCoupon(couponId, formData);

    res.json({
      success: true,
      message: "Coupon updated successfully",
      coupon
    });
  } catch (error) {
    console.error("Error updating coupon:", error);
    
    // Handle different types of errors
    let errorMessage = "Failed to update coupon";
    
    if (error.name === 'ValidationError') {
      // Handle Mongoose validation errors
      const validationErrors = Object.values(error.errors).map(err => err.message);
      errorMessage = validationErrors.join(', ');
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

const deleteCouponPost = async (req, res) => {
  try {
    const { couponId } = req.params;
    console.log("Attempting to delete coupon with ID:", couponId);
    
    await couponService.deleteCoupon(couponId);

    res.json({
      success: true,
      message: "Coupon deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    
    // Handle different types of errors
    let errorMessage = "Failed to delete coupon";
    
    if (error.name === 'ValidationError') {
      // Handle Mongoose validation errors
      const validationErrors = Object.values(error.errors).map(err => err.message);
      errorMessage = validationErrors.join(', ');
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage
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