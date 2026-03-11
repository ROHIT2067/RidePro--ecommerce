# Cart Stock Adjustment - Test Scenarios

## Scenario 1: Stock Reduced (Variant Still Exists)
**Steps:**
1. Add product to cart with quantity 4
2. Go to admin panel → Edit product
3. Change variant stock from 10 to 2 (DO NOT delete the variant)
4. Go back to cart page

**Expected Result:**
- Item stays in cart
- Quantity automatically adjusted from 4 to 2
- Yellow warning banner: "Quantity reduced from 4 to 2 (available stock)"
- Can proceed to checkout

## Scenario 2: Stock Becomes Zero (Variant Still Exists)
**Steps:**
1. Add product to cart with quantity 4
2. Go to admin panel → Edit product
3. Change variant stock to 0 (DO NOT delete the variant)
4. Go back to cart page

**Expected Result:**
- Item stays in cart
- Shows "Out of Stock" badge
- Yellow warning: "Product is now out of stock"
- Checkout button DISABLED
- Message: "Remove out of stock items to proceed"

## Scenario 3: Variant Deleted Completely
**Steps:**
1. Add product to cart with quantity 4
2. Go to admin panel → Edit product
3. DELETE the variant entirely (remove it from product)
4. Go back to cart page

**Expected Result:**
- Item REMOVED from cart
- Red banner: "Some items were removed from your cart"
- Shows: "Unknown Product — Product no longer exists"
- Cart may be empty if this was the only item

## Scenario 4: Product Unlisted (Status Changed)
**Steps:**
1. Add product to cart
2. Go to admin panel → Products list
3. Toggle product status to "Out Of Stock" (unlist it)
4. Go back to cart page

**Expected Result:**
- Item REMOVED from cart
- Red banner: "Some items were removed from your cart"
- Shows: "[Product Name] — Product is no longer available"

## Scenario 5: Category Deactivated
**Steps:**
1. Add product to cart
2. Go to admin panel → Categories
3. Change category status to "Inactive"
4. Go back to cart page

**Expected Result:**
- Item REMOVED from cart
- Red banner: "Some items were removed from your cart"
- Shows: "[Product Name] — Product category is no longer active"

## Current Behavior Summary

| Situation | Item in Cart? | Can Checkout? | Warning Type |
|-----------|---------------|---------------|--------------|
| Stock reduced (4→2) | ✅ Yes (qty=2) | ✅ Yes | Yellow (adjustment) |
| Stock becomes 0 | ✅ Yes | ❌ No | Yellow + Red badge |
| Variant deleted | ❌ Removed | N/A | Red (removed) |
| Product unlisted | ❌ Removed | N/A | Red (removed) |
| Category inactive | ❌ Removed | N/A | Red (removed) |

## Troubleshooting

If you see "Unknown Product — Product no longer exists":
- This means the variant was DELETED from the database
- Check admin panel → Edit product → Variants list
- The variant is no longer there

If you want to test stock adjustment:
- DO NOT delete the variant
- Just change the stock_quantity field to a lower number
- The variant must still exist in the database
