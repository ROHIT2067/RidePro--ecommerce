import Order from '../../Models/OrderModel.js';
import User from '../../Models/UserModel.js';

const getSalesReport = async (startDate, endDate, page = 1, limit = 20, statusFilter = null) => {
  try {
    // Parse dates
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Build match criteria
    const matchCriteria = {
      order_date: { $gte: start, $lte: end },
      payment_status: { $in: ['Paid', 'Pending'] }, // Include both paid and COD orders
    };

    // Add status filter if provided
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'active') {
        // Active orders (not cancelled or returned)
        matchCriteria.order_status = { $nin: ['Cancelled', 'Returned'] };
      } else if (statusFilter === 'completed') {
        // Completed orders (delivered)
        matchCriteria.order_status = 'Delivered';
      } else if (statusFilter === 'cancelled') {
        // Cancelled orders
        matchCriteria.order_status = 'Cancelled';
      } else if (statusFilter === 'returned') {
        // Returned orders
        matchCriteria.order_status = { $in: ['Return Requested', 'Returned', 'Partially Returned'] };
      } else {
        // Specific status
        matchCriteria.order_status = statusFilter;
      }
    } else {
      // Default: exclude cancelled orders for summary calculations
      matchCriteria.order_status = { $ne: 'Cancelled' };
    }

    // Summary aggregation
    const summaryResult = await Order.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalOrderAmount: { $sum: '$total_amount' },
          totalDiscount: { 
            $sum: { 
              $subtract: ['$total_amount', { $ifNull: ['$final_amount', '$total_amount'] }] 
            }
          },
          totalNetRevenue: { $sum: { $ifNull: ['$final_amount', '$total_amount'] } },
          totalRefunds: { $sum: { $ifNull: ['$refundAmount', 0] } }
        }
      }
    ]);

    const summary = summaryResult[0] || {
      totalOrders: 0,
      totalOrderAmount: 0,
      totalDiscount: 0,
      totalNetRevenue: 0,
      totalRefunds: 0
    };

    // Calculate actual revenue (net revenue minus refunds)
    summary.actualRevenue = summary.totalNetRevenue - summary.totalRefunds;

    // Detailed orders with pagination
    const skip = (page - 1) * limit;
    
    const orders = await Order.find(matchCriteria)
    .populate({
      path: 'user_id',
      select: 'username email'
    })
    .populate({
      path: 'items.variant_id',
      populate: {
        path: 'product_id',
        select: 'productName'
      }
    })
    .sort({ order_date: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

    // Format orders for display
    const formattedOrders = orders.map(order => {
      const itemNames = order.items.map(item => 
        item.variant_id?.product_id?.productName || 'Unknown Product'
      ).join(', ');
      
      // Handle customer name properly using username
      let customerName = 'Unknown Customer';
      
      // Check if user_id exists and has username
      if (order.user_id && order.user_id.username) {
        customerName = order.user_id.username;
      }
      // If no username, try shipping address
      else if (order.shipping_address?.name) {
        customerName = order.shipping_address.name;
      }
      
      const hasCoupon = order.coupon_details && order.coupon_details.code;
      
      return {
        orderId: order.order_id,
        date: order.order_date,
        customerName: customerName,
        customerEmail: order.user_id?.email || '',
        items: itemNames,
        orderAmount: order.final_amount || order.total_amount,
        refundAmount: order.refundAmount || 0,
        couponApplied: hasCoupon ? 'Yes' : 'No',
        paymentMethod: order.payment_method.toUpperCase(),
        status: order.order_status
      };
    });

    // Get total count for pagination
    const totalCount = await Order.countDocuments(matchCriteria);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      summary,
      orders: formattedOrders,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  } catch (error) {
    console.error('Error generating sales report:', error);
    throw error;
  }
};

const getDateRange = (range) => {
  const now = new Date();
  let startDate, endDate;

  switch (range) {
    case 'daily':
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      break;
    
    case 'weekly':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      break;
    
    case 'monthly':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    
    case 'yearly':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
    
    default:
      // Default to current month with extended range
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  return { startDate, endDate };
};

const getAllOrdersForExport = async (startDate, endDate, statusFilter = null) => {
  try {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Build match criteria
    const matchCriteria = {
      order_date: { $gte: start, $lte: end },
      payment_status: { $in: ['Paid', 'Pending'] }, // Include both paid and COD orders
    };

    // Add status filter if provided
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'active') {
        // Active orders (not cancelled or returned)
        matchCriteria.order_status = { $nin: ['Cancelled', 'Returned'] };
      } else if (statusFilter === 'completed') {
        // Completed orders (delivered)
        matchCriteria.order_status = 'Delivered';
      } else if (statusFilter === 'cancelled') {
        // Cancelled orders
        matchCriteria.order_status = 'Cancelled';
      } else if (statusFilter === 'returned') {
        // Returned orders
        matchCriteria.order_status = { $in: ['Return Requested', 'Returned', 'Partially Returned'] };
      } else {
        // Specific status
        matchCriteria.order_status = statusFilter;
      }
    } else {
      // Default: exclude cancelled orders
      matchCriteria.order_status = { $ne: 'Cancelled' };
    }

    const orders = await Order.find(matchCriteria)
    .populate({
      path: 'user_id',
      select: 'username email'
    })
    .populate({
      path: 'items.variant_id',
      populate: {
        path: 'product_id',
        select: 'productName'
      }
    })
    .sort({ order_date: -1 })
    .lean();

    return orders.map(order => {
      const itemNames = order.items.map(item => 
        item.variant_id?.product_id?.productName || 'Unknown Product'
      ).join(', ');
      
      // Handle customer name properly using username
      let customerName = 'Unknown Customer';
      
      // Check if user_id exists and has username
      if (order.user_id && order.user_id.username) {
        customerName = order.user_id.username;
      }
      // If no username, try shipping address
      else if (order.shipping_address?.name) {
        customerName = order.shipping_address.name;
      }
      
      const hasCoupon = order.coupon_details && order.coupon_details.code;
      
      return {
        orderId: order.order_id,
        date: order.order_date,
        customerName: customerName,
        customerEmail: order.user_id?.email || '',
        items: itemNames,
        orderAmount: order.final_amount || order.total_amount,
        refundAmount: order.refundAmount || 0,
        couponApplied: hasCoupon ? 'Yes' : 'No',
        paymentMethod: order.payment_method.toUpperCase(),
        status: order.order_status
      };
    });
  } catch (error) {
    console.error('Error getting orders for export:', error);
    throw error;
  }
};

export default {
  getSalesReport,
  getDateRange,
  getAllOrdersForExport
};