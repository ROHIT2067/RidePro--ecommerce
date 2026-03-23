import { z } from 'zod';

// Coupon code validation - alphanumeric with - and _ allowed
const couponCodeSchema = z.string({
  required_error: "Coupon code is required"
})
.min(4, "Coupon code must be at least 4 characters")
.max(20, "Coupon code must not exceed 20 characters")
.regex(/^[A-Za-z0-9_-]+$/, "Coupon code can only contain letters, numbers, hyphens (-) and underscores (_)")
.transform(val => val.toUpperCase().trim());

// Main coupon schema
export const couponSchema = z.object({
  code: couponCodeSchema,
  discountType: z.enum(['percentage', 'flat'], {
    required_error: "Discount type is required"
  }),
  discountValue: z.number({
    required_error: "Discount value is required"
  }).positive("Discount value must be greater than 0"),
  minimumOrderAmount: z.number().min(0, "Minimum order amount cannot be negative").optional().default(0),
  maximumOrderAmount: z.number().positive("Maximum order amount must be greater than 0").optional().nullable(),
  maximumDiscountCap: z.number().positive("Maximum discount cap must be greater than 0").optional().nullable(),
  usageLimit: z.number().positive("Total usage limit must be greater than 0").optional().nullable(),
  perUserLimit: z.number().positive("Per user limit must be greater than 0").default(1),
  expiryDate: z.string().or(z.date()).transform((val) => new Date(val))
}).refine((data) => {
  if (data.discountType === 'percentage') {
    return data.discountValue >= 1 && data.discountValue <= 100;
  }
  return true;
}, {
  message: "Percentage discount must be between 1-100%",
  path: ["discountValue"]
}).refine((data) => {
  if (data.minimumOrderAmount && data.maximumOrderAmount) {
    return data.minimumOrderAmount < data.maximumOrderAmount;
  }
  return true;
}, {
  message: "Minimum order amount must be less than maximum order amount",
  path: ["maximumOrderAmount"]
}).refine((data) => {
  const now = new Date();
  return data.expiryDate > now;
}, {
  message: "Expiry date must be in the future",
  path: ["expiryDate"]
}).refine((data) => {
  if (data.discountType === 'flat' && data.maximumOrderAmount) {
    return data.discountValue <= data.maximumOrderAmount;
  }
  return true;
}, {
  message: "Flat discount value cannot exceed maximum order amount",
  path: ["discountValue"]
});

export default { couponSchema };