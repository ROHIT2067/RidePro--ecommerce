import express from "express";
const router = express.Router();
import adminController from "../Controller/admin/adminController.js";
import customerController from "../Controller/admin/customerController.js";
import { blockIfLoggedIn, requireAdmin } from "../middlewares/authMiddleware.js";
import categoryController from "../Controller/admin/categoryController.js"
import productController from "../Controller/admin/productController.js";
import orderController from "../Controller/admin/orderController.js";
import offerController from "../Controller/admin/offerController.js";
import couponController from "../Controller/admin/couponController.js";
import reportController from "../Controller/admin/reportController.js";
import  upload  from '../middlewares/multer.js';


// login Management
router.get("/login",blockIfLoggedIn, adminController.adminLoginGet);
router.post("/login", adminController.adminLoginPost);
router.get("/logout", adminController.logOut);

router.get("/dashboard", requireAdmin, adminController.adminDashboardGet);

// Customer Management
router.get("/customers", requireAdmin, customerController.customerGet);
router.post('/customers/update-status', requireAdmin, customerController.updateCustomerStatusPost);

// Category Management
router.get('/category', requireAdmin, categoryController.categoryInfoGet)
router.post('/category/add', requireAdmin, categoryController.addCategoryPost)
router.post("/category/toggle/:catId", requireAdmin, categoryController.categoryDelete);
router.get("/category/edit/:catId", requireAdmin, categoryController.categoryEditGet);
router.post("/category/edit/:catId", requireAdmin, categoryController.categoryEditPost);

// Product Management
router.get('/products', requireAdmin, productController.productsGet)
router.post('/products/toggle/:id', requireAdmin, productController.toggleProductPost)
router.get('/addProduct', requireAdmin, productController.addProductGet)
router.post('/addProduct', requireAdmin, upload.any(), productController.addProductPost);
router.get('/editProduct/:id', requireAdmin, productController.editProductGet)
router.post('/editProduct/:id', requireAdmin, upload.any(), productController.editProductPost)

// Order Management
router.get('/orders', requireAdmin, orderController.ordersGet)
router.get('/orders/:id', requireAdmin, orderController.orderDetailsGet)
router.get('/orders/:id/invoice', requireAdmin, orderController.downloadInvoiceGet)
router.post('/orders/update-status', requireAdmin, orderController.updateOrderStatusPost)
router.post('/orders/items/:itemId/approve-return', requireAdmin, orderController.approveReturnPost)
router.post('/orders/items/:itemId/reject-return', requireAdmin, orderController.rejectReturnPost)

// Offer & Coupon Management
router.get('/offers', requireAdmin, offerController.offersGet)
router.post('/offers/create', requireAdmin, offerController.createOfferPost)
router.put('/offers/:offerId', requireAdmin, offerController.updateOfferPost)
router.delete('/offers/:offerId', requireAdmin, offerController.deleteOfferPost)
router.post('/coupons/create', requireAdmin, couponController.createCouponPost)
router.get('/coupons/edit/:id', requireAdmin, couponController.editCouponGet)
router.post('/coupons/edit/:id', requireAdmin, couponController.editCouponPost)
router.put('/coupons/:couponId', requireAdmin, couponController.updateCouponPost)
router.delete('/coupons/:couponId', requireAdmin, couponController.deleteCouponPost)

// Sales Report Management
router.get('/reports', requireAdmin, reportController.getSalesReportPage)
router.get('/reports/download', requireAdmin, reportController.downloadSalesReport)

export default router;
