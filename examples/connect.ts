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
    const result = await client.query("SELECT now() as current_time");
    console.log("Connected, now =", result.rows[0]);
  } catch (error: any) {
    console.error("connect example error", error.message || error);
  } finally {
    await client.close();
    console.log("client closed");
  }
}

main().catch((err) => console.error("connect example fatal", err));
