import { z } from 'zod';

export const ForgotPasswordSchema = z.object({
  email: z.string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
});

export const ResetPasswordSchema = z.object({
  newPassword: z.string()
    .min(1, 'New password is required')
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string()
    .min(1, 'Current password is required'),
  
  newPassword: z.string()
    .min(1, 'New password is required')
    .min(8, 'New password must be at least 8 characters')
    .max(128, 'New password must be at most 128 characters'),
  
  confirmPassword: z.string()
    .min(1, 'Confirm password is required')
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});