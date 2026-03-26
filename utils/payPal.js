import paypalClient from "../Config/payPalConfig.js";
import checkoutNodeJssdk from "@paypal/checkout-server-sdk";

// Convert INR to USD (approximate rate - you should use a real-time API for production)
const convertINRToUSD = (inrAmount) => {
  const exchangeRate = 0.012; // 1 INR = ~0.012 USD (update this with real-time rates)
  return (inrAmount * exchangeRate).toFixed(2);
};

const createPayPalOrder = async (totalAmount) => {
  try {
    const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
    
    // Convert INR to USD for PayPal
    const usdAmount = convertINRToUSD(totalAmount);
    
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: "USD",
          value: usdAmount
        },
        description: "RidePro Order Payment"
      }],
      application_context: {
        brand_name: "RidePro",
        landing_page: "NO_PREFERENCE",
        user_action: "PAY_NOW",
        return_url: `${process.env.BASE_URL}/checkout/paypal/success`,
        cancel_url: `${process.env.BASE_URL}/checkout/paypal/cancel`
      }
    });

    const order = await paypalClient.execute(request);
    return {
      success: true,
      orderId: order.result.id,
      approvalUrl: order.result.links.find(link => link.rel === 'approve').href
    };
  } catch (error) {
    console.error("PayPal Create Order Error:", error);
    
    // Provide more specific error messages
    let errorMessage = "PayPal service temporarily unavailable";
    if (error.statusCode) {
      switch (error.statusCode) {
        case 400:
          errorMessage = "Invalid payment request";
          break;
        case 401:
          errorMessage = "PayPal authentication failed";
          break;
        case 422:
          errorMessage = "Invalid payment amount or currency";
          break;
        case 500:
          errorMessage = "PayPal server error";
          break;
      }
    }
    
    return {
      success: false,
      message: errorMessage,
      errorCode: error.statusCode || 'UNKNOWN_ERROR'
    };
  }
};

const capturePayPalOrder = async (orderId) => {
  try {
    const request = new checkoutNodeJssdk.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});

    const capture = await paypalClient.execute(request);
    
    if (capture.result.status === 'COMPLETED') {
      return {
        success: true,
        captureId: capture.result.purchase_units[0].payments.captures[0].id,
        payerEmail: capture.result.payer.email_address,
        amount: capture.result.purchase_units[0].payments.captures[0].amount.value
      };
    } else {
      return {
        success: false,
        message: "Payment capture failed - transaction not completed",
        errorCode: 'CAPTURE_FAILED'
      };
    }
  } catch (error) {
    console.error("PayPal Capture Order Error:", error);
    
    // Provide more specific error messages
    let errorMessage = "Payment capture failed";
    if (error.statusCode) {
      switch (error.statusCode) {
        case 400:
          errorMessage = "Invalid payment capture request";
          break;
        case 401:
          errorMessage = "PayPal authentication failed";
          break;
        case 404:
          errorMessage = "Payment order not found";
          break;
        case 422:
          errorMessage = "Payment cannot be captured - insufficient funds or payment method declined";
          break;
        case 500:
          errorMessage = "PayPal server error during capture";
          break;
      }
    }
    
    return {
      success: false,
      message: errorMessage,
      errorCode: error.statusCode || 'CAPTURE_ERROR'
    };
  }
};

export {
  createPayPalOrder,
  capturePayPalOrder,
  convertINRToUSD
};
