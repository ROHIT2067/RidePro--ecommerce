// config/databaseConnect.js
import mongoose from "mongoose";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected successfully");
  } catch (err) {
    console.error("Database connection error:", err);
    process.exit(1);
  }
};
console.log("DB CONNECTED");


export default connectDB;
