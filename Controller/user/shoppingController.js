import shoppingService from "../../service/user/shoppingService.js";

const productsGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const data = await shoppingService.getProductsList(req.query);

    return res.render("productListing", data);
  } catch (error) {
    console.error("Error in loading products:", error);
    return res.redirect("/");
  }
};

const productDetailGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const data = await shoppingService.getProductDetails(req.params.id);

    return res.render("productDetail", data);
  } catch (error) {
    console.error("Error loading product detail:", error);
    return res.redirect("/products");
  }
};

export default { productsGet, productDetailGet };
