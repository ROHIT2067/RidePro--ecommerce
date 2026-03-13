import mongoose, { Schema } from "mongoose";

const wishlistItemSchema = new Schema({
  variant_id: {
    type: Schema.Types.ObjectId,
    ref: "Variant",
    required: true,
  },
  added_at: {
    type: Date,
    default: Date.now,
  },
});

const wishlistSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: [wishlistItemSchema],
  },
  { timestamps: true }
);

wishlistSchema.methods.hasItem = function (variantId) {
  return this.items.some(
    (item) => item.variant_id.toString() === variantId.toString()
  );
};

export default mongoose.model("Wishlist", wishlistSchema);
