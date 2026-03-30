import offerService from "../../service/admin/offerService.js";
import { offerSchema } from "../../schemas/index.js";
import couponService from "../../service/admin/couponService.js";
import Product from "../../Models/ProductModel.js";
import Category from "../../Models/CategoryModel.js";

const offersGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const offerData = await offerService.getOffers(req.query);
    const couponData = await couponService.getCoupons(req.query);
    const products = await Product.find({ status: 'Available' }).select('productName');
    const categories = await Category.find({ status: 'Active' }).select('name');

    res.render("offerPage", {
      offers: offerData.offers || [],
      coupons: couponData.coupons || [],
      products,
      categories,
      currentPage: offerData.currentPage || 1,
      totalPages: offerData.totalPages || 1,
      hasNextPage: offerData.hasNextPage || false,
      hasPrevPage: offerData.hasPrevPage || false,
      nextPage: offerData.nextPage || 1,
      prevPage: offerData.prevPage || 1
    });
  } catch (error) {
    console.error("Error loading offers:", error);
    res.redirect("/admin/dashboard");
  }
};

const createOfferPost = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Transform form data to proper types
    const formData = { ...req.body };
    
    // Convert string numbers to actual numbers
    if (formData.discountValue) {
      formData.discountValue = parseFloat(formData.discountValue);
    }
    
    if (formData.maxUsage) {
      formData.maxUsage = parseInt(formData.maxUsage); 
    } else if (formData.maxUsage === '') {
      // Remove empty string maxUsage
      delete formData.maxUsage;
    }

    // Validate request body with Zod schema
    const validation = offerSchema.safeParse(formData);
    if (!validation.success) {
      const errors = validation.error.issues.map(err => `${err.path.join('.')}: ${err.message}`);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors
      });
    }

    const offer = await offerService.createOffer(validation.data);

    res.json({
      success: true,
      message: "Offer created successfully",
      offer
    });
  } catch (error) {
    console.error("Error creating offer:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create offer"
    });
  }
};
const updateOfferPost = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { offerId } = req.params;
    
    // For status toggle, skip validation
    if (req.body.status === 'toggle') {
      const offer = await offerService.updateOffer(offerId, req.body);
      return res.json({
        success: true,
        message: "Offer status updated successfully",
        offer
      });
    }

    // For other updates, validate with Zod schema
    const validation = offerSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map(err => `${err.path.join('.')}: ${err.message}`);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors
      });
    }

    const offer = await offerService.updateOffer(offerId, validation.data);

    res.json({
      success: true,
      message: "Offer updated successfully",
      offer
    });
  } catch (error) {
    console.error("Error updating offer:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update offer"
    });
  }
};

const deleteOfferPost = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { offerId } = req.params;
    await offerService.deleteOffer(offerId);

    res.json({
      success: true,
      message: "Offer deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting offer:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete offer"
    });
  }
};

export default {
  offersGet,
  createOfferPost,
  updateOfferPost,
  deleteOfferPost
};