// Thin wrapper over expo-notifications. All "what to schedule" logic lives in reminders.ts.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { PlannedNotification } from './reminders';

export const ITEM_CATEGORY = 'habit-item';
export const ACTION_DONE = 'done';
export const ACTION_LATER = 'later';
export const ACTION_SKIP = 'skip';

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
      const show = type === 'item';
      return { shouldShowBanner: show, shouldShowList: true, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
  try {
    await Notifications.setNotificationCategoryAsync(ITEM_CATEGORY, [
      { identifier: ACTION_DONE, buttonTitle: 'Done', options: { opensAppToForeground: false } },
      { identifier: ACTION_LATER, buttonTitle: 'Later (30 min)', options: { opensAppToForeground: false } },
      { identifier: ACTION_SKIP, buttonTitle: 'Skip', options: { opensAppToForeground: false } },
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
  chain = chain.then(async () => {
    if ((await getPermission()) !== 'granted') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const p of plan) {
      await Notifications.scheduleNotificationAsync({
        identifier: p.id,
        content: {
          title: p.title,
          body: p.body,
          data: p.data,
          sound: true,
          ...(p.category ? { categoryIdentifier: ITEM_CATEGORY } : {}),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at },
      });
    }
  }).catch((e) => console.warn('Notification sync failed', e));
  return chain;
}

export interface ItemResponse {
  /** unique per tap, for de-duplication */
  key: string;
  action: 'done' | 'later' | 'skip' | 'open';
  habitId: number | null;
  date: string | null;
}

export function parseResponse(r: Notifications.NotificationResponse): ItemResponse {
  const data = (r.notification.request.content.data ?? {}) as { habitId?: number; date?: string };
  const a = r.actionIdentifier;
  const action = a === ACTION_DONE ? 'done' : a === ACTION_LATER ? 'later' : a === ACTION_SKIP ? 'skip' : 'open';
  return {
    key: `${r.notification.request.identifier}|${r.notification.date}|${a}`,
    action,
    habitId: typeof data.habitId === 'number' ? data.habitId : null,
    date: typeof data.date === 'string' ? data.date : null,
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
