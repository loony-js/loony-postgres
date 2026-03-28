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
    const ids = [1, 2, 3, 4, 5];
    const promises = ids.map((id) =>
      client.query("SELECT pg_sleep(0.2); SELECT $1::int as id", [id]),
    );

    const rows = await Promise.all(promises);
    console.log(
      "queue example rows",
      rows.map((r) => r.rows),
    );
  } catch (error: any) {
    console.error("queue example error", error.message || error);
  } finally {
    await client.close();
  }
}

main().catch((err) => console.error("queue example fatal", err));
