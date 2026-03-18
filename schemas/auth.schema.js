import { z } from 'zod';

export const SignUpSchema = z.object({
  username: z.string()
    .min(1, 'Username is required')
    .min(2, 'Username must be at least 2 characters')
    .max(50, 'Username must be at most 50 characters')
    .regex(/^[a-zA-Z0-9_\s]+$/, 'Username can only contain letters, numbers, underscores, and spaces'),
  
  email: z.string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  
  phoneNumber: z.string()
    .min(1, 'Phone number is required')
    .regex(/^\d{10}$/, 'Phone number must be exactly 10 digits'),
  
  password: z.string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
});

export const LoginSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  
  password: z.string()
    .min(1, 'Password is required')
});

export const VerifyOtpSchema = z.object({
  otp: z.string()
    .min(1, 'OTP is required')
    .regex(/^\d{6}$/, 'OTP must be exactly 6 digits')
});