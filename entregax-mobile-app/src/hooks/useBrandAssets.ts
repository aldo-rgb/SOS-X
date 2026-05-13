/**
 * useBrandAssets
 *
 * Hook compartido que descarga los logos activos del backend
 * (`GET /api/brand-assets/active`) y los cachea en memoria
 * por la duración de la sesión. Cada pantalla puede consumir
 * un slot específico (`entregax_full_white`, `xpay_full_color`, etc.)
 * con un fallback local para evitar parpadeos al iniciar.
 */
import { useEffect, useState } from 'react';
import { API_URL } from '../services/api';

export type BrandAsset = {
  id: number;
  url: string;
  filename: string;
  updated_at: string;
};

type BrandAssetsMap = Record<string, BrandAsset>;

let cache: BrandAssetsMap | null = null;
let inflight: Promise<BrandAssetsMap> | null = null;
const subscribers = new Set<(m: BrandAssetsMap) => void>();

async function fetchBrandAssets(): Promise<BrandAssetsMap> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/brand-assets/active`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const assets: BrandAssetsMap = data?.assets || {};
      cache = assets;
      subscribers.forEach((cb) => cb(assets));
      return assets;
    } catch (err) {
      if (__DEV__) console.warn('[useBrandAssets] fetch falló:', err);
      cache = cache || {};
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Obtiene el URL del logo del slot solicitado.
 * Devuelve `null` mientras se descarga la primera vez,
 * para que el caller decida usar el fallback local.
 */
export function useBrandAsset(slot: string): string | null {
  const [url, setUrl] = useState<string | null>(cache?.[slot]?.url ?? null);

  useEffect(() => {
    let mounted = true;
    const cb = (m: BrandAssetsMap) => {
      if (mounted) setUrl(m?.[slot]?.url ?? null);
    };
    subscribers.add(cb);

    if (cache?.[slot]) {
      setUrl(cache[slot].url);
    } else {
      fetchBrandAssets().then((m) => {
        if (mounted) setUrl(m?.[slot]?.url ?? null);
      });
    }

    return () => {
      mounted = false;
      subscribers.delete(cb);
    };
  }, [slot]);

  return url;
}

/** Fuerza un refetch (útil al regresar al foreground o tras admin update). */
export async function refreshBrandAssets(): Promise<void> {
  cache = null;
  await fetchBrandAssets();
}
