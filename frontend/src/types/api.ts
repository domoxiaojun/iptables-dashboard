// Type definitions mirroring the backend serde models.

export type Family = 'v4' | 'v6';
export type TableKind = 'filter' | 'nat' | 'mangle' | 'raw' | 'security';
export type ChainPolicy = 'ACCEPT' | 'DROP' | 'RETURN' | 'QUEUE';
export type SnapshotKind =
  | 'manual'
  | 'auto_pre_apply'
  | 'auto_rollback'
  | 'bootstrap_import';

export interface Counters {
  packets: number;
  bytes: number;
}

export interface MatchExt {
  name: string;
  args: string[];
}

export interface RuleSpec {
  protocol?: string;
  source?: string;
  destination?: string;
  in_interface?: string;
  out_interface?: string;
  sport?: string;
  dport?: string;
  fragment?: boolean;
  matches?: MatchExt[];
  jump?: string;
  goto?: string;
  target_args?: string[];
  comment?: string;
  extra?: string[];
}

export interface Rule {
  id?: number;
  family: Family;
  table: TableKind;
  chain: string;
  seq: number;
  spec: RuleSpec;
  raw: string;
  counters?: Counters;
}

export interface ChainSpec {
  family: Family;
  table: TableKind;
  name: string;
  policy?: ChainPolicy;
  builtin: boolean;
  counters?: Counters;
}

export interface TableEntry {
  kind: TableKind;
  chains: ChainSpec[];
  rules: Rule[];
}

export interface RulesResp {
  family: Family;
  tables: TableEntry[];
}

export interface SyncBadge {
  v4_count: number;
  v6_count: number;
  mismatched: number;
}

export interface GuardWarning {
  severity: 'error' | 'warn' | 'info';
  code: string;
  message: string;
  chain?: string;
  suggested_rules: string[];
}

export interface DiffOp {
  op: 'add' | 'remove' | 'modify';
  rule?: Rule;
  from?: Rule;
  to?: Rule;
}
export interface RuleDiff {
  family: Family;
  ops: DiffOp[];
}

export interface DualStackDiff {
  v4_only: Rule[];
  v6_only: Rule[];
  paired_diff: [Rule, Rule][];
  matched: number;
}

export interface SnapshotRecord {
  id: number;
  created_at: number;
  label: string;
  author: string;
  v4_save: string;
  v6_save: string;
  kind: string;
}

export interface TemplateRecord {
  id: number;
  name: string;
  category?: string;
  description?: string;
  rules_json: string;
  built_in: boolean;
}

export interface CounterSample {
  ts: number;
  family: Family;
  table: string;
  chain: string;
  seq: number;
  packets: number;
  bytes: number;
}

export interface AuditRecord {
  id: number;
  ts: number;
  user: string;
  action: string;
  target?: string;
  /** Backend stores arbitrary JSON string here; parse client-side if needed. */
  details_json?: string;
  result: string;
}

export interface Me {
  id: number;
  username: string;
  must_change_password: boolean;
}

export type Mutation =
  | {
      kind: 'create';
      family: Family;
      table: TableKind;
      chain: string;
      index?: number;
      spec: RuleSpec;
      also_for_other_family?: boolean;
    }
  | {
      kind: 'update';
      family: Family;
      table: TableKind;
      chain: string;
      seq: number;
      spec: RuleSpec;
    }
  | {
      kind: 'delete';
      family: Family;
      table: TableKind;
      chain: string;
      seq: number;
    }
  | {
      kind: 'reorder';
      family: Family;
      table: TableKind;
      chain: string;
      seq_order: number[];
    };

export interface PreviewResp {
  v4_diff: RuleDiff;
  v6_diff: RuleDiff;
  v4_save_after: string;
  v6_save_after: string;
  guard_warnings: GuardWarning[];
  /** FNV-1a hash of the v4 ruleset at preview time. Echo back via
   *  ApplyReq.if_v4_hash to detect concurrent kernel-side mutations. */
  v4_hash: string;
  v6_hash: string;
}

export interface ApplyResp {
  token: string;
  expires_at: number;
  /** Authoritative server-side grace window in seconds; clients should use
   *  this rather than computing `expires_at - now()` to avoid clock drift. */
  grace_seconds: number;
  guard_warnings: GuardWarning[];
}

export interface ApplyStatusResp {
  token: string;
  expires_at: number;
  remaining_seconds: number;
}
