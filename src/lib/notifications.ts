// Thin wrapper over expo-notifications. All "what to schedule" logic lives in reminders.ts.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { PlannedNotification } from './reminders';

export const ITEM_CATEGORY = 'habit-item';
export const ACTION_DONE = 'done';
export const ACTION_LATER = 'later';
export const ACTION_SKIP = 'skip';
export const ACTION_START = 'start';
const TIMER_PREFIX = 'timer-';
/** Scheduled outside the planner (timers, cut-back follow-ups); re-planning leaves them alone. */
const FOLLOW_PREFIX = 'follow-';
const KEEP = [TIMER_PREFIX, FOLLOW_PREFIX];
export const FEEL_CATEGORY = 'cutback-feel';
export const ACTION_NOTE = 'note';
const FEEL_ACTION = /^feel-([1-5])$/;
/** Focus round done: Break · Keep going · Done (each opens the app on the Focus screen). */
export const FOCUS_END_CATEGORY = 'focus-end';
export const FOCUS_ACTIONS = ['focus-break', 'focus-keep', 'focus-done'] as const;
export type FocusAction = (typeof FOCUS_ACTIONS)[number];

/** 'item' → Done / Later / Skip. 'start-15' → Start 15 min / Later / Skip (avoid habits). */
const categoryId = (c: string) => (c === 'item' ? ITEM_CATEGORY : `habit-${c}`);

const registeredStart = new Set<number>();
async function ensureStartCategories(plan: PlannedNotification[]) {
  for (const p of plan) {
    const m = p.category?.match(/^start-(\d+)$/);
    if (!m) continue;
    const n = Number(m[1]);
    if (registeredStart.has(n)) continue;
    registeredStart.add(n);
    try {
      await Notifications.setNotificationCategoryAsync(`habit-start-${n}`, [
        // Starting opens the app to the timer.
        { identifier: ACTION_START, buttonTitle: `Start ${n} min`, options: { opensAppToForeground: true } },
        { identifier: ACTION_LATER, buttonTitle: 'Later (30 min)', options: { opensAppToForeground: false } },
        { identifier: ACTION_SKIP, buttonTitle: 'Skip', options: { opensAppToForeground: false } },
      ]);
    } catch (e) {
      registeredStart.delete(n);
      console.warn('Could not register start action', e);
    }
  }
}

/** "Time's up" alert for a running session, in case the app is in the background. */
export interface TimerAlertOptions {
  /** Buttons on the notification (e.g. Focus done: Break · Keep going · Done). */
  category?: string;
  /** 'background' = only shown when the app isn't open (Meditate's "10 minutes. Done."). */
  when?: 'always' | 'background';
}

export async function scheduleTimerEnd(
  habitId: number | string,
  at: Date,
  title: string,
  body: string,
  opts: TimerAlertOptions = {},
) {
  if (!supported || (await getPermission()) !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    identifier: `${TIMER_PREFIX}${habitId}`,
    content: {
      title,
      body,
      sound: true,
      data: { type: opts.when === 'background' ? 'timer-quiet' : 'timer', timerKey: String(habitId) },
      ...(opts.category ? { categoryIdentifier: opts.category } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
}

/** "How do you feel now?" N minutes after a cut-back log, with 1–5 buttons and a note field. */
export async function scheduleFollowUp(occurrenceId: number, at: Date, title: string) {
  if (!supported || (await getPermission()) !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    identifier: `${FOLLOW_PREFIX}${occurrenceId}`,
    content: {
      title,
      body: 'Long-press to answer 1–5, or add a short note.',
      sound: true,
      categoryIdentifier: FEEL_CATEGORY,
      data: { type: 'follow', occurrenceId },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
}

export async function cancelFollowUp(occurrenceId: number) {
  if (!supported) return;
  await Notifications.cancelScheduledNotificationAsync(`${FOLLOW_PREFIX}${occurrenceId}`).catch(() => {});
}

export async function cancelTimerEnd(habitId: number | string) {
  if (!supported) return;
  await Notifications.cancelScheduledNotificationAsync(`${TIMER_PREFIX}${habitId}`).catch(() => {});
}

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

let initialised = false;

/** Call once at startup: foreground presentation + the Done / Later / Skip buttons. */
export async function initNotifications() {
  if (!supported || initialised) return;
  initialised = true;
  Notifications.setNotificationHandler({
    // While the app is open, item reminders still show as banners; the morning / evening
    // summaries don't, because the in-app banners already say the same thing.
    handleNotification: async (n) => {
      const type = (n.request.content.data as { type?: string } | undefined)?.type;
      const show = type === 'item' || type === 'timer' || type === 'follow';
      return { shouldShowBanner: show, shouldShowList: true, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
  try {
    await Notifications.setNotificationCategoryAsync(ITEM_CATEGORY, [
      { identifier: ACTION_DONE, buttonTitle: 'Done', options: { opensAppToForeground: false } },
      { identifier: ACTION_LATER, buttonTitle: 'Later (30 min)', options: { opensAppToForeground: false } },
      { identifier: ACTION_SKIP, buttonTitle: 'Skip', options: { opensAppToForeground: false } },
    ]);
    await Notifications.setNotificationCategoryAsync(FOCUS_END_CATEGORY, [
      { identifier: 'focus-break', buttonTitle: 'Break', options: { opensAppToForeground: true } },
      { identifier: 'focus-keep', buttonTitle: 'Keep going', options: { opensAppToForeground: true } },
      { identifier: 'focus-done', buttonTitle: 'Done', options: { opensAppToForeground: true } },
    ]);
    await Notifications.setNotificationCategoryAsync(FEEL_CATEGORY, [
      ...['Drained', 'Meh', 'Okay', 'Good', 'Great'].map((label, i) => ({
        identifier: `feel-${i + 1}`,
        buttonTitle: `${i + 1} · ${label}`,
        options: { opensAppToForeground: false },
      })),
      {
        identifier: ACTION_NOTE,
        buttonTitle: 'Add a note',
        textInput: { submitButtonTitle: 'Save', placeholder: 'A few words' },
        options: { opensAppToForeground: false },
      },
    ]);
  } catch (e) {
    console.warn('Could not register notification actions', e);
  }
}

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getPermission(): Promise<PermissionState> {
  if (!supported) return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

/** Ask only if iOS will still show the prompt. */
export async function requestPermission(): Promise<PermissionState> {
  if (!supported) return 'unsupported';
  const current = await getPermission();
  if (current !== 'undetermined') return current;
  const p = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return p.granted ? 'granted' : 'denied';
}

// Serialise syncs so overlapping calls can't interleave cancel/schedule.
let chain: Promise<void> = Promise.resolve();

/** Replace everything pending with `plan`. */
export function syncNotifications(plan: PlannedNotification[]): Promise<void> {
  if (!supported) return Promise.resolve();
  chain = chain
    .then(async () => {
      if ((await getPermission()) !== 'granted') return;
      // Replace everything we plan; leave a running session timer's alert alone.
      const pending = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of pending) {
        if (!KEEP.some((k) => n.identifier.startsWith(k)))
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
      await ensureStartCategories(plan);
      for (const p of plan) {
        await Notifications.scheduleNotificationAsync({
          identifier: p.id,
          content: {
            title: p.title,
            body: p.body,
            data: p.data,
            sound: true,
            ...(p.category ? { categoryIdentifier: categoryId(p.category) } : {}),
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at },
        });
      }
    })
    .catch((e) => console.warn('Notification sync failed', e));
  return chain;
}

export interface ItemResponse {
  /** unique per tap, for de-duplication */
  key: string;
  action: 'done' | 'later' | 'skip' | 'start' | 'feel' | 'note' | 'open';
  habitId: number | null;
  date: string | null;
  /** what the notification was: item / morning / evening / timer / follow / wait */
  type: string | null;
  /** cut-back follow-ups */
  occurrenceId: number | null;
  feeling: number | null;
  text: string | null;
  /** timer alerts: which timer (focus / meditate / session-…) and a Focus button, if tapped */
  timerKey: string | null;
  focusAction: FocusAction | null;
}

export function parseResponse(r: Notifications.NotificationResponse): ItemResponse {
  const data = (r.notification.request.content.data ?? {}) as {
    habitId?: number;
    date?: string;
    type?: string;
    occurrenceId?: number;
    timerKey?: string;
  };
  const a = r.actionIdentifier;
  const feel = a.match(FEEL_ACTION);
  const action: ItemResponse['action'] = feel
    ? 'feel'
    : a === ACTION_NOTE
      ? 'note'
      : a === ACTION_DONE
        ? 'done'
        : a === ACTION_LATER
          ? 'later'
          : a === ACTION_SKIP
            ? 'skip'
            : a === ACTION_START
              ? 'start'
              : 'open';
  return {
    key: `${r.notification.request.identifier}|${r.notification.date}|${a}`,
    action,
    habitId: typeof data.habitId === 'number' ? data.habitId : null,
    date: typeof data.date === 'string' ? data.date : null,
    type: typeof data.type === 'string' ? data.type : null,
    occurrenceId: typeof data.occurrenceId === 'number' ? data.occurrenceId : null,
    feeling: feel ? Number(feel[1]) : null,
    text: typeof r.userText === 'string' && r.userText.trim() ? r.userText.trim() : null,
    timerKey: typeof data.timerKey === 'string' ? data.timerKey : null,
    focusAction: (FOCUS_ACTIONS as readonly string[]).includes(a) ? (a as FocusAction) : null,
  };
}

/** Listen for taps / action buttons. Also replays the response that launched the app, if any. */
export function listenForResponses(handler: (r: ItemResponse) => void): () => void {
  if (!supported) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((r) => handler(parseResponse(r)));
  const last = Notifications.getLastNotificationResponse();
  if (last) {
    handler(parseResponse(last));
    Notifications.clearLastNotificationResponse();
  }
  return () => sub.remove();
}
