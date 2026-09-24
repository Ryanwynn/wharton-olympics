"use client";
import { track as vercelTrack } from "@vercel/analytics";

/**
 * Thin wrapper over Vercel Web Analytics custom events. Vercel already records
 * pageviews, visitors, referrers, devices, geo and Core Web Vitals automatically;
 * these custom events capture the product funnels (sign-in intent, registrations,
 * team formation, feature engagement) a PM needs to judge and improve the site.
 *
 * Allowed value types are string | number | boolean | null, so we coerce.
 */
export type EventName =
  | "signin_click"
  | "event_register"
  | "event_withdraw"
  | "waitlist_join"
  | "team_create"
  | "team_join"
  | "team_leave"
  | "bracket_view"
  | "maps_click"
  | "foodtruck_menu_click"
  | "events_filter";

export function track(event: EventName, props?: Record<string, string | number | boolean | null | undefined>) {
  try {
    const clean: Record<string, string | number | boolean | null> = {};
    if (props) for (const [k, v] of Object.entries(props)) clean[k] = v === undefined ? null : v;
    vercelTrack(event, clean);
  } catch {
    /* never let analytics break a user action */
  }
}
