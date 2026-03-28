## ✅ Run all examples in examples

Great news: this is easy and you’re ready to test everything.
You can run directly with ts-node or from compiled dist after `npm run build`.

---

### First: Setup Test Database

Run this once to create the test `users` table with sample data:

```bash
npx ts-node examples/setup.ts
```

This creates:
- `users` table with columns: id, name, email, age, bio, created_at
- 5 sample users for testing queries

---

### Option 1: Run TypeScript directly (quickest)

From workspace root:

1. `npm install` (if not done already)
2. `npx ts-node examples/setup.ts`  # Setup test data first
3. `npx ts-node examples/connect.ts`
4. `npx ts-node examples/params.ts`
5. `npx ts-node examples/extended.ts`
6. `npx ts-node examples/queue.ts`
7. `npx ts-node examples/transactions.ts`
8. `npx ts-node examples/pool.ts`

---

### Option 2: Compile + run JS (recommended for production-like)

1. `npm run build`
2. `node dist/examples/setup.js`  # Setup test data first
3. run compiled JS:
   - `node dist/examples/connect.js`
   - `node dist/examples/params.js`
   - `node dist/examples/extended.js`
   - `node dist/examples/queue.js`
   - `node dist/examples/transactions.js`
   - `node dist/examples/pool.js`

---

### Environment

- Ensure PG server running (default `localhost:5432`)
- DB + user as in examples:
  - `user=postgres`, `password=postgres`, `database=mydb` (or adjust config)
- The setup script will create the test table automatically

---

### Bonus: run all scripts with a loop

```bash
# Setup first
npx ts-node examples/setup.ts

# Then run all examples
for f in examples/*.ts; do
  if [[ "$f" != "examples/setup.ts" ]]; then
    echo "=== $f ==="
    npx ts-node "$f" || break
  fi
done
```
done
```
