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
  updateUser,
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
  setMyDefaultForService,
  getDefaultAddressForService,
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
  assignPriceListToUser,
  // Motor de Tarifas Marítimo
  getPricingCategories,
  getPricingTiers,
  updatePricingTiers,
  createPricingTier,
  deletePricingTier,
  createPricingCategory,
  updatePricingCategory,
  calculateMaritimeCost,
  toggleUserVipPricing
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
  uploadCostPdf,
  // Tarifas Marítimas
  getMaritimeRates,
  getActiveMaritimeRate,
  createMaritimeRate,
  updateMaritimeRate,
  deleteMaritimeRate,
  calculateShipmentCost
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
  deleteMaritimeRoute,
  // Instrucciones de entrega (cliente)
  updateDeliveryInstructions,
  getMyMaritimeOrderDetail
} from './maritimeApiController';
import {
  importLegacyClients,
  getLegacyClients,
  getLegacyStats,
  claimLegacyAccount,
  verifyLegacyBox,
  verifyLegacyName,
  deleteLegacyClient,
  uploadMiddleware
} from './legacyController';
import {
  getWalletStatus,
  getTransactionHistory,
  handleOpenpayWebhook,
  payCredit,
  manualDeposit,
  updateCreditLine,
  getCreditUsers,
  getFinancialSummary,
  getClientsFinancialStatus,
  updateClientCredit,
  runCreditCollectionEngine
} from './financeController';
import {
  getUserPendingPayments,
  getPaymentClabe,
  openpayWebhook,
  getUserPaymentHistory,
  getUserBalancesByService,
  listAvailableServices,
  createServiceInvoice as createMultiServiceInvoice,
  getAdminServiceSummary
} from './multiServicePaymentController';
import {
  getUserServiceCredits,
  updateServiceCredit,
  updateAllServiceCredits,
  getClientsWithServiceCredits,
  getServiceCreditsSummary,
  checkCreditAvailability,
  useServiceCredit
} from './serviceCreditController';
import {
  getAllNationalRates,
  updateNationalRate,
  createNationalRate,
  deleteNationalRate,
  quoteNationalFreight
} from './nationalFreightController';
import {
  getReadyToDispatch,
  quoteShipment as quoteLastMile,
  dispatchShipment,
  getDispatched,
  getCarriers,
  getStats as getLastMileStats,
  reprintLabel
} from './lastMileController';
import {
  getDhlRates,
  updateDhlRate,
  getClientPricing as getDhlClientPricing,
  updateClientPricing as updateDhlClientPricing,
  getDhlShipments,
  receiveDhlPackage,
  quoteDhlShipment,
  dispatchDhlShipment,
  getDhlStats,
  getClientDhlPending,
  getClientDhlHistory,
  clientQuoteDhl,
  measureBoxFromImage
} from './dhlController';
import {
  getPrivacyNotice,
  acceptPrivacyNotice,
  saveEmployeeOnboarding,
  checkIn,
  checkOut,
  getMyAttendanceToday,
  trackGPSLocation,
  getEmployeesWithAttendance,
  getEmployeeDetail,
  getAttendanceHistory,
  getDriversLiveLocation,
  getAttendanceStats,
  getWorkLocations,
  createWorkLocation,
  checkOnboardingStatus,
  createEmployee,
  updateEmployee,
  deleteEmployee
} from './hrController';
import {
  getVehicles,
  getVehicleDetail,
  createVehicle,
  updateVehicle,
  assignDriver,
  getVehicleDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  getMaintenanceHistory,
  createMaintenance,
  getInspections,
  reviewInspection,
  getAvailableVehicles,
  submitDailyInspection,
  checkTodayInspection,
  getFleetAlerts,
  resolveAlert,
  getFleetDashboard,
  getAvailableDrivers,
  checkExpiringDocuments,
  checkUpcomingMaintenance
} from './fleetController';

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
app.post('/api/legacy/verify-name', verifyLegacyName);
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
// Actualizar usuario (admin y superiores)
app.put('/api/admin/users/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), updateUser);

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
app.put('/api/addresses/:id/default-for-service', authenticateToken, setMyDefaultForService);
app.get('/api/addresses/default-for/:service', authenticateToken, getDefaultAddressForService);

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

// --- RUTAS DE VERIFICACIÓN (Usuario) ---
app.get('/api/verification/status', authenticateToken, getVerificationStatus);

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

// ========== MOTOR DE TARIFAS MARÍTIMO ==========

// Categorías de carga
app.get('/api/admin/pricing-categories', authenticateToken, requireMinLevel(ROLES.ADMIN), getPricingCategories);
app.post('/api/admin/pricing-categories', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), createPricingCategory);
app.put('/api/admin/pricing-categories/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updatePricingCategory);

// Tarifas por rango/CBM
app.get('/api/admin/pricing-tiers', authenticateToken, requireMinLevel(ROLES.ADMIN), getPricingTiers);
app.post('/api/admin/pricing-tiers', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), createPricingTier);
app.put('/api/admin/pricing-tiers', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updatePricingTiers);
app.delete('/api/admin/pricing-tiers/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), deletePricingTier);

// Toggle VIP pricing para clientes
app.put('/api/admin/users/:id/vip-pricing', authenticateToken, requireMinLevel(ROLES.ADMIN), toggleUserVipPricing);

// Calculadora de costos marítimos (puede ser pública o autenticada)
app.post('/api/maritime/calculate', calculateMaritimeCost);

// ========== TARIFAS DE FLETE NACIONAL (TERRESTRE) ==========
app.get('/api/admin/national-freight-rates', authenticateToken, requireMinLevel(ROLES.ADMIN), getAllNationalRates);
app.post('/api/admin/national-freight-rates', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), createNationalRate);
app.put('/api/admin/national-freight-rates/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), updateNationalRate);
app.delete('/api/admin/national-freight-rates/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), deleteNationalRate);
// Cotizador público
app.post('/api/national-freight/quote', quoteNationalFreight);

// ========== ÚLTIMA MILLA (SKYDROPX) ==========
// Dashboard y listados
app.get('/api/admin/last-mile/ready', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getReadyToDispatch);
app.get('/api/admin/last-mile/dispatched', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getDispatched);
app.get('/api/admin/last-mile/carriers', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getCarriers);
app.get('/api/admin/last-mile/stats', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getLastMileStats);
// Operaciones
app.post('/api/admin/last-mile/quote', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), quoteLastMile);
app.post('/api/admin/last-mile/dispatch', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), dispatchShipment);
app.get('/api/admin/last-mile/reprint/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), reprintLabel);

// ========== DHL MONTERREY (AA DHL) ==========
// Tarifas
app.get('/api/admin/dhl/rates', authenticateToken, requireMinLevel(ROLES.ADMIN), getDhlRates);
app.put('/api/admin/dhl/rates/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updateDhlRate);
// Precios especiales por cliente
app.get('/api/admin/dhl/client-pricing', authenticateToken, requireMinLevel(ROLES.ADMIN), getDhlClientPricing);
app.put('/api/admin/dhl/client-pricing/:userId', authenticateToken, requireMinLevel(ROLES.ADMIN), updateDhlClientPricing);
// Operaciones de bodega
app.get('/api/admin/dhl/shipments', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getDhlShipments);
app.post('/api/admin/dhl/receive', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), receiveDhlPackage);
app.post('/api/admin/dhl/quote', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), quoteDhlShipment);
app.post('/api/admin/dhl/dispatch', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), dispatchDhlShipment);
app.get('/api/admin/dhl/stats', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getDhlStats);
// IA: Medición de cajas con visión por computadora
app.post('/api/admin/dhl/measure-box', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), measureBoxFromImage);
// Endpoints para cliente (App)
app.get('/api/client/dhl/pending', authenticateToken, getClientDhlPending);
app.get('/api/client/dhl/history', authenticateToken, getClientDhlHistory);
app.post('/api/client/dhl/quote', authenticateToken, clientQuoteDhl);

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

// Tarifas Marítimas (Costo por CBM)
app.get('/api/maritime/rates', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMaritimeRates);
app.get('/api/maritime/rates/active', authenticateToken, getActiveMaritimeRate);
app.post('/api/maritime/rates', authenticateToken, requireMinLevel(ROLES.ADMIN), createMaritimeRate);
app.put('/api/maritime/rates/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), updateMaritimeRate);
app.delete('/api/maritime/rates/:id', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), deleteMaritimeRate);
app.post('/api/maritime/calculate-cost', authenticateToken, calculateShipmentCost);

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

// ========== INSTRUCCIONES DE ENTREGA - CLIENTE MÓVIL ==========
// Endpoints para que los clientes puedan asignar dirección de entrega a sus LOGs marítimos
app.put('/api/maritime-api/orders/:id/delivery-instructions', authenticateToken, updateDeliveryInstructions);
app.get('/api/maritime-api/my-orders/:id', authenticateToken, getMyMaritimeOrderDetail);

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

// Openpay/STP envía notificaciones de depósitos SPEI
app.post('/api/webhooks/openpay', handleOpenpayWebhook);

// ========== SISTEMA FINANCIERO - MONEDERO Y CRÉDITO ==========

// Cliente: Estado de su monedero y crédito
app.get('/api/wallet/status', authenticateToken, getWalletStatus);

// Cliente: Historial de transacciones
app.get('/api/wallet/transactions', authenticateToken, getTransactionHistory);

// Cliente: Pagar saldo de crédito con monedero
app.post('/api/wallet/pay-credit', authenticateToken, payCredit);

// Admin: Fondeo manual (cuando reciben depósito por otro medio)
app.post('/api/admin/wallet/deposit', authenticateToken, requireMinLevel(ROLES.ADMIN), manualDeposit);

// Admin: Gestionar línea de crédito de un usuario
app.post('/api/admin/credit/update', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updateCreditLine);

// Admin: Ver todos los usuarios con crédito
app.get('/api/admin/credit/users', authenticateToken, requireMinLevel(ROLES.ADMIN), getCreditUsers);

// Admin: Resumen financiero general
app.get('/api/admin/finance/summary', authenticateToken, requireMinLevel(ROLES.ADMIN), getFinancialSummary);

// Admin: Panel de Riesgo y Crédito B2B - Todos los clientes
app.get('/api/admin/finance/clients', authenticateToken, requireMinLevel(ROLES.ADMIN), getClientsFinancialStatus);

// Admin: Actualizar línea de crédito de un cliente específico
app.put('/api/admin/finance/clients/:clientId/credit', authenticateToken, requireMinLevel(ROLES.ADMIN), updateClientCredit);

// ========== PAGOS MULTI-SERVICIO (Múltiples RFCs/Empresas) ==========
// Cliente: Ver pagos pendientes por servicio
app.get('/api/payments/pending', authenticateToken, getUserPendingPayments);

// Cliente: Obtener CLABE para pagar un servicio específico
app.post('/api/payments/clabe', authenticateToken, getPaymentClabe);

// Cliente: Historial de pagos
app.get('/api/payments/history', authenticateToken, getUserPaymentHistory);

// Cliente: Balances por servicio
app.get('/api/payments/balances', authenticateToken, getUserBalancesByService);

// Público: Listar servicios disponibles
app.get('/api/services', listAvailableServices);

// Webhooks de Openpay (uno por cada servicio/RFC)
app.post('/api/webhook/openpay/:service', openpayWebhook);

// Admin: Crear factura para un servicio (multi-empresa)
app.post('/api/admin/multi-service/invoices', authenticateToken, requireMinLevel(ROLES.ADMIN), createMultiServiceInvoice);

// Admin: Resumen por servicio
app.get('/api/admin/services/summary', authenticateToken, requireMinLevel(ROLES.ADMIN), getAdminServiceSummary);

// ========== CRÉDITOS POR SERVICIO (Multi-RFC) ==========
// Admin: Resumen de créditos por servicio (dashboard)
app.get('/api/admin/service-credits/summary', authenticateToken, requireMinLevel(ROLES.ADMIN), getServiceCreditsSummary);

// Admin: Listar clientes con sus créditos por servicio
app.get('/api/admin/service-credits/clients', authenticateToken, requireMinLevel(ROLES.ADMIN), getClientsWithServiceCredits);

// Admin: Obtener créditos de un cliente específico
app.get('/api/admin/service-credits/:userId', authenticateToken, requireMinLevel(ROLES.ADMIN), getUserServiceCredits);

// Admin: Actualizar crédito de un servicio específico para un cliente
app.put('/api/admin/service-credits/:userId/:service', authenticateToken, requireMinLevel(ROLES.ADMIN), updateServiceCredit);

// Admin: Actualizar todos los créditos de un cliente
app.put('/api/admin/service-credits/:userId', authenticateToken, requireMinLevel(ROLES.ADMIN), updateAllServiceCredits);

// Cliente: Ver mis créditos por servicio
app.get('/api/my/service-credits', authenticateToken, getUserServiceCredits);

// Cliente: Verificar si puedo usar crédito
app.post('/api/credits/check', authenticateToken, checkCreditAvailability);

// Cliente: Usar crédito (compra a crédito)
app.post('/api/credits/use', authenticateToken, useServiceCredit);

// Admin: Obtener todas las facturas de pago (para panel admin)
app.get('/api/admin/payment-invoices', authenticateToken, requireMinLevel(ROLES.ADMIN), async (req: Request, res: Response): Promise<any> => {
  try {
    const invoicesRes = await pool.query(`
      SELECT 
        pi.*,
        u.full_name as user_name,
        u.email as user_email,
        sc.company_name
      FROM payment_invoices pi
      LEFT JOIN users u ON pi.user_id = u.id
      LEFT JOIN service_companies sc ON pi.service = sc.service
      ORDER BY pi.created_at DESC
      LIMIT 500
    `);

    // Resumen por servicio
    const summaryRes = await pool.query(`
      SELECT 
        sc.service,
        sc.company_name,
        COUNT(*) FILTER (WHERE pi.status IN ('pending', 'partial')) as invoice_count,
        COALESCE(SUM(pi.amount) FILTER (WHERE pi.status IN ('pending', 'partial')), 0) as total_pending
      FROM service_companies sc
      LEFT JOIN payment_invoices pi ON sc.service = pi.service
      GROUP BY sc.service, sc.company_name
      ORDER BY sc.id
    `);

    res.json({
      success: true,
      invoices: invoicesRes.rows,
      summary: summaryRes.rows
    });
  } catch (error) {
    console.error('Error getting payment invoices:', error);
    res.status(500).json({ error: 'Error obteniendo facturas' });
  }
});

// Admin: Crear nueva factura de cobro
app.post('/api/admin/payment-invoices', authenticateToken, requireMinLevel(ROLES.ADMIN), async (req: Request, res: Response): Promise<any> => {
  try {
    const { user_id, service_type, concept, description, amount, due_date, reference_type, reference_id } = req.body;

    // Generar número de factura
    const countRes = await pool.query('SELECT COUNT(*) FROM payment_invoices');
    const invoiceNumber = `PAY-${service_type.toUpperCase().slice(0, 3)}-${String(parseInt(countRes.rows[0].count) + 1).padStart(6, '0')}`;

    const result = await pool.query(`
      INSERT INTO payment_invoices 
        (user_id, service, invoice_number, concept, description, amount, due_date, reference_type, reference_id)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [user_id, service_type, invoiceNumber, concept, description || null, amount, due_date || null, reference_type || null, reference_id || null]);

    res.json({
      success: true,
      invoice: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating payment invoice:', error);
    res.status(500).json({ error: 'Error creando factura' });
  }
});

// Admin: Marcar factura como pagada
app.post('/api/admin/payment-invoices/:id/mark-paid', authenticateToken, requireMinLevel(ROLES.ADMIN), async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    await pool.query(`
      UPDATE payment_invoices 
      SET status = 'paid', paid_at = NOW(), amount_paid = amount
      WHERE id = $1
    `, [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking invoice as paid:', error);
    res.status(500).json({ error: 'Error actualizando factura' });
  }
});

// Admin: Cancelar factura
app.post('/api/admin/payment-invoices/:id/cancel', authenticateToken, requireMinLevel(ROLES.ADMIN), async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    await pool.query(`
      UPDATE payment_invoices 
      SET status = 'cancelled'
      WHERE id = $1
    `, [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error cancelling invoice:', error);
    res.status(500).json({ error: 'Error cancelando factura' });
  }
});

// Admin: Obtener lista de clientes para autocomplete
app.get('/api/admin/clients', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: Request, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT id, full_name as name, email, company_name
      FROM users
      WHERE role = 'client'
      ORDER BY full_name ASC
      LIMIT 500
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting clients:', error);
    res.status(500).json({ error: 'Error obteniendo clientes' });
  }
});

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

// ========== MÓDULO DE RECURSOS HUMANOS ==========
// Públicos (empleados)
app.get('/api/hr/privacy-notice', getPrivacyNotice);

// Empleados autenticados
app.post('/api/hr/accept-privacy', authenticateToken, acceptPrivacyNotice);
app.post('/api/hr/onboarding', authenticateToken, saveEmployeeOnboarding);
app.get('/api/hr/onboarding-status', authenticateToken, checkOnboardingStatus);

// Checador GPS
app.post('/api/hr/check-in', authenticateToken, checkIn);
app.post('/api/hr/check-out', authenticateToken, checkOut);
app.get('/api/hr/my-attendance', authenticateToken, getMyAttendanceToday);
app.post('/api/hr/track-gps', authenticateToken, trackGPSLocation);

// Admin HR
app.get('/api/admin/hr/employees', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getEmployeesWithAttendance);
app.get('/api/admin/hr/employees/:id', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getEmployeeDetail);
app.post('/api/admin/hr/employees', authenticateToken, requireMinLevel(ROLES.ADMIN), createEmployee);
app.put('/api/admin/hr/employees/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), updateEmployee);
app.delete('/api/admin/hr/employees/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), deleteEmployee);
app.get('/api/admin/hr/attendance', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getAttendanceHistory);
app.get('/api/admin/hr/attendance/stats', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getAttendanceStats);
app.get('/api/admin/hr/drivers/live', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getDriversLiveLocation);

// Ubicaciones de trabajo (geocercas)
app.get('/api/admin/hr/locations', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getWorkLocations);
app.post('/api/admin/hr/locations', authenticateToken, requireMinLevel(ROLES.ADMIN), createWorkLocation);

// ========== MÓDULO DE GESTIÓN DE FLOTILLA ==========
// Vehículos - Admin
app.get('/api/admin/fleet/vehicles', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getVehicles);
app.get('/api/admin/fleet/vehicles/:id', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getVehicleDetail);
app.post('/api/admin/fleet/vehicles', authenticateToken, requireMinLevel(ROLES.ADMIN), createVehicle);
app.put('/api/admin/fleet/vehicles/:id', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), updateVehicle);
app.post('/api/admin/fleet/vehicles/:id/assign-driver', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), assignDriver);

// Documentos de vehículos
app.get('/api/admin/fleet/vehicles/:vehicleId/documents', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getVehicleDocuments);
app.post('/api/admin/fleet/vehicles/:vehicleId/documents', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), createDocument);
app.put('/api/admin/fleet/documents/:id', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), updateDocument);
app.delete('/api/admin/fleet/documents/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), deleteDocument);

// Mantenimiento
app.get('/api/admin/fleet/vehicles/:vehicleId/maintenance', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getMaintenanceHistory);
app.post('/api/admin/fleet/vehicles/:vehicleId/maintenance', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), createMaintenance);

// Inspecciones diarias
app.get('/api/admin/fleet/inspections', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getInspections);
app.put('/api/admin/fleet/inspections/:id/review', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), reviewInspection);

// Alertas
app.get('/api/admin/fleet/alerts', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getFleetAlerts);
app.put('/api/admin/fleet/alerts/:id/resolve', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), resolveAlert);

// Dashboard y reportes
app.get('/api/admin/fleet/dashboard', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getFleetDashboard);
app.get('/api/admin/fleet/drivers', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getAvailableDrivers);

// Rutas para choferes (mobile app)
app.get('/api/fleet/available-vehicles', authenticateToken, getAvailableVehicles);
app.post('/api/fleet/inspection', authenticateToken, submitDailyInspection);
app.get('/api/fleet/inspection/today', authenticateToken, checkTodayInspection);

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
