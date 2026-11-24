export interface Env {
  DB: D1Database;
  /** Secret pepper used to HMAC access codes. Set with `wrangler secret put CODE_PEPPER`. */
  CODE_PEPPER: string;
  /** One-time token allowing creation of the first super admin. `wrangler secret put BOOTSTRAP_TOKEN`. */
  BOOTSTRAP_TOKEN?: string;
  /** Comma separated list of allowed browser origins. */
  ALLOWED_ORIGINS: string;
  ENVIRONMENT: string;
}

export interface SessionUser {
  id: number;
  display_name: string;
  role: string;
  employee_id: number | null;
  permissions: Set<string>;
  session_id: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: SessionUser };
};
