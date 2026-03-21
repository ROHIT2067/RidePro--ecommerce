import mongoose from "mongoose";

const referralSchema = new mongoose.Schema({
  referrerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  refereeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  offerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Offer',
    required: true
  },
  referralCode: {
    type: String,
    required: true
  },
  referralToken: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'expired'],
    default: 'completed'
  },
  referrerRewardGiven: {
    type: Boolean,
    default: false
  },
  refereeRewardGiven: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

export default mongoose.model("Referral", referralSchema);