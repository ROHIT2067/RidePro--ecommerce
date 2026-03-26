import User from '../../Models/UserModel.js';
import Referral from '../../Models/ReferralModel.js';
import { creditWallet } from '../../utils/walletHelper.js';
import mongoose from 'mongoose';

// Generate unique 6-character alphanumeric referral code
export const generateReferralCode = async () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let isUnique = false;
  
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    // Check if code already exists
    const existingUser = await User.findOne({ referralCode: code });
    if (!existingUser) {
      isUnique = true;
    }
  }
  
  return code;
};

// Validate referral code and get referrer
export const validateReferralCode = async (referralCode) => {
  if (!referralCode || referralCode.length !== 6) {
    return { valid: false, message: 'Invalid referral code format' };
  }
  
  const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
  if (!referrer) {
    return { valid: false, message: 'Referral code not found' };
  }
  
  return { valid: true, referrer };
};

// Create referral record after successful signup
export const createReferralRecord = async (referrerId, refereeId, referralCode) => {
  try {
    const referral = new Referral({
      referrerId,
      refereeId,
      referralCode: referralCode.toUpperCase(),
      status: 'pending'
    });
    
    await referral.save();
    return referral;
  } catch (error) {
    console.error('Error creating referral record:', error);
    throw error;
  }
};

// Process referral rewards after first purchase
export const processReferralRewards = async (userId) => {
  try {
    // Find pending referral where user is the referee
    const referral = await Referral.findOne({
      refereeId: userId,
      status: 'pending',
      referrerRewardGiven: false,
      refereeRewardGiven: false
    }).populate('referrerId refereeId');
    
    if (!referral) {
      return { success: false, message: 'No pending referral found' };
    }
    
    // Credit rewards to both users
    await creditWallet(
      referral.refereeId._id,
      100,
      'Referral reward - Welcome bonus',
      null
    );
    
    await creditWallet(
      referral.referrerId._id,
      150,
      `Referral reward - Friend joined (${referral.refereeId.username})`,
      null
    );
    
    // Update referral status
    referral.referrerRewardGiven = true;
    referral.refereeRewardGiven = true;
    referral.status = 'completed';
    await referral.save();
    
    return {
      success: true,
      message: 'Referral rewards processed successfully',
      refereeReward: 100,
      referrerReward: 150
    };
  } catch (error) {
    console.error('Error processing referral rewards:', error);
    throw error;
  }
};

// Get user's referral statistics
export const getUserReferralStats = async (userId) => {
  try {
    const user = await User.findById(userId).select('referralCode');
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Convert userId to ObjectId for proper matching
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    // Get all referrals where this user is the referrer
    const allReferrals = await Referral.find({ referrerId: userObjectId });
    
    const stats = {
      referralCode: user.referralCode,
      totalReferrals: allReferrals.length,
      pendingReferrals: 0,
      completedReferrals: 0,
      totalEarned: 0
    };
    
    // Count by status
    allReferrals.forEach(referral => {
      if (referral.status === 'pending') {
        stats.pendingReferrals++;
      } else if (referral.status === 'completed') {
        stats.completedReferrals++;
      }
    });
    
    stats.totalEarned = stats.completedReferrals * 150;
    
    return stats;
  } catch (error) {
    console.error('Error getting referral stats:', error);
    throw error;
  }
};