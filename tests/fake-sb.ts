/**
 * 시험용 가짜 Supabase — 표를 메모리에 두고 쿼리 빌더의 흔한 꼴(eq·in·gte·is·not·or·order·range·update·insert·upsert·single·count)을 흉내 낸다.
 * 진짜 PostgREST 처럼 한 번에 maxRows(기본 1,000)줄까지만 돌려준다 — 잘림 버그를 시험에서도 잡으려고.
 * 묶어 읽기("orders!inner(...)")는 줄에 미리 넣어 둔 객체를 그대로 돌려준다(점 이름 "orders.paid_at" 으로 거를 수 있다).
 */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const get = (r: Row, path: string) => path.split(".").reduce<any>((v, k) => (v == null ? v : v[k]), r); // eslint-disable-line @typescript-eslint/no-explicit-any

export type Fake = {
  tables: Record<string, Row[]>;
  calls: { table: string; op: string; filters: string[] }[];
  rpc: Record<string, (args: any) => any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  from: (t: string) => Builder;
};

class Builder {
  private filters: ((r: Row) => boolean)[] = [];
  private desc: string[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private from_ = 0;
  private to_: number | null = null;
  private lim: number | null = null;
  private op: "select" | "update" | "insert" | "upsert" | "delete" = "select";
  private patch: Row | Row[] | null = null;
  private returning = false;
  private head = false;
  private countMode = false;
  private one: "single" | "maybe" | null = null;
  constructor(private fake: Fake, private table: string, private maxRows: number) {}

  select(_cols?: string, opt?: { count?: string; head?: boolean }) {
    if (this.op !== "select") this.returning = true;
    if (opt?.count) this.countMode = true;
    if (opt?.head) this.head = true;
    return this;
  }
  eq(c: string, v: unknown) { this.desc.push(`eq ${c}=${v}`); this.filters.push((r) => get(r, c) === v); return this; }
  neq(c: string, v: unknown) { this.desc.push(`neq ${c}`); this.filters.push((r) => get(r, c) !== v); return this; }
  in(c: string, vs: unknown[]) { this.desc.push(`in ${c}`); this.filters.push((r) => vs.includes(get(r, c))); return this; }
  gt(c: string, v: any) { this.filters.push((r) => get(r, c) != null && get(r, c) > v); return this; } // eslint-disable-line @typescript-eslint/no-explicit-any
  gte(c: string, v: any) { this.filters.push((r) => get(r, c) != null && get(r, c) >= v); return this; } // eslint-disable-line @typescript-eslint/no-explicit-any
  lt(c: string, v: any) { this.filters.push((r) => get(r, c) != null && get(r, c) < v); return this; } // eslint-disable-line @typescript-eslint/no-explicit-any
  lte(c: string, v: any) { this.filters.push((r) => get(r, c) != null && get(r, c) <= v); return this; } // eslint-disable-line @typescript-eslint/no-explicit-any
  is(c: string, v: null) { this.desc.push(`is ${c}`); this.filters.push((r) => (get(r, c) ?? null) === v); return this; }
  not(c: string, op: string, v: unknown) {
    if (op === "is") this.filters.push((r) => (get(r, c) ?? null) !== v);
    else throw new Error(`not ${op} 은 흉내 내지 않아요`);
    return this;
  }
  /** "a.is.null,a.eq.x,a.lt.2026-…" 꼴 — 값에 점이 있어도 앞 두 점으로만 나눈다 */
  or(expr: string) {
    const parts = expr.split(",").map((p) => { const i = p.indexOf("."), j = p.indexOf(".", i + 1); return [p.slice(0, i), p.slice(i + 1, j), p.slice(j + 1)]; });
    this.filters.push((r) => parts.some(([c, o, v]) => {
      const x = r[c] ?? null;
      if (o === "is" && v === "null") return x === null;
      if (x === null) return false;
      return o === "eq" ? String(x) === v : o === "lt" ? x < v : o === "gt" ? x > v : o === "lte" ? x <= v : o === "gte" ? x >= v : false;
    }));
    return this;
  }
  order(col: string, opt?: { ascending?: boolean }) { this.orders.push({ col, asc: opt?.ascending !== false }); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.from_ = a; this.to_ = b; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  update(p: Row) { this.op = "update"; this.patch = p; return this; }
  insert(p: Row | Row[]) { this.op = "insert"; this.patch = p; return this; }
  upsert(p: Row | Row[]) { this.op = "upsert"; this.patch = p; return this; }
  delete() { this.op = "delete"; return this; }

  private rows() { return (this.fake.tables[this.table] ||= []); }
  private match(r: Row) { return this.filters.every((f) => f(r)); }

  private run(): { data: any; error: { message: string; code?: string } | null; count?: number } { // eslint-disable-line @typescript-eslint/no-explicit-any
    this.fake.calls.push({ table: this.table, op: this.op, filters: this.desc });
    const all = this.rows();
    if (this.op === "update") {
      const hit = all.filter((r) => this.match(r));
      for (const r of hit) Object.assign(r, this.patch);
      return { data: this.returning ? hit.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.op === "delete") {
      const keep = all.filter((r) => !this.match(r));
      this.fake.tables[this.table] = keep;
      return { data: null, error: null };
    }
    if (this.op === "insert" || this.op === "upsert") {
      const list = Array.isArray(this.patch) ? this.patch : [this.patch!];
      const out: Row[] = [];
      for (const p of list) {
        // 고유 키 흉내: partner_settlements(partner_id, month)
        if (this.table === "partner_settlements") {
          const dup = all.find((r) => r.partner_id === p.partner_id && r.month === p.month);
          if (dup && this.op === "insert") return { data: null, error: { message: "duplicate key", code: "23505" } };
          if (dup) { Object.assign(dup, p); out.push(dup); continue; }
        }
        const row = { id: p.id ?? `${this.table}-${all.length + 1}`, ...p };
        all.push(row); out.push(row);
      }
      const data = this.returning ? out.map((r) => ({ ...r })) : null;
      return { data: this.one ? data?.[0] ?? null : data, error: null };
    }
    let rows = all.filter((r) => this.match(r));
    if (this.countMode && this.head) return { data: null, error: null, count: rows.length };
    for (const o of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = get(a, o.col), y = get(b, o.col);
        if (x === y) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
      });
    }
    const start = this.from_;
    let end = this.to_ !== null ? this.to_ + 1 : rows.length;
    if (this.lim !== null && this.to_ === null) end = start + this.lim;
    end = Math.min(end, start + this.maxRows); // PostgREST max-rows
    rows = rows.slice(start, end).map((r) => ({ ...r }));
    if (this.one === "single") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `single 인데 ${rows.length}줄` } };
    if (this.one === "maybe") return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null, count: this.countMode ? rows.length : undefined };
  }

  then<T>(ok: (v: ReturnType<Builder["run"]>) => T, bad?: (e: unknown) => T) {
    try { return Promise.resolve(ok(this.run())); } catch (e) { return bad ? Promise.resolve(bad(e)) : Promise.reject(e); }
  }
}

export function fakeSb(tables: Record<string, Row[]> = {}, maxRows = 1000): Fake {
  const fake: Fake = {
    tables, calls: [], rpc: {},
    from: (t: string) => new Builder(fake, t, maxRows),
  };
  return fake;
}

/** sb.rpc(name, args) 를 흉내 — fake.rpc[name] 이 돌려준 값을 data 로 */
export function withRpc(fake: Fake, fns: Record<string, (args: any) => any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (fake as any).rpc = (name: string, args: unknown) => ({ then: (ok: (v: unknown) => unknown) => Promise.resolve(ok({ data: fns[name]?.(args) ?? null, error: null })) });
  return fake;
}
