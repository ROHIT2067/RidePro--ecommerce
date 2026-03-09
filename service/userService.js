import userCollection from "../Models/UserModel.js";
import bcrypt from "bcrypt";
import { generateOtp } from "../utils/otp.js";
import { sendVerificationEmail } from "./mailService.js";
import { securePassword } from "../utils/passwordHash.js";
import Category from "../Models/CategoryModel.js";
import Product from "../Models/ProductModel.js";
import Variant from "../Models/VariantModel.js";

const getHomeData = async () => {
    const categories = await Category.find({ status: "Active" });

    const featuredRaw = await Product.find({ status: "Available" })
        .populate("category")
        .sort({ createdAt: -1 })
        .limit(4);

    const featuredProducts = await Promise.all(
        featuredRaw.map(async (product) => {
            const variants = await Variant.find({ product_id: product._id });
            const prices = variants.map((v) => v.price).filter(Boolean);
            const minPrice = prices.length ? Math.min(...prices) : 0;
            const maxPrice = prices.length ? Math.max(...prices) : 0;
            const firstImage = variants[0]?.images?.[0] || null;
            const isNew =
                product.createdAt &&
                Date.now() - new Date(product.createdAt) < 7 * 24 * 60 * 60 * 1000;
            return { product, minPrice, maxPrice, firstImage, isNew };
        })
    );

    return { categories, featuredProducts };
};

const signup = async (userData) => {
    const { email } = userData;
    const findUser = await userCollection.findOne({ email });
    if (findUser) {
        throw new Error("User already exists");
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
        throw new Error("Failed to send email");
    }

    return otp;
};

const verifyOtp = async (otp, sessionOtp, userData) => {
    if (otp !== sessionOtp) {
        throw new Error("Invalid OTP, Please try again");
    }

    const hashedPassword = await securePassword(userData.password);

    const saveUser = new userCollection({
        username: userData.username,
        email: userData.email,
        phoneNumber: userData.phoneNumber,
        password: hashedPassword,
    });

    await saveUser.save();
    return saveUser;
};

const resendOtp = async (userData) => {
    const { email } = userData;
    if (!email) {
        throw new Error("Email Not Found!");
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
        throw new Error("Failed to resend OTP");
    }

    return otp;
};

const authenticateUser = async (email, password) => {
    const findUser = await userCollection.findOne({ email });

    if (!findUser) {
        throw new Error("User doesn't exist");
    }

    if (findUser.is_blocked === true) {
        throw new Error("This account is Blocked");
    }

    if (!findUser.password) {
        throw new Error("This account uses Google login");
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);

    if (!passwordMatch) {
        throw new Error("Invalid Credentials");
    }

    return findUser;
};

const forgotPassword = async (email) => {
    const findUser = await userCollection.findOne({ email });

    if (!findUser) {
        throw new Error("User doesn't exist");
    }

    if (findUser.google_ID) {
        throw new Error("This account uses Google login");
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
        throw new Error("Failed to send email");
    }

    return otp;
};

const verifyPasswordOtp = async (otp, sessionOtp) => {
    if (otp !== sessionOtp) {
        throw new Error("Invalid OTP, Please try again");
    }
    return true;
};

const resendPasswordOtp = async (email) => {
    if (!email) {
        throw new Error("Email Not Found!");
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
        throw new Error("Failed to resend OTP");
    }

    return otp;
};

const resetPassword = async (email, newPassword, isVerified) => {
    if (!isVerified || !email) {
        throw new Error("Unauthorized access");
    }

    const hashedPassword = await securePassword(newPassword);

    await userCollection.updateOne(
        { email },
        { $set: { password: hashedPassword } }
    );
};

export default {
    getHomeData,
    signup,
    verifyOtp,
    resendOtp,
    authenticateUser,
    forgotPassword,
    verifyPasswordOtp,
    resendPasswordOtp,
    resetPassword,
};
