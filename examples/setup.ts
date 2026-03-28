import { DB_NAME, DB_PASSWORD, DB_USERNAME } from "../credentials.json";
import { connect } from "../src/index";

async function setupTestData() {
  const client = await connect({
    host: "localhost",
    port: 5432,
    database: DB_NAME,
    user: DB_USERNAME,
    password: DB_PASSWORD,
  });

  try {
    console.log("Setting up test database...");

    // Drop table if exists (for clean setup)
    await client.query("DROP TABLE IF EXISTS users");

    // Create users table
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        age INTEGER,
        bio TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✓ Created users table");

    // Insert test data
    const testUsers = [
      {
        name: "Alice Johnson",
        email: "alice@example.com",
        age: 28,
        bio: "Software engineer",
      },
      {
        name: "Bob Smith",
        email: "bob@example.com",
        age: 34,
        bio: "Product manager",
      },
      {
        name: "Charlie Brown",
        email: "charlie@example.com",
        age: 25,
        bio: "Designer",
      },
      {
        name: "Diana Prince",
        email: "diana@example.com",
        age: 31,
        bio: "Data scientist",
      },
      {
        name: "Eve Wilson",
        email: "eve@example.com",
        age: 29,
        bio: "DevOps engineer",
      },
    ];

    for (const user of testUsers) {
      await client.query(
        "INSERT INTO users (name, email, age, bio) VALUES ($1, $2, $3, $4)",
        [user.name, user.email, user.age, user.bio],
      );
    }
    console.log("✓ Inserted test users");

    // Verify data
    const result = await client.query("SELECT COUNT(*) as count FROM users");
    console.log(`✓ Total users: ${result.rows[0].count}`);

    // Show sample data
    const sample = await client.query(
      "SELECT id, name, email FROM users LIMIT 3",
    );
    console.log("Sample users:", sample.rows);

    console.log("✅ Test database setup complete!");
  } catch (error: any) {
    console.error("❌ Setup failed:", error.message || error);
    throw error;
  } finally {
    await client.close();
  }
}

async function main() {
  await setupTestData();
}

main();
