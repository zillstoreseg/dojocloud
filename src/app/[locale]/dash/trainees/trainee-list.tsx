'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { initials } from '@/lib/utils';
import { TraineeForm, type TraineeFormValues } from './trainee-form';
import { setTraineeStatus, deleteTrainee } from './actions';

export interface TraineeRow extends TraineeFormValues {
  id: string;
  status: string;
  statusLabel: string;
  goalLabel: string;
  renewalLabel: string | null;
  /** Days until renewal; negative means overdue, null means none set. */
  renewalIn: number | null;
}

interface Props {
  rows: TraineeRow[];
  options: {
    goals: { value: string; label: string }[];
    activity: { value: string; label: string }[];
  };
  labels: Record<string, string>;
  /** Rendered when the trainer has no trainees at all (not just no matches). */
  isEmpty: boolean;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'muted' | 'destructive'> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  EXPIRED: 'destructive',
  ARCHIVED: 'muted',
};

export function TraineeList({ rows, options, labels, isEmpty }: Props) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TraineeFormValues | undefined>();
  const [, startAction] = useTransition();

  function openAdd() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(row: TraineeRow) {
    setEditing(row);
    setFormOpen(true);
  }

  function changeStatus(id: string, status: string) {
    startAction(async () => {
      await setTraineeStatus({ id, status: status as never });
      router.refresh();
    });
  }

  function remove(id: string, name: string) {
    if (!confirm(labels.confirmDelete.replace('{name}', name))) return;
    startAction(async () => {
      await deleteTrainee({ id });
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={openAdd}>
          <Plus />
          {labels.add}
        </Button>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<UserPlus />}
          title={labels.emptyTitle}
          description={labels.emptyDescription}
          action={
            <Button size="sm" onClick={openAdd}>
              {labels.add}
            </Button>
          }
        />
      ) : (
        <div className="table-wrap bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.colName}</TableHead>
                <TableHead>{labels.colGoal}</TableHead>
                <TableHead>{labels.colStatus}</TableHead>
                <TableHead>{labels.colRenewal}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={5}>{labels.noMatches}</TableEmpty>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/dash/trainees/${row.id}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <Avatar className="size-9">
                          <AvatarFallback className="text-xs">
                            {initials(row.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.fullName}</p>
                          {row.phone ? (
                            <p className="truncate text-xs text-muted-foreground" dir="ltr">
                              {row.phone}
                            </p>
                          ) : null}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.goalLabel}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status] ?? 'muted'}>
                        {row.statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.renewalLabel ? (
                        <span
                          className={
                            row.renewalIn !== null && row.renewalIn <= 7
                              ? 'font-medium text-warning'
                              : 'text-muted-foreground'
                          }
                        >
                          {row.renewalLabel}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={labels.actions}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(row)}>
                            <Pencil />
                            {labels.edit}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {row.status !== 'ACTIVE' ? (
                            <DropdownMenuItem onClick={() => changeStatus(row.id, 'ACTIVE')}>
                              {labels.activate}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => changeStatus(row.id, 'PAUSED')}>
                              {labels.pause}
                            </DropdownMenuItem>
                          )}
                          {row.status !== 'ARCHIVED' ? (
                            <DropdownMenuItem onClick={() => changeStatus(row.id, 'ARCHIVED')}>
                              {labels.archive}
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onClick={() => remove(row.id, row.fullName)}>
                            <Trash2 />
                            {labels.delete}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <TraineeForm
        // Remounting on the edited row clears state between opens without a
        // reset effect.
        key={editing?.id ?? 'new'}
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        options={options}
        labels={labels}
      />
    </>
  );
}
