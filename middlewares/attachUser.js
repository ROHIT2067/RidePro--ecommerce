import userCollection from "../Models/UserModel.js";

export const attachUserToLocals = async (req, res, next) => {
  try {
    if (!req.session.user) {
      res.locals.currentUser = null;
      return next();
    }

    const user = await userCollection.findById(req.session.user).select("username");
    res.locals.currentUser = user;
    next();
  } catch (err) {
    console.error("userContext error", err);
    res.locals.currentUser = null;
    next();
  }
};


