"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { moveBy, moveItem } from "@/lib/offline-course-editor";
import { cn } from "@/lib/utils";
import type { ApiResult } from "./api";
import { notify } from "@/lib/notify";

/**
 * cursos-offline T11b — A reorderable list (lessons, topics, quizzes,
 * questions), two ways:
 *  - drag the handle (mouse/touch), or focus it and use Space + arrows
 *    (dnd-kit's keyboard sensor);
 *  - the "Subir"/"Bajar" buttons, one step at a time, for whoever finds the
 *    drag gesture awkward.
 *
 * The new order shows at once and the WHOLE id list goes to the server (the
 * API takes every child exactly once). If the server refuses, the list goes
 * back to what it was and says why.
 */

export type HandleProps = { index: number; count: number; handle: ReactNode };

const announcements = (labelOf: (id: string) => string): Announcements => ({
  onDragStart: ({ active }) => `Se tomó «${labelOf(String(active.id))}».`,
  onDragOver: ({ active, over }) =>
    over ? `«${labelOf(String(active.id))}» está sobre «${labelOf(String(over.id))}».` : undefined,
  onDragEnd: ({ active, over }) =>
    over ? `«${labelOf(String(active.id))}» se soltó en el lugar de «${labelOf(String(over.id))}».` : "Se soltó.",
  onDragCancel: ({ active }) => `Se canceló el movimiento de «${labelOf(String(active.id))}».`,
});

export function SortableList<T extends { id: string }>({
  items,
  itemLabel,
  onReorder,
  renderItem,
  className,
  itemClassName,
  disabled = false,
}: {
  items: readonly T[];
  /** What the handle and the announcements call each item. */
  itemLabel: (item: T) => string;
  onReorder: (ids: string[]) => Promise<ApiResult<unknown>>;
  renderItem: (item: T, handle: HandleProps) => ReactNode;
  className?: string;
  itemClassName?: string;
  disabled?: boolean;
}) {
  // A stable id keeps dnd-kit's aria ids equal on the server and the client.
  const dndId = useId();
  const incoming = useMemo(() => items.map((i) => i.id), [items]);
  const incomingKey = incoming.join("|");
  const [order, setOrder] = useState<string[]>(incoming);
  const [busy, setBusy] = useState(false);

  // The server's order wins whenever it changes (refresh after any edit).
  useEffect(() => {
    setOrder(incomingKey ? incomingKey.split("|") : []);
  }, [incomingKey]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const labelOf = (id: string) => {
    const item = byId.get(id);
    return item ? itemLabel(item) : id;
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function commit(next: string[]) {
    const previous = order;
    setOrder(next);
    setBusy(true);
    const result = await onReorder(next);
    setBusy(false);
    if (!result.ok) {
      setOrder(previous);
      notify.error(result.message);
    }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    void commit(moveItem(order, from, to));
  }

  const ordered = order.map((id) => byId.get(id)).filter((i): i is T => !!i);
  const locked = disabled || busy;

  return (
    <div className="space-y-1">
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements: announcements(labelOf),
          screenReaderInstructions: {
            draggable:
              "Para mover un elemento, presioná Espacio o Enter, usá las flechas y volvé a presionar Espacio o Enter para soltarlo. Escape cancela.",
          },
        }}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy} disabled={locked}>
          <ol className={className}>
            {ordered.map((item, index) => (
              <SortableRow key={item.id} id={item.id} className={itemClassName}>
                {(dragHandle) =>
                  renderItem(item, {
                    index,
                    count: ordered.length,
                    handle: (
                      <span className="flex shrink-0 items-center">
                        {dragHandle(`Mover «${itemLabel(item)}»`, locked)}
                        <MoveButton
                          label={`Subir «${itemLabel(item)}»`}
                          disabled={locked || index === 0}
                          onClick={() => {
                            const next = moveBy(order, item.id, -1);
                            if (next) void commit(next);
                          }}
                        >
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                        </MoveButton>
                        <MoveButton
                          label={`Bajar «${itemLabel(item)}»`}
                          disabled={locked || index === ordered.length - 1}
                          onClick={() => {
                            const next = moveBy(order, item.id, 1);
                            if (next) void commit(next);
                          }}
                        >
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                        </MoveButton>
                      </span>
                    ),
                  })
                }
              </SortableRow>
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function SortableRow({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: (dragHandle: (label: string, disabled: boolean) => ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
  };
  return (
    <li ref={setNodeRef} style={style} className={cn(className, isDragging && "relative z-10 shadow-lg")}>
      {children((label, disabled) => (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={label}
          title={label}
          disabled={disabled}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      ))}
    </li>
  );
}
