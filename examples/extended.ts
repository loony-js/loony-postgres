import { connect } from "../src/index";

async function main() {
  const client = await connect({
    host: "localhost",
    port: 5432,
    database: "mydb",
    user: "postgres",
    password: "postgres",
  });

  try {
    // Here this client.query() call passes params to extended PARSE/BIND/EXECUTE.
    const result = await client.query(
      "SELECT $1::text as name, $2::int as age",
      ["Bob", 42],
    );
    console.log("extended protocol result", result.rows);
  } catch (error: any) {
    console.error("extended example error", error.message || error);
  } finally {
    await client.close();
  }
}

main().catch((err) => console.error("extended example fatal", err));
