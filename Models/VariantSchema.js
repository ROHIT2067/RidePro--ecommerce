import mongoose, { Schema } from "mongoose";

const variantSchema = new Schema(
  {
    product_id: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    size: {
      type: String,
      required: true,
    },
    color: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    stock_quantity: { type: Number, default: 0 },
    images: {
      type: [String],
      required: true,
    },
    status: {
      type: String,
      enum: ["Available", "Out Of Stock", "Discontinued"],
      default: "Available",
    },
  },
  { timestamps: true },
);

const Variant = mongoose.model("Variant", variantSchema);

export default Variant;

