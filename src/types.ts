export interface ConnectionConfig {
  user: string;
  password?: string;
  database: string;
  encoding?: string;
}

export interface AuthParams {
  [key: string]: string;
}
