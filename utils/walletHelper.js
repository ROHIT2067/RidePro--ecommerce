import User from '../Models/UserModel.js';

// Credit money to wallet
export const creditWallet = async (userId, amount, description, orderId = null) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Ensure wallet is in correct format
  if (typeof user.wallet === 'number') {
    user.wallet = {
      balance: user.wallet,
      transactions: []
    };
  } else if (!user.wallet) {
    user.wallet = {
      balance: 0,
      transactions: []
    };
  }

  user.wallet.balance += amount;
  user.wallet.transactions.push({
    type: 'credit',
    amount,
    description,
    orderId
  });

  await user.save();
  return user.wallet.balance;
};

// Debit money from wallet
export const debitWallet = async (userId, amount, description, orderId = null) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Ensure wallet is in correct format
  if (typeof user.wallet === 'number') {
    user.wallet = {
      balance: user.wallet,
      transactions: []
    };
  } else if (!user.wallet) {
    user.wallet = {
      balance: 0,
      transactions: []
    };
  }

  if (user.wallet.balance < amount) {
    throw new Error('Insufficient wallet balance');
  }

  user.wallet.balance -= amount;
  user.wallet.transactions.push({
    type: 'debit',
    amount,
    description,
    orderId
  });

  await user.save();
  return user.wallet.balance;
};