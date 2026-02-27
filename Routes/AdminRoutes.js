import express from "express";
const router = express.Router();
import adminController from "../Controller/admin/AdminController.js";
import customerController from "../Controller/admin/customerController.js";
import { blockIfLoggedIn } from "../middlewares/authMiddleware.js";
import categoryController from "../Controller/admin/categoryController.js"

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

export default router;
