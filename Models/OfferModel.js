import mongoose from "mongoose";

const offerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['product', 'category', 'referral'],
    required: true
  },
  discountType: {
    type: String,
    enum: ['percentage', 'flat'],
    default: 'percentage'
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'targetModel'
  },
  targetModel: {
    type: String,
    enum: ['Product', 'Category']
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referralToken: {
    type: String,
    unique: true,
    sparse: true
  },
  referrerReward: {
    type: Number,
    default: 0
  },
  refereeReward: {
    type: Number,
    default: 0
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  usageCount: {
    type: Number,
    default: 0
  },
  maxUsage: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

export default mongoose.model("Offer", offerSchema);