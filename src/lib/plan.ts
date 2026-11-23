// Everything the notification planner reads, gathered in one place, so the background re-plan
// and the Reminders page's Upcoming list always agree.
import type { DayRecord, Habit, ReminderSettings } from '../types';
import { planNotifications, type PlannedNotification } from './reminders';
import { windDownAnchor, type DayClose } from './dayClose';
import { horizonOn } from './direction';
import type { NotToday } from './notToday';
import type { NudgeLogRow } from './nudges';
import type { Ctx, RecordIndex } from './schedule';

export interface PlanSources {
  habits: Habit[];
  records?: DayRecord[];
  idx: RecordIndex;
  ctx: Ctx;
  reminders: ReminderSettings;
  dayCloses: DayClose[];
  notToday: NotToday[];
  weeks: Record<string, string>;
  months: Record<string, string>;
  nudgeLog: NudgeLogRow[];
}

export function buildPlan(s: PlanSources, now: Date): PlannedNotification[] {
  const close = {
    windDown: windDownAnchor(s.habits)?.scheduled_time ?? null,
    closed: s.dayCloses.map((c) => c.date),
    better: Object.fromEntries(s.dayCloses.filter((c) => c.better).map((c) => [c.date, c.better as string])),
  };
  const nudges = {
    log: s.nudgeLog,
    notToday: s.notToday,
    weeks: s.weeks,
    horizon: horizonOn(s.months, s.ctx.today)?.line ?? null,
  };
  return planNotifications(s.habits, s.idx, s.ctx, s.reminders, now, close, nudges);
}
