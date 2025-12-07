import PostgreSQLConnection from "./src/pgConnection.mjs";

async function main() {
  console.log("=== PostgreSQL Wire Protocol Test ===");

  // Configuration
  const config = {
    host: process.env.PG_HOST || "localhost",
    port: parseInt(process.env.PG_PORT) || 5432,
    database: process.env.PG_DATABASE || "postgres",
    user: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || "postgres",
  };

  console.log("Configuration:", {
    ...config,
    password: config.password ? "[HIDDEN]" : "[EMPTY]",
  });

  const client = new PostgreSQLConnection(config);

  try {
    console.log("\n1. Connecting to database...");
    await client.connect();
    console.log("✓ Connected successfully!");

    console.log("\n2. Testing simple query...");
    const result1 = await client.query(
      "SELECT version(), current_user, current_database()"
    );
    console.log("Result:", result1.rows[0]);

    console.log("\n3. Testing calculation query...");
    const result2 = await client.query("SELECT 1 + 2 + 3 as sum, NOW() as now");
    console.log("Result:", result2.rows[0]);

    console.log("\n4. Testing table query (if available)...");
    try {
      const result3 = await client.query(`
                SELECT table_name, table_type
                FROM information_schema.tables
                WHERE table_schema = 'public'
                LIMIT 5
            `);
      console.log("Tables:", result3.rows);
    } catch (err) {
      console.log("Table query failed (normal if no tables):", err.message);
    }

    console.log("\n5. Testing NULL handling...");
    const result4 = await client.query(
      "SELECT NULL as null_value, 1 as not_null"
    );
    console.log("Result:", result4.rows[0]);

    console.log("\n6. Closing connection...");
    await client.close();
    console.log("✓ Connection closed");
  } catch (error) {
    console.error("\n✗ Error:", error.message);
    if (error.fields) {
      console.error("PostgreSQL error details:", error.fields);
    }
    console.error(error.stack);
  }
}

main();
