export interface ListParams {
  q: string;
  page: number;
  perPage: number;
  sort: string | null;
  dir: 'asc' | 'desc';
  filters: Record<string, string>;
  from: Date | null;
  to: Date | null;
}

export const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 200;

const RESERVED = new Set(['q', 'page', 'perPage', 'sort', 'dir', 'from', 'to']);

/**
 * Turns admin list URLs into a normalised query descriptor. Every list page
 * reads its state from the URL, so filters survive refresh and are shareable.
 */
export function parseListParams(
  searchParams: Record<string, string | string[] | undefined>,
  options: { defaultSort?: string; defaultDir?: 'asc' | 'desc'; perPage?: number } = {},
): ListParams {
  const get = (key: string): string | undefined => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const page = Math.max(1, Number.parseInt(get('page') ?? '1', 10) || 1);
  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(5, Number.parseInt(get('perPage') ?? '', 10) || options.perPage || DEFAULT_PER_PAGE),
  );

  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (RESERVED.has(key)) continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v && v !== 'ALL') filters[key] = v;
  }

  const parseDate = (value: string | undefined): Date | null => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  return {
    q: (get('q') ?? '').trim(),
    page,
    perPage,
    sort: get('sort') ?? options.defaultSort ?? null,
    dir: get('dir') === 'asc' ? 'asc' : options.defaultDir ?? 'desc',
    filters,
    from: parseDate(get('from')),
    to: parseDate(get('to')),
  };
}

export function paginationArgs(params: ListParams) {
  return { skip: (params.page - 1) * params.perPage, take: params.perPage };
}

/**
 * Builds a Prisma orderBy from a whitelist, so a hostile `sort` value can never
 * reach the query.
 */
export function orderByArgs(
  params: ListParams,
  allowed: readonly string[],
  fallback: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' },
): Record<string, unknown> {
  if (!params.sort || !allowed.includes(params.sort)) return fallback;
  // Supports one level of nesting, e.g. "plan.nameAr".
  if (params.sort.includes('.')) {
    const [relation, field] = params.sort.split('.');
    return { [relation]: { [field]: params.dir } };
  }
  return { [params.sort]: params.dir };
}

/** Inclusive date-range filter for a given column. */
export function dateRangeArgs(params: ListParams, field = 'createdAt') {
  if (!params.from && !params.to) return {};
  const range: Record<string, Date> = {};
  if (params.from) range.gte = params.from;
  if (params.to) {
    const end = new Date(params.to);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return { [field]: range };
}

export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
}

export function pageMeta(params: ListParams, total: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const from = total === 0 ? 0 : (params.page - 1) * params.perPage + 1;
  const to = Math.min(total, params.page * params.perPage);
  return { page: params.page, perPage: params.perPage, total, totalPages, from, to };
}

/** Serialises rows to CSV with a UTF-8 BOM so Excel renders Arabic correctly. */
export function toCsv(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  if (rows.length === 0) return '﻿';
  const keys = headers ?? Object.keys(rows[0]);

  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = value instanceof Date ? value.toISOString() : String(value);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [keys.join(','), ...rows.map((row) => keys.map((k) => escape(row[k])).join(','))];
  return `﻿${lines.join('\r\n')}`;
}
