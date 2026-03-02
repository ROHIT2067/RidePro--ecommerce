import mongoose, { Schema } from "mongoose";

const productSchema = new Schema(
  {
    productName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    rating: {
      type: Number,
      default: 0,
    },
    review_count: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Available", "Out Of Stock"],
      required: true,
      default: "Available",
    },
  },
  { timestamps: true },
);

const Product = mongoose.model("Product", productSchema);

export default Product;
