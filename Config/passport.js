import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../Models/UserModel.js";
import dotenv from "dotenv";
dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
      scope: ["profile", "email"], 
      accessType: 'offline',
      prompt: 'select_account'
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user=await User.findOne({$or:[{google_ID:profile.id},{email:profile.emails[0].value}],});
        if (user) {
          
          return done(null, user);
        } else {
          user = new User({
            username: profile.displayName,
            email: profile.emails ? profile.emails[0].value : null,
            google_ID: profile.id,
          });
          await user.save();
          
          return done(null, user);
        }
      } catch (error) {
        return done(error, null);
      }
    },
  ),
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id)
    .then((user) => {
      done(null, user);
    })
    .catch((err) => {
      done(err, null);
    });
});

export default passport;
