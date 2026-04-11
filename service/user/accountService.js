import userCollection from "../../Models/UserModel.js";
import bcrypt from "bcrypt";
import { generateOtp } from "../../utils/otp.js";
import { sendVerificationEmail } from "./mailService.js";
import { securePassword } from "../../utils/passwordHash.js";
import cloudinary from "../../Config/cloudinary.js";
import { generateReferralCode } from "./referralService.js";
import { ProfileUpdateSchema } from "../../schemas/index.js";

const getProfileData = async (userId) => {
    const findUser = await userCollection.findById(userId).lean();
    if (!findUser) {
        throw new Error("User not found");
    }

    // Generate referral code if user doesn't have one (fallback)
    let referralCode = findUser.referralCode;
    if (!referralCode) {
        referralCode = await generateReferralCode();
        await userCollection.findByIdAndUpdate(userId, { referralCode });
    }

    const initials = findUser.username
        ? findUser.username.substring(0, 2).toUpperCase()
        : ":)";

    return {
        username: findUser.username || "",
        email: findUser.email || "",
        mobile: findUser.phoneNumber || "Not Provided",
        name: findUser.username || "",
        initials: initials,
        avatar: findUser.avatar || { url: null, publicId: null },
        referralCode: referralCode,
        walletBalance: findUser.wallet?.balance || 0,
    };
};

const updatePassword = async (userId, data) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match");
    }

    const findUser = await userCollection.findById(userId);
    if (!findUser) {
        throw new Error("User not found");
    }

    if (!findUser.password) {
        throw new Error("Cannot change password for Google accounts");
    }

    const passwordMatch = await bcrypt.compare(currentPassword, findUser.password);
    if (!passwordMatch) {
        throw new Error("Current password is incorrect");
    }

    const hashedPassword = await securePassword(newPassword);
    await userCollection.findByIdAndUpdate(userId, {
        $set: { password: hashedPassword },
    });
};

const initiateEmailChange = async (userId, newEmail) => {
    const findUser = await userCollection.findById(userId);
    if (!findUser) throw new Error("User not found");

    if (newEmail !== findUser.email) {
        throw new Error("Enter your current Email");
    }

    if (findUser.google_ID) {
        throw new Error("This account uses Google login");
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(newEmail, otp);

    if (!emailSent) {
        throw new Error("Failed to send email");
    }

    return otp;
};

const verifyEmailOtp = async (otp, sessionOtp) => {
    if (otp !== sessionOtp) {
        throw new Error("Invalid OTP, Please try again");
    }
    return true;
};

const resendEmailOtp = async (email) => {
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

const updateEmail = async (userId, newEmail, confirmEmail) => {
    if (newEmail !== confirmEmail) {
        throw new Error("Email do not match");
    }

    const result = await userCollection.findByIdAndUpdate(userId, {
        $set: { email: newEmail },
    });

    if (!result) {
        throw new Error("User not found");
    }
};

const updateProfile = async (userId, profileData) => {
    // Validate input data with Zod schema
    const validation = ProfileUpdateSchema.safeParse(profileData);
    
    if (!validation.success) {
        const errors = validation.error.errors.map(err => err.message).join(', ');
        throw new Error(errors);
    }

    const validatedData = validation.data;
    
    // Check if email is already taken by another user
    if (validatedData.email) {
        const existingUser = await userCollection.findOne({
            email: validatedData.email,
            _id: { $ne: userId }
        });
        
        if (existingUser) {
            throw new Error("Email is already registered with another account");
        }
    }
    
    // Check if phone number is already taken by another user
    if (validatedData.phone) {
        const existingUserWithPhone = await userCollection.findOne({
            phoneNumber: validatedData.phone,
            _id: { $ne: userId }
        });
        
        if (existingUserWithPhone) {
            throw new Error("Mobile number is already registered with another account");
        }
    }

    const result = await userCollection.findByIdAndUpdate(userId, {
        username: validatedData.username,
        email: validatedData.email,
        phoneNumber: validatedData.phone,
    }, { new: true });

    if (!result) {
        throw new Error("User not found");
    }
    
    return result;
};

const uploadToCloudinary = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "user-avatars",
                transformation: [
                    { width: 300, height: 300, crop: "fill" },
                    { quality: "auto", fetch_format: "auto" },
                ],
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        stream.end(fileBuffer);
    });
};

const uploadAvatar = async (userId, file) => {
    if (!file) {
        throw new Error("No file uploaded");
    }

    const result = await uploadToCloudinary(file.buffer);
    const user = await userCollection.findById(userId);

    if (!user) throw new Error("User not found");

    if (user.avatar && user.avatar.publicId) {
        await cloudinary.uploader.destroy(user.avatar.publicId);
    }

    user.avatar = {
        url: result.secure_url,
        publicId: result.public_id,
    };
    await user.save();

    return user.avatar;
};

const deleteAvatar = async (userId) => {
    const user = await userCollection.findById(userId);
    if (!user) {
        throw new Error("User not found");
    }

    if (user.avatar && user.avatar.publicId) {
        await cloudinary.uploader.destroy(user.avatar.publicId);
    }

    user.avatar = {
        url: null,
        publicId: null,
    };
    await user.save();
};

const checkMobileAvailability = async (mobile, excludeUserId) => {
    const existingUser = await userCollection.findOne({
        phoneNumber: mobile,
        _id: { $ne: excludeUserId }
    });
    
    return existingUser;
};

export default {
    getProfileData,
    updatePassword,
    initiateEmailChange,
    verifyEmailOtp,
    resendEmailOtp,
    updateEmail,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    checkMobileAvailability,
};
