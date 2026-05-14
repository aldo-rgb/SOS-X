// ============================================
// HOOK: useModulePermissions
// Carga permisos de módulos para un panel de operaciones
// Usado en todas las páginas de operaciones para filtrar módulos visibles
// ============================================

import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ModulePermission {
  module_key: string;
  module_name: string;
  can_view: boolean;
  can_edit: boolean;
}

interface UseModulePermissionsResult {
  allowedModules: string[];
  editableModules: string[];
  loading: boolean;
  canView: (moduleKey: string) => boolean;
  canEdit: (moduleKey: string) => boolean;
}

export default function useModulePermissions(panelKey: string, allModuleKeys: string[]): UseModulePermissionsResult {
  const [allowedModules, setAllowedModules] = useState<string[]>([]);
  const [editableModules, setEditableModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !panelKey) {
      // Sin token o sin panel → fail-closed (no permisos)
      setAllowedModules([]);
      setEditableModules([]);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        // Obtener rol del usuario
        const profileRes = await fetch(`${API_URL}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        let role = '';
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          role = profileData.user?.role || profileData.role || '';
        }

        // Super admin tiene acceso total
        if (role === 'super_admin') {
          setAllowedModules(allModuleKeys);
          setEditableModules(allModuleKeys);
          setLoading(false);
          return;
        }

        // Cargar permisos del endpoint
        const modulesRes = await fetch(`${API_URL}/api/modules/${panelKey}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (modulesRes.ok) {
          const data = await modulesRes.json();
          const modules: ModulePermission[] = data.modules || [];

          const viewable = modules
            .filter((m) => m.can_view)
            .map((m) => m.module_key);
          const editable = modules
            .filter((m) => m.can_edit)
            .map((m) => m.module_key);

          console.log(`📋 Módulos permitidos [${panelKey}]:`, viewable);
          setAllowedModules(viewable);
          setEditableModules(editable);
        } else {
          // Endpoint falló (403, 500, etc.) → fail-closed para no exponer
          // módulos por accidente. Mejor mostrar "sin permisos" que filtrar mal.
          console.warn(`⚠️ No se pudieron cargar permisos de [${panelKey}] (status ${modulesRes.status}). Aplicando fail-closed.`);
          setAllowedModules([]);
          setEditableModules([]);
        }
      } catch (err) {
        console.error(`Error cargando permisos [${panelKey}]:`, err);
        // Fail-closed ante cualquier error de red
        setAllowedModules([]);
        setEditableModules([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [panelKey]);

  const canView = useCallback(
    (moduleKey: string) => allowedModules.includes(moduleKey),
    [allowedModules]
  );

  const canEdit = useCallback(
    (moduleKey: string) => editableModules.includes(moduleKey),
    [editableModules]
  );

  return { allowedModules, editableModules, loading, canView, canEdit };
}
