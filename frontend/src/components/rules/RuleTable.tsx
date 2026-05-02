import * as React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/Badge';
import { formatBytes, formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { CounterSample, Rule } from '@/types/api';

export interface RuleTableProps {
  rules: Rule[];
  onEdit?: (r: Rule) => void;
  onDelete?: (r: Rule) => void;
  onReorder?: (newSeqOrder: number[]) => void;
  liveCounters?: Map<string, CounterSample>;
}

export const RuleTable: React.FC<RuleTableProps> = ({
  rules,
  onEdit,
  onDelete,
  onReorder,
  liveCounters,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (rules.length === 0) {
    return (
      <div className="grid place-items-center gap-2 rounded-lg border border-dashed border-[var(--c-hairline-strong)] bg-canvas-tint/40 px-6 py-16 text-center">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-canvas-soft text-ink-dim">
          ◯
        </div>
        <p className="text-sm font-medium text-ink-strong">当前链中没有规则</p>
        <p className="text-xs text-ink-muted">点击右上角「+ 新建规则」开始</p>
      </div>
    );
  }

  const ids = rules.map((r) => r.seq);

  const handleDragEnd = (event: DragEndEvent) => {
    if (!onReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id as number);
    const newIndex = ids.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(rules, oldIndex, newIndex);
    onReorder(reordered.map((r) => r.seq));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="overflow-hidden rounded-lg border border-[var(--c-hairline)]">
        <table className="w-full caption-bottom text-sm tabular">
          <thead className="bg-canvas-tint border-b border-[var(--c-hairline)]">
            <tr>
              {onReorder && <th className="w-8" />}
              <th className="h-10 w-14 px-4 text-left text-2xs font-semibold uppercase tracking-wider text-ink-dim">#</th>
              <th className="h-10 px-4 text-left text-2xs font-semibold uppercase tracking-wider text-ink-dim">规则</th>
              <th className="h-10 w-28 px-4 text-left text-2xs font-semibold uppercase tracking-wider text-ink-dim">动作</th>
              <th className="h-10 w-44 px-4 text-left text-2xs font-semibold uppercase tracking-wider text-ink-dim">命中</th>
              <th className="h-10 w-24 px-4 text-2xs font-semibold uppercase tracking-wider text-ink-dim" />
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-b-0">
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {rules.map((r) => (
                <RuleRow
                  key={`${r.chain}-${r.seq}`}
                  rule={r}
                  draggable={!!onReorder}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  live={liveCounters?.get(counterKey(r))}
                />
              ))}
            </SortableContext>
          </tbody>
        </table>
      </div>
    </DndContext>
  );
};

const RuleRow: React.FC<{
  rule: Rule;
  draggable: boolean;
  onEdit?: (r: Rule) => void;
  onDelete?: (r: Rule) => void;
  live?: CounterSample;
}> = ({ rule: r, draggable, onEdit, onDelete, live }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: r.seq,
    disabled: !draggable,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const counters = live ?? r.counters;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        'group border-b border-[var(--c-hairline)] transition-colors duration-fast',
        'hover:bg-canvas-tint',
      )}
    >
      {draggable && (
        <td
          className="cursor-grab select-none px-2 text-ink-faint hover:text-ink-muted"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </td>
      )}
      <td className="px-4 py-3">
        <span className="inline-grid h-6 min-w-[28px] place-items-center rounded-md bg-canvas-soft px-1.5 font-mono text-2xs font-semibold text-ink-muted">
          {String(r.seq + 1).padStart(2, '0')}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="font-mono text-xs text-ink">
          {r.spec.protocol && (
            <>
              <span className="text-ink-dim">-p</span> {r.spec.protocol}{' '}
            </>
          )}
          {r.spec.in_interface && (
            <>
              <span className="text-ink-dim">-i</span> {r.spec.in_interface}{' '}
            </>
          )}
          {r.spec.out_interface && (
            <>
              <span className="text-ink-dim">-o</span> {r.spec.out_interface}{' '}
            </>
          )}
          {r.spec.source && (
            <>
              <span className="text-ink-dim">-s</span> {r.spec.source}{' '}
            </>
          )}
          {r.spec.destination && (
            <>
              <span className="text-ink-dim">-d</span> {r.spec.destination}{' '}
            </>
          )}
          {r.spec.dport && (
            <>
              <span className="text-ink-dim">--dport</span>{' '}
              <span className="text-brand">{r.spec.dport}</span>{' '}
            </>
          )}
          {r.spec.sport && (
            <>
              <span className="text-ink-dim">--sport</span>{' '}
              <span className="text-brand">{r.spec.sport}</span>{' '}
            </>
          )}
          {r.spec.matches?.map((m, i) => (
            <span key={i} className="text-ink-muted">
              <span className="text-ink-dim">-m</span> {m.name}{' '}
            </span>
          ))}
          {!r.spec.protocol &&
            !r.spec.dport &&
            !r.spec.source &&
            !r.spec.destination &&
            (r.spec.matches?.length ?? 0) === 0 && (
              <span className="text-ink-muted">默认（任意流量）</span>
            )}
        </div>
        {r.spec.comment && (
          <div className="mt-0.5 text-xs text-ink-muted truncate">
            {r.spec.comment}
          </div>
        )}
      </td>
      <td className="px-4 py-3">{actionPill(r.spec.jump)}</td>
      <td className="px-4 py-3">
        {counters ? (
          <div className="flex flex-col leading-tight">
            <span
              className={cn(
                'font-mono text-sm font-semibold tabular',
                live ? 'text-success' : 'text-ink-strong',
              )}
              title={live ? '实时计数' : '快照'}
            >
              {formatNumber(counters.packets)}
            </span>
            <span className="text-2xs text-ink-dim">
              {formatBytes(counters.bytes)}
            </span>
          </div>
        ) : (
          <span className="text-ink-dim">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-fast">
          {onEdit && (
            <button
              onClick={() => onEdit(r)}
              className="grid h-7 w-7 place-items-center rounded-md border border-[var(--c-hairline)] bg-canvas-card text-ink-muted hover:border-brand hover:bg-brand-tint hover:text-brand transition-colors duration-fast"
              title="编辑"
            >
              <EditIcon />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(r)}
              className="grid h-7 w-7 place-items-center rounded-md border border-[var(--c-hairline)] bg-canvas-card text-ink-muted hover:border-danger hover:bg-danger-tint hover:text-danger transition-colors duration-fast"
              title="删除"
            >
              <DeleteIcon />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

function actionPill(jump?: string) {
  if (!jump) return <Badge variant="outline">—</Badge>;
  switch (jump) {
    case 'ACCEPT':
      return (
        <Badge variant="success" dot>
          ACCEPT
        </Badge>
      );
    case 'DROP':
    case 'REJECT':
      return (
        <Badge variant="destructive" dot>
          {jump}
        </Badge>
      );
    case 'LOG':
      return (
        <Badge variant="warn" dot>
          LOG
        </Badge>
      );
    case 'RETURN':
      return <Badge variant="neutral">RETURN</Badge>;
    default:
      return <Badge variant="brand">{jump}</Badge>;
  }
}

export function counterKey(r: Rule): string {
  return `${r.family}:${r.table}:${r.chain}:${r.seq}`;
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}
function DeleteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
