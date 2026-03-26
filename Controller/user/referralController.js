import { getUserReferralStats } from '../../service/user/referralService.js';
import accountService from '../../service/user/accountService.js';

const getReferralStats = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const stats = await getUserReferralStats(req.session.user);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error getting referral stats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const referralPageGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userData = await accountService.getProfileData(req.session.user);
    return res.render("referral", { user: userData });
  } catch (error) {
    console.error("Referral page error:", error);
    return res.redirect("/account");
  }
};

export default {
  getReferralStats,
  referralPageGet
};