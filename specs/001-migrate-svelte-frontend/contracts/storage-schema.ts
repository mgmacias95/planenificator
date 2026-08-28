/**
 * IndexedDB Local Storage Schema & Repository Contract
 */

import type { SavedFlightPlan } from '../../../frontend/src/lib/types/flight';

export const DB_NAME = 'planenificator_db';
export const DB_VERSION = 1;

export enum StoreNames {
  ACTIVE_SESSION = 'active_session',
  SAVED_PLANS = 'saved_plans'
}

export interface IFlightPlanRepository {
  /**
   * Initializes or upgrades the IndexedDB database structure.
   */
  init(): Promise<void>;

  /**
   * Saves or updates the active in-progress flight plan draft.
   */
  saveActiveSession(plan: SavedFlightPlan): Promise<void>;

  /**
   * Retrieves the active in-progress flight plan draft for crash/reload recovery.
   */
  getActiveSession(): Promise<SavedFlightPlan | null>;

  /**
   * Clears the active draft session.
   */
  clearActiveSession(): Promise<void>;

  /**
   * Lists all named user flight plans ordered by updated timestamp descending.
   */
  listSavedPlans(): Promise<SavedFlightPlan[]>;

  /**
   * Retrieves a single saved flight plan by its unique ID.
   */
  getSavedPlan(id: string): Promise<SavedFlightPlan | null>;

  /**
   * Saves or overwrites a named flight plan in the permanent store.
   */
  savePlan(plan: SavedFlightPlan): Promise<void>;

  /**
   * Deletes a saved flight plan by ID.
   */
  deletePlan(id: string): Promise<void>;
}
