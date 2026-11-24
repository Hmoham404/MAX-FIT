import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { assertPerm, can } from './auth';
import { audit, HttpError, nowISO } from './util';

export interface ResourceConfig {
  name: string;
  table: string;
  module: string;
  schema: z.ZodObject<z.ZodRawShape>;
  /** Columns written to the table (subset of schema keys). Defaults to all schema keys. */
  columns?: string[];
  /** SELECT clause, main table aliased "t". */
  select?: string;
  from?: string;
  search?: string[];
  filters?: Record<string, string>;
  sortable?: string[];
  defaultSort?: string;
  softDelete?: boolean;
  /** Fields hidden unless user has the permission. */
  sensitive?: { perm: string; fields: string[] };
  /** Restrict rows for some users (e.g. coach sees own). Returns [sql, params]. */
  scope?: (c: Context<AppEnv>) => [string, unknown[]] | null;
  beforeInsert?: (c: Context<AppEnv>, data: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
  beforeUpdate?: (c: Context<AppEnv>, id: number, data: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
  afterWrite?: (c: Context<AppEnv>, id: number, input: Record<string, unknown>, isNew: boolean) => Promise<void>;
  beforeDelete?: (c: Context<AppEnv>, id: number) => Promise<void>;
  transform?: (row: Record<string, unknown>) => Record<string, unknown>;
  hasUpdatedAt?: boolean;
  audit?: boolean;
}

const JSON_FIELDS = new Set(['activities']);

function serialize(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (JSON_FIELDS.has(k) && Array.isArray(v)) out[k] = JSON.stringify(v);
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else if (v === '') out[k] = null;
    else out[k] = v;
  }
  return out;
}

function deserialize(row: Record<string, unknown>) {
  for (const k of JSON_FIELDS) {
    if (typeof row[k] === 'string') {
      try {
        row[k] = JSON.parse(row[k] as string);
      } catch {
        row[k] = [];
      }
    }
  }
  return row;
}

export function stripSensitive(c: Context<AppEnv>, cfg: ResourceConfig, row: Record<string, unknown>) {
  if (cfg.sensitive && !can(c.get('user'), cfg.sensitive.perm)) {
    for (const f of cfg.sensitive.fields) delete row[f];
  }
  return row;
}

export async function getOne(c: Context<AppEnv>, cfg: ResourceConfig, id: number) {
  const select = cfg.select ?? 't.*';
  const from = cfg.from ?? `${cfg.table} t`;
  const row = await c.env.DB.prepare(`SELECT ${select} FROM ${from} WHERE t.id = ?`).bind(id).first<Record<string, unknown>>();
  if (!row) throw new HttpError(404, 'Introuvable');
  let r = deserialize(row);
  if (cfg.transform) r = cfg.transform(r);
  return stripSensitive(c, cfg, r);
}

export function crudRouter(cfg: ResourceConfig) {
  const app = new Hono<AppEnv>();
  const cols = cfg.columns ?? Object.keys(cfg.schema.shape);
  const sortable = new Set(['id', 'created_at', ...(cfg.sortable ?? [])]);

  app.get('/', async (c) => {
    assertPerm(c.get('user'), `${cfg.module}:read`);
    const q = c.req.query();
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(q.pageSize) || 25));
    const where: string[] = [];
    const params: unknown[] = [];
    if (cfg.softDelete) {
      if (q.archived === '1') where.push('t.archived_at IS NOT NULL');
      else if (q.archived !== 'all') where.push('t.archived_at IS NULL');
    }
    if (q.search && cfg.search?.length) {
      where.push('(' + cfg.search.map((s) => `${s} LIKE ?`).join(' OR ') + ')');
      cfg.search.forEach(() => params.push(`%${q.search}%`));
    }
    for (const [param, column] of Object.entries(cfg.filters ?? {})) {
      const v = q[param];
      if (v === undefined || v === '') continue;
      if (column.includes('?')) {
        where.push(column);
        const n = column.split('?').length - 1;
        for (let i = 0; i < n; i++) params.push(v);
      } else {
        where.push(`${column} = ?`);
        params.push(v);
      }
    }
    const scope = cfg.scope?.(c);
    if (scope) {
      where.push(scope[0]);
      params.push(...scope[1]);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    let sort = cfg.defaultSort ?? 't.id DESC';
    if (q.sort) {
      const [field, dir] = q.sort.split(':');
      if (sortable.has(field)) sort = `${field.includes('.') ? field : field} ${dir === 'asc' ? 'ASC' : 'DESC'}`;
    }
    const select = cfg.select ?? 't.*';
    const from = cfg.from ?? `${cfg.table} t`;
    const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${from} ${whereSql}`)
      .bind(...params)
      .first<{ n: number }>();
    const rows = await c.env.DB.prepare(
      `SELECT ${select} FROM ${from} ${whereSql} ORDER BY ${sort} LIMIT ? OFFSET ?`,
    )
      .bind(...params, pageSize, (page - 1) * pageSize)
      .all<Record<string, unknown>>();
    const data = rows.results.map((r) => {
      let x = deserialize(r);
      if (cfg.transform) x = cfg.transform(x);
      return stripSensitive(c, cfg, x);
    });
    return c.json({ data, total: total?.n ?? 0, page, pageSize });
  });

  app.get('/:id{[0-9]+}', async (c) => {
    assertPerm(c.get('user'), `${cfg.module}:read`);
    return c.json(await getOne(c, cfg, Number(c.req.param('id'))));
  });

  app.post('/', async (c) => {
    assertPerm(c.get('user'), `${cfg.module}:write`);
    const input = cfg.schema.parse(await c.req.json()) as Record<string, unknown>;
    let data: Record<string, unknown> = {};
    for (const k of cols) if (k in input) data[k] = input[k];
    if (cfg.beforeInsert) data = await cfg.beforeInsert(c, data);
    data = serialize(data);
    const tableCols = Object.keys(data);
    const user = c.get('user');
    const hasCreatedBy = await columnExists(c.env.DB, cfg.table, 'created_by');
    if (hasCreatedBy) {
      tableCols.push('created_by');
      data.created_by = user.id;
    }
    const res = await c.env.DB.prepare(
      `INSERT INTO ${cfg.table} (${tableCols.join(',')}) VALUES (${tableCols.map(() => '?').join(',')}) RETURNING id`,
    )
      .bind(...tableCols.map((k) => data[k] ?? null))
      .first<{ id: number }>();
    const id = res!.id;
    if (cfg.afterWrite) await cfg.afterWrite(c, id, input, true);
    if (cfg.audit !== false) await audit(c, 'create', cfg.name, id);
    return c.json(await getOne(c, cfg, id), 201);
  });

  app.put('/:id{[0-9]+}', async (c) => {
    assertPerm(c.get('user'), `${cfg.module}:write`);
    const id = Number(c.req.param('id'));
    const input = cfg.schema.partial().parse(await c.req.json()) as Record<string, unknown>;
    let data: Record<string, unknown> = {};
    for (const k of cols) if (k in input) data[k] = input[k];
    // Users without sensitive permission can never write sensitive fields.
    if (cfg.sensitive && !can(c.get('user'), cfg.sensitive.perm)) {
      for (const f of cfg.sensitive.fields) delete data[f];
    }
    if (cfg.beforeUpdate) data = await cfg.beforeUpdate(c, id, data);
    data = serialize(data);
    const keys = Object.keys(data);
    const before = await getOne(c, cfg, id);
    if (keys.length) {
      const setUpdated = cfg.hasUpdatedAt !== false && (await columnExists(c.env.DB, cfg.table, 'updated_at'));
      await c.env.DB.prepare(
        `UPDATE ${cfg.table} SET ${keys.map((k) => `${k} = ?`).join(', ')}${setUpdated ? ", updated_at = datetime('now')" : ''} WHERE id = ?`,
      )
        .bind(...keys.map((k) => data[k] ?? null), id)
        .run();
    }
    if (cfg.afterWrite) await cfg.afterWrite(c, id, input, false);
    const changes: Record<string, unknown> = {};
    for (const k of keys) if (before[k] !== data[k]) changes[k] = { from: before[k], to: data[k] };
    if (cfg.audit !== false) await audit(c, 'update', cfg.name, id, changes);
    return c.json(await getOne(c, cfg, id));
  });

  app.post('/:id{[0-9]+}/archive', async (c) => {
    assertPerm(c.get('user'), `${cfg.module}:delete`);
    if (!cfg.softDelete) throw new HttpError(400, 'Archivage non supporté');
    const id = Number(c.req.param('id'));
    const restore = c.req.query('restore') === '1';
    await c.env.DB.prepare(`UPDATE ${cfg.table} SET archived_at = ? WHERE id = ?`)
      .bind(restore ? null : nowISO(), id)
      .run();
    await audit(c, restore ? 'restore' : 'archive', cfg.name, id);
    return c.json({ ok: true });
  });

  app.delete('/:id{[0-9]+}', async (c) => {
    assertPerm(c.get('user'), `${cfg.module}:delete`);
    const id = Number(c.req.param('id'));
    if (cfg.beforeDelete) await cfg.beforeDelete(c, id);
    try {
      await c.env.DB.prepare(`DELETE FROM ${cfg.table} WHERE id = ?`).bind(id).run();
    } catch (e) {
      throw new HttpError(409, 'Suppression impossible : cet élément est utilisé ailleurs. Utilisez l’archivage.');
    }
    await audit(c, 'delete', cfg.name, id);
    return c.json({ ok: true });
  });

  return app;
}

const colCache = new Map<string, Set<string>>();
export async function columnExists(db: D1Database, table: string, col: string) {
  let set = colCache.get(table);
  if (!set) {
    const r = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    set = new Set(r.results.map((x) => x.name));
    colCache.set(table, set);
  }
  return set.has(col);
}

// ---------- shared zod helpers ----------
export const zMoney = z.coerce.number().int().min(0).max(1_000_000_000_000);
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)');
export const zTime = z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide (HH:MM)');
export const zOptStr = (max = 500) => z.string().trim().max(max).optional().nullable();
export const zBool = z.union([z.boolean(), z.number()]).transform((v) => (v ? 1 : 0));
export const zIdOpt = z.coerce.number().int().positive().optional().nullable();
