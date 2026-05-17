import type { PlaybackSegment, Recording } from "../services/api";
import type { MouseEvent } from "react";

type TimelineItem = PlaybackSegment | Recording;

type DayTimelineProps = {
  date: string;
  segments: TimelineItem[];
  currentSecond?: number | null;
  onSelect: (daySecond: number, segment?: TimelineItem) => void;
};

const daySeconds = 24 * 60 * 60;

function parseLocal(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function secondOfDay(value: string | null): number {
  const date = parseLocal(value);
  if (!date) return 0;
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function segmentRange(segment: TimelineItem): { start: number; end: number } {
  const start = secondOfDay(segment.startedAt);
  const fallbackEnd = start + (segment.durationSeconds ?? 0);
  const end = segment.endedAt ? secondOfDay(segment.endedAt) : fallbackEnd;
  return {
    start: clamp(start, 0, daySeconds),
    end: clamp(Math.max(end, fallbackEnd, start + 1), 0, daySeconds)
  };
}

export function findSegmentForSecond(segments: TimelineItem[], second: number): TimelineItem | undefined {
  return segments.find((segment) => {
    const range = segmentRange(segment);
    return second >= range.start && second <= range.end;
  });
}

export function DayTimeline({ date, segments, currentSecond, onSelect }: DayTimelineProps) {
  const sorted = [...segments].sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const second = clamp(Math.round(ratio * daySeconds), 0, daySeconds - 1);
    onSelect(second, findSegmentForSecond(sorted, second));
  }

  return (
    <div className="day-timeline">
      <div className="timeline-label-row">
        <span>{date || "Data"}</span>
        <span>{formatClock(currentSecond ?? 0)}</span>
      </div>
      <div className="timeline-track" onClick={handleClick} role="button" tabIndex={0}>
        {sorted.map((segment) => {
          const range = segmentRange(segment);
          const left = (range.start / daySeconds) * 100;
          const width = Math.max(0.25, ((range.end - range.start) / daySeconds) * 100);
          return (
            <span
              key={segment.id}
              className={segment.isProtected ? "timeline-block protected" : "timeline-block"}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${formatClock(range.start)} - ${formatClock(range.end)}`}
            />
          );
        })}
        {typeof currentSecond === "number" ? (
          <span
            className="timeline-cursor"
            style={{ left: `${(clamp(currentSecond, 0, daySeconds) / daySeconds) * 100}%` }}
          />
        ) : null}
      </div>
      <div className="timeline-axis">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:59</span>
      </div>
    </div>
  );
}
