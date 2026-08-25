import { openDB, type IDBPDatabase } from 'idb';
import type { SavedFlightPlan, AircraftPerformanceProfile } from '$lib/types/flight';

export const DB_NAME = 'planenificator_db';
export const DB_VERSION = 2;

export enum StoreNames {
	ACTIVE_SESSION = 'active_session',
	SAVED_PLANS = 'saved_plans',
	AIRCRAFT_PROFILES = 'aircraft_profiles'
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
					if (!db.objectStoreNames.contains(StoreNames.AIRCRAFT_PROFILES)) {
						const profileStore = db.createObjectStore(StoreNames.AIRCRAFT_PROFILES, { keyPath: 'id' });
						profileStore.createIndex('by_updatedAt', 'updatedAt');
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

	async listAircraftProfiles(): Promise<AircraftPerformanceProfile[]> {
		const db = await this.getDb();
		const profiles: AircraftPerformanceProfile[] = await db.getAllFromIndex(
			StoreNames.AIRCRAFT_PROFILES,
			'by_updatedAt'
		);
		return profiles.reverse(); // Newest first
	}

	async getAircraftProfile(id: string): Promise<AircraftPerformanceProfile | null> {
		const db = await this.getDb();
		const profile = await db.get(StoreNames.AIRCRAFT_PROFILES, id);
		return profile || null;
	}

	async saveAircraftProfile(profile: AircraftPerformanceProfile): Promise<void> {
		const db = await this.getDb();
		const now = Date.now();
		const profileRecord: AircraftPerformanceProfile = {
			...profile,
			isCustom: true,
			createdAt: profile.createdAt || now,
			updatedAt: now
		};
		await db.put(StoreNames.AIRCRAFT_PROFILES, profileRecord);
	}

	async deleteAircraftProfile(id: string): Promise<void> {
		const db = await this.getDb();
		await db.delete(StoreNames.AIRCRAFT_PROFILES, id);
	}
}

export const flightPlanStorage = new FlightPlanStorageService();
