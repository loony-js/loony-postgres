import { DB_NAME, DB_PASSWORD, DB_USERNAME } from "../credentials.json";
import { Pool } from "../src/index";

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

    for (const u of results) {
      const user = u.rows[0];
      console.log(user);
    }
  } catch (error: any) {
    console.error("Pool example error:", error.message || error);
  } finally {
    await pool.close();
    console.log("Pool closed");
  }
}

async function main() {
  await runPoolExample();
}

main().catch((err) => console.error("Example main error:", err));
