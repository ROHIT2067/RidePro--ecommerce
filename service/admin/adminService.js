import userCollection from "../../Models/UserModel.js";
import bcrypt from "bcrypt";

const authenticateAdmin = async (email, password) => {
    const findUser = await userCollection.findOne({ email });

    if (!findUser) {
        throw new Error("You are not authorized to access the admin panel.");
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);

    if (!passwordMatch) {
        throw new Error("Invalid Credentials");
    }

    if (findUser.role !== "admin") {
        throw new Error("You are not authorized to access the admin panel.");
    }

    return findUser;
};

export default {
    authenticateAdmin,
};
