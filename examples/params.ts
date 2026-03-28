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
    const result1 = await client.query(
      "SELECT * FROM users WHERE id = $1",
      [1],
    );
    console.log("params result1:", result1.rows);

    const result2 = await client.query("SELECT * FROM users WHERE email = $1", [
      "alice@example.com",
    ]);
    console.log("params result2:", result2.rows);

    const result3 = await client.query(
      "SELECT $1::int + $2::int as sum",
      [2, 5],
    );
    console.log("sum result:", result3.rows[0]);
  } catch (error: any) {
    console.error("params example error", error.message || error);
  } finally {
    await client.close();
  }
}

main().catch((err) => console.error("params example fatal", err));
