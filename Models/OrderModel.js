import mongoose, { Schema } from "mongoose";

const statusHistorySchema = new Schema({
  status: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  reason: String,
});

const orderItemSchema = new Schema({
  product_id: {
    type: Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  variant_id: {
    type: Schema.Types.ObjectId,
    ref: "Variant",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
  },
  totalPrice: {
    type: Number,
    required: true,
  },
  productName: {
    type: String,
    required: true,
  },
  variantDetails: {
    size: String,
    color: String,
    images: [String],
  },
  status: {
    type: String,
    enum: ["Pending", "Confirmed", "Processing", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Return Requested", "Returned"],
    default: "Pending",
  },
  statusHistory: {
    type: [statusHistorySchema],
    default: []
  },
  cancellationReason: String,
  cancelledAt: Date,
  return_reason: String,
  return_requested_at: Date,
  returned_at: Date,
});

const returnRequestSchema = new Schema({
  itemId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  refundAmount: {
    type: Number,
    default: 0,
  },
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  processedAt: Date,
  adminReason: String,
});

const orderSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    order_id: {
      type: String,
      required: true,
      unique: true,
    },
    items: [orderItemSchema],
    cancelledItems: {
      type: [{
        itemId: Schema.Types.ObjectId,
        reason: String,
        cancelledAt: {
          type: Date,
          default: Date.now,
        },
      }],
      default: []
    },
    returnRequests: {
      type: [returnRequestSchema],
      default: []
    },
    shipping_address: {
      name: {
        type: String,
        required: true,
      },
      mobile: {
        type: String,
        required: true,
      },
      area: {
        type: String,
        required: true,
      },
      district: {
        type: String,
        required: true,
      },
      state: {
        type: String,
        required: true,
      },
      country: {
        type: String,
        required: true,
      },
      pincode: {
        type: String,
        required: true,
      },
    },
    payment_method: {
      type: String,
      enum: ["COD", "wallet", "online"],
      default: "COD",
    },
    payment_status: {
      type: String,
      enum: ["Pending", "Paid", "Failed"],
      default: "Pending",
    },
    order_status: {
      type: String,
      enum: ["Pending", "Confirmed", "Processing", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Return Requested", "Returned"],
      default: "Pending",
    },
    subtotal: {
      type: Number,
      required: true,
    },
    shipping_cost: {
      type: Number,
      required: true,
      default: 118,
    },
    total_amount: {
      type: Number,
      required: true,
    },
    coupon_discount: {
      type: Number,
      default: 0,
    },
    coupon_details: {
      couponId: {
        type: Schema.Types.ObjectId,
        ref: "Coupon",
      },
      code: String,
      discountAmount: Number,
    },
    final_amount: {
      type: Number,
      required: true,
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundStatus: {
      type: String,
      enum: ['pending', 'completed', 'not_applicable'],
      default: 'not_applicable',
    },
    refundedAt: {
      type: Date,
      default: null,
    },
    order_date: {
      type: Date,
      default: Date.now,
    },
    delivery_date: {
      type: Date,
    },
    shipped_date: {
      type: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);
