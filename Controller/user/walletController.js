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
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

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
        balance: 50000,
        transactions: []
      };
      // Update the user document
      await User.findByIdAndUpdate(userId, {
        wallet: wallet
      });
    }

    // Sort transactions by date (newest first)
    const allTransactions = wallet.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Calculate pagination
    const totalTransactions = allTransactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);
    const transactions = allTransactions.slice(skip, skip + limit);

    // Pagination info
    const pagination = {
      currentPage: page,
      totalPages: totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page + 1,
      prevPage: page - 1,
      totalTransactions: totalTransactions
    };

    res.render('wallet', {
      balance: wallet.balance || 0,
      transactions,
      pagination
    });
  } catch (error) {
    console.error('Wallet page error:', error);
    res.redirect('/home');
  }
};

export default { walletGet };