export type User = { id: string; email?: string | null; user_metadata?: Record<string, unknown> };
export type Session = { user: User } | null;
export type Database = Record<string, unknown>;
