import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

export async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
      }
    });

    const info = await transporter.sendMail({
      from: `"Team RidePro" <${process.env.NODEMAILER_EMAIL}>`,
      to: email,
      subject: "Verify your account",
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP: ${otp}</b>`
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error in sending email:", error.message);
    return false;
  }
}