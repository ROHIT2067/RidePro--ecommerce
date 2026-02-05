import nodemailer from "nodemailer"
import dotenv, { decrypt } from "dotenv";
dotenv.config();

export async function sendVerificationEmail(email,otp){
    try {
        const transporter= nodemailer.createTransport({
            service:'gmail',
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD
            }
        })

        const info= await transporter.sendMail({
            from:"Team RidePro",
            to:email,
            subject:"Verify your account",
            text:`Your OTP is ${otp}`,
            html:`<b>Your OTP : ${otp}</b>`
        })

        return info.accepted.length>0
    } catch (error) {
        console.log("Error in sending email : ",error)
        return false
    }
}