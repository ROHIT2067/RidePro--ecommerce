import Variant from "../../Models/VariantModel.js";
import Product from "../../Models/ProductModel.js";
import Category from "../../Models/CategoryModel.js";

const productsGet = async (req, res) => {
  // console.log("HII")
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    let search = req.query.search || "";
    let page = Number(req.query.page) || 1;
    let sort = req.query.sort || "newest";
    let category = req.query.category || "";
    let minPrice = Number(req.query.minPrice) || 0;
    let maxPrice = Number(req.query.maxPrice) || 999999;
    const limit = 8;

    const productFilter = {};
    if (search)
      productFilter.productName = { $regex: "^" + search, $options: "i" };
    if (category) productFilter.category = category;

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      nameAZ: { productName: 1 },
      nameZA: { productName: -1 },
    };
    const sortObj = sortMap[sort] || sortMap.newest;

    // Fetch products
    const allProducts = await Product.find(productFilter)
      .populate("category")
      .sort(sortObj);

    // Attach lowest variant price to each product
    const productsWithPrice = await Promise.all(
      allProducts.map(async (product) => {
        const variants = await Variant.find({ product_id: product._id });
        const prices = variants.map((v) => v.price).filter(Boolean);
        const minVarPrice = prices.length ? Math.min(...prices) : 0;
        const maxVarPrice = prices.length ? Math.max(...prices) : 0;
        const firstImage = variants[0]?.images?.[0] || null;
        return { product, minVarPrice, maxVarPrice, firstImage };
      }),
    );

    // Filter by price on variant price
    const priceFiltered = productsWithPrice.filter(
      ({ minVarPrice }) => minVarPrice >= minPrice && minVarPrice <= maxPrice,
    );

    // Sort by price if needed
    if (sort === "priceLow")
      priceFiltered.sort((a, b) => a.minVarPrice - b.minVarPrice);
    if (sort === "priceHigh")
      priceFiltered.sort((a, b) => b.minVarPrice - a.minVarPrice);

    const totalProducts = priceFiltered.length;
    const totalPages = Math.ceil(totalProducts / limit);
    const paginated = priceFiltered.slice((page - 1) * limit, page * limit);

    // Fetch categories for filter dropdown
    const categories = await Category.find({ status: "Active" });

    return res.render("productListing", {
      productsData: paginated,
      currentPage: page,
      totalPages,
      totalProducts,
      searchQuery: search,
      sortQuery: sort,
      categoryQuery: category,
      minPriceQuery: minPrice || "",
      maxPriceQuery: maxPrice === 999999 ? "" : maxPrice,
      categories,
    });
  } catch (error) {
    console.log("Error in loading products:", error);
    return res.redirect("/");
  }
};

export default { productsGet };
