import Order from '../../Models/OrderModel.js';
import User from '../../Models/UserModel.js';
import Product from '../../Models/ProductModel.js';
import Category from '../../Models/CategoryModel.js';

const getDashboardStats = async () => {
  try {
    // Get current month start and end dates
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    // Get last 30 days for charts
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // 1. STATS CARDS
    
    // Total Sales (current month completed orders)
    const totalSalesResult = await Order.aggregate([
      {
        $match: {
          order_date: { $gte: currentMonthStart, $lte: currentMonthEnd },
          order_status: { $in: ['Delivered', 'Cancelled', 'Returned'] }, // Completed orders
          payment_status: 'Paid'
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$final_amount' }
        }
      }
    ]);
    const totalSales = totalSalesResult[0]?.totalSales || 0;

    // Customers (new signups this month)
    const customersCount = await User.countDocuments({
      createdOn: { $gte: currentMonthStart, $lte: currentMonthEnd },
      role: 'user'
    });

    // Orders (this month)
    const ordersCount = await Order.countDocuments({
      order_date: { $gte: currentMonthStart, $lte: currentMonthEnd }
    });
    const ordersGoal = 100;
    const ordersPercentage = Math.min((ordersCount / ordersGoal) * 100, 100);
    const ordersLeft = Math.max(ordersGoal - ordersCount, 0);

    // 2. BEST SELLING SECTION
    
    // Total sales for best selling (use same period as stats card)
    const bestSellingTotalSales = totalSales;

    // Top 3 categories by revenue
    const topCategories = await Order.aggregate([
      {
        $match: {
          order_date: { $gte: currentMonthStart, $lte: currentMonthEnd },
          order_status: { $in: ['Delivered', 'Cancelled', 'Returned'] },
          payment_status: 'Paid'
        }
      },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'variants',
          localField: 'items.variant_id',
          foreignField: '_id',
          as: 'variant'
        }
      },
      { $unwind: '$variant' },
      {
        $lookup: {
          from: 'products',
          localField: 'variant.product_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'categories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' },
      {
        $group: {
          _id: '$category._id',
          categoryName: { $first: '$category.name' },
          totalRevenue: { $sum: '$items.totalPrice' }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 3 }
    ]);

    // Add colors for chart
    const categoryColors = ['#3b82f6', '#8b5cf6', '#e5e7eb'];
    const categoriesWithColors = topCategories.map((cat, index) => ({
      ...cat,
      color: categoryColors[index] || '#9ca3af'
    }));

    // 3. RECENT ORDERS (5 most recent)
    const recentOrders = await Order.find({})
      .populate({
        path: 'items.variant_id',
        populate: {
          path: 'product_id',
          select: 'productName'
        }
      })
      .sort({ order_date: -1 })
      .limit(5)
      .lean();

    // Format recent orders
    const formattedRecentOrders = recentOrders.map(order => {
      const firstItem = order.items[0];
      const productName = firstItem?.variant_id?.product_id?.productName || 'Unknown Product';
      
      return {
        productName,
        orderDate: order.order_date,
        totalAmount: order.final_amount || order.total_amount,
        status: order.order_status
      };
    });

    // 4. CHARTS DATA (Last 30 days)
    
    // Sales chart - daily revenue for last 30 days
    const dailySales = await Order.aggregate([
      {
        $match: {
          order_date: { $gte: thirtyDaysAgo },
          order_status: { $in: ['Delivered', 'Cancelled', 'Returned'] },
          payment_status: 'Paid'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$order_date' },
            month: { $month: '$order_date' },
            day: { $dayOfMonth: '$order_date' }
          },
          dailyRevenue: { $sum: '$final_amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    // Customers chart - daily signups for last 30 days
    const dailySignups = await User.aggregate([
      {
        $match: {
          createdOn: { $gte: thirtyDaysAgo },
          role: 'user'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdOn' },
            month: { $month: '$createdOn' },
            day: { $dayOfMonth: '$createdOn' }
          },
          dailySignups: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    // Create arrays for last 30 days (fill missing days with 0)
    const salesChartData = [];
    const customersChartData = [];
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // Find sales for this date
      const salesForDate = dailySales.find(sale => 
        sale._id.year === date.getFullYear() &&
        sale._id.month === date.getMonth() + 1 &&
        sale._id.day === date.getDate()
      );
      salesChartData.push(salesForDate ? Math.round(salesForDate.dailyRevenue) : 0);
      
      // Find signups for this date
      const signupsForDate = dailySignups.find(signup => 
        signup._id.year === date.getFullYear() &&
        signup._id.month === date.getMonth() + 1 &&
        signup._id.day === date.getDate()
      );
      customersChartData.push(signupsForDate ? signupsForDate.dailySignups : 0);
    }

    return {
      // Stats Cards
      totalSales,
      customersCount,
      ordersCount,
      ordersPercentage: Math.round(ordersPercentage * 10) / 10, // Round to 1 decimal
      ordersLeft,
      
      // Best Selling
      bestSellingTotalSales,
      topCategories: categoriesWithColors,
      
      // Recent Orders
      recentOrders: formattedRecentOrders,
      
      // Charts
      salesChartData,
      customersChartData
    };
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    throw error;
  }
};

export default {
  getDashboardStats
};