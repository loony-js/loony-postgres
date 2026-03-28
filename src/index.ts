/**
 * Loony PostgreSQL - Pure TypeScript PostgreSQL Wire Protocol Client
 *
 * A lightweight, zero-dependency PostgreSQL client implementing the wire protocol.
 * Provides direct access to PostgreSQL without relying on native bindings.
 */

import PostgreSQLConnection from "./pgConnection";
import {
  ConnectionConfig,
  PoolOptions,
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
  private transactionDepth: number = 0;
  private inTransaction: boolean = false;

  constructor(connection: PostgreSQLConnection) {
    this.connection = connection;
  }

  /**
   * Execute a SQL query and return results
   *
   * @param sql - SQL query string
   * @param params - Query parameters (automatically prevents SQL injection)
   * @returns Promise<QueryResult> - Query result with rows and metadata
   *
   * @example
   * ```typescript
   * // Simple query
   * const result = await client.query("SELECT * FROM users");
   *
   * // Parameterized query (safe from SQL injection)
   * const user = await client.query(
   *   "SELECT * FROM users WHERE id = $1",
   *   [123]
   * );
   *
   * // Multiple parameters
   * const rows = await client.query(
   *   "SELECT * FROM users WHERE age > $1 AND city = $2",
   *   [18, "New York"]
   * );
   *
   * // NULL values
   * const result = await client.query(
   *   "UPDATE users SET bio = $1 WHERE id = $2",
   *   [null, 123]  // Sets bio to NULL
   * );
   * ```
   */
  async query(sql: string, params?: any[]): Promise<QueryResult> {
    console.log(sql, params);
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
    if (this.transactionDepth === 0) {
      // Start new transaction
      await this.begin();
    } else {
      // Create savepoint for nested transaction
      await this.savepoint(`sp_${this.transactionDepth}`);
    }

    this.transactionDepth++;

    try {
      const result = await callback(this);
      this.transactionDepth--;

      if (this.transactionDepth === 0) {
        await this.commit();
      } else {
        await this.releaseSavepoint(`sp_${this.transactionDepth}`);
      }

      return result;
    } catch (error) {
      this.transactionDepth--;

      if (this.transactionDepth === 0) {
        await this.rollback().catch(() => {
          // Ignore rollback errors
        });
      } else {
        await this.rollbackToSavepoint(`sp_${this.transactionDepth}`).catch(
          () => {
            // Ignore rollback errors
          },
        );
      }

      throw error;
    }
  }

  /**
   * Start a new transaction
   *
   * @example
   * ```typescript
   * await client.begin();
   * try {
   *   await client.query("INSERT INTO users (name) VALUES ('Alice')");
   *   await client.commit();
   * } catch (error) {
   *   await client.rollback();
   * }
   * ```
   */
  async begin(): Promise<QueryResult> {
    if (this.inTransaction && this.transactionDepth === 0) {
      throw new Error(
        "Transaction already in progress. Use nested transactions or savepoints.",
      );
    }
    const result = (await this.connection.query("BEGIN", [])) as QueryResult;
    if (this.transactionDepth === 0) {
      this.inTransaction = true;
    }
    return result;
  }

  /**
   * Commit the current transaction
   *
   * @example
   * ```typescript
   * await client.query("INSERT INTO users (name) VALUES ('Alice')");
   * await client.commit();
   * ```
   */
  async commit(): Promise<QueryResult> {
    if (!this.inTransaction) {
      throw new Error("No active transaction to commit");
    }
    const result = (await this.connection.query("COMMIT", [])) as QueryResult;
    if (this.transactionDepth === 0) {
      this.inTransaction = false;
    }
    return result;
  }

  /**
   * Rollback the current transaction
   *
   * @example
   * ```typescript
   * try {
   *   await client.query("INSERT INTO users (name) VALUES ('Alice')");
   *   throw new Error("Oops!");
   * } catch (error) {
   *   await client.rollback();
   * }
   * ```
   */
  async rollback(): Promise<QueryResult> {
    if (!this.inTransaction) {
      throw new Error("No active transaction to rollback");
    }
    const result = (await this.connection.query("ROLLBACK", [])) as QueryResult;
    if (this.transactionDepth === 0) {
      this.inTransaction = false;
    }
    return result;
  }

  /**
   * Create a savepoint within the current transaction
   *
   * @param name - Savepoint name
   * @example
   * ```typescript
   * await client.begin();
   * await client.savepoint("my_savepoint");
   * try {
   *   await client.query("INSERT INTO users (name) VALUES ('Alice')");
   * } catch (error) {
   *   await client.rollbackToSavepoint("my_savepoint");
   * }
   * await client.commit();
   * ```
   */
  async savepoint(name: string): Promise<QueryResult> {
    if (!this.inTransaction) {
      throw new Error("Savepoints require an active transaction");
    }
    return (await this.connection.query(
      `SAVEPOINT ${name}`,
      [],
    )) as QueryResult;
  }

  /**
   * Rollback to a specific savepoint
   *
   * @param name - Savepoint name
   */
  async rollbackToSavepoint(name: string): Promise<QueryResult> {
    if (!this.inTransaction) {
      throw new Error("No active transaction");
    }
    return (await this.connection.query(
      `ROLLBACK TO SAVEPOINT ${name}`,
      [],
    )) as QueryResult;
  }

  /**
   * Release a savepoint
   *
   * @param name - Savepoint name
   */
  async releaseSavepoint(name: string): Promise<QueryResult> {
    if (!this.inTransaction) {
      throw new Error("No active transaction");
    }
    return (await this.connection.query(
      `RELEASE SAVEPOINT ${name}`,
      [],
    )) as QueryResult;
  }

  /**
   * Get current transaction state
   */
  getTransactionState() {
    return {
      inTransaction: this.inTransaction,
      depth: this.transactionDepth,
    };
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

export class Pool {
  private config: PoolOptions;
  private max: number;
  private idleTimeoutMillis: number;
  private acquireTimeoutMillis: number;
  private available: Client[] = [];
  private inUse: Set<Client> = new Set();
  private pending: Array<{
    resolve: (client: Client) => void;
    reject: (error: any) => void;
    timer: ReturnType<typeof setTimeout> | null;
  }> = [];
  private closed = false;

  constructor(config: PoolOptions) {
    this.config = config;
    this.max = config.max || 10;
    this.idleTimeoutMillis = config.idleTimeoutMillis || 30000;
    this.acquireTimeoutMillis = config.acquireTimeoutMillis || 30000;
  }

  async acquire(): Promise<Client> {
    if (this.closed) {
      throw new Error("Pool is closed");
    }

    const immediate = this.available.pop();
    if (immediate) {
      this.inUse.add(immediate);
      return immediate;
    }

    if (this.inUse.size < this.max) {
      const client = await connect(this.config);
      this.inUse.add(client);
      return client;
    }

    return new Promise<Client>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pending.findIndex((item) => item.reject === reject);
        if (idx >= 0) {
          this.pending.splice(idx, 1);
        }
        reject(new Error("Pool acquire timeout"));
      }, this.acquireTimeoutMillis);

      this.pending.push({ resolve, reject, timer });
    });
  }

  release(client: Client) {
    if (this.closed) {
      client.close();
      return;
    }

    if (!this.inUse.has(client)) {
      throw new Error("Attempt to release client that is not checked out");
    }

    this.inUse.delete(client);

    if (this.pending.length > 0) {
      const next = this.pending.shift()!;
      if (next.timer) {
        clearTimeout(next.timer);
      }
      this.inUse.add(client);
      next.resolve(client);
      return;
    }

    this.available.push(client);
    setTimeout(() => {
      const index = this.available.indexOf(client);
      if (index !== -1 && this.available.length + this.inUse.size > this.max) {
        this.available.splice(index, 1);
        client.close();
      }
    }, this.idleTimeoutMillis);
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    const client = await this.acquire();
    try {
      return await client.query(sql, params);
    } finally {
      this.release(client);
    }
  }

  async close(): Promise<void> {
    this.closed = true;

    for (const pending of this.pending) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.reject(new Error("Pool closed"));
    }
    this.pending = [];

    for (const client of this.available) {
      await client.close();
    }
    this.available = [];

    for (const client of Array.from(this.inUse)) {
      await client.close();
    }
    this.inUse.clear();
  }
}

// Export all types for external use
export type {
  ConnectionConfig,
  PoolOptions,
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
  createParsePacket,
  createBindPacket,
  createExecutePacket,
  createSyncPacket,
  createClosePacket,
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
