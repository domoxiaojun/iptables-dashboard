import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Family, Mutation, Rule, RuleSpec, TableKind } from '@/types/api';

// IP/CIDR validation: accepts IPv4 (1.2.3.4, 1.2.3.0/24) and IPv6 (::1, 2001:db8::/32)
const IP_CIDR_RE = /^(!\s*)?((\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?|[0-9a-fA-F:]+(:[0-9a-fA-F:]*)?(\/\d{1,3})?)$/;
// Port: number or range like 1024:65535
const PORT_RE = /^(!\s*)?(\d{1,5})(:\d{1,5})?$/;
// Interface name: alphanumeric, dots, hyphens, underscores
const IFACE_RE = /^[a-zA-Z0-9_.+-]+$/;

const formSchema = z.object({
  protocol: z.string().optional(),
  source: z.string().refine(
    (v) => !v || v.trim() === '' || IP_CIDR_RE.test(v.trim()),
    { message: '无效的 IP/CIDR 格式' },
  ).optional(),
  destination: z.string().refine(
    (v) => !v || v.trim() === '' || IP_CIDR_RE.test(v.trim()),
    { message: '无效的 IP/CIDR 格式' },
  ).optional(),
  in_interface: z.string().max(15).refine(
    (v) => !v || v.trim() === '' || IFACE_RE.test(v.trim()),
    { message: '接口名只能包含字母、数字、. _ + -' },
  ).optional(),
  out_interface: z.string().max(15).refine(
    (v) => !v || v.trim() === '' || IFACE_RE.test(v.trim()),
    { message: '接口名只能包含字母、数字、. _ + -' },
  ).optional(),
  sport: z.string().refine(
    (v) => !v || v.trim() === '' || PORT_RE.test(v.trim()),
    { message: '端口格式无效（如 22 或 1024:65535）' },
  ).optional(),
  dport: z.string().refine(
    (v) => !v || v.trim() === '' || PORT_RE.test(v.trim()),
    { message: '端口格式无效（如 80 或 1024:65535）' },
  ).optional(),
  jump: z.string().optional(),
  reject_with: z.string().optional(),
  log_prefix: z.string().max(29).optional(),
  comment: z.string().max(256).optional(),
  also_other_family: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const COMMON_PROTOCOLS = ['', 'tcp', 'udp', 'icmp', 'ipv6-icmp'];
const COMMON_JUMPS = [
  '', 'ACCEPT', 'DROP', 'REJECT', 'LOG', 'RETURN', 'MASQUERADE', 'SNAT', 'DNAT', 'REDIRECT',
];

export const RuleEditDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  family: Family;
  table: TableKind;
  chain: string;
  initial?: Rule;
  onSubmit: (mutation: Mutation) => void;
}> = ({ open, onOpenChange, family, table, chain, initial, onSubmit }) => {
  const isEdit = initial !== undefined;
  const otherFamily: Family = family === 'v4' ? 'v6' : 'v4';

  const defaults = React.useMemo<FormValues>(
    () => ({
      protocol: initial?.spec.protocol ?? '',
      source: initial?.spec.source ?? '',
      destination: initial?.spec.destination ?? '',
      in_interface: initial?.spec.in_interface ?? '',
      out_interface: initial?.spec.out_interface ?? '',
      sport: initial?.spec.sport ?? '',
      dport: initial?.spec.dport ?? '',
      jump: initial?.spec.jump ?? 'ACCEPT',
      reject_with: pickTargetArg(initial?.spec.target_args, '--reject-with') ?? '',
      log_prefix: pickTargetArg(initial?.spec.target_args, '--log-prefix') ?? '',
      comment: initial?.spec.comment ?? '',
      also_other_family: !isEdit,
    }),
    [initial, isEdit],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  });

  React.useEffect(() => {
    reset(defaults);
  }, [defaults, reset]);

  const watchedProtocol = watch('protocol');
  const watchedSource = watch('source');
  const watchedDest = watch('destination');
  React.useEffect(() => {
    if (isEdit) return;
    const isV6Only = (s?: string) => !!s && (s.includes(':') || s === '::/0');
    const isV4Only = (s?: string) => !!s && /^\d+\.\d+\.\d+\.\d+/.test(s);
    const v6OnlyProto = ['ipv6-icmp', 'icmpv6'].includes(watchedProtocol ?? '');
    const v4OnlyProto = ['icmp'].includes(watchedProtocol ?? '');
    const familySpecific =
      (family === 'v4' && (v4OnlyProto || isV4Only(watchedSource) || isV4Only(watchedDest))) ||
      (family === 'v6' && (v6OnlyProto || isV6Only(watchedSource) || isV6Only(watchedDest)));
    if (familySpecific) {
      setValue('also_other_family', false);
    }
  }, [watchedProtocol, watchedSource, watchedDest, family, isEdit, setValue]);

  const submit = (v: FormValues) => {
    const targetArgs: string[] = [];
    if (v.reject_with?.trim()) {
      targetArgs.push('--reject-with', v.reject_with.trim());
    }
    if (v.log_prefix?.trim()) {
      targetArgs.push('--log-prefix', v.log_prefix.trim(), '--log-level', '4');
    }

    const spec: RuleSpec = {
      protocol: emptyToUndef(v.protocol),
      source: emptyToUndef(v.source),
      destination: emptyToUndef(v.destination),
      in_interface: emptyToUndef(v.in_interface),
      out_interface: emptyToUndef(v.out_interface),
      sport: emptyToUndef(v.sport),
      dport: emptyToUndef(v.dport),
      jump: emptyToUndef(v.jump),
      target_args: targetArgs.length > 0 ? targetArgs : undefined,
      comment: emptyToUndef(v.comment),
    };

    let mutation: Mutation;
    if (isEdit && initial) {
      mutation = {
        kind: 'update',
        family, table, chain,
        seq: initial.seq,
        spec,
      };
    } else {
      mutation = {
        kind: 'create',
        family, table, chain,
        spec,
        also_for_other_family: v.also_other_family,
      };
    }
    onSubmit(mutation);
    onOpenChange(false);
    toast.success(isEdit ? '规则已修改' : '规则已加入暂存区', {
      description: isEdit
        ? `${chain} #${initial!.seq + 1}`
        : `${family}/${table}/${chain}`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑规则' : '新建规则'}</DialogTitle>
          <DialogDescription>
            {`${family.toUpperCase()} · ${table} · ${chain}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField
              label="协议"
              hint="-p"
              options={COMMON_PROTOCOLS}
              {...register('protocol')}
            />
            <SelectField
              label="跳转目标"
              hint="-j"
              options={COMMON_JUMPS}
              {...register('jump')}
            />

            <FormField
              label="源地址"
              hint="-s · 加 ! 取反"
              placeholder="192.168.1.0/24 或 2001:db8::/32"
              {...register('source')}
            />
            <FormField
              label="目的地址"
              hint="-d"
              placeholder="10.0.0.1 或 ::1"
              {...register('destination')}
            />

            <FormField
              label="入接口"
              hint="-i"
              placeholder="eth0"
              error={errors.in_interface?.message}
              {...register('in_interface')}
            />
            <FormField
              label="出接口"
              hint="-o"
              placeholder="eth0"
              error={errors.out_interface?.message}
              {...register('out_interface')}
            />

            <FormField
              label="源端口"
              hint="--sport"
              placeholder="22 或 1024:65535"
              {...register('sport')}
            />
            <FormField
              label="目的端口"
              hint="--dport"
              placeholder="80 或 1024:65535"
              {...register('dport')}
            />
          </div>

          <details className="rounded-lg border border-[var(--c-hairline)] bg-canvas-tint/40 p-4 [&[open]]:bg-canvas-tint/60">
            <summary className="cursor-pointer select-none text-sm font-medium text-ink-muted hover:text-ink-strong">
              高级目标参数（可选）
            </summary>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                label="REJECT 类型"
                hint="--reject-with"
                placeholder="icmp-port-unreachable"
                {...register('reject_with')}
              />
              <FormField
                label="LOG 前缀"
                hint="--log-prefix"
                placeholder="iptables drop:"
                {...register('log_prefix')}
              />
            </div>
          </details>

          <FormField
            label="备注"
            placeholder="例如：阻止已知扫描器"
            error={errors.comment?.message}
            {...register('comment')}
          />

          {!isEdit && (
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--c-hairline)] bg-brand-tint/40 px-4 py-3 hover:bg-brand-tint transition-colors duration-fast">
              <input
                type="checkbox"
                {...register('also_other_family')}
                className="h-4 w-4 cursor-pointer accent-brand"
              />
              <span className="text-sm text-ink">
                同时写入 <strong className="text-brand">{otherFamily.toUpperCase()}</strong>
                <span className="ml-1.5 text-xs text-ink-muted">
                  — 含协议族专属字段时会自动取消
                </span>
              </span>
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" variant="primary">
              {isEdit ? '保存修改' : '加入暂存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface FieldExtras {
  label: string;
  hint?: string;
  error?: string;
}

const FormField = React.forwardRef<
  HTMLInputElement,
  FieldExtras & React.InputHTMLAttributes<HTMLInputElement>
>(({ label, hint, error, className: _ignored, ...props }, ref) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-2">
      <label className="text-xs font-medium text-ink-strong">{label}</label>
      {hint && (
        <span className="font-mono text-2xs text-ink-dim">{hint}</span>
      )}
    </div>
    <Input ref={ref} error={!!error} {...props} />
    {error && <p className="text-2xs text-danger">{error}</p>}
  </div>
));
FormField.displayName = 'FormField';

const SelectField = React.forwardRef<
  HTMLSelectElement,
  FieldExtras & {
    options: readonly string[];
  } & React.SelectHTMLAttributes<HTMLSelectElement>
>(({ label, hint, error, options, ...props }, ref) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-2">
      <label className="text-xs font-medium text-ink-strong">{label}</label>
      {hint && (
        <span className="font-mono text-2xs text-ink-dim">{hint}</span>
      )}
    </div>
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full appearance-none rounded-md px-3 pr-8 text-sm font-medium',
        'bg-canvas-card text-ink-strong border border-[var(--c-hairline-input)]',
        'transition-[border-color,box-shadow] duration-fast',
        'hover:border-ink/30 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:outline-none',
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B95A3' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
      }}
      {...props}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o === '' ? '(未指定 = 全部协议)' : o}
        </option>
      ))}
    </select>
    {error && <p className="text-2xs text-danger">{error}</p>}
  </div>
));
SelectField.displayName = 'SelectField';

function emptyToUndef(s?: string): string | undefined {
  return s && s.trim().length > 0 ? s.trim() : undefined;
}

function pickTargetArg(args: string[] | undefined, key: string): string | undefined {
  if (!args) return undefined;
  const idx = args.indexOf(key);
  if (idx === -1) return undefined;
  return args[idx + 1];
}
