import mongoose, { Schema } from "mongoose";

const cartItemSchema = new Schema({
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
    default: 1,
  },
  price: {
    type: Number,
    required: true,
  },
});

const cartSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: [cartItemSchema],
  },
  { timestamps: true }
);

cartSchema.methods.getTotalItems = function () {
  return this.items.reduce((total, item) => total + item.quantity, 0);
};

cartSchema.methods.getTotalPrice = async function () {
  await this.populate("items.variant_id");
  return this.items.reduce((total, item) => {
    // Only count available items in the total price
    const variant = item.variant_id;
    if (variant && variant.stock_quantity > 0 && variant.status === "Available") {
      return total + (variant.price * item.quantity);
    }
    return total;
  }, 0);
};

export default mongoose.model("Cart", cartSchema);