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

const User = mongoose.model("User", userSchema);

export default User;
