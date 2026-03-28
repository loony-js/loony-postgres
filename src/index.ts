/**
 * Loony PostgreSQL - Pure TypeScript PostgreSQL Wire Protocol Client
 *
 * A lightweight, zero-dependency PostgreSQL client implementing the wire protocol.
 * Provides direct access to PostgreSQL without relying on native bindings.
 */

import PostgreSQLConnection from "./pgConnection";
import {
  ConnectionConfig,
  QueryResult,
  QueryOptions,
  FieldInfo,
  QueryRow,
  AuthParams,
  PostgreSQLError,
} from "./types";

/**
 * Create and connect to a PostgreSQL database
 *
 * @example
 * ```typescript
 * const client = await connect({
 *   host: "localhost",
 *   port: 5432,
 *   user: "postgres",
 *   password: "secret",
 *   database: "mydb"
 * });
 *
 * const result = await client.query("SELECT * FROM users WHERE id = $1", [1]);
 * await client.close();
 * ```
 */
export async function connect(config: ConnectionConfig): Promise<Client> {
  const connection = new PostgreSQLConnection({
    host: config.host || "localhost",
    port: config.port || 5432,
    database: config.database,
    user: config.user,
    password: config.password || "",
  });
  await connection.connect();
  return new Client(connection);
}

/**
 * PostgreSQL Client - Public API for query execution and connection management
 */
export class Client {
  private connection: PostgreSQLConnection;

  constructor(connection: PostgreSQLConnection) {
    this.connection = connection;
  }

  /**
   * Execute a SQL query and return results
   *
   * @param sql - SQL query string
   * @param params - Query parameters (for future parameterized query support)
   * @returns Promise<QueryResult> - Query result with rows and metadata
   *
   * @example
   * ```typescript
   * const result = await client.query("SELECT * FROM users");
   * console.log(result.rows);        // Array of row objects
   * console.log(result.rowCount);    // Number of rows
   * console.log(result.fields);      // Column metadata
   * ```
   */
  async query(sql: string, params?: any[]): Promise<QueryResult> {
    return this.connection.query(sql, params) as Promise<QueryResult>;
  }

  /**
   * Execute multiple queries in a transaction
   *
   * @param queries - Array of SQL query strings
   * @returns Promise<QueryResult[]> - Array of query results
   *
   * @example
   * ```typescript
   * const results = await client.queryBatch([
   *   "BEGIN",
   *   "INSERT INTO users (name) VALUES ('Alice')",
   *   "COMMIT"
   * ]);
   * ```
   */
  async queryBatch(queries: string[]): Promise<QueryResult[]> {
    const results: QueryResult[] = [];
    for (const query of queries) {
      results.push((await this.connection.query(query, [])) as QueryResult);
    }
    return results;
  }

  /**
   * Execute a transaction with automatic rollback on error
   *
   * @param callback - Function that receives this client and executes queries
   * @returns Promise<T> - Return value from the callback
   *
   * @example
   * ```typescript
   * const result = await client.transaction(async (txn) => {
   *   await txn.query("INSERT INTO users (name) VALUES ('Alice')");
   *   await txn.query("INSERT INTO users (name) VALUES ('Bob')");
   *   return { success: true };
   * });
   * ```
   */
  async transaction<T>(callback: (client: this) => Promise<T>): Promise<T> {
    try {
      await this.connection.query("BEGIN", []);
      const result = await callback(this);
      await this.connection.query("COMMIT", []);
      return result;
    } catch (error) {
      await this.connection.query("ROLLBACK", []).catch(() => {
        // Ignore rollback errors
      });
      throw error;
    }
  }

  /**
   * Get the underlying connection object (advanced usage)
   */
  getConnection(): PostgreSQLConnection {
    return this.connection;
  }

  /**
   * Close the connection to the database
   *
   * @example
   * ```typescript
   * await client.close();
   * ```
   */
  async close(): Promise<void> {
    return this.connection.close();
  }

  /**
   * Get connection state information
   */
  getState() {
    return {
      state: this.connection.state,
      connected: this.connection.state === "connected",
      readyForQuery: this.connection.readyForQuery,
      processId: this.connection.processId,
    };
  }
}

// Export all types for external use
export type {
  ConnectionConfig,
  QueryResult,
  QueryOptions,
  FieldInfo,
  QueryRow,
  AuthParams,
  PostgreSQLError,
};

// Export the connection class for advanced usage
export { PostgreSQLConnection };

// Export message builders and parsers for advanced use cases
export {
  createPasswordPacket,
  createSimpleQueryPacket,
  createStartupPacket,
  createSASLInitialResponsePacket,
} from "./messageBuilder";

export {
  readCString,
  parseNullTerminatedPairs,
  parseCommandComplete,
  parseRowDescription,
  parseDataRow,
  parseSCRAMParams,
} from "./messageParser";

// Export authentication utilities
export {
  startSCRAMSHA256,
  processSASLContinue,
  processSASLFinal,
} from "./scramAuth";

// Export constants
export { MESSAGE_TYPES, AUTH_TYPES } from "./constants";

// Default export
export default connect;
