import addressService from "../../service/user/addressService.js";

const addressGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user;
    const addressId = req.query.addressId;

    const { addresses, selectedAddress } = await addressService.getAddresses(
      userId,
      addressId,
    );

    return res.render("addressPage", { addresses, selectedAddress });
  } catch (error) {
    console.error("Address Get Error:", error);
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
    await addressService.addAddress(userId, req.body);

    return res.redirect("/account/address");
  } catch (error) {
    console.error("Error adding address:", error);
    if (
      error.message === "All fields are required" ||
      error.message.includes("Pincode") ||
      error.message.includes("Mobile") ||
      error.message.includes("Area") ||
      error.message.includes("District")
    ) {
      req.session.flash = { error: error.message };
      return res.redirect("/account/address/add");
    }
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

    const addressToEdit = await addressService.getEditAddressData(
      userId,
      addressId,
    );

    return res.render("addressEdit", { address: addressToEdit });
  } catch (error) {
    console.error("Address Edit Get Error:", error);
    return res.redirect("/account/address");
  }
};

const addressEditPost = async (req, res) => {
  try {
    const userId = req.session.user;
    const addressId = req.params.id;

    await addressService.updateAddress(userId, addressId, req.body);

    return res.redirect("/account/address/");
  } catch (error) {
    console.error("Error updating Address:", error);
    if (
      error.message === "All fields are required" ||
      error.message.includes("Pincode") ||
      error.message.includes("Mobile") ||
      error.message.includes("Area") ||
      error.message.includes("District")
    ) {
      req.session.flash = { error: error.message };
      return res.redirect(`/account/address/edit/${req.params.id}`);
    }
    req.session.flash = { error: "Failed to update address" };
    return res.redirect(`/account/address/edit/${req.params.id}`);
  }
};

const addressDeletePost = async (req, res) => {
  try {
    const addressId = req.params.id;
    await addressService.deleteAddress(addressId);

    return res.redirect("/account/address");
  } catch (error) {
    console.error("Error in deleting address:", error);
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
