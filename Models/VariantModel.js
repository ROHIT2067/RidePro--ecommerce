import mongoose, { Schema } from "mongoose";

const variantSchema = new Schema(
  {
    product_id: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    size: {
      type: String,
      required: true,
      trim: true,
    },

    color: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    stock_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    images: {
      type: [String],
      default: [],
    },

    status: {
      type: String,
      enum: ["Available", "Out Of Stock"],
      default: "Available",
    },
  },
  { timestamps: true },
);

const Variant = mongoose.model("Variant", variantSchema);

export default Variant;
