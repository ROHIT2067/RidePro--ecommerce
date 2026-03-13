import express from "express";
const router = express.Router();
import adminController from "../Controller/admin/adminController.js";
import customerController from "../Controller/admin/customerController.js";
import { blockIfLoggedIn } from "../middlewares/authMiddleware.js";
import categoryController from "../Controller/admin/categoryController.js"
import productController from "../Controller/admin/productController.js";
import orderController from "../Controller/admin/orderController.js";
import  upload  from '../middlewares/multer.js';


// login Management
router.get("/login",blockIfLoggedIn, adminController.adminLoginGet);
router.post("/login", adminController.adminLoginPost);
router.get("/logout", adminController.logOut);

router.get("/dashboard",blockIfLoggedIn, adminController.adminDashboardGet);

// Customer Management
router.get("/customers",blockIfLoggedIn, customerController.customerGet);
router.post("/customers/update-status",customerController.updateCustomerStatusPost,);

// Category Management
router.get('/category',blockIfLoggedIn,categoryController.categoryInfoGet)
router.post('/category/add',categoryController.addCategoryPost)
router.post("/category/toggle/:catId", categoryController.categoryDelete);
router.get("/category/edit/:catId", categoryController.categoryEditGet);
router.post("/category/edit/:catId", categoryController.categoryEditPost);

// Product Management
router.get('/products',blockIfLoggedIn,productController.productsGet)
router.post('/products/toggle/:id',productController.toggleProductPost)
router.get('/addProduct',blockIfLoggedIn,productController.addProductGet)
router.post('/addProduct', upload.any(), productController.addProductPost);
router.get('/editProduct/:id',blockIfLoggedIn,productController.editProductGet)
router.post('/editProduct/:id',upload.any(),productController.editProductPost)

// Order Management
router.get('/orders', blockIfLoggedIn, orderController.ordersGet)
router.get('/orders/:id', blockIfLoggedIn, orderController.orderDetailsGet)
router.post('/orders/update-status', orderController.updateOrderStatusPost)
router.post('/orders/approve-return', orderController.approveOrderReturnPost)
router.post('/orders/reject-return', orderController.rejectOrderReturnPost)
router.post('/orders/items/:itemId/approve-return', orderController.approveReturnPost)
router.post('/orders/items/:itemId/reject-return', orderController.rejectReturnPost)

export default router;
