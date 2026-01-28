import { z } from "zod";
import userCollection from "../Models/UserModel.js";

const loginGet = (req, res) => {
  if (!req.session.admin) {
    if (!req.session.user) {
      res.render("login", {
        loginErr1: req.session.loginErr1,
        loginErr: req.session.loginErr,
      });
    } else {
      res.redirect("/home");
    }
  } else {
    res.redirect("/admin/adminHome");
  }
};

const signupGet = (req, res) => {
  if (!req.session.admin) {
    if (!req.session.user) {
      res.render("signup", {
        err: req.session.err,
        err1: req.session.err1,
        err2: req.session.err2,
      });
    } else {
      return res.redirect("/home");
    }
  }
};

const homeGet = (req, res) => {
  if (!req.session.admin) {
    if (!req.session.user) {
      return res.redirect("/login");
    } else {
      return res.render("home");
    }
  }
  return res.redirect("/admin/adminHome");
};

// const signUppost = async (req, res) => {
//   // console.log("BODY:", req.body);

//   if (req.session.admin) {
//     return res.redirect("/admin/adminHome");
//   }
//   const signupSchema = z.object({
//     username: z
//       .string()
//       .min(3, "Username must be at least 3 characters")
//       .max(20, "Username must be at most 20 characters")
//       .regex(
//         /^[a-zA-Z][a-zA-Z0-9_]*$/,
//         "Username must start with a letter and contain only letters, numbers, underscores",
//       ),
//     email: z.string().email("Invalid email format"),
//     phoneNumber: z
//       .string()
//       .regex(/^\d{10}$/, "Phone number must be exactly 10 digits"),
//     password: z
//       .string()
//       .min(6, "Password must be at least 6 characters")
//       .max(15, "Password must be at most 20 characters")
//       .regex(
//         /^[a-zA-Z0-9_]+$/,
//         "Password can contain only letters, numbers, underscores",
//       ),
//   });
//   // console.log(req.body)

//   const result = signupSchema.safeParse(req.body);

//   if (!result.success) {
//     console.log(result.error.format());
//     return res.redirect("/signup");
//   }

//   const { username, email, phoneNumber, password } = result.data;

//   const existEmail = await userCollection.findOne({ email });

//   if (existEmail) {
//     req.session.err2 = "User already exists";
//     return res.redirect("/signup");
//   }

//   req.session.user = username;

//   await userCollection.create({
//     username,
//     email,
//     phoneNumber,
//     password,
//   });
//   // console.log("HI");
//   return res.redirect("/home");
// };

const signUppost= async (req,res)=>{
  const {username,email,phoneNumber,password}=req.body

  const newUser= new userCollection({username,email,phoneNumber,password})

  await newUser.save()

  return res.redirect('/home')
}

const loginPost = async (req, res) => {
  // console.log("BODY", req.body);
  if (req.session.admin) {
    return res.redirect("/admin/adminHome");
  }

  const loginSchema = z.object({
    email: z.string().email("Invalid Email Format"),
    password: z.string().min(1, "Password Is Required"),
  });

  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    req.session.loginErr = result.error.format().email?._errors[0] || "";
    req.session.loginErr1 = result.error.format().password?._errors[0] || "";
    return res.redirect("/login");
  }

  const { email, password } = result.data;

  const user = await userCollection.findOne({ email });

  if (!user) {
    req.session.loginErr = "User Not Found";
    return res.redirect("/login");
  }

  if (user.password !== password) {
    req.session.loginErr1 = "Invalid Credentials";
    return res.redirect("/login");
  }
  req.session.user = user.username;
  return res.redirect("/home");
};

export default { loginGet, loginPost, homeGet, signUppost, signupGet };
