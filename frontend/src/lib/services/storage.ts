import { openDB, type IDBPDatabase } from 'idb';
import type { SavedFlightPlan } from '$lib/types/flight';

export const DB_NAME = 'planenificator_db';
export const DB_VERSION = 1;

export enum StoreNames {
	ACTIVE_SESSION = 'active_session',
	SAVED_PLANS = 'saved_plans'
}

export class FlightPlanStorageService {
	private dbPromise: Promise<IDBPDatabase> | null = null;

	private async getDb(): Promise<IDBPDatabase> {
		if (!this.dbPromise) {
			this.dbPromise = openDB(DB_NAME, DB_VERSION, {
				upgrade(db) {
					if (!db.objectStoreNames.contains(StoreNames.ACTIVE_SESSION)) {
						db.createObjectStore(StoreNames.ACTIVE_SESSION, { keyPath: 'id' });
					}
					if (!db.objectStoreNames.contains(StoreNames.SAVED_PLANS)) {
						const savedStore = db.createObjectStore(StoreNames.SAVED_PLANS, { keyPath: 'id' });
						savedStore.createIndex('by_updatedAt', 'updatedAt');
					}
				}
			});
		}
		return this.dbPromise;
	}

	async init(): Promise<void> {
		await this.getDb();
	}

	async saveActiveSession(plan: SavedFlightPlan): Promise<void> {
		const db = await this.getDb();
		const sessionRecord = { ...plan, id: 'current_active_session', updatedAt: Date.now() };
		await db.put(StoreNames.ACTIVE_SESSION, sessionRecord);
	}

	async getActiveSession(): Promise<SavedFlightPlan | null> {
		const db = await this.getDb();
		const plan = await db.get(StoreNames.ACTIVE_SESSION, 'current_active_session');
		return plan || null;
	}

	async clearActiveSession(): Promise<void> {
		const db = await this.getDb();
		await db.delete(StoreNames.ACTIVE_SESSION, 'current_active_session');
	}

	async listSavedPlans(): Promise<SavedFlightPlan[]> {
		const db = await this.getDb();
		const plans: SavedFlightPlan[] = await db.getAllFromIndex(
			StoreNames.SAVED_PLANS,
			'by_updatedAt'
		);
		return plans.reverse(); // Newest first
	}

	async getSavedPlan(id: string): Promise<SavedFlightPlan | null> {
		const db = await this.getDb();
		const plan = await db.get(StoreNames.SAVED_PLANS, id);
		return plan || null;
	}

	async savePlan(plan: SavedFlightPlan): Promise<void> {
		const db = await this.getDb();
		const planRecord = {
			...plan,
			updatedAt: Date.now()
		};
		await db.put(StoreNames.SAVED_PLANS, planRecord);
	}

	async deletePlan(id: string): Promise<void> {
		const db = await this.getDb();
		await db.delete(StoreNames.SAVED_PLANS, id);
	}
}

export const flightPlanStorage = new FlightPlanStorageService();
