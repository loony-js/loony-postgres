import { connect } from "../src/index";

async function test_transactions() {
  const config = {
    host: "localhost",
    port: 5432,
    database: "postgres",
    user: "postgres",
    password: "postgres",
  };
  const client = await connect(config);

  const result = await client.transaction(async (txn) => {
    await txn.query("INSERT INTO users (name) VALUES ('Alice')");
    await txn.query("INSERT INTO users (name) VALUES ('Bob')");
    return { success: true };
  });

  await client.transaction(async (txn1) => {
    await txn1.query("INSERT INTO users (name) VALUES ('Alice')");

    await txn1.transaction(async (txn2) => {
      await txn2.query("INSERT INTO users (name) VALUES ('Bob')");
    });
  });

  await client.begin();
  try {
    await client.query("INSERT INTO users (name) VALUES ('Alice')");
    await client.savepoint("sp1");
    await client.query("INSERT INTO users (name) VALUES ('Bob')");
    await client.commit();
  } catch (error) {
    await client.rollback();
  }
}
