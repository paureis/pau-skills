# Brief: order confirmed

Write `screens/order-confirmed.html`: the screen a customer sees right after placing an order. It belongs to the same
product as `screens/sign-in.html`.

The screen shows, from top to bottom:

1. A banner that tells the customer the order went through. It must read as success: not as the primary action, and
   not as an error.
2. The order number: Order 10482.
3. A summary card with the items and the total:
   - Linen notebook, 2 at $9.00 each: $18.00
   - Fountain pen: $24.00
   - Total: $42.00
4. A button that goes back to the orders list, at `/orders`.
