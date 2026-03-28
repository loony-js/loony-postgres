/**
 * Connection configuration for PostgreSQL
 */
export interface ConnectionConfig {
  host?: string;
  port?: number;
  user: string;
  password?: string;
  database: string;
  encoding?: string;
}

/**
 * Authentication parameters key-value pairs
 */
export interface AuthParams {
  [key: string]: string;
}

/**
 * Field metadata from row description
 */
export interface FieldInfo {
  name: string;
  tableOID: number;
  columnAttrNum: number;
  dataTypeOID: number;
  dataTypeSize: number;
  typeModifier: number;
  format: number;
}

/**
 * Query result row (key-value pairs)
 */
export interface QueryRow {
  [key: string]: string | null;
}

/**
 * Complete query result set with metadata
 */
export interface QueryResult {
  rows: QueryRow[];
  fields: FieldInfo[] | null;
  command: string; // e.g., "SELECT", "INSERT", "UPDATE", "DELETE"
  rowCount: number; // Number of affected rows
  commandTag: string; // Full command tag from server
  oid: number | null; // OID for INSERT operations
}

/**
 * Query options for future parameterized query support
 */
export interface QueryOptions {
  timeout?: number; // Query timeout in milliseconds (default: 30000)
}

/**
 * Error response with PostgreSQL fields
 */
export interface PostgreSQLError extends Error {
  fields?: {
    [key: string]: string;
  };
}
