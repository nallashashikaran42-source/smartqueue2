import path from 'node:path';

const DEFAULT_DB_FILE_PATH = path.resolve(process.cwd(), '.data', 'smartqueue-db.json');

function resolveDbFilePath(rawPath: string | undefined): string {
  const trimmed = rawPath?.trim();
  if (!trimmed) {
    return DEFAULT_DB_FILE_PATH;
  }
  // Guard against database connection URIs (e.g., mongodb+srv://) or trailing directory paths
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) || trimmed.endsWith('/') || trimmed.endsWith('\\')) {
    console.warn(
      `Invalid SMARTQUEUE_DB_PATH (expected a local file path, got a URI or directory). Falling back to ${DEFAULT_DB_FILE_PATH}`
    );
    return DEFAULT_DB_FILE_PATH;
  }
  return path.resolve(trimmed);
}

export const ENV = {
  PORT: Number(process.env.PORT || 3000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  AUTH_SECRET:
    process.env.AUTH_SECRET || 'smartqueue-civic-dev-secret-change-in-production',
  REFRESH_SECRET:
    process.env.REFRESH_SECRET || 'smartqueue-refresh-dev-secret-change-in-production',
  ACCESS_TOKEN_TTL_SECONDS: 60 * 60 * 4, // 4 hours
  REFRESH_TOKEN_TTL_SECONDS: 60 * 60 * 24 * 14, // 14 days
  TOKEN_TTL_SECONDS: 60 * 60 * 24 * 7,
  DB_FILE_PATH: resolveDbFilePath(process.env.SMARTQUEUE_DB_PATH),
};
