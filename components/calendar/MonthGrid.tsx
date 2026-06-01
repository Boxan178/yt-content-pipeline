'use client';

import { useMemo, useState } from 'react';
import { WEEKDAY_LABELS, type CalendarItem, type CalendarDragPayload } from '@/lib/calendar-types';

/**
 * Rejilla de un mes (semana empezando en lunes). Render + drag-drop; la
 * navegación, el filtro y el backlog viven en app/calendar/page.tsx.
 * Adaptado de youtube-dashboard/components/CalendarView.tsx (Luna) al design
 * system glass de ytcp.
 */

interface MonthGridProps {
  year: number;
  month: number; // 0-11
  items: CalendarItem[];
  onItemClick?: (item: CalendarItem) => void;
  /** Soltar algo (idea/vídeo/planificado) en un día. */
  onDropOnDay?: (day: number, payload: CalendarDragPayload) => void;
  /** Pulsar "+" para planificar manualmente en un día. */
  onAddToDay?: (day: number) => void;
}

/** Glifo de estado breve para el chip (sin recargar la celda). */
const STATUS_GLYPH: Record<CalendarItem['status'], { mark: string; cls: string }> = {
  planned: { mark: '', cls: '' },
  scheduled: { mark: '◷', cls: 'text-indigo-300' },
  pending: { mark: '', cls: '' },
  uploading: { mark: '↑', cls: 'text-blue-300' },
  done: { mark: '✓', cls: 'text-green-300' },
  failed: { mark: '✕', cls: 'text-red-300' },
  cancelled: { mark: '−', cls: 'text-zinc-500' },
};

export function MonthGrid({ year, month, items, onItemClick, onDropOnDay, onAddToDay }: MonthGridProps) {
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  // Mientras se arrastra un chip, los chips quedan pointer-events-none para que
  // dragenter/dragleave no salten en sus fronteras (evita el parpadeo del borde
  // de drag-over al pasar el puntero por encima de los chips hijos).
  const [dragging, setDragging] = useState(false);

  const { daysInMonth, firstDayOffset, trailing } = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    // getDay(): domingo=0. Queremos lunes=0 → desplazar.
    const firstDayOffset = (firstDay + 6) % 7;
    // Celdas de relleno al final para completar la última semana (borde inferior
    // recto en meses cuyo último día no cae en domingo).
    const trailing = (7 - ((firstDayOffset + daysInMonth) % 7)) % 7;
    return { daysInMonth, firstDayOffset, trailing };
  }, [year, month]);

  const itemsByDay = useMemo(() => {
    const map = new Map<number, CalendarItem[]>();
    for (const item of items) {
      const d = new Date(item.date);
      if (Number.isNaN(d.getTime())) continue;
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        const arr = map.get(day) ?? [];
        arr.push(item);
        map.set(day, arr);
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    return map;
  }, [items, year, month]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  function handleDrop(e: React.DragEvent, day: number) {
    e.preventDefault();
    setDragOverDay(null);
    setDragging(false);
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      onDropOnDay?.(day, JSON.parse(raw) as CalendarDragPayload);
    } catch {}
  }

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-2">
        {WEEKDAY_LABELS.map((wd, i) => (
          <div key={i} className="text-center text-[11px] font-medium uppercase tracking-label text-zinc-500">
            {wd}
          </div>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-2"
        onDragEnd={() => { setDragging(false); setDragOverDay(null); }}
      >
        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[104px] rounded-2xl border border-white/[0.03] bg-white/[0.01]" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dayItems = itemsByDay.get(day) ?? [];
          const isToday = isCurrentMonth && today.getDate() === day;
          const isDragOver = dragOverDay === day;
          return (
            <div
              key={day}
              onDragOver={(e) => { e.preventDefault(); setDragOverDay(day); }}
              onDragLeave={() => setDragOverDay((d) => (d === day ? null : d))}
              onDrop={(e) => handleDrop(e, day)}
              className={`group relative flex max-h-[180px] min-h-[104px] flex-col rounded-2xl border p-2 transition ${
                isDragOver
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/[0.12]'
                  : isToday
                  ? 'border-[color:var(--accent)]/50 bg-[color:var(--accent)]/[0.06]'
                  : 'border-white/5 bg-white/[0.02]'
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={`text-xs font-medium ${isToday ? 'text-accent' : 'text-zinc-400'}`}>{day}</span>
                {onAddToDay && (
                  <button
                    onClick={() => onAddToDay(day)}
                    className="hidden h-4 w-4 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-white group-hover:flex"
                    title="Planificar en este día"
                  >
                    +
                  </button>
                )}
              </div>
              <div className={`min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5 ${dragging ? '[&_button]:pointer-events-none' : ''}`}>
                {dayItems.map((item) => {
                  const glyph = STATUS_GLYPH[item.status];
                  const dimmed = item.status === 'cancelled' || item.status === 'failed';
                  const isPlanned = item.source === 'planned';
                  return (
                    <button
                      key={item.id}
                      draggable={isPlanned}
                      onDragStart={(e) => {
                        if (!isPlanned || !item.plannedId) return;
                        const payload: CalendarDragPayload = { kind: 'planned', plannedId: item.plannedId };
                        e.dataTransfer.setData('application/json', JSON.stringify(payload));
                        e.dataTransfer.effectAllowed = 'move';
                        setDragging(true);
                      }}
                      onDragEnd={() => { setDragging(false); setDragOverDay(null); }}
                      onClick={() => onItemClick?.(item)}
                      className={`flex w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-left text-[10px] text-white transition hover:brightness-150 ${
                        dimmed ? 'opacity-60' : ''
                      } ${isPlanned ? 'border-dashed' : 'border-transparent'}`}
                      style={{
                        backgroundColor: item.channelColor + (isPlanned ? '14' : '26'),
                        borderLeftWidth: '2px',
                        borderLeftStyle: 'solid',
                        borderLeftColor: item.channelColor,
                        ...(isPlanned ? { borderColor: item.channelColor + '66', borderLeftColor: item.channelColor } : {}),
                      }}
                      title={`${item.channelName} · ${item.title}${isPlanned ? ' · planificado (arrastra para mover)' : item.nativeSchedule ? ' · programado en YouTube' : ''}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {glyph.mark && <span className={`shrink-0 ${glyph.cls}`}>{glyph.mark}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {Array.from({ length: trailing }).map((_, i) => (
          <div key={`trailing-${i}`} className="min-h-[104px] rounded-2xl border border-white/[0.03] bg-white/[0.01]" />
        ))}
      </div>
    </div>
  );
}
