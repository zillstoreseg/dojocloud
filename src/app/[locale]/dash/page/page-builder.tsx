'use client';

import { useState, useTransition, type ReactNode } from 'react';
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
import {
  Eye,
  EyeOff,
  GripVertical,
  Monitor,
  Plus,
  Settings2,
  Smartphone,
  Tablet,
  Trash2,
  Rocket,
  Undo2,
} from 'lucide-react';
import type { BlockType, PageStatus } from '@prisma/client';
import { BLOCK_LABELS, BLOCK_HINTS, SINGLETON_BLOCKS, type PageTheme } from '@/lib/page-blocks';
import { cn } from '@/lib/utils';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LandingBlock } from '@/components/landing/blocks';
import type { LandingContext, BlockNode } from '@/components/landing/context';
import { BlockInspector } from './block-inspector';
import { PageSettings } from './page-settings';
import { ShareDialog } from './share-dialog';
import { addBlock, deleteBlock, reorderBlocks, setPageStatus, toggleBlock } from './actions';

export interface BuilderPage {
  id: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  status: PageStatus;
  username: string;
  viewsCount: number;
  leadsCount: number;
}

type Viewport = 'mobile' | 'tablet' | 'desktop';

const VIEWPORT_WIDTH: Record<Viewport, string> = {
  mobile: '390px',
  tablet: '768px',
  desktop: '100%',
};

/**
 * Three-column editor: block library, live preview, block inspector.
 *
 * The preview is the real renderer, not a facsimile, so there is exactly one
 * definition of what a block looks like. Reordering is optimistic — the list
 * settles under the cursor and the server catches up — and the local order is
 * dropped whenever the server sends a new one.
 */
export function PageBuilder({
  locale,
  page,
  theme,
  blocks: serverBlocks,
  ctx,
  available,
  packages,
}: {
  locale: string;
  page: BuilderPage;
  theme: PageTheme;
  blocks: BlockNode[];
  ctx: LandingContext;
  available: BlockType[];
  packages: { id: string; label: string }[];
}) {
  const router = useRouter();
  const isAr = locale === 'ar';

  const [blocks, setBlocks] = useState(serverBlocks);
  const [seen, setSeen] = useState(serverBlocks);
  if (seen !== serverBlocks) {
    setSeen(serverBlocks);
    setBlocks(serverBlocks);
  }

  const [selectedId, setSelectedId] = useState<string | null>(serverBlocks[0]?.id ?? null);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [panel, setPanel] = useState<'inspector' | 'settings'>('inspector');
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const selected = blocks.find((b) => b.id === selectedId) ?? null;
  const used = new Set(blocks.map((b) => b.type));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startBusy(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? (isAr ? 'حصل خطأ' : 'Something went wrong'));
      router.refresh();
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const next = arrayMove(
      blocks,
      blocks.findIndex((b) => b.id === active.id),
      blocks.findIndex((b) => b.id === over.id),
    );
    setBlocks(next);
    run(() => reorderBlocks({ pageId: page.id, blockIds: next.map((b) => b.id) }));
  }

  const published = page.status === 'PUBLISHED';

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge variant={published ? 'success' : 'muted'}>
            {published ? (isAr ? 'منشورة' : 'Live') : isAr ? 'مسودة' : 'Draft'}
          </Badge>
          <span className="hidden text-xs text-muted-foreground sm:inline" dir="ltr">
            /c/{page.username}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5">
          {([
            ['mobile', Smartphone],
            ['tablet', Tablet],
            ['desktop', Monitor],
          ] as const).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setViewport(key)}
              aria-label={key}
              aria-pressed={viewport === key}
              className={cn(
                'rounded px-2 py-1.5 text-muted-foreground transition-colors',
                viewport === key && 'bg-accent text-foreground',
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <ShareDialog locale={locale} username={page.username} isAr={isAr} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPanel(panel === 'settings' ? 'inspector' : 'settings')}
          >
            <Settings2 />
            {isAr ? 'إعدادات' : 'Settings'}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            variant={published ? 'outline' : 'default'}
            onClick={() => run(() => setPageStatus({ pageId: page.id, publish: !published }))}
          >
            {published ? <Undo2 /> : <Rocket />}
            {published ? (isAr ? 'رجّعها مسودة' : 'Unpublish') : isAr ? 'انشر' : 'Publish'}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" className="m-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid flex-1 gap-0 lg:grid-cols-[15rem_1fr_20rem]">
        {/* Block library + outline */}
        <aside className="order-2 border-t border-border/60 lg:order-none lg:border-e lg:border-t-0">
          <div className="space-y-4 p-4">
            <div>
              <p className="eyebrow mb-2">{isAr ? 'ترتيب الصفحة' : 'Page outline'}</p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext
                  items={blocks.map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="space-y-1">
                    {blocks.map((block) => (
                      <OutlineRow
                        key={block.id}
                        block={block}
                        locale={locale}
                        selected={block.id === selectedId}
                        onSelect={() => {
                          setSelectedId(block.id);
                          setPanel('inspector');
                        }}
                        onToggle={() =>
                          run(() => toggleBlock({ id: block.id, isVisible: !block.isVisible }))
                        }
                        onDelete={() => {
                          if (!confirm(isAr ? 'تحذف البلوك ده؟' : 'Delete this block?')) return;
                          if (selectedId === block.id) setSelectedId(null);
                          run(() => deleteBlock({ id: block.id }));
                        }}
                        disabled={busy}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            </div>

            <div>
              <p className="eyebrow mb-2">{isAr ? 'أضف بلوك' : 'Add a block'}</p>
              <ul className="space-y-1">
                {available.map((type) => {
                  const blocked = SINGLETON_BLOCKS.has(type) && used.has(type);
                  return (
                    <li key={type}>
                      <button
                        type="button"
                        disabled={blocked || busy}
                        title={BLOCK_HINTS[type][isAr ? 'ar' : 'en']}
                        onClick={() => run(() => addBlock({ pageId: page.id, type }))}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm transition-colors',
                          blocked
                            ? 'cursor-default text-muted-foreground/50'
                            : 'hover:bg-accent',
                        )}
                      >
                        <Plus className="size-3.5 shrink-0" />
                        <span className="truncate">{BLOCK_LABELS[type][isAr ? 'ar' : 'en']}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </aside>

        {/* Live preview */}
        <div className="order-1 min-w-0 bg-muted/40 p-4 lg:order-none">
          <div
            className="mx-auto overflow-hidden rounded-lg border border-border/60 bg-background shadow-lift transition-[max-width] duration-300"
            style={{ maxWidth: VIEWPORT_WIDTH[viewport] }}
          >
            {blocks.length === 0 ? (
              <p className="p-16 text-center text-sm text-muted-foreground">
                {isAr ? 'ضيف بلوك من الشمال عشان تبدأ' : 'Add a block to get started'}
              </p>
            ) : (
              blocks.map((block) => (
                <PreviewFrame
                  key={block.id}
                  selected={block.id === selectedId}
                  hidden={!block.isVisible}
                  label={BLOCK_LABELS[block.type][isAr ? 'ar' : 'en']}
                  onSelect={() => {
                    setSelectedId(block.id);
                    setPanel('inspector');
                  }}
                >
                  <LandingBlock node={block} ctx={ctx} />
                </PreviewFrame>
              ))
            )}
          </div>
        </div>

        {/* Inspector */}
        <aside className="order-3 border-t border-border/60 lg:order-none lg:border-s lg:border-t-0">
          {panel === 'settings' ? (
            <PageSettings page={page} theme={theme} isAr={isAr} />
          ) : selected ? (
            <BlockInspector
              key={selected.id}
              block={selected}
              isAr={isAr}
              packages={packages}
              stats={{ views: page.viewsCount, leads: page.leadsCount }}
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              {isAr ? 'اختر بلوك عشان تعدّله' : 'Pick a block to edit it'}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function OutlineRow({
  block,
  locale,
  selected,
  onSelect,
  onToggle,
  onDelete,
  disabled,
}: {
  block: BlockNode;
  locale: string;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const isAr = locale === 'ar';

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors',
        selected ? 'bg-primary/10' : 'hover:bg-accent',
        isDragging && 'z-10 shadow-lift',
        !block.isVisible && 'opacity-50',
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted-foreground active:cursor-grabbing"
        aria-label={isAr ? 'اسحب لإعادة الترتيب' : 'Drag to reorder'}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>

      <button type="button" onClick={onSelect} className="min-w-0 flex-1 py-1 text-start text-sm">
        <span className="truncate">{BLOCK_LABELS[block.type][isAr ? 'ar' : 'en']}</span>
      </button>

      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-label={block.isVisible ? (isAr ? 'إخفاء' : 'Hide') : isAr ? 'إظهار' : 'Show'}
        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        {block.isVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label={isAr ? 'حذف' : 'Delete'}
        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

/** Click target and selection outline drawn over a block in the preview. */
function PreviewFrame({
  children,
  selected,
  hidden,
  label,
  onSelect,
}: {
  children: ReactNode;
  selected: boolean;
  hidden: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative cursor-pointer transition-shadow',
        hidden && 'opacity-40',
        selected
          ? 'shadow-[inset_0_0_0_2px_hsl(var(--primary))]'
          : 'hover:shadow-[inset_0_0_0_2px_hsl(var(--primary)/0.3)]',
      )}
    >
      {selected ? (
        <span className="absolute end-2 top-2 z-10 rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">
          {label}
        </span>
      ) : null}
      {/* The preview is a picture of the page, not the page: nothing inside it
          should be reachable by keyboard or clickable in its own right. */}
      <div className="pointer-events-none">{children}</div>
    </div>
  );
}
