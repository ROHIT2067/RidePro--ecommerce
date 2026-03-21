import crypto from 'crypto';

export const generateReferralCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

export const generateReferralToken = () => {
  return crypto.randomBytes(16).toString('hex');
};

export const generateCouponCode = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};