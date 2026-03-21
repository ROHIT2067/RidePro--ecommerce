import Offer from "../../Models/OfferModel.js";
import Product from "../../Models/ProductModel.js";
import Category from "../../Models/CategoryModel.js";
import { generateReferralCode, generateReferralToken } from "../../utils/referralUtils.js";

const getOffers = async (query) => {
    const page = parseInt(query.page) || 1;
    const limit = 10;
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
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1
    };
};

const createOffer = async (offerData) => {
    // Validation
    if (!offerData.name || !offerData.type || !offerData.discountValue || !offerData.startDate || !offerData.endDate) {
        throw new Error("All required fields must be filled");
    }

    if (new Date(offerData.startDate) >= new Date(offerData.endDate)) {
        throw new Error("End date must be after start date");
    }

    if (offerData.discountValue <= 0) {
        throw new Error("Discount value must be positive");
    }

    if (offerData.discountType === 'percentage' && offerData.discountValue > 100) {
        throw new Error("Percentage discount cannot exceed 100%");
    }

    const processedData = {
        name: offerData.name,
        type: offerData.type,
        discountType: offerData.discountType || 'percentage',
        discountValue: parseFloat(offerData.discountValue),
        startDate: new Date(offerData.startDate),
        endDate: new Date(offerData.endDate),
        maxUsage: offerData.maxUsage ? parseInt(offerData.maxUsage) : null
    };

    if (offerData.type === 'product' || offerData.type === 'category') {
        if (!offerData.targetId) {
            throw new Error(`${offerData.type} selection is required`);
        }
        processedData.targetId = offerData.targetId;
        processedData.targetModel = offerData.type === 'product' ? 'Product' : 'Category';
    }

    if (offerData.type === 'referral') {
        processedData.referralCode = generateReferralCode();
        processedData.referralToken = generateReferralToken();
        processedData.referrerReward = parseFloat(offerData.referrerReward) || 0;
        processedData.refereeReward = parseFloat(offerData.refereeReward) || 0;
    }

    const offer = new Offer(processedData);
    await offer.save();
    return offer;
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
        // Update other fields
        if (updateData.name) offer.name = updateData.name;
        if (updateData.discountValue) {
            if (updateData.discountValue <= 0) {
                throw new Error("Discount value must be positive");
            }
            if (offer.discountType === 'percentage' && updateData.discountValue > 100) {
                throw new Error("Percentage discount cannot exceed 100%");
            }
            offer.discountValue = parseFloat(updateData.discountValue);
        }
        if (updateData.startDate) offer.startDate = new Date(updateData.startDate);
        if (updateData.endDate) offer.endDate = new Date(updateData.endDate);
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

export default {
    getOffers,
    createOffer,
    updateOffer,
    deleteOffer
};