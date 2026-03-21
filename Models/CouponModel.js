import mongoose from "mongoose";

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  discountType: {
    type: String,
    enum: ['percentage', 'flat'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0
  },
  minimumOrderAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  maximumOrderAmount: {
    type: Number,
    default: null,
    min: 0
  },
  maximumDiscountCap: {
    type: Number,
    default: null
  },
  usageLimit: {
    type: Number,
    default: null
  },
  perUserLimit: {
    type: Number,
    default: 1
  },
  usageCount: {
    type: Number,
    default: 0
  },
  usedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    usageCount: {
      type: Number,
      default: 1
    },
    usedAt: {
      type: Date,
      default: Date.now
    }
  }],
  expiryDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

export default mongoose.model("Coupon", couponSchema);