import express from "express"
const app=express()
import nocache from "nocache"
import session from "express-session";
import MongoStore from "connect-mongo";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import methodOverride from "method-override"
import userRouter from "./Routes/UserRoutes.js"
import path, { dirname } from "path";
dotenv.config();
import passport from "./Config/passport.js";
import { attachUserToLocals } from "./middlewares/attachUser.js";
import { startCacheCleanup, checkUserBlocked } from "./middlewares/blockCheckMiddleware.js";
import connectDB from "./Config/databaseConnect.js"
import adminRouter from "./Routes/AdminRoutes.js"

const PORT = process.env.PORT;



connectDB()

// Start cache cleanup for blocked user status (runs every 5 minutes)
startCacheCleanup();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.urlencoded({extended:true}))
app.use(express.json())



app.use(methodOverride('_method'))

app.set('trust proxy', 1)

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        touchAfter: 24 * 3600, // lazy session update
        collectionName: 'sessions'
    }),
    cookie: {
        secure: true, // HTTPS required for secure cookies(Remove for local)
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'none' // Important for cross-domain redirects like PayPal (Remove for local)
    },
    name: 'ridepro.session' // Custom session name
}))


app.use(attachUserToLocals)


app.use(passport.initialize());
app.use(passport.session());

app.set('view engine','ejs')
app.set('views',[path.join(__dirname,'Views/user'),path.join(__dirname,'Views/admin')])
app.use(express.static(path.join(process.cwd(), "public")));
app.use('/styles', express.static(path.join(process.cwd(), 'Styles')));
app.use('/Images', express.static(path.join(process.cwd(), 'Images')));


app.use(nocache());

// Apply blocked user check globally to all routes
// This checks if a logged-in user has been blocked by admin
app.use(checkUserBlocked);

// app.get('/',(req,res)=>res.redirect('/'))
app.use('/',userRouter)
app.use('/admin',adminRouter)

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

app.use('/', (req, res) => {
   res.render('pagenotfound')
})

app.listen(PORT,()=>console.log(`Server is running on https://ridepro.online`))