import { z } from 'zod';

// Helper to get start of today (midnight)
const getStartOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

// Helper to get end of today (23:59:59)
const getEndOfToday = () => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today;
};

// Helper to get max date (1 year from now)
const getMaxDate = () => {
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 1);
  return maxDate;
};

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

// Enhanced date validation with comprehensive checks
const dateValidation = z.object({
  startDate: z.string().or(z.date()).transform((val) => new Date(val)),
  endDate: z.string().or(z.date()).transform((val) => new Date(val))
}).refine((data) => {
  // Start date cannot be in the past (before today)
  const startOfToday = getStartOfToday();
  return data.startDate >= startOfToday;
}, {
  message: "Start date cannot be in the past. Please select today or a future date",
  path: ["startDate"]
}).refine((data) => {
  // End date must be after start date
  return data.endDate > data.startDate;
}, {
  message: "End date must be after start date",
  path: ["endDate"]
}).refine((data) => {
  // End date must be in the future (after today)
  const endOfToday = getEndOfToday();
  return data.endDate > endOfToday;
}, {
  message: "End date must be in the future",
  path: ["endDate"]
}).refine((data) => {
  // Offer duration must be at least 1 day
  const oneDayInMs = 24 * 60 * 60 * 1000;
  const duration = data.endDate.getTime() - data.startDate.getTime();
  return duration >= oneDayInMs;
}, {
  message: "Offer must run for at least 1 day",
  path: ["endDate"]
}).refine((data) => {
  // Offer cannot be longer than 1 year
  const maxDate = getMaxDate();
  return data.endDate <= maxDate;
}, {
  message: "Offer duration cannot exceed 1 year",
  path: ["endDate"]
});

// Base offer schema
const baseOfferSchema = z.object({
  name: z.string({
    required_error: "Offer name is required"
  }).min(2, "Offer name must be at least 2 characters")
    .max(100, "Offer name must not exceed 100 characters")
    .trim(),
  
  type: z.enum(['product', 'category'], {
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

// Combined offer schema
export const offerSchema = z.discriminatedUnion('type', [
  productOfferSchema,
  categoryOfferSchema
]);

export default {
  offerSchema,
  productOfferSchema,
  categoryOfferSchema
};