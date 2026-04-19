"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildMonthGrid,
  countDayEvents,
  emptyDayBucket,
  fetchCalendar,
  fmtDateKey,
  getDayBucket,
  monthLabel,
  parseDateKey,
  type CalendarDayBucket,
  type CalendarLineWorksSummary,
} from "@/lib/calendar-api";
import { DayDetailPanel } from "./DayDetailPanel";

interface Props {
  onOpenAttachment: (id: number, fileName: string | null, mimeType: string | null) => void;
  onOpenMessage: (message: CalendarLineWorksSummary) => void;
}

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;

export function CalendarView({ onOpenAttachment, onOpenMessage }: Props) {
  const [anchor, setAnchor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string>(() => fmtDateKey(new Date()));
  const [days, setDays] = useState<Record<string, CalendarDayBucket>>({});
  const [loading, setLoading] = useState(false);

  const grid = useMemo(() => buildMonthGrid(anchor), [anchor]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void fetchCalendar(grid.gridFrom, grid.gridTo)
      .then((resp) => {
        if (mounted) setDays(resp.days);
      })
      .catch((error) => {
        console.error("[calendar] fetch failed", error);
        if (mounted) setDays({});
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [grid.gridFrom, grid.gridTo]);

  const selectedBucket = getDayBucket(days, selected);
  const todayKey = fmtDateKey(new Date());

  function shiftMonth(delta: number) {
    setAnchor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function goToday() {
    const now = new Date();
    setAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(fmtDateKey(now));
  }

  return (
    <section className="calendar-wrapper">
      <div className="calendar-main">
        <header className="calendar-head">
          <div className="calendar-nav">
            <button type="button" className="icon-button" onClick={() => shiftMonth(-1)}>
              ◀
            </button>
            <h2 className="calendar-month">{monthLabel(anchor)}</h2>
            <button type="button" className="icon-button" onClick={() => shiftMonth(1)}>
              ▶
            </button>
          </div>
          <button type="button" className="secondary-button" onClick={goToday}>
            오늘
          </button>
        </header>

        <div className={`calendar-grid ${loading ? "is-loading" : ""}`.trim()}>
          <div className="calendar-weekdays">
            {WEEKDAYS.map((w) => (
              <div key={w} className="calendar-weekday">
                {w}
              </div>
            ))}
          </div>
          <div className="calendar-cells">
            {grid.weeks.flat().map((dateKey) => {
              const inMonth = dateKey >= grid.monthStart && dateKey <= grid.monthEnd;
              const bucket = getDayBucket(days, dateKey);
              const count = countDayEvents(bucket);
              const isSelected = dateKey === selected;
              const isToday = dateKey === todayKey;
              const d = parseDateKey(dateKey);
              return (
                <button
                  key={dateKey}
                  type="button"
                  className={[
                    "calendar-cell",
                    inMonth ? "" : "muted",
                    isSelected ? "selected" : "",
                    isToday ? "today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelected(dateKey)}
                >
                  <span className="calendar-cell-date">{d.getDate()}</span>
                  {count > 0 ? (
                    <span className="calendar-cell-badges">
                      {bucket.tasks.length > 0 ? (
                        <span className="calendar-badge badge-task">태스크 {bucket.tasks.length}</span>
                      ) : null}
                      {bucket.notion.length > 0 ? (
                        <span className="calendar-badge badge-notion">📄 {bucket.notion.length}</span>
                      ) : null}
                      {bucket.github.length > 0 ? (
                        <span className="calendar-badge badge-github">🔖 {bucket.github.length}</span>
                      ) : null}
                      {bucket.lineWorks.length > 0 ? (
                        <span className="calendar-badge badge-lw">💬 {bucket.lineWorks.length}</span>
                      ) : null}
                      {bucket.storage.length > 0 ? (
                        <span className="calendar-badge badge-storage">📎 {bucket.storage.length}</span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <DayDetailPanel
        dateKey={selected}
        bucket={selectedBucket ?? emptyDayBucket()}
        onOpenAttachment={onOpenAttachment}
        onOpenMessage={onOpenMessage}
      />
    </section>
  );
}
