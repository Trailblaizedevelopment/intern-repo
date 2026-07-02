/**
 * Maps CRM board "App" (Web App / Mobile App) ↔ Linear project names.
 * CRM `tickets.project` stores the app tab value, not the Linear project name.
 */

export const CRM_APP_WEB = 'Web App' as const;
export const CRM_APP_MOBILE = 'Mobile App' as const;

export type CrmApp = typeof CRM_APP_WEB | typeof CRM_APP_MOBILE;

const DEFAULT_LINEAR_MOBILE_PROJECT = 'Trailblaize: Mobile';

/** Linear project name for mobile app tickets (override via env after sync). */
export function getLinearMobileProjectName(): string {
  return (
    process.env.LINEAR_MOBILE_PROJECT_NAME?.trim() ||
    DEFAULT_LINEAR_MOBILE_PROJECT
  );
}

/** Optional stable UUID from Linear — skips name lookup when set. */
export function getLinearMobileProjectId(): string | null {
  const id = process.env.LINEAR_MOBILE_PROJECT_ID?.trim();
  return id || null;
}

/** CRM App tab → Linear project name for issueCreate (null = no project). */
export function mapCrmAppToLinearProjectName(app: string | null | undefined): string | null {
  const normalized = (app ?? CRM_APP_WEB).trim();
  if (normalized === CRM_APP_MOBILE) {
    return getLinearMobileProjectName();
  }
  return null;
}

/** Linear project name → CRM App tab for board filters. */
export function mapLinearProjectNameToCrmApp(
  linearProjectName: string | null | undefined
): CrmApp {
  if (!linearProjectName?.trim()) {
    return CRM_APP_WEB;
  }

  const mobileName = getLinearMobileProjectName().toLowerCase();
  const linearName = linearProjectName.trim().toLowerCase();

  if (linearName === mobileName || linearName.includes('mobile')) {
    return CRM_APP_MOBILE;
  }

  return CRM_APP_WEB;
}

export function isCrmApp(value: string | null | undefined): value is CrmApp {
  return value === CRM_APP_WEB || value === CRM_APP_MOBILE;
}
