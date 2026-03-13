import bcrypt from "bcrypt";

export async function securePassword(password){
    try {
        const hashedPassword=await bcrypt.hash(password,10)
        return hashedPassword
    } catch (error) {
        
    }
} 