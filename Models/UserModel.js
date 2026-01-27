import mongoose, { Schema } from "mongoose"
import { boolean } from "zod"


const userSchema=new mongoose.Schema({
    username:{
        type:String,
        required:true,
        trim:true,
    },
    email:{
        type:String,
        required:true,
        unique:true,
        lowercase:true,
        trim:true,
    },
    phoneNumber:{
        type:String,
        required:false,
        unique:true,
        trim:true,
    },
    password:{
        type:String,
        required:false
    },
    role:{
        type:String,
        enum:['user','admin'],
        default:'user',
    },
    is_blocked:{
        type:Boolean,
        default:false,
    },
    google_ID:{
        type:String,
        unique:true,
    },
    cart:[{
        type: Schema.Types.ObjectId,
        ref:"Cart",
    }],
    orderHistory:[{
        type: Schema.Types.ObjectId,
        ref:"Order",
    }],
    wishlist:[{
        type:Schema.Types.ObjectId,
        ref:"Wishlist"
    }],
    wallet:{
        type:Number,
        default:0,
    },
    createdOn:{
        type:Date,
        default:Date.now
    },
    referalCode:{
        type:String,
    },
    redeemed_user:{
        type: boolean,
    },
    redeemed_users:[{
        type:Schema.Types.ObjectId,
        ref:"User"
    }],

},{timestamps:true})

export default mongoose.model('User',userSchema)