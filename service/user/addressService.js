import address from "../../Models/AddressModel.js";

const validateAddressData = (addressData) => {
    const { name, area, district, state, pincode, country, mobile } = addressData;

    if (!name || !area || !district || !state || !pincode || !country || !mobile) {
        throw new Error("All fields are required");
    }

    if (!/^\d{6}$/.test(pincode)) {
        throw new Error("Pincode must be 6 digits");
    }

    if (!/^\d{10}$/.test(mobile)) {
        throw new Error("Mobile number must be 10 digits");
    }

    if (area.length > 50) {
        throw new Error("Area must be at most 50 characters");
    }

    if (district.length > 50) {
        throw new Error("District must be at most 50 characters");
    }
};

const getAddresses = async (userId, selectedAddressId) => {
    const userAddresses = await address.findOne({ user_id: userId }).lean();
    const addresses = userAddresses?.address || [];

    let selectedAddress = null;
    if (addresses.length > 0) {
        selectedAddress = selectedAddressId
            ? addresses.find((a) => a._id.toString() === selectedAddressId)
            : addresses[0];
    }

    return { addresses, selectedAddress };
};

const addAddress = async (userId, addressData) => {
    validateAddressData(addressData);

    const { name, mobile, area, district, state, country, pincode } = addressData;
    const userAddress = await address.findOne({ user_id: userId });

    if (!userAddress) {
        const newAddress = new address({
            user_id: userId,
            address: [
                {
                    name,
                    mobile,
                    area,
                    district,
                    state,
                    country,
                    pincode,
                    is_default: true,
                },
            ],
        });
        await newAddress.save();
    } else {
        userAddress.address.push({
            name,
            mobile,
            area,
            district,
            state,
            country,
            pincode,
            is_default: false,
        });
        await userAddress.save();
    }
};

const getEditAddressData = async (userId, addressId) => {
    const userAddresses = await address.findOne(
        { user_id: userId, "address._id": addressId },
        { "address.$": 1 }
    ).lean();

    if (!userAddresses || !userAddresses.address[0]) {
        throw new Error("Address not found");
    }

    return userAddresses.address[0];
};

const updateAddress = async (userId, addressId, addressData) => {
    validateAddressData(addressData);

    const { name, mobile, area, district, state, country, pincode } = addressData;
    const userAddress = await address.findOne({ user_id: userId });

    if (!userAddress) {
        throw new Error("User address collection not found");
    }

    const result = await address.updateOne(
        { user_id: userId, "address._id": addressId },
        {
            $set: {
                "address.$.name": name,
                "address.$.mobile": mobile,
                "address.$.area": area,
                "address.$.district": district,
                "address.$.state": state,
                "address.$.country": country,
                "address.$.pincode": pincode,
            },
        }
    );

    if (result.matchedCount === 0) {
        throw new Error("Address update failed");
    }
};

const deleteAddress = async (addressId) => {
    const result = await address.updateOne(
        { "address._id": addressId },
        { $pull: { address: { _id: addressId } } }
    );

    if (result.matchedCount === 0) {
        throw new Error("Address not found");
    }
};

export default {
    getAddresses,
    addAddress,
    getEditAddressData,
    updateAddress,
    deleteAddress,
};
