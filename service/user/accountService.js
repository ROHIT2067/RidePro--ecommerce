import userCollection from "../../Models/UserModel.js";
import bcrypt from "bcrypt";
import { generateOtp } from "../../utils/otp.js";
import { sendVerificationEmail } from "./mailService.js";
import { securePassword } from "../../utils/passwordHash.js";
import cloudinary from "../../Config/cloudinary.js";
import { generateReferralCode } from "./referralService.js";

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
    const { username, email, phone } = profileData;
    const result = await userCollection.findByIdAndUpdate(userId, {
        username,
        email,
        phoneNumber: phone,
    });

    if (!result) {
        throw new Error("User not found");
    }
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
};
