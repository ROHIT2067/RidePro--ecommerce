import userCollection from "../../Models/UserModel.js";
import address from "../../Models/AddressModel.js";

const addressGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user;

    const userAddresses = await address.findOne({ user_id: userId }).lean();
    // console.log(userAddresses);

    const addresses = userAddresses?.address || [];

    let selectedAddress = null;

    if (addresses.length > 0) {
      const addressId = req.query.addressId;
      selectedAddress = addressId
        ? addresses.find((a) => a._id.toString() === addressId)
        : addresses[0];
    }

    return res.render("addressPage", { addresses, selectedAddress });
  } catch (error) {
    console.log("Address Get Error : ", error);
    return res.redirect("/account");
  }
};

const addressAddGet = (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }

  if (!req.session.user) {
    return res.redirect("/login");
  }

  const user = req.session.user;
  return res.render("addressAdd", { user: user });
};

const addressAddPost = async (req, res) => {
  try {
    const userId = req.session.user;

    const userData = await userCollection.findOne({ user_id: userId });

    const { name, area, district, state, pincode, country, mobile } = req.body;

    // Validation
    if (
      !name ||
      !area ||
      !district ||
      !state ||
      !pincode ||
      !country ||
      !mobile
    ) {
      req.session.flash = { error: "All fields are required" };
      return res.redirect("/account/address/add");
    }

    // Pincode validation
    if (!/^\d{6}$/.test(pincode)) {
      req.session.flash = { error: "Pincode must be 6 digits" };
      return res.redirect("/account/address/add");
    }

    // Mobile validation
    if (!/^\d{10}$/.test(mobile)) {
      req.session.flash = { error: "Mobile number must be 10 digits" };
      return res.redirect("/account/address/add");
    }
    if (area.length > 50) {
      req.session.flash = { error: "Area must be at most 50 characters" };
      return res.redirect("/account/address/add");
    }

    if (district.length > 50) {
      req.session.flash = { error: "District must be at most 50 characters" };
      return res.redirect("/account/address/add");
    }

    const userAddress = await address.findOne({ user_id: userId });

    if (!userAddress) {
      const newAddress = new address({
        user_id: userId,
        address: [
          {
            name: name,
            mobile: mobile,
            area: area,
            district: district,
            state: state,
            country: country,
            pincode: pincode,
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

    // req.session.flash = { success: "Address added successfully" };
    return res.redirect("/account/address");
  } catch (error) {
    console.error("Error adding address : ", error);
    return res.redirect("/pageNotFound");
  }
};

const addressEditGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user;
    const addressId = req.params.id;

    const userAddresses = await address
      .findOne(
        { user_id: userId, "address._id": addressId },
        { "address.$": 1 }, //return only the matched address inside the address array, instead of the full array.
      )
      .lean();

    if (!userAddresses) {
      return res.redirect("/account/address");
    }

    const addressToEdit = userAddresses.address[0]; //gets the matched address from the array.

    if (!addressToEdit) {
      return res.redirect("/account/address");
    }

    return res.render("addressEdit", { address: addressToEdit });
  } catch (error) {
    console.log("Address Edit Get Error : ", error);
    return res.redirect("/account/address");
  }
};

const addressEditPost = async (req, res) => {
  try {
    const userId = req.session.user;
    const addressId = req.params.id;

    const { name, area, district, state, pincode, country, mobile } = req.body;

    if (
      !name ||
      !area ||
      !district ||
      !state ||
      !pincode ||
      !country ||
      !mobile
    ) {
      req.session.flash = { error: "All fields are required" };
      return res.redirect(`/account/address/edit/${addressId}`);
    }

    // pin validation
    if (!/^\d{6}$/.test(pincode)) {
      req.session.flash = { error: "Pincode must be 6 digits" };
      return res.redirect(`/account/address/edit/${addressId}`);
    }

    // mobile validation
    if (!/^\d{10}$/.test(mobile)) {
      req.session.flash = { error: "Mobile number must be 10 digits" };
      return res.redirect(`/account/address/edit/${addressId}`);
    }

    if (area.length > 50) {
      req.session.flash = { error: "Area must be at most 50 characters" };
      return res.redirect("/account/address/add");
    }

    if (district.length > 50) {
      req.session.flash = { error: "District must be at most 50 characters" };
      return res.redirect("/account/address/add");
    }

    const userAddress = await address.findOne({ user_id: userId });

    if (!userAddress) {
      return res.redirect("/account/address");
    }

    await address.updateOne(
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
      },
    );

    // req.session.flash = { success: "Address updated successfully" };
    return res.redirect("/account/address/");
  } catch (error) {
    console.log("Error updating Address : ", error);
    req.session.flash = { error: "Failed to update address" };
    return res.redirect(`/account/address/edit/${req.params.id}`);
  }
};

const addressDeletePost = async (req, res) => {
  try {
    const addressId = req.params.id;

    const findAddress = await address.findOne({ "address._id": addressId });

    if (!findAddress) {
      return res.redirect("/account/address");
    }

    await address.updateOne(
      {
        "address._id": addressId,
      },
      {
        $pull: {
          address: {
            _id: addressId,
          },
        },
      },
    );

    return res.redirect("/account/address");
  } catch (error) {
    console.log("Error in deleting : ", error);
    return res.redirect("/account/address");
  }
};

export default {
  addressGet,
  addressAddGet,
  addressAddPost,
  addressEditGet,
  addressEditPost,
  addressDeletePost,
};
