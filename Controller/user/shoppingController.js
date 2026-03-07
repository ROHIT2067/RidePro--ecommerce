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
    let page = parseInt(req.query.page, 10) || 1;
    let sort = req.query.sort || "newest";
    let category = req.query.category || "";
    let minPrice = Number(req.query.minPrice) || 0;
    let maxPrice = Number(req.query.maxPrice) || 999999;
    let limit = 8;

    //Hides inActive products
    const activeCategories = await Category.find({ status: "Active" });
    const activeCategoryIds = activeCategories.map((c) => c._id);

    const productFilter = {
      status: "Available", 
      category: { $in: activeCategoryIds }, // hide unlisted categories
    };

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

    const allProducts = await Product.find(productFilter)
      .populate("category")
      .sort(sortObj);

    const productsWithPrice = await Promise.all(
      allProducts.map(async (product) => {
        const variants = await Variant.find({ product_id: product._id });
        const prices = variants.map((v) => v.price).filter((price) => price != null);
        const minVarPrice = prices.length ? Math.min(...prices) : 0;
        const maxVarPrice = prices.length ? Math.max(...prices) : 0;
        const firstImage = variants[0]?.images?.[0] || null;
        return { product, minVarPrice, maxVarPrice, firstImage };
      }),
    );

    const priceFiltered = productsWithPrice.filter(
      ({ minVarPrice }) => minVarPrice >= minPrice && minVarPrice <= maxPrice,
    );  //get products that only comes between min/max

    if (sort === "priceLow")     //price isnt in the product So it cant be done in sortObj
      priceFiltered.sort((a, b) => a.minVarPrice - b.minVarPrice);
    if (sort === "priceHigh")
      priceFiltered.sort((a, b) => b.minVarPrice - a.minVarPrice);

    const totalProducts = priceFiltered.length;
    const totalPages = Math.ceil(totalProducts / limit);
    const paginated = priceFiltered.slice((page - 1) * limit, page * limit);

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
      categories: activeCategories, // reuse already-fetched active categories
    });
  } catch (error) {
    console.log("Error in loading products:", error);
    return res.redirect("/");
  }
};

const productDetailGet = async (req, res) => {
  try {
    if (req.session.admin){ 
      return res.redirect("/admin/dashboard");
      }
    if (!req.session.user){
       return res.redirect("/login");
    }

    const { id } = req.params;
    const product = await Product.findById(id).populate("category");

    if (!product) return res.redirect("/products");
    if (product.status !== "Available") return res.redirect("/products");
    if (!product.category || product.category.status !== "Active")
      return res.redirect("/products");

    const variants = await Variant.find({ product_id: id });
    const selectedVariant =
      variants.find((v) => v.stock_quantity > 0) || variants[0] || null;
    const isAvailable =
      product.status === "Available" &&
      variants.some((v) => v.stock_quantity > 0);

    const relatedRaw = await Product.find({
      _id: { $ne: id },
      category: product.category._id,
      status: "Available",
    })
      .populate("category")
      .limit(4);
    const relatedProducts = await Promise.all(
      relatedRaw.map(async (rp) => {
        const vars = await Variant.find({ product_id: rp._id });
        const prices = vars.map((v) => v.price).filter(Boolean);
        return {
          product: rp,
          minVarPrice: prices.length ? Math.min(...prices) : 0,
          firstImage: vars[0]?.images?.[0] || null,
        };
      }),
    );

    // Replace with real Review  
    const reviews = [];

    return res.render("productDetail", {
      product,
      variants,
      selectedVariant,
      isAvailable,
      relatedProducts,
      reviews,
    });
  } catch (error) {
    console.log("Error loading product detail:", error);
    return res.redirect("/products");
  }
};

export default { productsGet, productDetailGet };
