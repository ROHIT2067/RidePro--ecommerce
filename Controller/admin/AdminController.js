import userCollection from "../../Models/UserModel.js";
import address from "../../Models/AddressModel.js";
import bcrypt from "bcrypt";





const adminLoginGet = (req, res) => {
  if (req.session.user) {
    return res.redirect("/home");
  }
  if (!req.session.admin) {
    if (!req.session.user) {
      const loginErr = req.session.loginErr || null;
      const loginErr1 = req.session.loginErr1 || null;

      delete req.session.loginErr;
      delete req.session.loginErr1;

      res.render("adminLogin", {
        loginErr1: loginErr1,
        loginErr: loginErr,
      });
    } else {
      res.redirect("/home");
    }
  } else {
    res.redirect("/admin/dashboard");
  }
};

const adminLoginPost = async (req, res) => {
  try {
    const { email, password } = req.body;

    const findUser = await userCollection.findOne({ email });

    if (!findUser) {
      req.session.loginErr = "You are not authorized to access the admin panel.";
      return res.redirect("/admin/login");
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);

    if (passwordMatch) {
      req.session.role = findUser.role;
      if(req.session.role==="admin"){
        req.session.admin=findUser._id
        return res.redirect("/admin/dashboard");
      }else{
       req.session.loginErr = "You are not authorized to access the admin panel.";
      return res.redirect("/admin/login");
      }
    } else {
      req.session.loginErr = "Invalid Credentials";
      return res.redirect("/admin/login");
    }
  } catch (error) {
    console.error("login error ", error);
    req.session.loginErr = "Server Error";
    return res.redirect("/admin/login");
  }
};

const adminDashboardGet=(req,res)=>{
    if(req.session.user){
        return res.redirect('/home')
    }

    if(!req.session.admin){
        return res.redirect('/login')
    }

    return res.render('adminDashboard',{ success_msg: req.session.success_msg || '',
        error_msg: req.session.error_msg || '',})
}

const logOut = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.log("error in destroying session : ", err);
        return res.render("adminDashboard");
      }

      res.clearCookie("connect.sid");
      res.set("Cache-Control", "no-store");
      return res.redirect("/login");
    });
  } catch (error) {
    console.log("Error in logging out : ", error);
    return res.redirect("/admin/dashboard");
  }
};

export default {adminDashboardGet,logOut,adminLoginGet,adminLoginPost}