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

    // Get separate page parameters for offers and coupons
    const offerPage = parseInt(req.query.offerPage) || 1;
    const couponPage = parseInt(req.query.couponPage) || 1;

    const offerData = await offerService.getOffers({ page: offerPage });
    const couponData = await couponService.getCoupons({ page: couponPage });
    const products = await Product.find({ status: 'Available' }).select('productName');
    const categories = await Category.find({ status: 'Active' }).select('name');

    res.render("offerPage", {
      offers: offerData.offers || [],
      coupons: couponData.coupons || [],
      products,
      categories,
      // Offer pagination
      offerCurrentPage: offerData.currentPage || 1,
      offerTotalPages: offerData.totalPages || 1,
      offerTotalCount: offerData.totalOffers || 0,
      offerHasNextPage: offerData.hasNextPage || false,
      offerHasPrevPage: offerData.hasPrevPage || false,
      offerNextPage: offerData.nextPage || 1,
      offerPrevPage: offerData.prevPage || 1,
      // Coupon pagination
      couponCurrentPage: couponData.currentPage || 1,
      couponTotalPages: couponData.totalPages || 1,
      couponTotalCount: couponData.totalCoupons || 0,
      couponHasNextPage: couponData.hasNextPage || false,
      couponHasPrevPage: couponData.hasPrevPage || false,
      couponNextPage: couponData.nextPage || 1,
      couponPrevPage: couponData.prevPage || 1
    });
  } catch (error) {
    console.error("Error loading offers:", error);
    res.redirect("/admin/dashboard");
  }
};

const editOfferGet = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/login");
    }

    const { id } = req.params;
    const offer = await offerService.getOfferById(id);
    
    if (!offer) {
      req.session.errorMsg = "Offer not found";
      return res.redirect("/admin/offers");
    }

    const products = await Product.find({ status: 'Available' }).select('productName');
    const categories = await Category.find({ status: 'Active' }).select('name');

    // Get session messages and clear them
    const successMsg = req.session.successMsg;
    const errorMsg = req.session.errorMsg;
    delete req.session.successMsg;
    delete req.session.errorMsg;

    res.render("editOffer", { 
      offer,
      products,
      categories,
      successMsg,
      errorMsg
    });
  } catch (error) {
    console.error("Error fetching offer for edit:", error);
    req.session.errorMsg = error.message || "Failed to load offer";
    res.redirect("/admin/offers");
  }
};

const editOfferPost = async (req, res) => {
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
    
    // Convert string numbers to actual numbers
    if (formData.discountValue) {
      formData.discountValue = parseFloat(formData.discountValue);
    }
    
    if (formData.maxUsage) {
      formData.maxUsage = parseInt(formData.maxUsage); 
    } else if (formData.maxUsage === '') {
      delete formData.maxUsage;
    }

    // Validate request body with Zod schema
    const validation = offerSchema.safeParse(formData);
    if (!validation.success) {
      const errors = validation.error.issues.map(err => err.message);
      
      // Get offer data and render form with errors
      const offer = await offerService.getOfferById(id);
      const products = await Product.find({ status: 'Available' }).select('productName');
      const categories = await Category.find({ status: 'Active' }).select('name');
      
      // Preserve user input but keep original targetId structure for comparison
      const offerWithInput = { 
        ...offer.toObject(), 
        ...req.body,
        // Keep original targetId for dropdown selection logic
        originalTargetId: offer.targetId
      };
      
      return res.render("editOffer", { 
        offer: offerWithInput,
        products,
        categories,
        errorMsg: errors.join(', ')
      });
    }

    await offerService.updateOffer(id, validation.data);

    req.session.successMsg = "Offer updated successfully";
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("Error updating offer:", error);
    
    try {
      // Try to get offer data and render form with error
      const offer = await offerService.getOfferById(req.params.id);
      const products = await Product.find({ status: 'Available' }).select('productName');
      const categories = await Category.find({ status: 'Active' }).select('name');
      
      // Preserve user input but keep original targetId structure for comparison
      const offerWithInput = { 
        ...offer.toObject(), 
        ...req.body,
        // Keep original targetId for dropdown selection logic
        originalTargetId: offer.targetId
      };
      
      return res.render("editOffer", { 
        offer: offerWithInput,
        products,
        categories,
        errorMsg: error.message || "Failed to update offer"
      });
    } catch (renderError) {
      // If we can't render the form, redirect with session message
      console.error("Error rendering edit form:", renderError);
      req.session.errorMsg = error.message || "Failed to update offer";
      res.redirect("/admin/offers");
    }
  }
};

const createOfferPost = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Transform form data to proper types and handle arrays
    const formData = { ...req.body };
    
    // Ensure single values for fields that might come as arrays
    Object.keys(formData).forEach(key => {
      if (Array.isArray(formData[key])) {
        formData[key] = formData[key][0]; // Take first value if array
      }
    });
    
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
      const errors = validation.error.issues.map(err => err.message);
      return res.status(400).json({
        success: false,
        message: errors.join(', ')
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
      const errors = validation.error.issues.map(err => err.message);
      return res.status(400).json({
        success: false,
        message: errors.join(', ')
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
  editOfferGet,
  editOfferPost,
  createOfferPost,
  updateOfferPost,
  deleteOfferPost
};