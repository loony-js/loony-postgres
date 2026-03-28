import { DB_NAME, DB_PASSWORD, DB_USERNAME } from "../credentials.json";
import { connect } from "../src/index";

async function setupTestData() {
  const config = {
    host: "localhost",
    port: 5432,
    database: DB_NAME,
    user: DB_USERNAME,
    password: DB_PASSWORD,
  };
  const client = await connect(config);
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
  try {
    await client.transaction(async (txn) => {
      await txn.query(
        "INSERT INTO users (name, email, age, bio) VALUES ($1, $2, $3, $4)",
        ["Alice Johnson", "alice@example.com", 28, "Software engineer"],
      );
      await txn.query(
        "INSERT INTO users (name, email, age, bio) VALUES ($1, $2, $3, $4)",
        ["Bob Smith", "bob@example.com", 34, "Product manager"],
      );
      return { success: true };
    });

    const res = await client.transaction(async (txn1) => {
      await txn1.query(
        "INSERT INTO users (name, email, age, bio) VALUES ($1, $2, $3, $4)",
        ["Charlie Brown", "charlie@example.com", 25, "Designer"],
      );
      await txn1.query(
        "INSERT INTO users (name, email, age, bio) VALUES ($1, $2, $3, $4)",
        ["Diana Prince", "diana@example.com", 31, "Data scientist"],
      );
    });
  } catch (error) {
    console.log(error);
  }
  await client.begin();
  try {
    await client.query(
      "INSERT INTO users (name, email, age, bio) VALUES ($1, $2, $3, $4)",
      ["Eve Wilson", "eve@example.com", 29, "DevOps engineer"],
    );
    await client.savepoint("sp1");
    await client.query(
      "INSERT INTO users (name, email, age, bio) VALUES ($1, $2, $3, $4)",
      ["Sankar Boro", "sankar@yahoo.com", 31, "Rust Developer"],
    );
    await client.commit();
  } catch (error) {
    console.log(error);
    await client.rollback();
  }
}

async function main() {
  await setupTestData();
  process.exit(1);
}

main();
