import addressService from "../../service/user/addressService.js";
import { AddAddressSchema, EditAddressSchema } from "../../schemas/index.js";

const addressGet = async (req, res) => {
  try {
    const userId = req.session.user;
    const addressId = req.query.addressId;

    const { addresses, selectedAddress } = await addressService.getAddresses(
      userId,
      addressId,
    );

    // Get error message from session if any
    const addressError = req.session.addressError;
    delete req.session.addressError; // Clear the message after reading

    // Get success message from session if any
    const addressSuccess = req.session.addressSuccess;
    delete req.session.addressSuccess; // Clear the message after reading

    return res.render("addressPage", { 
      addresses, 
      selectedAddress, 
      addressError,
      addressSuccess
    });
  } catch (error) {
    console.error("Address Get Error:", error);
    return res.redirect("/account");
  }
};

const addressAddGet = (req, res) => {
  const user = req.session.user;
  const error = req.session.flash?.error || null;
  delete req.session.flash;
  
  return res.render("addressAdd", { 
    user: user,
    query: req.query,
    error: error
  });
};

const addressAddPost = async (req, res) => {
  try {
    const result = AddAddressSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const firstError = Object.values(errors)[0]?.[0] || "Validation failed";
      req.session.flash = { error: firstError };
      return res.redirect("/account/address/add");
    }

    const userId = req.session.user;
    await addressService.addAddress(userId, result.data);

    // Check if user came from checkout (indicated by fromCheckout query parameter)
    const fromCheckout = req.body.fromCheckout || req.query.fromCheckout;
    if (fromCheckout === 'true') {
      req.session.addressSuccess = "Address added successfully! You can now proceed with checkout.";
      return res.redirect("/checkout");
    }

    req.session.addressSuccess = "Address added successfully!";
    return res.redirect("/account/address");
  } catch (error) {
    console.error("Error adding address:", error);
    if (
      error.message === "All fields are required" ||
      error.message === "Pincode must be 6 digits" ||
      error.message === "Mobile number must be 10 digits" ||
      error.message === "Area must be at most 50 characters" ||
      error.message === "District must be at most 50 characters"
    ) {
      req.session.flash = { error: error.message };
      return res.redirect("/account/address/add");
    }
    req.session.flash = { error: "Failed to add address. Please try again." };
    return res.redirect("/account/address/add");
  }
};

const addressEditGet = async (req, res) => {
  try {
    const userId = req.session.user;
    const addressId = req.params.id;
    const error = req.session.flash?.error || null;
    delete req.session.flash;

    const addressToEdit = await addressService.getEditAddressData(
      userId,
      addressId,
    );

    return res.render("addressEdit", { 
      address: addressToEdit,
      error: error
    });
  } catch (error) {
    console.error("Address Edit Get Error:", error);
    if (error.message === "Address not found") {
      req.session.addressError = "Address not found.";
    } else {
      req.session.addressError = "Failed to load address details.";
    }
    return res.redirect("/account/address");
  }
};

const addressEditPost = async (req, res) => {
  try {
    const validationData = { ...req.body, addressId: req.params.id };
    const result = EditAddressSchema.safeParse(validationData);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const firstError = Object.values(errors)[0]?.[0] || "Validation failed";
      req.session.flash = { error: firstError };
      return res.redirect(`/account/address/edit/${req.params.id}`);
    }

    const userId = req.session.user;
    const addressId = req.params.id;

    await addressService.updateAddress(userId, addressId, result.data);

    req.session.addressSuccess = "Address updated successfully!";
    return res.redirect("/account/address/");
  } catch (error) {
    console.error("Error updating Address:", error);
    if (
      error.message === "All fields are required" ||
      error.message === "Pincode must be 6 digits" ||
      error.message === "Mobile number must be 10 digits" ||
      error.message === "Area must be at most 50 characters" ||
      error.message === "District must be at most 50 characters" ||
      error.message === "User address collection not found" ||
      error.message === "Address update failed"
    ) {
      req.session.flash = { error: error.message };
      return res.redirect(`/account/address/edit/${req.params.id}`);
    }
    req.session.flash = { error: "Failed to update address. Please try again." };
    return res.redirect(`/account/address/edit/${req.params.id}`);
  }
};

const addressDeletePost = async (req, res) => {
  try {
    const addressId = req.params.id;
    await addressService.deleteAddress(addressId);

    req.session.addressSuccess = "Address deleted successfully!";
    return res.redirect("/account/address");
  } catch (error) {
    console.error("Error in deleting address:", error);
    if (error.message === "Address not found") {
      req.session.addressError = "Address not found or already deleted.";
    } else {
      req.session.addressError = "Failed to delete address. Please try again.";
    }
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
