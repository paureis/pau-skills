# Mocking Guidelines

## When to Mock

Mock **external systems** at the seam where your code meets them:
- Databases → mock the repository/data-access layer
- HTTP APIs → mock the HTTP client or use a test server
- File system → mock the file access layer
- Time → mock the clock
- Randomness → mock the random source

## When NOT to Mock

- **Your own code.** If you control both sides, use the real implementation.
- **Internal collaborators.** If module A calls module B and you own both, test them together through A's public interface.
- **Simple value objects.** Just construct real ones.

## Mock Shape

A good mock is **simple and dumb**:

```
// GOOD: Simple fake that returns canned data
const fakeUserRepo = {
  findById: async (id) => ({ id, name: "Test User", email: "test@example.com" }),
  save: async (user) => ({ ...user, id: "generated-id" }),
};

// BAD: Mock that reimplements the real thing
const fakeUserRepo = {
  _store: new Map(),
  findById: async (id) => {
    const user = this._store.get(id);
    if (!user) throw new NotFoundError();
    return { ...user, updatedAt: new Date() };
  },
  // ... 50 more lines of logic
};
```

If your mock needs logic, the seam is in the wrong place.

## Test Doubles Hierarchy

Prefer in this order:
1. **Real implementation** — always first choice if feasible
2. **Fake** — simplified but working implementation (e.g., in-memory database)
3. **Stub** — returns canned responses, no logic
4. **Mock** — verifies interactions (use sparingly, only when the interaction IS the behavior)
