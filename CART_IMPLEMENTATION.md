# Cart Management Implementation

## Overview
Cart management has been successfully implemented following your existing project architecture and coding patterns.

## Architecture

### 1. Cart Model (`Models/CartModel.js`)
**Already existed** - No changes needed
- One cart per user (unique user_id)
- Items array with: product_id, variant_id, quantity, price
- Helper methods: `getTotalItems()`, `getTotalPrice()`

### 2. Cart Service (`service/user/cartService.js`)
**Business logic layer** - Handles all cart operations

**Functions:**
- `getCart(userId)` - Fetches cart with validation and cleanup
  - Removes unavailable products
  - Adjusts quantities if stock changed
  - Marks out-of-stock items
  - Returns: items, cartCount, totalPrice, hasOutOfStock, warnings

- `addToCart(userId, variantId, quantity)` - Adds product to cart
  - Validates product exists and is available
  - Checks stock availability
  - Increases quantity if item already exists
  - Enforces max quantity limit (5 per item)

- `updateCartQuantity(userId, variantId, quantity)` - Updates item quantity
  - Validates quantity limits (1-5)
  - Checks stock availability
  - Returns updated totals for frontend

- `removeFromCart(userId, variantId)` - Removes item from cart

- `clearCart(userId)` - Empties entire cart

**Validation Rules:**
- Maximum 5 items per product variant
- Cannot add blocked/unlisted products
- Cannot add out-of-stock items
- Quantity automatically adjusted if stock decreases

### 3. Cart Controller (`Controller/user/cartController.js`)
**Request/Response handler** - Follows your existing patterns

**Routes:**
- `cartGet` - Renders cart page (GET /cart)
- `addToCartPost` - Adds item (POST /cart/add)
- `updateCartPost` - Updates quantity (POST /cart/update)
- `removeFromCartPost` - Removes item (POST /cart/remove)
- `clearCartPost` - Clears cart (POST /cart/clear)

**Features:**
- Session-based authentication
- JSON responses for AJAX calls
- Proper error handling with descriptive messages
- Admin/user session checks

### 4. Routes (`Routes/UserRoutes.js`)
Added cart routes:
```javascript
router.get('/cart', cartController.cartGet)
router.post('/cart/add', cartController.addToCartPost)
router.post('/cart/update', cartController.updateCartPost)
router.post('/cart/remove', cartController.removeFromCartPost)
router.post('/cart/clear', cartController.clearCartPost)
```

### 5. Frontend Integration (`Views/user/cart.ejs`)
**Already existed** - Fully compatible with backend

**Features:**
- Displays all cart items with images, prices, quantities
- Shows stock status and warnings
- AJAX-based quantity updates
- Remove item functionality
- Clear cart option
- Out-of-stock item handling
- Order summary with delivery calculation
- Checkout button (disabled if out-of-stock items present)

**JavaScript Functions:**
- `updateQty(variantId, newQty)` - Updates item quantity
- `removeItem(variantId)` - Removes item
- `clearCart()` - Clears entire cart
- `showToast(msg, type)` - Shows notifications

### 6. Product Detail Integration (`Views/user/productDetail.ejs`)
**Already existed** - Has "Add to Cart" button

The existing `addToCart()` function calls `/cart/add` endpoint:
```javascript
async function addToCart() {
  var res = await fetch('/cart/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: '<%= product._id %>',
      variantId: activeVariantId,
      quantity: qty
    })
  });
}
```

## Features Implemented

### ✅ Add to Cart
- Adds product variant to cart
- Increases quantity if already exists
- Validates stock availability
- Enforces max quantity (5 per item)

### ✅ Remove from Cart
- Removes individual items
- Clear entire cart option

### ✅ Update Quantity
- Increase/decrease quantity
- Real-time validation
- Stock limit enforcement

### ✅ Invalid Product Prevention
- Blocks out-of-stock products
- Removes unavailable products automatically
- Shows warnings for stock adjustments

### ✅ Stock Management
- Displays stock status
- Disables checkout if out-of-stock items
- Shows low stock warnings (≤5 items)
- Prevents adding more than available stock

### ✅ Cart Validation
- Automatic cleanup of removed products
- Quantity adjustment if stock decreased
- Clear error messages
- Prevents duplicate entries

## API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/cart` | View cart page | Yes |
| POST | `/cart/add` | Add item to cart | Yes |
| POST | `/cart/update` | Update item quantity | Yes |
| POST | `/cart/remove` | Remove item from cart | Yes |
| POST | `/cart/clear` | Clear entire cart | Yes |

## Request/Response Examples

### Add to Cart
**Request:**
```json
POST /cart/add
{
  "variantId": "507f1f77bcf86cd799439011",
  "quantity": 2
}
```

**Response:**
```json
{
  "success": true,
  "message": "Item added to cart"
}
```

### Update Quantity
**Request:**
```json
POST /cart/update
{
  "variantId": "507f1f77bcf86cd799439011",
  "quantity": 3
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cart updated",
  "itemTotal": 2997,
  "cartTotal": 5994,
  "cartCount": 6
}
```

## Error Handling

All errors return JSON with descriptive messages:
```json
{
  "success": false,
  "message": "Only 3 items available in stock"
}
```

**Common Error Messages:**
- "Product variant not found"
- "This product is currently unavailable"
- "This product is out of stock"
- "Maximum 5 items allowed per product"
- "Only X items available in stock"
- "Please login to add items to cart"

## Testing the Implementation

1. **Add to Cart:**
   - Go to any product detail page
   - Select size and color
   - Click "Add to Cart"
   - Should see success toast

2. **View Cart:**
   - Navigate to `/cart`
   - Should see all added items
   - Check stock status display

3. **Update Quantity:**
   - Click +/- buttons
   - Should update in real-time
   - Check max limit enforcement

4. **Remove Items:**
   - Click "Remove" button
   - Should remove item and refresh

5. **Out of Stock:**
   - Add item to cart
   - Manually set stock to 0 in database
   - Refresh cart page
   - Should show "Out of Stock" badge
   - Checkout button should be disabled

## Code Style Compliance

✅ Follows your existing patterns:
- 3-layer architecture (Controller → Service → Model)
- Async/await throughout
- Try-catch error handling
- Session-based auth
- camelCase naming
- Default exports with object
- Lean queries for read operations
- Population for related documents
- Descriptive error messages
- Simple, readable code

## Next Steps (Optional)

If you want to extend the cart functionality:
1. Add wishlist integration
2. Implement coupon/discount codes
3. Add cart persistence for guest users
4. Implement "Save for later" feature
5. Add cart item recommendations
6. Implement cart expiry (auto-remove after X days)
