import User from "../../Models/UserModel.js";

const walletGet = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user;
    const user = await User.findById(userId).select('wallet');
    
    if (!user) {
      return res.redirect('/login');
    }

    // Ensure wallet is in correct format
    let wallet = user.wallet;
    if (typeof wallet === 'number') {
      wallet = {
        balance: wallet,
        transactions: []
      };
      // Update the user document
      await User.findByIdAndUpdate(userId, {
        wallet: wallet
      });
    } else if (!wallet) {
      wallet = {
        balance: 0,
        transactions: []
      };
      // Update the user document
      await User.findByIdAndUpdate(userId, {
        wallet: wallet
      });
    }

    const transactions = wallet.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.render('wallet', {
      balance: wallet.balance || 0,
      transactions
    });
  } catch (error) {
    console.error('Wallet page error:', error);
    res.redirect('/home');
  }
};

export default { walletGet };