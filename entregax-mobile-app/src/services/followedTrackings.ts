/**
 * Lista local de guías "en seguimiento" — paquetes que el usuario rastrea
 * pero que NO son suyos (por ejemplo, una guía de un familiar / proveedor).
 *
 * Sólo guarda el número de tracking + último resultado público en cache.
 * El detalle siempre se vuelve a pedir a /api/public/track/:tracking
 * (sólo expone datos públicos: hito actual, eventos, servicio).
 *
 * Almacenamiento: AsyncStorage local del dispositivo.
 * No se sincroniza con backend (no hay PII, sólo trackings que el usuario
 * escogió guardar).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'followed_trackings_v1';

export interface FollowedTracking {
    tracking: string;          // siempre normalizado UPPER
    addedAt: string;           // ISO
    // Snapshot del último fetch público (para mostrar offline)
    lastSnapshot?: PublicTrackingSnapshot;
}

export interface PublicTrackingSnapshot {
    tracking: string;
    service?: { es: string; en: string; zh: string };
    current_milestone?: number;
    milestones?: { label_es: string; label_en: string; label_zh: string }[];
    movements?: Array<{
        date: string;
        location?: string;
        description_es?: string;
        description_en?: string;
        description_zh?: string;
    }>;
    fetchedAt: string;
}

const normalize = (t: string): string => String(t || '').trim().toUpperCase();

export const getFollowedTrackings = async (): Promise<FollowedTracking[]> => {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
};

export const isTrackingFollowed = async (tracking: string): Promise<boolean> => {
    const list = await getFollowedTrackings();
    const norm = normalize(tracking);
    return list.some(f => f.tracking === norm);
};

export const addFollowedTracking = async (
    tracking: string,
    snapshot?: PublicTrackingSnapshot
): Promise<FollowedTracking[]> => {
    const norm = normalize(tracking);
    if (!norm) return getFollowedTrackings();
    const list = await getFollowedTrackings();
    const exists = list.find(f => f.tracking === norm);
    let next: FollowedTracking[];
    if (exists) {
        // Actualizar snapshot si viene
        next = list.map(f => f.tracking === norm
            ? { ...f, lastSnapshot: snapshot ?? f.lastSnapshot }
            : f);
    } else {
        next = [
            { tracking: norm, addedAt: new Date().toISOString(), lastSnapshot: snapshot },
            ...list,
        ];
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
};

export const removeFollowedTracking = async (tracking: string): Promise<FollowedTracking[]> => {
    const norm = normalize(tracking);
    const list = await getFollowedTrackings();
    const next = list.filter(f => f.tracking !== norm);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
};

export const updateFollowedSnapshot = async (
    tracking: string,
    snapshot: PublicTrackingSnapshot
): Promise<void> => {
    const norm = normalize(tracking);
    const list = await getFollowedTrackings();
    const next = list.map(f => f.tracking === norm
        ? { ...f, lastSnapshot: snapshot }
        : f);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};
