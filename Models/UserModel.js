import mongoose, { Schema } from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: false,
      trim: true,
      sparse: true,
      default: null,
      validate: {
        validator: function(v) {
          // Allow null/empty values (not required field)
          if (!v) return true;
          // Validate Indian mobile number format
          return /^[6-9]\d{9}$/.test(v);
        },
        message: 'Mobile number must be a valid 10-digit Indian number starting with 6, 7, 8, or 9'
      }
    },
    password: {
      type: String,
      required: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    is_blocked: {
      type: Boolean,
      default: false,
    },
    google_ID: {
      type: String,
      unique: true,
      sparse: true,
    },
    cart: [
      {
        type: Schema.Types.ObjectId,
        ref: "Cart",
      },
    ],
    orderHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
    wishlist: [
      {
        type: Schema.Types.ObjectId,
        ref: "Wishlist",
      },
    ],
    wallet: {
      balance: {
        type: Number,
        default: 50000,
        min: 0,
      },
      transactions: [{
        type: {
          type: String,
          enum: ['credit', 'debit'],
          required: true,
        },
        amount: {
          type: Number,
          required: true,
        },
        description: {
          type: String,
          required: true,
        },
        orderId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Order',
          default: null,
        },
        date: {
          type: Date,
          default: Date.now,
        },
      }],
    },
    createdOn: {
      type: Date,
      default: Date.now,
    },
    avatar: {
      url: {
        type: String,
        default: null
      },
      publicId: {
        type: String,
        default: null
      }
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      minlength: 6,
      maxlength: 6
    },
    redeemed_user: {
      type: Boolean,
      default: false,
    },
    redeemed_users: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true },
);

// Create unique index for phoneNumber (sparse to allow null values)
userSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });

const User = mongoose.model("User", userSchema);

export default User;
