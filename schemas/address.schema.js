import { z } from 'zod';

export const AddAddressSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(50, 'Name must be at most 50 characters')
    .regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters and spaces'),
  
  mobile: z.string()
    .min(1, 'Mobile number is required')
    .regex(/^\d{10}$/, 'Mobile number must be exactly 10 digits'),
  
  area: z.string()
    .min(1, 'Area is required')
    .max(50, 'Area must be at most 50 characters'),
  
  district: z.string()
    .min(1, 'District is required')
    .max(50, 'District must be at most 50 characters'),
  
  state: z.string()
    .min(1, 'State is required')
    .max(50, 'State must be at most 50 characters'),
  
  country: z.string()
    .min(1, 'Country is required')
    .max(50, 'Country must be at most 50 characters'),
  
  pincode: z.string()
    .min(1, 'Pincode is required')
    .regex(/^\d{6}$/, 'Pincode must be exactly 6 digits')
});

export const EditAddressSchema = z.object({
  addressId: z.string()
    .min(1, 'Address ID is required'),
  
  name: z.string()
    .min(1, 'Name is required')
    .max(50, 'Name must be at most 50 characters')
    .regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters and spaces'),
  
  mobile: z.string()
    .min(1, 'Mobile number is required')
    .regex(/^\d{10}$/, 'Mobile number must be exactly 10 digits'),
  
  area: z.string()
    .min(1, 'Area is required')
    .max(50, 'Area must be at most 50 characters'),
  
  district: z.string()
    .min(1, 'District is required')
    .max(50, 'District must be at most 50 characters'),
  
  state: z.string()
    .min(1, 'State is required')
    .max(50, 'State must be at most 50 characters'),
  
  country: z.string()
    .min(1, 'Country is required')
    .max(50, 'Country must be at most 50 characters'),
  
  pincode: z.string()
    .min(1, 'Pincode is required')
    .regex(/^\d{6}$/, 'Pincode must be exactly 6 digits')
});