# Good and Bad Tests

## Good Tests

**Integration-style**: Test through real interfaces, not mocks of internal parts.

```
// GOOD: Tests observable behavior
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

Characteristics:
- Tests behavior users/callers care about
- Uses public API only
- Survives internal refactors
- Describes WHAT, not HOW
- One logical assertion per test

## Bad Tests

**Implementation-detail tests**: Coupled to internal structure.

```
// BAD: Tests implementation details
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

Red flags:
- Mocking internal collaborators
- Testing private methods
- Asserting on call counts/order
- Test breaks when refactoring without behavior change
- Test name describes HOW rather than WHAT

**Tautological tests**: The expected value is worked out the same way the code works it out, so any mistake the code and the test share passes.

```
// BAD: Recomputes the expected total with the same sum the code uses
test("order total adds the line prices", () => {
  const lines = [{ price: 400 }, { price: 250 }];
  const expected = lines.reduce((total, line) => total + line.price, 0);
  expect(orderTotal(lines)).toBe(expected);
});

// GOOD: Asserts a total known from the requirement
test("order total adds the line prices", () => {
  expect(orderTotal([{ price: 400 }, { price: 250 }])).toBe(650);
});
```

## Naming Convention

Test names should read like specifications:

```
// GOOD names
"user can add item to empty cart"
"checkout fails with expired payment method"
"duplicate email returns validation error"

// BAD names
"test addItem"
"checkout test 2"
"should call validateEmail"
```
