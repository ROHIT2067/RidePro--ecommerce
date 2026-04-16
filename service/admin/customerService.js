import userCollection from "../../Models/UserModel.js";

const getCustomers = async (query) => {
    let search = query.search || "";
    let page = parseInt(query.page, 10) || 1;
    let limit = 4;

    const filter = {
        role: "user",
        $or: [
            { username: { $regex: "^" + search, $options: "i" } },
            { email: { $regex: "^" + search, $options: "i" } },
        ],
    };

    const userData = await userCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit);

    const count = await userCollection.countDocuments(filter);
    const totalPages = Math.ceil(count / limit);

    return {
        customers: userData,
        currentPage: page,
        search,
        totalPages,
    };
};

const updateCustomerStatus = async (userId, status) => {
    if (!userId || !status) {
        throw new Error("Missing Data");
    }

    if (!["block", "unblock"].includes(status)) {
        throw new Error("Invalid Status");
    }

    const isBlocked = status === "block";

    const updateUser = await userCollection.findByIdAndUpdate(
        userId,
        { is_blocked: isBlocked },
        { new: true }
    );

    if (!updateUser) {
        throw new Error("User not Found");
    }

    return { success: true };
};

export default {
    getCustomers,
    updateCustomerStatus,
};
