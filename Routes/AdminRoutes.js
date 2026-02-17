import express from "express"
const router=express.Router()
import adminController from "../Controller/admin/AdminController.js"
import customerController from "../Controller/admin/customerController.js"

// login Management
router.get('/login',adminController.adminLoginGet)
router.post('/login',adminController.adminLoginPost)
router.get('/logout',adminController.logOut)

router.get('/dashboard',adminController.adminDashboardGet)

// Customer Management
router.get('/customers',customerController.customerGet)


export default router