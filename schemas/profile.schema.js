import { z } from 'zod';

// Indian mobile number validation
const mobileNumberSchema = z.string({
  required_error: "Mobile number is required"
})
.min(1, "Mobile number is required")
.regex(/^[6-9]\d{9}$/, "Mobile number must be a valid 10-digit Indian number starting with 6, 7, 8, or 9")
.length(10, "Mobile number must be exactly 10 digits");

// Username validation
const usernameSchema = z.string({
  required_error: "Username is required"
})
.min(2, "Username must be at least 2 characters")
.max(50, "Username must be at most 50 characters")
.regex(/^[a-zA-Z0-9_\s]+$/, "Username can only contain letters, numbers, underscores, and spaces")
.transform(val => val.trim());

// Email validation
const emailSchema = z.string({
  required_error: "Email is required"
})
.email("Please enter a valid email address")
.min(1, "Email is required")
.max(100, "Email must be at most 100 characters")
.transform(val => val.toLowerCase().trim());

// Profile update schema
export const ProfileUpdateSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  phone: mobileNumberSchema
}).refine((data) => {
  // Additional validation can be added here if needed
  return true;
}, {
  message: "Profile validation failed"
});

export default {
  ProfileUpdateSchema,
  mobileNumberSchema,
  usernameSchema,
  emailSchema
};