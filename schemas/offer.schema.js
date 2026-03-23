import { z } from 'zod';

// Common discount validation
const discountValidation = z.object({
  discountType: z.enum(['percentage', 'flat'], {
    required_error: "Discount type is required",
    invalid_type_error: "Discount type must be either 'percentage' or 'flat'"
  }),
  discountValue: z.number({
    required_error: "Discount value is required",
    invalid_type_error: "Discount value must be a number"
  }).positive("Discount value must be greater than 0")
}).refine((data) => {
  if (data.discountType === 'percentage') {
    return data.discountValue >= 1 && data.discountValue <= 100;
  }
  return data.discountValue > 0;
}, {
  message: "Percentage discount must be between 1-100%, flat discount must be greater than 0",
  path: ["discountValue"]
});

// Date validation
const dateValidation = z.object({
  startDate: z.string().or(z.date()).transform((val) => new Date(val)),
  endDate: z.string().or(z.date()).transform((val) => new Date(val))
}).refine((data) => {
  return data.startDate < data.endDate;
}, {
  message: "Start date must be before end date",
  path: ["endDate"]
}).refine((data) => {
  const now = new Date();
  return data.endDate > now;
}, {
  message: "End date must be in the future",
  path: ["endDate"]
});

// Base offer schema
const baseOfferSchema = z.object({
  name: z.string({
    required_error: "Offer name is required"
  }).min(2, "Offer name must be at least 2 characters")
    .max(100, "Offer name must not exceed 100 characters")
    .trim(),
  
  type: z.enum(['product', 'category', 'referral'], {
    required_error: "Offer type is required"
  }),
  
  maxUsage: z.number().positive().optional().nullable()
}).merge(discountValidation).merge(dateValidation);

// Product offer schema
export const productOfferSchema = baseOfferSchema.extend({
  type: z.literal('product'),
  targetId: z.string({
    required_error: "Product selection is required"
  }).min(1, "Please select a product")
});

// Category offer schema
export const categoryOfferSchema = baseOfferSchema.extend({
  type: z.literal('category'),
  targetId: z.string({
    required_error: "Category selection is required"
  }).min(1, "Please select a category")
});

// Referral offer schema
export const referralOfferSchema = baseOfferSchema.extend({
  type: z.literal('referral'),
  referrerReward: z.number().min(0, "Referrer reward must be 0 or greater").max(1000, "Referrer reward cannot exceed ₹1,000").optional(),
  refereeReward: z.number().min(0, "Referee reward must be 0 or greater").max(1000, "Referee reward cannot exceed ₹1,000").optional()
}).refine((data) => {
  // At least one reward must be specified for referral offers
  return (data.referrerReward && data.referrerReward > 0) || (data.refereeReward && data.refereeReward > 0);
}, {
  message: "At least one reward (referrer or referee) must be greater than 0",
  path: ["referrerReward"]
});

// Combined offer schema
export const offerSchema = z.discriminatedUnion('type', [
  productOfferSchema,
  categoryOfferSchema,
  referralOfferSchema
]);

export default {
  offerSchema,
  productOfferSchema,
  categoryOfferSchema,
  referralOfferSchema
};