import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { pool } from './db';
import { 
  registerUser, 
  loginUser, 
  getAllUsers, 
  getProfile, 
  authenticateToken,
  requireRole,
  requireMinLevel,
  getDashboardSummary,
  changePassword,
  updateProfile,
  getAdvisors as getAdvisorsList,
  getMyAdvisor,
  assignAdvisor,
  ROLES,
  AuthRequest
} from './authController';
import {
  createPackage,
  getPackages,
  getPackageByTracking,
  updatePackageStatus,
  getPackagesByClient,
  getPackageStats,
  getPackageLabels,
  getMyPackages,
  createConsolidation,
  getAdminConsolidations,
  dispatchConsolidation
} from './packageController';
import {
  createPaymentOrder,
  capturePaymentOrder,
  getPaymentStatus
} from './paymentController';
import {
  uploadVerificationDocuments,
  getVerificationStatus,
  checkAddress,
  registerAddress,
  getPendingVerifications,
  approveVerification,
  rejectVerification,
  getVerificationStats
} from './verificationController';
import {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  savePreferences,
  getClientInstructions,
  getMyAddresses,
  createMyAddress,
  updateMyAddress,
  deleteMyAddress,
  setMyDefaultAddress,
  getMyPaymentMethods,
  createPaymentMethod,
  deletePaymentMethod,
  setDefaultPaymentMethod
} from './addressController';
import {
  getCommissionRates,
  updateCommissionRate,
  createServiceType,
  deleteServiceType,
  validateReferralCode,
  getReferralsByAdvisor,
  getCommissionStats,
  getMyReferralCode,
  getAdvisors,
  createAdvisor
} from './commissionController';
import {
  getFiscalEmitters,
  createFiscalEmitter,
  updateFiscalEmitter,
  assignEmitterToService,
  getUserFiscalProfiles,
  createFiscalProfile,
  updateFiscalProfile,
  deleteFiscalProfile,
  generateInvoice,
  getUserInvoices,
  getAllInvoices,
  cancelInvoice,
  downloadInvoicePdf,
  downloadInvoiceXml,
  sendInvoiceByEmail,
  validateRfc,
  getSatCatalogs,
  // Facturación por servicio
  getServiceFiscalConfig,
  getAllServiceFiscalConfig,
  assignFiscalToService,
  removeFiscalFromService,
  setDefaultFiscalForService,
  getServiceInvoices,
  createServiceInvoice,
  stampServiceInvoice,
  getServiceInvoicingSummary
} from './invoicingController';
import {
  getServiceInstructions,
  getAllServiceInstructions,
  updateServiceInstructions,
  getServiceAddresses,
  getAllServiceAddresses,
  createServiceAddress,
  updateServiceAddress,
  deleteServiceAddress,
  setPrimaryAddress,
  getPublicServiceInfo
} from './serviceInstructionsController';
import {
  getCurrentExchangeRate,
  updateExchangeRate,
  getExchangeRateHistory,
  getPaymentProviders,
  createPaymentProvider,
  updatePaymentProvider,
  getClientPaymentSettings,
  saveClientPaymentSettings,
  quotePayment,
  createSupplierPayment,
  getMySupplierPayments,
  getAllSupplierPayments,
  updateSupplierPaymentStatus,
  getSupplierPaymentStats
} from './supplierPaymentController';
import {
  getLogisticsServices,
  calculateQuoteEndpoint,
  getPriceLists,
  createPriceList,
  deletePriceList,
  getPricingRules,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  createLogisticsService,
  updateLogisticsService,
  assignPriceListToUser
} from './pricingEngine';
import {
  getWarehouseServices,
  getWarehouseReceipts,
  createWarehouseReceipt,
  updateWarehouseReceipt,
  searchClientByBoxId,
  getWarehouseStats,
  assignWarehouseLocation,
  getWarehouseLocations
} from './warehouseController';
import {
  getExchangeRate,
  updateExchangeRate as updateGexExchangeRate,
  quoteWarranty,
  createWarranty,
  createWarrantyByUser,
  getWarranties,
  getWarrantyById,
  activateWarranty,
  rejectWarranty,
  uploadWarrantyDocument,
  getAdvisorRanking,
  getRevenueReport,
  getWarrantyStats,
  searchClients
} from './warrantyController';
import {
  requestAdvisor,
  getCrmLeads,
  getAvailableAdvisors,
  assignAdvisorManually,
  updateLeadStatus,
  createLeadFromSupport,
  // Nuevos módulos CRM
  getCRMClients,
  exportCRMClients,
  getRecoveryPromotions,
  saveRecoveryPromotion,
  executeRecoveryAction,
  getRecoveryHistory,
  detectAtRiskClients,
  getProspects,
  createProspect,
  updateProspect,
  convertProspectToClient,
  deleteProspect,
  getSalesReport,
  getChurnReport,
  getCRMDashboard,
  getAdvisorsForCRM,
  getTeamLeaders
} from './crmController';
import {
  handleSupportMessage,
  getMyTickets,
  getTicketMessages,
  getAdminTickets,
  getSupportStats,
  adminReplyTicket,
  resolveTicket,
  assignTicket
} from './supportController';
import {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  sendNotificationToUser,
  sendBroadcastNotification
} from './notificationController';
import {
  receiveFromChina,
  getChinaReceipts,
  getChinaReceiptDetail,
  updateChinaReceiptStatus,
  assignClientToReceipt,
  getChinaStats,
  createChinaReceipt
} from './chinaController';
import {
  getMasterAwbData,
  saveMasterCost,
  listMasterAwbs,
  deleteMasterAwb,
  getMasterAwbStats,
  getProfitReport
} from './masterCostController';
import {
  verifyWebhook,
  handleFacebookMessage,
  getChatHistory,
  toggleAI,
  sendManualMessage,
  simulateMessage
} from './facebookController';
import {
  getContainers,
  getContainerDetail,
  createContainer,
  updateContainer,
  updateContainerStatus,
  deleteContainer,
  getContainerCosts,
  updateContainerCosts,
  getMaritimeShipments,
  createMaritimeShipment,
  updateMaritimeShipment,
  assignShipmentToContainer,
  assignClientToShipment,
  deleteMaritimeShipment,
  getMaritimeStats,
  receiveAtCedis,
  uploadCostPdf
} from './maritimeController';
import {
  // IA Extraction
  extractLogDataLcl,
  extractBlDataFcl,
  // Save Operations
  saveLclReception,
  saveFclWithBl,
  createFclInWarehouse,
  // Client Actions
  uploadPackingListLcl,
  uploadPackingListFcl,
  // Listings
  getLclShipments,
  getFclContainers,
  getMaritimeAiStats,
  assignClientToLcl,
  consolidateLclToContainer
} from './maritimeAiController';
import {
  getInventoryItems,
  getInventoryStats,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  registerInventoryMovement,
  getInventoryMovements,
  getInventoryCategories,
  getInventoryAlerts,
  bulkInventoryMovement
} from './inventoryController';
import {
  manualSyncOrders,
  manualSyncTracking,
  getMaritimeOrders,
  getMaritimeOrderDetail,
  refreshOrderTracking,
  assignOrderToClient,
  getSyncLogs,
  getMaritimeStats as getMaritimeApiStats,
  // Consolidaciones
  getConsolidationOrders,
  getConsolidationStats,
  updateOrderConsolidation,
  uploadPackingList,
  updateMarkClient,
  // Rutas
  getMaritimeRoutes,
  createMaritimeRoute,
  updateMaritimeRoute,
  deleteMaritimeRoute
} from './maritimeApiController';
import {
  importLegacyClients,
  getLegacyClients,
  getLegacyStats,
  claimLegacyAccount,
  verifyLegacyBox,
  deleteLegacyClient,
  uploadMiddleware
} from './legacyController';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir archivos estáticos de uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Endpoint de salud - Para probar que el servidor funciona
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'EntregaX API está funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Endpoint para migración de columnas de documentos oficiales
app.get('/api/migrate/container-docs', async (_req: Request, res: Response) => {
  try {
    await pool.query(`
      ALTER TABLE container_costs ADD COLUMN IF NOT EXISTS telex_release_pdf TEXT;
      ALTER TABLE container_costs ADD COLUMN IF NOT EXISTS bl_document_pdf TEXT;
      ALTER TABLE maritime_reception_drafts ADD COLUMN IF NOT EXISTS telex_pdf_url TEXT;
      ALTER TABLE maritime_reception_drafts ADD COLUMN IF NOT EXISTS telex_pdf_filename TEXT;
    `);
    res.json({ success: true, message: 'Migraciones aplicadas correctamente: telex_release_pdf, bl_document_pdf, telex_pdf_url, telex_pdf_filename' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Migración: agregar campo email a maritime_routes
app.get('/api/migrate/routes-email', async (_req: Request, res: Response) => {
  try {
    await pool.query(`
      ALTER TABLE maritime_routes ADD COLUMN IF NOT EXISTS email VARCHAR(255);
    `);
    res.json({ success: true, message: 'Migración aplicada: campo email agregado a maritime_routes' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Migración: agregar campo route_id a containers
app.get('/api/migrate/container-route', async (_req: Request, res: Response) => {
  try {
    await pool.query(`
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS route_id INTEGER REFERENCES maritime_routes(id);
      ALTER TABLE maritime_reception_drafts ADD COLUMN IF NOT EXISTS route_id INTEGER REFERENCES maritime_routes(id);
    `);
    res.json({ success: true, message: 'Migración aplicada: campo route_id agregado a containers y maritime_reception_drafts' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Migración: agregar columnas para Excel SUMMARY
app.get('/api/migrate/summary-excel', async (_req: Request, res: Response) => {
  try {
    await pool.query(`
      ALTER TABLE maritime_reception_drafts ADD COLUMN IF NOT EXISTS summary_excel_url TEXT;
      ALTER TABLE maritime_reception_drafts ADD COLUMN IF NOT EXISTS summary_excel_filename TEXT;
    `);
    res.json({ success: true, message: 'Migración aplicada: campos summary_excel_url y summary_excel_filename agregados' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Migración: agregar columnas para información del SUMMARY en maritime_orders
app.get('/api/migrate/orders-summary', async (_req: Request, res: Response) => {
  try {
    // Columnas para containers (datos del BL)
    await pool.query(`
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS consignee TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS shipper TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS vessel TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS pol TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS pod TEXT;
    `);
    
    // Columnas para maritime_orders (datos del SUMMARY)
    await pool.query(`
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS container_id INTEGER REFERENCES containers(id);
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS brand_type VARCHAR(50) DEFAULT 'generic';
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS has_battery BOOLEAN DEFAULT false;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS has_liquid BOOLEAN DEFAULT false;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS is_pickup BOOLEAN DEFAULT false;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS summary_boxes INTEGER;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS summary_weight DECIMAL(10,2);
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS summary_volume DECIMAL(10,4);
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS summary_description TEXT;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_maritime_orders_container_id ON maritime_orders(container_id);
    `);
    res.json({ success: true, message: 'Migración aplicada: columnas BL en containers y SUMMARY en maritime_orders' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint raíz
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'EntregaX Backend API',
    description: 'API central para el ecosistema EntregaX',
    endpoints: {
      health: 'GET /health - Estado del servidor',
      register: 'POST /api/auth/register - Registrar nuevo usuario',
      login: 'POST /api/auth/login - Iniciar sesión',
      verify: 'GET /api/auth/verify - Verificar token',
      profile: 'GET /api/auth/profile - Obtener perfil (requiere token)',
      users: 'GET /api/users - Ver usuarios (solo admin)',
      dashboard: 'GET /api/admin/dashboard - Panel admin (staff+)',
    },
    roles: {
      super_admin: 'Control total del sistema',
      admin: 'Administrador general',
      director: 'Director de área',
      branch_manager: 'Gerente de sucursal',
      customer_service: 'Servicio a cliente',
      counter_staff: 'Personal de mostrador',
      warehouse_ops: 'Operaciones de bodega',
      client: 'Cliente final'
    }
  });
});

// --- RUTAS DE AUTENTICACIÓN ---
app.post('/api/auth/register', registerUser);
app.post('/api/auth/login', loginUser);
app.get('/api/auth/profile', authenticateToken, getProfile);
app.post('/api/auth/change-password', authenticateToken, changePassword);
app.put('/api/auth/update-profile', authenticateToken, updateProfile);

// --- RUTAS DE CLIENTES LEGACY (Migración) ---
// Públicas (para registro)
app.post('/api/legacy/claim', claimLegacyAccount);
app.get('/api/legacy/verify/:boxId', verifyLegacyBox);
// Protegidas (para admin)
app.post('/api/legacy/import', authenticateToken, requireRole(ROLES.SUPER_ADMIN), uploadMiddleware, importLegacyClients);
app.get('/api/legacy/clients', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER), getLegacyClients);
app.get('/api/legacy/stats', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER), getLegacyStats);
app.delete('/api/legacy/clients/:id', authenticateToken, requireRole(ROLES.SUPER_ADMIN), deleteLegacyClient);

// --- RUTAS DE ASESORES ---
app.get('/api/users/advisors', authenticateToken, getAdvisorsList);
app.get('/api/users/my-advisor', authenticateToken, getMyAdvisor);
app.post('/api/users/assign-advisor', authenticateToken, assignAdvisor);

// --- RUTAS DE USUARIOS (protegida por rol) ---
// Solo admin y gerentes pueden ver todos los usuarios
app.get('/api/users', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER), getAllUsers);

// --- RUTAS DE ADMINISTRACIÓN (solo staff y superiores) ---
app.get('/api/admin/dashboard', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), (req: AuthRequest, res: Response) => {
  res.json({
    message: 'Bienvenido al panel de administración',
    usuario: req.user,
    timestamp: new Date().toISOString()
  });
});

// --- RUTA DE RESUMEN DEL DASHBOARD ---
app.get('/api/dashboard/summary', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getDashboardSummary);

// --- RUTA PARA VERIFICAR PERMISOS ---
app.get('/api/auth/verify', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({
    valid: true,
    user: req.user,
    message: 'Token válido'
  });
});

// --- RUTAS DE PAQUETES ---
// Crear paquete (Bodega o superior)
app.post('/api/packages', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), createPackage);

// Listar todos los paquetes (Staff o superior)
app.get('/api/packages', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getPackages);

// Estadísticas de paquetes (Staff o superior)
app.get('/api/packages/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getPackageStats);

// Buscar paquete por tracking (cualquier usuario autenticado)
app.get('/api/packages/track/:tracking', authenticateToken, getPackageByTracking);

// Paquetes de un cliente específico (Staff o superior)
app.get('/api/packages/client/:boxId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getPackagesByClient);

// Obtener etiquetas para imprimir (Bodega o superior)
app.get('/api/packages/:id/labels', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getPackageLabels);

// Actualizar estatus de paquete (Bodega o superior)
app.patch('/api/packages/:id/status', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updatePackageStatus);

// --- RUTAS PARA APP MÓVIL (CLIENTES) ---
// Mis paquetes (requiere autenticación básica)
app.get('/api/client/packages/:userId', authenticateToken, getMyPackages);

// Crear consolidación (solicitud de envío)
app.post('/api/consolidations', authenticateToken, createConsolidation);

// --- RUTAS ADMIN: CONSOLIDACIONES ---
app.get('/api/admin/consolidations', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAdminConsolidations);
app.put('/api/admin/consolidations/dispatch', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), dispatchConsolidation);

// --- RUTAS DE PAGOS (PayPal) ---
app.post('/api/payments/create', authenticateToken, createPaymentOrder);
app.post('/api/payments/capture', authenticateToken, capturePaymentOrder);
app.get('/api/payments/status/:consolidationId', authenticateToken, getPaymentStatus);

// --- RUTAS DE VERIFICACIÓN KYC ---
app.post('/api/verify/documents', authenticateToken, uploadVerificationDocuments);
app.get('/api/verify/status', authenticateToken, getVerificationStatus);
app.get('/api/verify/address', authenticateToken, checkAddress);
app.post('/api/verify/address', authenticateToken, registerAddress);

// --- RUTAS DE DIRECCIONES Y PREFERENCIAS ---
app.get('/api/client/addresses/:userId', authenticateToken, getAddresses);
app.post('/api/client/addresses', authenticateToken, createAddress);
app.put('/api/client/addresses/:id', authenticateToken, updateAddress);
app.delete('/api/client/addresses/:id', authenticateToken, deleteAddress);
app.put('/api/client/addresses/default', authenticateToken, setDefaultAddress);
app.put('/api/client/preferences', authenticateToken, savePreferences);

// --- RUTAS PARA APP MÓVIL: MIS DIRECCIONES (con token) ---
app.get('/api/addresses', authenticateToken, getMyAddresses);
app.post('/api/addresses', authenticateToken, createMyAddress);
app.put('/api/addresses/:id', authenticateToken, updateMyAddress);
app.delete('/api/addresses/:id', authenticateToken, deleteMyAddress);
app.put('/api/addresses/:id/default', authenticateToken, setMyDefaultAddress);

// --- RUTAS PARA APP MÓVIL: MIS MÉTODOS DE PAGO ---
app.get('/api/payment-methods', authenticateToken, getMyPaymentMethods);
app.post('/api/payment-methods', authenticateToken, createPaymentMethod);
app.delete('/api/payment-methods/:id', authenticateToken, deletePaymentMethod);
app.put('/api/payment-methods/:id/default', authenticateToken, setDefaultPaymentMethod);

// --- RUTA PARA OBTENER INSTRUCCIONES DEL CLIENTE POR BOX ID (para recepción inteligente) ---
app.get('/api/client/instructions/:boxId', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getClientInstructions);

// --- RUTAS DE COMISIONES Y REFERIDOS ---
// Validar código de referido (público, para registro)
app.get('/api/referral/validate/:code', validateReferralCode);

// Mi código de referido (usuario autenticado)
app.get('/api/referral/my-code', authenticateToken, getMyReferralCode);

// Admin: Configuración de tarifas de comisiones y tipos de servicio
app.get('/api/admin/commissions', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getCommissionRates);
app.put('/api/admin/commissions', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updateCommissionRate);
app.post('/api/admin/service-types', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), createServiceType);
app.delete('/api/admin/service-types/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), deleteServiceType);

// Admin: Estadísticas de referidos
app.get('/api/admin/commissions/stats', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getCommissionStats);

// Admin: Referidos de un asesor específico
app.get('/api/admin/referrals/:advisorId', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getReferralsByAdvisor);

// --- TIPOS DE SERVICIO (Logistics Services) ---
app.get('/api/admin/logistics-services', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getLogisticsServices);
app.put('/api/admin/logistics-services/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updateLogisticsService);

// --- RUTAS DE ASESORES (Gestión de Jerarquía) ---
app.get('/api/admin/advisors', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getAdvisors);
app.post('/api/admin/advisors', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), createAdvisor);

// --- RUTAS DE VERIFICACIÓN ADMIN (Revisión Manual KYC) ---
app.get('/api/admin/verifications/pending', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getPendingVerifications);
app.get('/api/admin/verifications/stats', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getVerificationStats);
app.post('/api/admin/verifications/:userId/approve', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), approveVerification);
app.post('/api/admin/verifications/:userId/reject', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), rejectVerification);

// --- RUTAS DE FACTURACIÓN FISCAL ---
// Admin: Gestión de empresas emisoras
app.get('/api/admin/fiscal/emitters', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getFiscalEmitters);
app.post('/api/admin/fiscal/emitters', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), createFiscalEmitter);
app.put('/api/admin/fiscal/emitters', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updateFiscalEmitter);
app.post('/api/admin/fiscal/assign-service', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), assignEmitterToService);
app.get('/api/admin/invoices', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getAllInvoices);
app.post('/api/admin/invoices/cancel', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), cancelInvoice);

// Facturación por servicio
app.get('/api/admin/service-fiscal/all', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getAllServiceFiscalConfig);
app.get('/api/admin/service-fiscal/:serviceType', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getServiceFiscalConfig);
app.post('/api/admin/service-fiscal/assign', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), assignFiscalToService);
app.post('/api/admin/service-fiscal/remove', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), removeFiscalFromService);
app.post('/api/admin/service-fiscal/set-default', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), setDefaultFiscalForService);
app.get('/api/admin/service-invoices/:serviceType', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getServiceInvoices);
app.post('/api/admin/service-invoices', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), createServiceInvoice);
app.post('/api/admin/service-invoices/:id/stamp', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), stampServiceInvoice);
app.get('/api/admin/service-invoicing-summary', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getServiceInvoicingSummary);

// Direcciones de servicio (Admin)
app.get('/api/admin/service-instructions/all', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getAllServiceInstructions);
app.get('/api/admin/service-instructions/:serviceType', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getServiceInstructions);
app.put('/api/admin/service-instructions/:serviceType', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updateServiceInstructions);
app.get('/api/admin/service-addresses/all', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getAllServiceAddresses);
app.get('/api/admin/service-addresses/:serviceType', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getServiceAddresses);
app.post('/api/admin/service-addresses', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), createServiceAddress);
app.put('/api/admin/service-addresses/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updateServiceAddress);
app.delete('/api/admin/service-addresses/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), deleteServiceAddress);
app.post('/api/admin/service-addresses/:id/set-primary', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), setPrimaryAddress);

// Información pública de servicios (para usuarios)
app.get('/api/services/:serviceType/info', getPublicServiceInfo);

// Cliente: Perfiles fiscales
app.get('/api/fiscal/profiles', authenticateToken, getUserFiscalProfiles);
app.post('/api/fiscal/profiles', authenticateToken, createFiscalProfile);
app.put('/api/fiscal/profiles', authenticateToken, updateFiscalProfile);
app.delete('/api/fiscal/profiles/:id', authenticateToken, deleteFiscalProfile);

// Cliente: Facturación
app.post('/api/invoices/generate', authenticateToken, generateInvoice);
app.get('/api/invoices', authenticateToken, getUserInvoices);
app.get('/api/invoices/:invoiceId/pdf', authenticateToken, downloadInvoicePdf);
app.get('/api/invoices/:invoiceId/xml', authenticateToken, downloadInvoiceXml);
app.post('/api/invoices/send-email', authenticateToken, sendInvoiceByEmail);
app.post('/api/invoices/cancel', authenticateToken, cancelInvoice);

// Utilidades fiscales
app.post('/api/fiscal/validate-rfc', authenticateToken, validateRfc);
app.get('/api/fiscal/catalogs', getSatCatalogs);

// ========== PAGOS A PROVEEDORES ==========

// Tipo de cambio
app.get('/api/exchange-rate', getCurrentExchangeRate);
app.post('/api/admin/exchange-rate', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updateExchangeRate);
app.get('/api/admin/exchange-rate/history', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getExchangeRateHistory);

// Proveedores de pago (Admin)
app.get('/api/admin/payment-providers', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getPaymentProviders);
app.post('/api/admin/payment-providers', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), createPaymentProvider);
app.put('/api/admin/payment-providers', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updatePaymentProvider);

// Configuración por cliente (Admin)
app.get('/api/admin/client-settings/:userId', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getClientPaymentSettings);
app.post('/api/admin/client-settings', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), saveClientPaymentSettings);

// Solicitudes de pago (Admin)
app.get('/api/admin/supplier-payments', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getAllSupplierPayments);
app.put('/api/admin/supplier-payments/status', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updateSupplierPaymentStatus);
app.get('/api/admin/supplier-payments/stats', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getSupplierPaymentStats);

// Cliente: Pagos a proveedores
app.post('/api/supplier-payments/quote', authenticateToken, quotePayment);
app.post('/api/supplier-payments', authenticateToken, createSupplierPayment);
app.get('/api/supplier-payments', authenticateToken, getMySupplierPayments);

// ========== MOTOR DE PRECIOS (PRICING ENGINE) ==========

// Servicios logísticos (Público)
app.get('/api/logistics/services', getLogisticsServices);

// Cotizador (Cliente autenticado)
app.post('/api/quotes/calculate', authenticateToken, calculateQuoteEndpoint);

// Admin: Listas de precios
app.get('/api/admin/price-lists', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getPriceLists);
app.post('/api/admin/price-lists', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), createPriceList);
app.delete('/api/admin/price-lists/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), deletePriceList);

// Admin: Reglas de precio
app.get('/api/admin/pricing-rules/:priceListId', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getPricingRules);
app.post('/api/admin/pricing-rules', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), createPricingRule);
app.put('/api/admin/pricing-rules/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updatePricingRule);
app.delete('/api/admin/pricing-rules/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), deletePricingRule);

// Admin: Servicios logísticos
app.post('/api/admin/logistics-services', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), createLogisticsService);
app.put('/api/admin/logistics-services/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updateLogisticsService);

// Admin: Asignar lista de precios a cliente
app.put('/api/admin/users/:userId/price-list', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), assignPriceListToUser);

// ========== RECEPCIÓN DE BODEGA (WAREHOUSE) ==========

// Configuración de ubicaciones (Admin)
app.get('/api/admin/warehouse-locations', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), getWarehouseLocations);
app.put('/api/admin/users/:id/warehouse-location', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), assignWarehouseLocation);

// Panel de bodega (Staff)
app.get('/api/warehouse/services', authenticateToken, getWarehouseServices);
app.get('/api/warehouse/receipts', authenticateToken, getWarehouseReceipts);
app.post('/api/warehouse/receipts', authenticateToken, createWarehouseReceipt);
app.put('/api/warehouse/receipts/:id', authenticateToken, updateWarehouseReceipt);
app.get('/api/warehouse/stats', authenticateToken, getWarehouseStats);
app.get('/api/warehouse/client/:boxId', authenticateToken, searchClientByBoxId);

// ========== RECEPCIÓN CHINA (TDI AÉREO) ==========

// Webhook para recibir datos del sistema chino (público o con API key)
app.post('/api/china/receive', receiveFromChina);

// Panel administrativo de recepciones China
app.get('/api/china/receipts', authenticateToken, getChinaReceipts);
app.post('/api/china/receipts', authenticateToken, createChinaReceipt); // Captura manual
app.get('/api/china/receipts/:id', authenticateToken, getChinaReceiptDetail);
app.put('/api/china/receipts/:id/status', authenticateToken, updateChinaReceiptStatus);
app.post('/api/china/receipts/:id/assign', authenticateToken, assignClientToReceipt);
app.get('/api/china/stats', authenticateToken, getChinaStats);

// ========== GARANTÍA EXTENDIDA (GEX) ==========

// Tipo de cambio
app.get('/api/gex/exchange-rate', authenticateToken, getExchangeRate);
app.post('/api/gex/exchange-rate', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updateGexExchangeRate);

// Cotización y creación de pólizas
app.post('/api/gex/quote', authenticateToken, quoteWarranty);
app.post('/api/gex/warranties', authenticateToken, createWarranty);
app.post('/api/gex/warranties/self', authenticateToken, createWarrantyByUser); // Autoservicio usuario
app.get('/api/gex/warranties', authenticateToken, getWarranties);
app.get('/api/gex/warranties/:id', authenticateToken, getWarrantyById);

// Gestión de pólizas
app.put('/api/gex/warranties/:id/activate', authenticateToken, activateWarranty);
app.put('/api/gex/warranties/:id/reject', authenticateToken, rejectWarranty);
app.put('/api/gex/warranties/:id/document', authenticateToken, uploadWarrantyDocument);

// Reportes y estadísticas
app.get('/api/gex/stats', authenticateToken, getWarrantyStats);
app.get('/api/gex/ranking', authenticateToken, getAdvisorRanking);
app.get('/api/gex/revenue-report', authenticateToken, getRevenueReport);

// Búsqueda de clientes para select
app.get('/api/gex/clients', authenticateToken, searchClients);

// ========== CRM - SOLICITUDES DE ASESOR ==========

// App: Usuario solicita asesor (con o sin código)
app.post('/api/advisor/request', authenticateToken, requestAdvisor);

// Admin: Ver leads pendientes
app.get('/api/admin/crm/leads', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getCrmLeads);

// Admin: Ver asesores disponibles para asignar
app.get('/api/admin/crm/advisors', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAvailableAdvisors);

// Admin: Asignar asesor manualmente a un lead
app.post('/api/admin/crm/assign', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), assignAdvisorManually);

// Admin: Actualizar estado de un lead
app.put('/api/admin/crm/leads/:id/status', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateLeadStatus);

// App: Crear lead desde chat de soporte (solicitud de llamada)
app.post('/api/crm/leads', authenticateToken, createLeadFromSupport);

// ========== CRM INTELIGENCIA COMERCIAL (NUEVOS MÓDULOS) ==========

// Dashboard CRM
app.get('/api/admin/crm/dashboard', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getCRMDashboard);

// Módulo 1: Control de Clientes
app.get('/api/admin/crm/clients', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getCRMClients);
app.get('/api/admin/crm/clients/export', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), exportCRMClients);

// Módulo 2: Recuperación y Sostenimiento
app.get('/api/admin/crm/promotions', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getRecoveryPromotions);
app.post('/api/admin/crm/promotions', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), saveRecoveryPromotion);
app.post('/api/admin/crm/recovery/action', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), executeRecoveryAction);
app.get('/api/admin/crm/recovery/history/:userId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getRecoveryHistory);
app.post('/api/admin/crm/recovery/detect', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), detectAtRiskClients);

// Módulo 3: Prospectos (Leads mejorado)
app.get('/api/admin/crm/prospects', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getProspects);
app.post('/api/admin/crm/prospects', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createProspect);
app.put('/api/admin/crm/prospects/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateProspect);
app.post('/api/admin/crm/prospects/:id/convert', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), convertProspectToClient);
app.delete('/api/admin/crm/prospects/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), deleteProspect);

// Módulo 4: Reportes
app.get('/api/admin/crm/reports/sales', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getSalesReport);
app.get('/api/admin/crm/reports/churn', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getChurnReport);

// Utilidades CRM
app.get('/api/admin/crm/advisors-list', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAdvisorsForCRM);
app.get('/api/admin/crm/team-leaders', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getTeamLeaders);

// ========== SOPORTE AL CLIENTE (AI + HUMANO) ==========

// Cliente: Enviar mensaje al chat de soporte
app.post('/api/support/message', authenticateToken, handleSupportMessage);

// Cliente: Ver mis tickets
app.get('/api/support/tickets', authenticateToken, getMyTickets);

// Cliente: Ver mensajes de un ticket
app.get('/api/support/ticket/:id/messages', authenticateToken, getTicketMessages);

// Admin: Ver todos los tickets (tablero Kanban)
app.get('/api/admin/support/tickets', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAdminTickets);

// Admin: Estadísticas de soporte
app.get('/api/admin/support/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getSupportStats);

// Admin: Responder como agente
app.post('/api/admin/support/ticket/:id/reply', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), adminReplyTicket);

// Admin: Resolver ticket
app.put('/api/admin/support/ticket/:id/resolve', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), resolveTicket);

// Admin: Asignar ticket a agente
app.put('/api/admin/support/ticket/:id/assign', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), assignTicket);

// ========== NOTIFICACIONES ==========

// App: Obtener mis notificaciones
app.get('/api/notifications', authenticateToken, getMyNotifications);

// App: Marcar notificación como leída
app.put('/api/notifications/:notificationId/read', authenticateToken, markAsRead);

// App: Marcar todas como leídas
app.put('/api/notifications/read-all', authenticateToken, markAllAsRead);

// App: Obtener conteo de no leídas
app.get('/api/notifications/unread-count', authenticateToken, getUnreadCount);

// Admin: Enviar notificación a un usuario
app.post('/api/admin/notifications/send', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), sendNotificationToUser);

// Admin: Enviar notificación masiva
app.post('/api/admin/notifications/broadcast', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), sendBroadcastNotification);

// ========== COSTEO TDI AÉREO (MASTER AIR WAYBILLS) ==========

// Admin: Estadísticas de guías aéreas
app.get('/api/master-cost/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMasterAwbStats);

// Admin: Reporte de utilidad
app.get('/api/master-cost/profit-report', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getProfitReport);

// Admin: Listar todas las guías
app.get('/api/master-cost', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), listMasterAwbs);

// Admin: Buscar/Crear guía específica
app.get('/api/master-cost/:awb', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMasterAwbData);

// Admin: Guardar y calcular costos
app.post('/api/master-cost', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), saveMasterCost);

// Admin: Eliminar guía
app.delete('/api/master-cost/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), deleteMasterAwb);

// ========== MÓDULO MARÍTIMO (Contenedores y Costeo) ==========

// Estadísticas marítimas
app.get('/api/maritime/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMaritimeStats);

// Contenedores
app.get('/api/maritime/containers', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getContainers);
app.get('/api/maritime/containers/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getContainerDetail);
app.post('/api/maritime/containers', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createContainer);
app.put('/api/maritime/containers/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateContainer);
app.put('/api/maritime/containers/:id/status', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateContainerStatus);
app.delete('/api/maritime/containers/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), deleteContainer);

// Costos de contenedor
app.get('/api/maritime/containers/:containerId/costs', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getContainerCosts);
app.put('/api/maritime/containers/:containerId/costs', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateContainerCosts);

// Upload de PDFs para costos
const costUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max
app.post('/api/maritime/containers/upload-cost-pdf', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), costUpload.single('file'), uploadCostPdf);

// Envíos marítimos (Recepciones)
app.get('/api/maritime/shipments', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getMaritimeShipments);
app.post('/api/maritime/shipments', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), createMaritimeShipment);
app.put('/api/maritime/shipments/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updateMaritimeShipment);
app.post('/api/maritime/shipments/assign-container', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), assignShipmentToContainer);
app.post('/api/maritime/shipments/:id/assign-client', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), assignClientToShipment);
app.put('/api/maritime/shipments/:id/receive-cedis', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), receiveAtCedis);
app.delete('/api/maritime/shipments/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), deleteMaritimeShipment);

// ========== MÓDULO MARÍTIMO CON IA (Nuevo Panel Bodega) ==========

// Extracción con IA
app.post('/api/maritime-ai/extract-log', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), extractLogDataLcl);
app.post('/api/maritime-ai/extract-bl', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), extractBlDataFcl);

// Guardar recepciones
app.post('/api/maritime-ai/lcl', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), saveLclReception);
app.post('/api/maritime-ai/fcl/bl', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), saveFclWithBl);
app.post('/api/maritime-ai/fcl/warehouse', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), createFclInWarehouse);

// Listados y estadísticas
app.get('/api/maritime-ai/lcl', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getLclShipments);
app.get('/api/maritime-ai/fcl', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getFclContainers);
app.get('/api/maritime-ai/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMaritimeAiStats);

// Operaciones administrativas
app.post('/api/maritime-ai/lcl/:shipmentId/assign-client', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), assignClientToLcl);
app.post('/api/maritime-ai/consolidate', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), consolidateLclToContainer);

// Acciones del cliente (desde App móvil)
app.post('/api/client/maritime/lcl/:shipmentId/packing-list', authenticateToken, uploadPackingListLcl);
app.post('/api/client/maritime/fcl/:containerId/packing-list', authenticateToken, uploadPackingListFcl);

// ========== MÓDULO MARÍTIMO - API CHINA (Zero Touch) ==========

// Sincronización manual
app.post('/api/maritime-api/sync/orders', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), manualSyncOrders);
app.post('/api/maritime-api/sync/tracking', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), manualSyncTracking);

// Consolidaciones marítimas (rutas específicas ANTES de las paramétrizadas)
app.get('/api/maritime-api/orders/consolidations', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getConsolidationOrders);
app.get('/api/maritime-api/consolidations/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getConsolidationStats);

// Órdenes marítimas (de API China)
app.get('/api/maritime-api/orders', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMaritimeOrders);
app.get('/api/maritime-api/orders/:ordersn', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMaritimeOrderDetail);
app.get('/api/maritime-api/orders/:ordersn/refresh', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), refreshOrderTracking);
app.post('/api/maritime-api/orders/:ordersn/assign', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), assignOrderToClient);
app.put('/api/maritime-api/orders/:ordersn/consolidation', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateOrderConsolidation);
app.put('/api/maritime-api/orders/:ordersn/mark-client', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateMarkClient);
app.post('/api/maritime-api/orders/:ordersn/packing-list', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), uploadPackingList);

// Monitoreo y estadísticas
app.get('/api/maritime-api/sync/logs', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getSyncLogs);
app.get('/api/maritime-api/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMaritimeApiStats);

// Rutas marítimas
app.get('/api/maritime-api/routes', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMaritimeRoutes);
app.post('/api/maritime-api/routes', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createMaritimeRoute);
app.put('/api/maritime-api/routes/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateMaritimeRoute);
app.delete('/api/maritime-api/routes/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), deleteMaritimeRoute);

// ========== MÓDULO DE INVENTARIO POR SERVICIO ==========

// Items de inventario
app.get('/api/inventory/:serviceType/items', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getInventoryItems);
app.post('/api/inventory/:serviceType/items', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createInventoryItem);
app.put('/api/inventory/:serviceType/items/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateInventoryItem);
app.delete('/api/inventory/:serviceType/items/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), deleteInventoryItem);

// Movimientos de inventario
app.post('/api/inventory/:serviceType/movement', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), registerInventoryMovement);
app.get('/api/inventory/:serviceType/movements', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getInventoryMovements);
app.post('/api/inventory/:serviceType/bulk-movement', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), bulkInventoryMovement);

// Estadísticas y alertas
app.get('/api/inventory/:serviceType/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getInventoryStats);
app.get('/api/inventory/:serviceType/alerts', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getInventoryAlerts);
app.get('/api/inventory/:serviceType/categories', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getInventoryCategories);

// ============================================================
// FACEBOOK MESSENGER WEBHOOK
// ============================================================
// Verificación del webhook (Meta lo llama al configurar)
app.get('/api/webhooks/facebook', verifyWebhook);
// Recibir mensajes de Facebook
app.post('/api/webhooks/facebook', handleFacebookMessage);

// Endpoints Admin para gestionar chats de Facebook
app.get('/api/admin/facebook/chat/:prospectId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getChatHistory);
app.post('/api/admin/facebook/toggle-ai/:prospectId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), toggleAI);
app.post('/api/admin/facebook/send/:prospectId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), sendManualMessage);
// Endpoint de pruebas (desarrollo)
app.post('/api/admin/facebook/simulate', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), simulateMessage);

// ============================================================
// MÓDULO DE PERMISOS Y MATRIZ DE CONTROL
// ============================================================
import {
  getPermissionMatrix,
  togglePermission,
  addPermission,
  deletePermission,
  checkUserPermission,
  getRolePermissions,
  bulkAssignPermissions
} from './permissionController';
import { requireSuperAdmin } from './authMiddleware';

// Email Inbound Controller (Webhooks de correo)
import {
  handleInboundEmail,
  getDrafts,
  getDraftDetail,
  approveDraft,
  rejectDraft,
  matchClientToDraft,
  getWhitelist,
  addToWhitelist,
  removeFromWhitelist,
  getEmailStats,
  uploadManualShipment,
  serveDraftPdf,
  serveDraftExcel,
  reExtractDraftData
} from './emailInboundController';

// Vizion API Controller (Tracking satelital de contenedores)
import {
    subscribeContainer as subscribeToVizion,
    handleVizionWebhook,
    getContainerTracking as getContainerTrackingHistory,
    addManualTrackingEvent,
    syncCarrierTracking
} from './vizionController';

// ========== WEBHOOKS PÚBLICOS (SIN AUTENTICACIÓN) ==========
// Mailgun envía correos aquí automáticamente
app.post('/api/webhooks/email/inbound', handleInboundEmail);

// Vizion envía updates de tracking aquí
app.post('/api/webhooks/vizion', handleVizionWebhook);

// Matriz de permisos (Solo Super Admin)
app.get('/api/admin/permissions/matrix', authenticateToken, requireSuperAdmin(), getPermissionMatrix);
app.post('/api/admin/permissions/toggle', authenticateToken, requireSuperAdmin(), togglePermission);
app.post('/api/admin/permissions/add', authenticateToken, requireSuperAdmin(), addPermission);
app.delete('/api/admin/permissions/:id', authenticateToken, requireSuperAdmin(), deletePermission);
app.post('/api/admin/permissions/bulk', authenticateToken, requireSuperAdmin(), bulkAssignPermissions);

// Consultas de permisos (cualquier usuario autenticado)
app.get('/api/permissions/check/:slug', authenticateToken, checkUserPermission);
app.get('/api/permissions/role/:role', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getRolePermissions);

// ========== EMAIL INBOUND - GESTIÓN DE BORRADORES MARÍTIMOS ==========
// Borradores de recepciones (LOG/BL extraídos de correos)
app.get('/api/admin/maritime/drafts', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getDrafts);
app.get('/api/admin/maritime/drafts/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getDraftDetail);
app.post('/api/admin/maritime/drafts/:id/approve', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), approveDraft);
app.post('/api/admin/maritime/drafts/:id/reject', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), rejectDraft);
app.put('/api/admin/maritime/drafts/:id/match-client', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), matchClientToDraft);

// Whitelist de correos (Solo Admin+)
app.get('/api/admin/email/whitelist', authenticateToken, requireMinLevel(ROLES.ADMIN), getWhitelist);
app.post('/api/admin/email/whitelist', authenticateToken, requireMinLevel(ROLES.ADMIN), addToWhitelist);
app.delete('/api/admin/email/whitelist/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), removeFromWhitelist);
app.get('/api/admin/email/stats', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getEmailStats);

// Servir PDFs de drafts (endpoint que sirve el archivo directamente)
app.get('/api/admin/email/draft/:id/pdf/:type', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), serveDraftPdf);
// Servir Excel SUMMARY de drafts LCL
app.get('/api/admin/email/draft/:id/excel', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), serveDraftExcel);
// Re-extraer datos de un draft usando IA
app.post('/api/admin/email/draft/:id/reextract', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), reExtractDraftData);

// ========== VIZION TRACKING (Rastreo satelital de contenedores) ==========
// Suscribir contenedor a tracking de Vizion
app.post('/api/admin/vizion/subscribe', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), subscribeToVizion);
// Historial de tracking de un contenedor
app.get('/api/admin/containers/:id/tracking', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getContainerTrackingHistory);
// Agregar evento manual de tracking (para cuando no hay API)
app.post('/api/admin/containers/:id/tracking/manual', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), addManualTrackingEvent);
// Sincronizar tracking desde la naviera (Wan Hai, etc.)
app.post('/api/admin/containers/:id/tracking/sync-carrier', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), syncCarrierTracking);

// Upload manual de documentos marítimos (FCL/LCL)
const maritimeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.post('/api/admin/maritime/upload-manual', 
  authenticateToken, 
  requireMinLevel(ROLES.WAREHOUSE_OPS),
  maritimeUpload.fields([
    { name: 'bl', maxCount: 1 },
    { name: 'telex', maxCount: 1 },
    { name: 'packingList', maxCount: 1 },
    { name: 'summary', maxCount: 1 }
  ]),
  uploadManualShipment
);

// Iniciar CRON Jobs para automatización
import { initCronJobs } from './cronJobs';

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 EntregaX API corriendo en http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Login: POST http://localhost:${PORT}/api/auth/login`);
  console.log(`📝 Registro: POST http://localhost:${PORT}/api/auth/register`);
  
  // Iniciar tareas programadas
  initCronJobs();
});
