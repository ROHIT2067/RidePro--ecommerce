import reportService from '../../service/admin/reportService.js';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

const getSalesReportPage = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect('/admin/login');
    }

    const { range, startDate, endDate, page = 1 } = req.query;
    let dateRange;

    // Determine date range
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Validate dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        req.session.error_msg = 'Invalid date format';
        return res.redirect('/admin/reports');
      }
      
      if (start > end) {
        req.session.error_msg = 'Start date cannot be after end date';
        return res.redirect('/admin/reports');
      }
      
      dateRange = { startDate: start, endDate: end };
    } else if (range) {
      dateRange = reportService.getDateRange(range);
    } else {
      // Default to current month
      dateRange = reportService.getDateRange('monthly');
    }

    // Get report data
    const reportData = await reportService.getSalesReport(
      dateRange.startDate,
      dateRange.endDate,
      parseInt(page),
      20
    );

    // Format dates for display
    const formattedStartDate = dateRange.startDate.toISOString().split('T')[0];
    const formattedEndDate = dateRange.endDate.toISOString().split('T')[0];

    res.render('salesReport', {
      ...reportData,
      currentRange: range || 'custom',
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      success_msg: req.session.success_msg || '',
      error_msg: req.session.error_msg || ''
    });

    // Clear messages
    delete req.session.success_msg;
    delete req.session.error_msg;

  } catch (error) {
    console.error('Error loading sales report:', error);
    req.session.error_msg = 'Error loading sales report';
    res.redirect('/admin/dashboard');
  }
};

const downloadSalesReport = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect('/admin/login');
    }

    const { format, range, startDate, endDate } = req.query;
    let dateRange;

    // Determine date range
    if (startDate && endDate) {
      dateRange = { startDate: new Date(startDate), endDate: new Date(endDate) };
    } else if (range) {
      dateRange = reportService.getDateRange(range);
    } else {
      dateRange = reportService.getDateRange('monthly');
    }

    // Get summary data
    const summaryData = await reportService.getSalesReport(
      dateRange.startDate,
      dateRange.endDate,
      1,
      1
    );

    // Get all orders for export
    const allOrders = await reportService.getAllOrdersForExport(
      dateRange.startDate,
      dateRange.endDate
    );

    if (format === 'pdf') {
      await generatePDFReport(res, summaryData.summary, allOrders, dateRange);
    } else if (format === 'excel') {
      await generateExcelReport(res, summaryData.summary, allOrders, dateRange);
    } else {
      res.status(400).send('Invalid format');
    }

  } catch (error) {
    console.error('Error downloading sales report:', error);
    res.status(500).send('Error generating report');
  }
};

const generatePDFReport = async (res, summary, orders, dateRange) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' }); // Use landscape for better table width
  
  // Set response headers
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="sales-report-${dateRange.startDate.toISOString().split('T')[0]}-to-${dateRange.endDate.toISOString().split('T')[0]}.pdf"`);
  
  // Pipe the PDF to response
  doc.pipe(res);

  // Title
  doc.fontSize(20).text('Sales Report', { align: 'center' });
  doc.fontSize(12).text(`Period: ${dateRange.startDate.toLocaleDateString()} - ${dateRange.endDate.toLocaleDateString()}`, { align: 'center' });
  doc.moveDown(2);

  // Summary Cards
  doc.fontSize(16).text('Summary', { underline: true });
  doc.moveDown();
  
  doc.fontSize(12);
  doc.text(`Total Orders: ${summary.totalOrders}`);
  doc.text(`Order Amount: ₹${summary.totalOrderAmount.toLocaleString('en-IN')}`);
  doc.text(`Total Discounts: ₹${summary.totalDiscount.toLocaleString('en-IN')}`);
  doc.text(`Net Revenue: ₹${summary.totalNetRevenue.toLocaleString('en-IN')}`);
  doc.moveDown(2);

  // Orders Table
  doc.fontSize(16).text('Order Details', { underline: true });
  doc.moveDown();

  // Table headers with better column widths for landscape
  const tableTop = doc.y;
  const tableLeft = 50;
  const colWidths = [90, 70, 140, 90, 60, 80, 100]; // Adjusted for landscape
  
  doc.fontSize(10);
  doc.text('Order ID', tableLeft, tableTop);
  doc.text('Date', tableLeft + colWidths[0], tableTop);
  doc.text('Customer', tableLeft + colWidths[0] + colWidths[1], tableTop);
  doc.text('Amount', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop);
  doc.text('Coupon', tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], tableTop);
  doc.text('Payment', tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], tableTop);
  doc.text('Status', tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], tableTop);

  // Draw line under headers
  doc.moveTo(tableLeft, tableTop + 15)
     .lineTo(tableLeft + colWidths.reduce((a, b) => a + b, 0), tableTop + 15)
     .stroke();

  let currentY = tableTop + 25;

  // Table rows
  if (orders.length > 0) {
    orders.forEach((order, index) => {
      if (currentY > 500) { // Start new page if needed (landscape has more height)
        doc.addPage();
        currentY = 50;
      }

      // Handle customer name properly
      const customerName = order.customerName && order.customerName !== 'Unknown Customer' 
        ? (order.customerName.length > 18 ? order.customerName.substring(0, 18) + '...' : order.customerName)
        : 'N/A';

      doc.fontSize(9); // Smaller font for table content
      doc.text(order.orderId, tableLeft, currentY);
      doc.text(new Date(order.date).toLocaleDateString('en-GB'), tableLeft + colWidths[0], currentY);
      doc.text(customerName, tableLeft + colWidths[0] + colWidths[1], currentY, { width: colWidths[2] - 5 });
      doc.text(`₹${order.orderAmount.toLocaleString('en-IN')}`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2], currentY);
      doc.text(order.couponApplied, tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], currentY);
      doc.text(order.paymentMethod, tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], currentY);
      doc.text(order.status, tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], currentY, { width: colWidths[6] - 5 });

      currentY += 18; // Reduced line height
    });
  } else {
    doc.text('No orders found for the selected period.', tableLeft, currentY, { align: 'center' });
  }

  doc.end();
};

const generateExcelReport = async (res, summary, orders, dateRange) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sales Report');

  // Set response headers
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="sales-report-${dateRange.startDate.toISOString().split('T')[0]}-to-${dateRange.endDate.toISOString().split('T')[0]}.xlsx"`);

  // Title and period
  worksheet.addRow(['Sales Report']);
  worksheet.addRow([`Period: ${dateRange.startDate.toLocaleDateString()} - ${dateRange.endDate.toLocaleDateString()}`]);
  worksheet.addRow([]);

  // Summary section
  worksheet.addRow(['Summary']);
  worksheet.addRow(['Total Orders', summary.totalOrders]);
  worksheet.addRow(['Order Amount', `₹${summary.totalOrderAmount.toLocaleString('en-IN')}`]);
  worksheet.addRow(['Total Discounts', `₹${summary.totalDiscount.toLocaleString('en-IN')}`]);
  worksheet.addRow(['Net Revenue', `₹${summary.totalNetRevenue.toLocaleString('en-IN')}`]);
  worksheet.addRow([]);

  // Orders table headers
  worksheet.addRow(['Order Details']);
  const headerRow = worksheet.addRow([
    'Order ID',
    'Date',
    'Customer',
    'Items',
    'Order Amount',
    'Coupon Applied',
    'Payment Method',
    'Status'
  ]);

  // Style header row
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' }
  };

  // Add order data
  if (orders.length > 0) {
    orders.forEach(order => {
      worksheet.addRow([
        order.orderId,
        new Date(order.date).toLocaleDateString(),
        order.customerName,
        order.items,
        `₹${order.orderAmount.toLocaleString('en-IN')}`,
        order.couponApplied,
        order.paymentMethod,
        order.status
      ]);
    });
  } else {
    worksheet.addRow(['No orders found for the selected period.']);
  }

  // Auto-fit columns
  worksheet.columns.forEach(column => {
    column.width = 15;
  });

  // Write to response
  await workbook.xlsx.write(res);
  res.end();
};

export default {
  getSalesReportPage,
  downloadSalesReport
};