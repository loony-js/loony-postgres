import { DB_NAME, DB_PASSWORD, DB_USERNAME } from "../credentials.json";
import { Pool, connect } from "../src/index";

async function runClientExample() {
  console.log("=== Direct Client Example ===");

  const client = await connect({
    host: "localhost",
    port: 5432,
    database: DB_NAME,
    user: DB_USERNAME,
    password: DB_PASSWORD,
  });

  try {
    console.log("Connected via Client");

    await client.query("INSERT INTO users (name, email) VALUES ($1, $2)", [
      "Alice",
      "alice@example.com",
    ]);

    const select = await client.query(
      "SELECT id, name, email, created_at FROM users WHERE name = $1",
      ["Alice"],
    );

    console.log("Selected rows:", select.rows);

    await client.transaction(async (tx) => {
      await tx.query("UPDATE users SET name = $1 WHERE name = $2", [
        "Alicia",
        "Alice",
      ]);
      const r2 = await tx.query("SELECT * FROM users WHERE name = $1", [
        "Alicia",
      ]);
      console.log("Transaction select:", r2.rows);
    });
  } catch (error: any) {
    console.error("Client example error:", error.message || error);
  } finally {
    await client.close();
    console.log("Client connection closed");
  }
}

async function runPoolExample() {
  console.log("=== Connection Pool Example ===");

  const pool = new Pool({
    host: "localhost",
    port: 5432,
    user: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_NAME,
    max: 5,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 15000,
  });

  try {
    // Concurrent queries through pool
    const concurrent = Array.from({ length: 6 }, (_, i) => i + 1);
    const promises = concurrent.map(async (id) => {
      const user = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
      return { id, rows: user.rows };
    });

    const results = await Promise.all(promises);
    console.log("Pool query results:", results);

    // Transaction using pool wrapper query
    const t1 = await pool.query("BEGIN");
    try {
      await pool.query("INSERT INTO users (name, email) VALUES ($1, $2)", [
        "Bob",
        "bob@example.com",
      ]);
      await pool.query("COMMIT");
      console.log("Pool transaction committed");
    } catch (e) {
      await pool.query("ROLLBACK");
      console.error("Pool transaction rolled back", e);
    }
  } catch (error: any) {
    console.error("Pool example error:", error.message || error);
  } finally {
    await pool.close();
    console.log("Pool closed");
  }
}

async function main() {
  await runClientExample();
  await runPoolExample();
}

main().catch((err) => console.error("Example main error:", err));
