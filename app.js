import express from "express"
const app=express()
import nocache from "nocache"
import session from "express-session";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import methodOverride from "method-override"
import userRouter from "./Routes/UserRoutes.js"
import path, { dirname } from "path";
dotenv.config();

const PORT = process.env.PORT;

import connectDB from "./Config/databaseConnect.js"
connectDB()

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.urlencoded({extended:true}))
app.use(express.json())

app.use(methodOverride('_method'))

app.use(session({
    secret:"mouse",
    resave:false,
    saveUninitialized:false,
}))

app.set('view engine','ejs')
app.set('views',[path.join(__dirname,'Views/user'),path.join(__dirname,'Views/admin')])
app.use(express.static(path.join(process.cwd(), "public")));
app.use('/styles', express.static(path.join(process.cwd(), 'Styles')));


app.use(nocache());

app.get('/',(req,res)=>res.redirect('/login'))
app.use('/',userRouter)

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

app.use('/', (req, res) => {
  // console.log(req.method)
   res.render('pagenotfound')
})

app.listen(PORT,()=>console.log(`Server is running in http://localhost:${PORT}`))