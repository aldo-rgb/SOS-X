// EntregaX Backend API v2.1.0
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import axios from 'axios';
import { pool } from './db';
import { generateCommissionsForPackages } from './commissionService';
import { 
  registerUser, 
  loginUser, 
  getAllUsers, 
  getProfile, 
  authenticateToken,
  requireRole,
  requireMinLevel,
  getDashboardSummary,
  getCounterStaffDashboard,
  changePassword,
  updateProfile,
  updateProfilePhoto,
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
  dispatchConsolidation,
  assignDeliveryInstructions,
  bulkAssignDelivery,
  uploadDeliveryDocs,
  getSavedConstancia,
  getPackageById,
  requestRepack,
  getOutboundReadyPackages,
  createOutboundConsolidation,
  getRepackInstructions,
  updatePackageClient
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
  createAdvisor,
  getAdvisorCommissionsList,
  markCommissionsAsPaid,
  getCommissionsByAdvisor,
  runCommissionBackfill,
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
  getServiceInvoicingSummary,
  // Configuración de servicios por empresa
  getServiceCompanyConfig,
  updateServiceCompanyConfig,
  getEmitterByServiceType
} from './invoicingController';
import {
  saveOpenpayConfig,
  getOpenpayConfig,
  getEmpresasOpenpay,
  createOpenpayCustomer,
  getUserClabe,
  generateClabeBatch,
  handleOpenpayWebhook as handleOpenpayWebhookMultiEmpresa,
  getOpenpayPaymentHistory,
  getOpenpayDashboard,
  getPaymentApplications,
  saveBankConfig,
  getBankConfig,
  savePaypalConfig,
  getPaypalConfig,
  getEmpresaFullConfig
} from './openpayController';
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
  getFclBasePrice,
  getFclClientRates,
  upsertFclClientRate,
  deleteFclClientRate,
  calculateEffectiveFclPrice
} from './fclRatesController';
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
  getWarehouseLocations,
  // Panel Unificado Multi-Sucursal
  getWorkerBranchInfo,
  processWarehouseScan,
  getScanHistory,
  getDailyStats,
  getBranches,
  assignWorkerToBranch,
  // CRUD de Sucursales
  getAllBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  // Geocerca
  validateGeofence,
  getBranchGeofence,
  haversineDistance,
  // Validación Supervisor y DHL
  validateSupervisor,
  processDhlReception,
  getBranchInventory,
  updateSupervisorPin,
  getSupervisorAuthorizations
} from './warehouseController';
import {
  scanPackageToLoad,
  getDriverRouteToday,
  scanPackageReturn,
  getPackagesToReturn,
  confirmDelivery,
  getDeliveriesToday,
  verifyPackageForDelivery
} from './driverController';
import {
  // PO Box USA Rates
  calcularCotizacionPOBox,
  getTarifasVolumen,
  updateTarifaVolumen,
  createTarifaVolumen,
  getServiciosExtra,
  updateServicioExtra,
  createServicioExtra,
  // PO Box Costing
  getCostingConfig,
  saveCostingConfig,
  getCostingPackages,
  updatePackageCost,
  markPackagesAsPaid,
  getPaymentHistory,
  getUtilidadesData
} from './poboxRatesController';
import {
  getCajaChicaStats,
  registrarIngreso,
  registrarEgreso,
  getTransacciones,
  buscarGuiaParaCobro,
  realizarCorte,
  getCortes,
  buscarCliente,
  getGuiasPendientesCliente,
  registrarPagoCliente,
  getDetalleTransaccion,
  getHistorialPagosCliente,
  buscarPorReferencia,
  confirmarPagoReferencia,
  pagarConsolidacionProveedor
} from './cajaChicaController';
import {
  // Exchange Rate Config
  getExchangeRateConfig,
  getExchangeRateByService,
  updateExchangeRateConfig,
  refreshAllExchangeRates,
  getExchangeRateHistory as getExchangeHistory,
  createExchangeRateConfig,
  getExchangeRateSystemStatus,
  getExchangeRateAlerts,
  resolveExchangeRateAlert
} from './exchangeRateController';
import {
  getFiscalData,
  updateFiscalData,
  getRegimenesFiscales,
  getUsosCFDI,
  getFacturasUsuario,
  retryPendingInvoice,
  createInvoice
} from './fiscalController';
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
  getAdvisorDashboard,
  getAdvisorClients,
  saveAdvisorNote,
  getAdvisorShipments,
  getAdvisorCommissions,
  getRepackChildren,
  getClientWallet,
  getAdvisorTeam,
  getAdvisorClientTickets,
  getAdvisorTicketDetail,
  getAdvisorNotifications,
  getAdvisorUnreadCount
} from './advisorPanelController';
import {
  requestAdvisor,
  lookupAdvisor,
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
  clientReplyTicket,
  getAdminTickets,
  getSupportStats,
  adminReplyTicket,
  resolveTicket,
  assignTicket,
  uploadSupportImages,
  validateTracking
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
  createChinaReceipt,
  getAirDaughterGuides,
  getAirDaughterStats,
  pullFromMJCustomer,
  pullBatchFromMJCustomer,
  updateMJCustomerToken,
  loginMJCustomerEndpoint,
  mojieCallbackEncrypted,
  trackFNO,
  getTrajectory,
  getCallbackLogs
} from './chinaController';
import {
  getMasterAwbData,
  saveMasterCost,
  listMasterAwbs,
  deleteMasterAwb,
  getMasterAwbStats,
  getProfitReport,
  getChinaReceiptsList,
  getChinaReceiptPackages
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
  downloadPdf,
  extractDebitNoteFromPdf,
  // Tarifas Marítimas
  getMaritimeRates,
  getActiveMaritimeRate,
  createMaritimeRate,
  updateMaritimeRate,
  deleteMaritimeRate,
  calculateShipmentCost,
  // Utilidades
  getContainerProfitBreakdown
} from './maritimeController';
import {
  // Módulo de Anticipos a Proveedores
  getProveedoresAnticipos,
  getProveedorById,
  createProveedor,
  updateProveedor,
  getBolsasAnticipos,
  getBolsasDisponibles,
  getReferenciasDisponibles,
  getReferenciasByBolsa,
  asignarReferenciaAContainer,
  validarReferenciasExisten,
  getReferenciasValidas,
  getAnticiposByContainer,
  createBolsaAnticipo,
  updateBolsaAnticipo,
  deleteBolsaAnticipo,
  getAsignacionesByContainer,
  getAsignacionesByBolsa,
  asignarAnticipo,
  revertirAsignacion,
  getAnticiposStats
} from './anticiposController';
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
  // Panel Correos Entrantes - Aéreo
  uploadManualAirShipment,
  handleInboundAirEmail,
  getAirDrafts,
  getAirDraftById,
  approveAirDraft,
  rejectAirDraft,
  reextractAirDraft,
  serveAirAwbPdf,
  serveAirExcel,
  getAirEmailStats,
  getAirWhitelist,
  addToAirWhitelist,
  removeFromAirWhitelist,
  // Rutas Aéreas
  getAirRoutes,
  createAirRoute,
  updateAirRoute,
  deleteAirRoute,
  getAirTariffs,
  saveAirTariffs,
  getRoutePriceHistory,
  getAirCostBrackets,
  saveAirCostBrackets,
  // Tarifas personalizadas por cliente
  searchClientsForTariffs,
  getClientTariffs,
  getClientsWithCustomTariffs,
  saveClientTariff,
  saveClientTariffsBulk,
  deleteClientTariff
} from './airEmailController';
import {
  getCajoGuides,
  getCajoStats,
  getCajoGuideById,
  updateCajoGuide,
  batchUpdateCajoStatus,
  deleteCajoGuide,
  getCajoByMawb,
  listCajoMawbs,
  getCajoOverfee,
  saveCajoOverfee
} from './cajoController';
import {
  listAwbCosts,
  getAwbCostDetail,
  saveAwbCosts,
  getAwbCostStats,
  getAwbCostProfit,
  calcReleaseCosts,
  deleteAwbCost,
  uploadAwbDocument,
  handleAwbDocumentUpload
} from './airWaybillCostController';
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
  getMyMaritimeOrderDetail,
  // Asignación masiva de precios
  bulkAssignPricing
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
  getBalance as getWalletBalance,
  getSummary as getWalletSummary,
  getTransactions as getWalletTransactions,
  applyToPayment,
  getMyReferralCode as getReferralCode,
  validateCode as validateReferralCodeNew,
  registerReferral,
  getMyReferrals,
  getMyReferrer,
  getSettings as getReferralSettings,
  adminDeposit,
  adminWithdraw,
  getTopReferrers
} from './walletController';
import {
  getUserPendingPayments,
  getPaymentClabe,
  openpayWebhook,
  getUserPaymentHistory,
  getUserBalancesByService,
  listAvailableServices,
  createServiceInvoice as createMultiServiceInvoice,
  getAdminServiceSummary,
  processOpenPayCard,
  createPayPalPayment,
  createBranchPayment,
  testConfirmPayment,
  handleOpenpayPaymentCallback,
  handleOpenpayPaymentWebhook,
  handlePayPalPaymentCallback
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
  quoteShipmentDirect,
  dispatchShipment,
  getDispatched,
  getCarriers,
  getStats as getLastMileStats,
  reprintLabel,
  quoteShipping
} from './lastMileController';
import {
  pqtxLogin,
  pqtxQuote,
  pqtxCreateShipment,
  pqtxSchedulePickup,
  pqtxCancel,
  pqtxTrack,
  pqtxLabelPdf,
  pqtxLabelZpl,
  pqtxGetConfig,
  pqtxListShipments,
  pqtxClientQuote,
} from './paqueteExpressController';
import {
  getCarrierOptions,
  getCarrierOptionsByService,
  createCarrierOption,
  updateCarrierOption,
  deleteCarrierOption,
  toggleCarrierOption,
  uploadCarrierIcon,
  carrierIconUpload
} from './carrierServiceController';
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
  measureBoxFromImage,
  getDhlCostRates,
  updateDhlCostRate,
  getDhlCosting,
  assignDhlCost,
  autoAssignDhlCosts,
  markDhlCostPaid,
  getDhlPaymentBatches,
  getDhlProfitability
} from './dhlController';
import {
  getPrivacyNotice,
  getAdvisorPrivacyNotice,
  acceptPrivacyNotice,
  acceptAdvisorPrivacyNotice,
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
import {
  // API Pública (app móvil)
  getActiveSlides,
  registerSlideClick,
  // API Admin
  getAllSlides,
  getSlideById,
  createSlide,
  updateSlide,
  deleteSlide,
  reorderSlides,
  toggleSlideActive,
  getCarouselStats,
  duplicateSlide,
  uploadSlideImage
} from './carouselController';
import {
  // Ajustes Financieros
  getAjustesGuia,
  createAjuste,
  deleteAjuste,
  // Cartera Vencida
  getCarteraCliente,
  getCarteraDashboard,
  searchGuiasCS,
  // Abandono y Firma Digital
  generarDocumentoAbandono,
  getDocumentoAbandono,
  firmarDocumentoAbandono,
  // Resumen Financiero
  getResumenFinancieroGuia,
  // Solicitudes de Descuento
  createDiscountRequest,
  getDiscountRequests,
  getDiscountStats,
  resolveDiscountRequest,
  // Cron helpers
  actualizarCarteraVencida,
  sincronizarCartera
} from './customerServiceController';
import {
  getAllLegalDocuments,
  getLegalDocumentByType,
  updateLegalDocument,
  createLegalDocument,
  getLegalDocumentHistory,
  getPublicServiceContract,
  getPublicPrivacyNotice
} from './legalDocumentsController';
import {
  createPoboxPaypalPayment,
  capturePoboxPaypalPayment,
  createPoboxOpenpayPayment,
  createPoboxCashPayment,
  getPoboxPaymentStatus,
  confirmPoboxCashPayment,
  handlePoboxOpenpayWebhook,
  handlePoboxOpenpayCallback,
  getPoboxPendingPayments,
  getPoboxPaymentHistory
} from './poboxPaymentController';
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierConsolidations,
  updateConsolidationStatus,
  getConsolidacionesPendientes
} from './supplierController';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.text({ limit: '50mb', type: ['text/plain', 'text/html'] })); // Para callbacks encriptados de MoJie

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

// También disponible en /api/health para consistencia
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'EntregaX API está funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// DEBUG: Verificar conexión a base de datos
app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT NOW() as time, current_database() as db');
    res.json({ 
      status: 'OK', 
      database: result.rows[0].db,
      time: result.rows[0].time,
      dbUrl: process.env.DATABASE_URL ? 'configured' : 'missing'
    });
  } catch (error: any) {
    res.status(500).json({ 
      status: 'ERROR', 
      error: error.message,
      dbUrl: process.env.DATABASE_URL ? 'configured' : 'missing'
    });
  }
});

// EMERGENCIA: Limpiar espacio en la base de datos
app.post('/api/admin/cleanup-db-space', authenticateToken, requireRole('super_admin'), async (_req: Request, res: Response) => {
  const logs: string[] = [];
  try {
    logs.push('🔍 Iniciando limpieza de base de datos...');

    // 1. Ver tamaño actual
    const sizeQuery = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as db_size`);
    logs.push(`💾 Tamaño actual: ${sizeQuery.rows[0].db_size}`);

    // 2. Contar drafts
    const draftsCount = await pool.query(`SELECT COUNT(*) as total FROM maritime_reception_drafts`);
    logs.push(`📋 Total drafts: ${draftsCount.rows[0].total}`);

    // 3. Eliminar drafts rechazados antiguos (>7 días)
    const deleteRejected = await pool.query(`
      DELETE FROM maritime_reception_drafts 
      WHERE status = 'rejected' 
        AND created_at < NOW() - INTERVAL '7 days'
      RETURNING id
    `);
    logs.push(`🗑️ Eliminados ${deleteRejected.rowCount} drafts rechazados antiguos`);

    // 4. Limpiar extracted_data de drafts con base64 embebido
    const draftsWithLargeData = await pool.query(`
      SELECT id, extracted_data 
      FROM maritime_reception_drafts 
      WHERE LENGTH(extracted_data::text) > 100000
    `);
    logs.push(`📊 Encontrados ${draftsWithLargeData.rows.length} drafts con datos grandes`);

    let cleaned = 0;
    for (const draft of draftsWithLargeData.rows) {
      try {
        let data = draft.extracted_data;
        if (typeof data === 'string') data = JSON.parse(data);

        let modified = false;
        // Limpiar campos que puedan tener base64
        const fieldsToClean = [
          'bl_document_pdf', 'telex_release_pdf', 'packing_list_data',
          'bl_pdf_base64', 'telex_pdf_base64', 'packing_list_base64',
          'bl_data', 'telex_data', 'summary_data', 'excel_data',
          'pdf_data', 'file_data', 'attachment_data', 'rawPdfText'
        ];

        for (const field of fieldsToClean) {
          if (data[field] && typeof data[field] === 'string' && data[field].length > 50000) {
            logs.push(`   Draft ${draft.id}: limpiando ${field} (${(data[field].length/1024).toFixed(0)} KB)`);
            data[field] = '[CLEANED_TO_SAVE_SPACE]';
            modified = true;
          }
        }

        // Truncar packingListData muy grande
        if (data.packingListData && JSON.stringify(data.packingListData).length > 50000) {
          if (Array.isArray(data.packingListData) && data.packingListData.length > 20) {
            logs.push(`   Draft ${draft.id}: truncando packingListData de ${data.packingListData.length} a 20 items`);
            data.packingListData = data.packingListData.slice(0, 20);
            modified = true;
          }
        }

        if (modified) {
          await pool.query('UPDATE maritime_reception_drafts SET extracted_data = $1 WHERE id = $2', [JSON.stringify(data), draft.id]);
          cleaned++;
        }
      } catch (e: any) {
        logs.push(`   Error en draft ${draft.id}: ${e.message}`);
      }
    }
    logs.push(`✅ Limpiados ${cleaned} drafts`);

    // 5. Ejecutar VACUUM
    logs.push('🔄 Ejecutando VACUUM ANALYZE...');
    await pool.query('VACUUM ANALYZE maritime_reception_drafts');
    logs.push('✅ VACUUM completado');

    // 6. Ver tamaño final
    const finalSize = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as db_size`);
    logs.push(`💾 Tamaño final: ${finalSize.rows[0].db_size}`);

    res.json({ success: true, logs });
  } catch (error: any) {
    logs.push(`❌ Error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message, logs });
  }
});

// MIGRACIÓN: Mover documentos base64 de la DB a S3 y luego limpiar
app.post('/api/admin/migrate-base64-to-s3', authenticateToken, requireRole('super_admin'), async (_req: Request, res: Response) => {
  const { uploadToS3, isS3Configured } = await import('./s3Service');
  const logs: string[] = [];
  
  try {
    logs.push('🚀 Iniciando migración de base64 a S3...');
    
    // Verificar S3
    if (!isS3Configured()) {
      return res.status(400).json({ success: false, error: 'S3 no está configurado', logs });
    }
    logs.push('✅ S3 configurado correctamente');

    // Ver tamaño actual
    const sizeQuery = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as db_size`);
    logs.push(`💾 Tamaño actual DB: ${sizeQuery.rows[0].db_size}`);

    // Buscar drafts con datos base64 grandes
    const draftsWithBase64 = await pool.query(`
      SELECT id, extracted_data, pdf_url, telex_pdf_url, summary_excel_url
      FROM maritime_reception_drafts 
      WHERE LENGTH(extracted_data::text) > 50000
      ORDER BY id DESC
      LIMIT 100
    `);
    logs.push(`📋 Encontrados ${draftsWithBase64.rows.length} drafts con datos grandes`);

    let migrated = 0;
    let errors = 0;

    for (const draft of draftsWithBase64.rows) {
      try {
        let data = draft.extracted_data;
        if (typeof data === 'string') data = JSON.parse(data);
        
        let modified = false;
        const timestamp = Date.now();

        // Migrar bl_document_pdf si es base64
        if (data.bl_document_pdf && typeof data.bl_document_pdf === 'string') {
          if (data.bl_document_pdf.startsWith('data:') || data.bl_document_pdf.length > 50000) {
            try {
              const base64Data = data.bl_document_pdf.replace(/^data:[^;]+;base64,/, '');
              const buffer = Buffer.from(base64Data, 'base64');
              const key = `maritime/migration/${draft.id}_bl_${timestamp}.pdf`;
              const s3Url = await uploadToS3(buffer, key, 'application/pdf');
              
              logs.push(`  ✅ Draft ${draft.id}: BL migrado a S3 (${(buffer.length/1024).toFixed(0)} KB)`);
              data.bl_document_pdf = s3Url;
              data.bl_migrated_from_base64 = true;
              modified = true;
            } catch (e: any) {
              logs.push(`  ⚠️ Draft ${draft.id}: Error migrando BL - ${e.message}`);
            }
          }
        }

        // Migrar telex_release_pdf si es base64
        if (data.telex_release_pdf && typeof data.telex_release_pdf === 'string') {
          if (data.telex_release_pdf.startsWith('data:') || data.telex_release_pdf.length > 50000) {
            try {
              const base64Data = data.telex_release_pdf.replace(/^data:[^;]+;base64,/, '');
              const buffer = Buffer.from(base64Data, 'base64');
              const key = `maritime/migration/${draft.id}_telex_${timestamp}.pdf`;
              const s3Url = await uploadToS3(buffer, key, 'application/pdf');
              
              logs.push(`  ✅ Draft ${draft.id}: TELEX migrado a S3 (${(buffer.length/1024).toFixed(0)} KB)`);
              data.telex_release_pdf = s3Url;
              data.telex_migrated_from_base64 = true;
              modified = true;
            } catch (e: any) {
              logs.push(`  ⚠️ Draft ${draft.id}: Error migrando TELEX - ${e.message}`);
            }
          }
        }

        // Migrar packing_list_data si es base64
        if (data.packing_list_data && typeof data.packing_list_data === 'string') {
          if (data.packing_list_data.startsWith('data:') || data.packing_list_data.length > 50000) {
            try {
              const base64Data = data.packing_list_data.replace(/^data:[^;]+;base64,/, '');
              const buffer = Buffer.from(base64Data, 'base64');
              const ext = data.packing_list_data.includes('spreadsheet') ? 'xlsx' : 'pdf';
              const key = `maritime/migration/${draft.id}_packing_${timestamp}.${ext}`;
              const contentType = ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
              const s3Url = await uploadToS3(buffer, key, contentType);
              
              logs.push(`  ✅ Draft ${draft.id}: Packing migrado a S3 (${(buffer.length/1024).toFixed(0)} KB)`);
              data.packing_list_data = s3Url;
              data.packing_migrated_from_base64 = true;
              modified = true;
            } catch (e: any) {
              logs.push(`  ⚠️ Draft ${draft.id}: Error migrando Packing - ${e.message}`);
            }
          }
        }

        // Limpiar rawPdfText si es muy grande (no se puede migrar, solo limpiar)
        if (data.rawPdfText && data.rawPdfText.length > 50000) {
          logs.push(`  🧹 Draft ${draft.id}: Limpiando rawPdfText (${(data.rawPdfText.length/1024).toFixed(0)} KB)`);
          data.rawPdfText = data.rawPdfText.substring(0, 5000) + '... [TRUNCATED]';
          modified = true;
        }

        // Truncar packingListData si es muy grande
        if (data.packingListData && Array.isArray(data.packingListData) && data.packingListData.length > 50) {
          logs.push(`  🧹 Draft ${draft.id}: Truncando packingListData de ${data.packingListData.length} a 50`);
          data.packingListData = data.packingListData.slice(0, 50);
          data.packingListData_truncated = true;
          modified = true;
        }

        if (modified) {
          await pool.query('UPDATE maritime_reception_drafts SET extracted_data = $1 WHERE id = $2', [JSON.stringify(data), draft.id]);
          migrated++;
        }
      } catch (e: any) {
        logs.push(`  ❌ Draft ${draft.id}: Error general - ${e.message}`);
        errors++;
      }
    }

    logs.push(`\n📊 Resumen: ${migrated} migrados, ${errors} errores`);

    // Ejecutar VACUUM
    logs.push('🔄 Ejecutando VACUUM ANALYZE...');
    await pool.query('VACUUM ANALYZE maritime_reception_drafts');
    logs.push('✅ VACUUM completado');

    // Ver tamaño final
    const finalSize = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as db_size`);
    logs.push(`💾 Tamaño final DB: ${finalSize.rows[0].db_size}`);

    res.json({ success: true, migrated, errors, logs });
  } catch (error: any) {
    logs.push(`❌ Error fatal: ${error.message}`);
    res.status(500).json({ success: false, error: error.message, logs });
  }
});

// Verificar estado de S3
app.get('/api/admin/s3-status', authenticateToken, requireRole('super_admin'), async (_req: Request, res: Response) => {
  const { isS3Configured } = await import('./s3Service');
  
  res.json({
    s3_configured: isS3Configured(),
    aws_region: process.env.AWS_REGION || 'not set',
    aws_bucket: process.env.AWS_S3_BUCKET || 'not set',
    aws_access_key: process.env.AWS_ACCESS_KEY_ID ? '****' + process.env.AWS_ACCESS_KEY_ID.slice(-4) : 'not set',
    aws_secret_key: process.env.AWS_SECRET_ACCESS_KEY ? '****' + process.env.AWS_SECRET_ACCESS_KEY.slice(-4) : 'not set'
  });
});

// EMERGENCIA CRÍTICA: Liberar espacio eliminando datos (cuando DB está 100% llena)
app.delete('/api/admin/emergency-cleanup', authenticateToken, requireRole('super_admin'), async (_req: Request, res: Response) => {
  const logs: string[] = [];
  try {
    logs.push('🚨 LIMPIEZA DE EMERGENCIA - DB sin espacio');

    // 1. Eliminar TODOS los drafts rechazados
    const del1 = await pool.query(`DELETE FROM maritime_reception_drafts WHERE status = 'rejected' RETURNING id`);
    logs.push(`🗑️ Eliminados ${del1.rowCount} drafts rechazados`);

    // 2. Eliminar drafts antiguos (más de 30 días) que no sean aprobados
    const del2 = await pool.query(`DELETE FROM maritime_reception_drafts WHERE status != 'approved' AND created_at < NOW() - INTERVAL '30 days' RETURNING id`);
    logs.push(`🗑️ Eliminados ${del2.rowCount} drafts antiguos (>30 días)`);

    // 3. Limpiar extracted_data de drafts restantes (poner NULL en campos grandes)
    const updateResult = await pool.query(`
      UPDATE maritime_reception_drafts 
      SET extracted_data = '{}'::jsonb 
      WHERE LENGTH(extracted_data::text) > 10000
      RETURNING id
    `);
    logs.push(`🧹 Limpiados ${updateResult.rowCount} drafts con datos grandes`);

    // 4. Limpiar campos base64 en container_costs
    const pdfFields = [
      'debit_note_pdf', 'demurrage_pdf', 'storage_pdf', 'maneuvers_pdf',
      'custody_pdf', 'advance_1_pdf', 'advance_2_pdf', 'advance_3_pdf',
      'advance_4_pdf', 'transport_pdf', 'other_pdf', 'telex_release_pdf', 'bl_document_pdf'
    ];
    
    for (const field of pdfFields) {
      const upd = await pool.query(`
        UPDATE container_costs SET ${field} = NULL 
        WHERE ${field} IS NOT NULL AND LENGTH(${field}) > 1000 AND ${field} NOT LIKE 'http%'
        RETURNING id
      `);
      if (upd.rowCount && upd.rowCount > 0) {
        logs.push(`  🧹 ${field}: ${upd.rowCount} campos base64 eliminados`);
      }
    }

    // 5. Limpiar comprobantes base64 en anticipos
    const updAnt = await pool.query(`
      UPDATE bolsas_anticipos SET comprobante_url = NULL 
      WHERE comprobante_url IS NOT NULL AND LENGTH(comprobante_url) > 1000 AND comprobante_url NOT LIKE 'http%'
      RETURNING id
    `);
    logs.push(`🧹 Anticipos: ${updAnt.rowCount} comprobantes base64 eliminados`);

    logs.push('✅ Limpieza de emergencia completada');
    logs.push('⚠️ Ejecuta VACUUM manualmente desde Railway si es posible');

    res.json({ success: true, logs });
  } catch (error: any) {
    logs.push(`❌ Error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message, logs });
  }
});

// Migrar archivos de container_costs de base64 a S3
app.post('/api/admin/migrate-costs-to-s3', authenticateToken, requireRole('super_admin'), async (_req: Request, res: Response) => {
  const { uploadToS3, isS3Configured } = await import('./s3Service');
  const logs: string[] = [];
  
  try {
    logs.push('🚀 Iniciando migración de archivos de costos a S3...');
    
    if (!isS3Configured()) {
      return res.status(400).json({ success: false, error: 'S3 no está configurado', logs });
    }
    logs.push('✅ S3 configurado correctamente');

    // Campos PDF en container_costs
    const pdfFields = [
      'debit_note_pdf', 'demurrage_pdf', 'storage_pdf', 'maneuvers_pdf',
      'custody_pdf', 'advance_1_pdf', 'advance_2_pdf', 'advance_3_pdf',
      'advance_4_pdf', 'transport_pdf', 'other_pdf', 'telex_release_pdf', 'bl_document_pdf'
    ];

    // Buscar registros con datos base64 en los campos PDF
    const costsQuery = await pool.query(`SELECT id, container_id, ${pdfFields.join(', ')} FROM container_costs`);
    logs.push(`📋 Encontrados ${costsQuery.rows.length} registros de costos`);

    let migrated = 0;
    let errors = 0;

    for (const cost of costsQuery.rows) {
      const updates: { field: string; url: string }[] = [];

      for (const field of pdfFields) {
        const value = cost[field];
        if (!value) continue;

        // Verificar si es base64 (muy largo y no es URL)
        if (typeof value === 'string' && value.length > 1000 && !value.startsWith('http')) {
          try {
            logs.push(`  📄 Cost ${cost.id} / Container ${cost.container_id}: Migrando ${field}...`);
            
            // Extraer el contenido base64
            let base64Data = value;
            if (value.startsWith('data:')) {
              const commaIndex = value.indexOf(',');
              if (commaIndex > 0) {
                base64Data = value.substring(commaIndex + 1);
              }
            }

            const buffer = Buffer.from(base64Data, 'base64');
            const timestamp = Date.now();
            const s3Key = `costs/migrated_${cost.container_id}_${field}_${timestamp}.pdf`;
            const s3Url = await uploadToS3(buffer, s3Key, 'application/pdf');

            updates.push({ field, url: s3Url });
            logs.push(`    ✅ Migrado a S3: ${(buffer.length/1024).toFixed(0)} KB`);
            migrated++;
          } catch (e: any) {
            logs.push(`    ❌ Error: ${e.message}`);
            errors++;
          }
        }
      }

      // Actualizar campos migrados en la DB
      if (updates.length > 0) {
        const setClause = updates.map((u, i) => `${u.field} = $${i + 2}`).join(', ');
        const values = updates.map(u => u.url);
        await pool.query(
          `UPDATE container_costs SET ${setClause}, updated_at = NOW() WHERE id = $1`,
          [cost.id, ...values]
        );
      }
    }

    // Migrar también bolsas_anticipos
    logs.push('\n📦 Migrando comprobantes de anticipos...');
    const anticiposQuery = await pool.query(`SELECT id, proveedor_id, comprobante_url FROM bolsas_anticipos WHERE comprobante_url IS NOT NULL`);
    
    for (const anticipo of anticiposQuery.rows) {
      const value = anticipo.comprobante_url;
      if (typeof value === 'string' && value.length > 1000 && !value.startsWith('http')) {
        try {
          logs.push(`  📄 Anticipo ${anticipo.id}: Migrando comprobante...`);
          
          let base64Data = value;
          if (value.startsWith('data:')) {
            const commaIndex = value.indexOf(',');
            if (commaIndex > 0) base64Data = value.substring(commaIndex + 1);
          }

          const buffer = Buffer.from(base64Data, 'base64');
          const timestamp = Date.now();
          const s3Key = `anticipos/migrated_${anticipo.proveedor_id}_${timestamp}.pdf`;
          const s3Url = await uploadToS3(buffer, s3Key, 'application/pdf');

          await pool.query('UPDATE bolsas_anticipos SET comprobante_url = $1 WHERE id = $2', [s3Url, anticipo.id]);
          logs.push(`    ✅ Migrado: ${(buffer.length/1024).toFixed(0)} KB`);
          migrated++;
        } catch (e: any) {
          logs.push(`    ❌ Error: ${e.message}`);
          errors++;
        }
      }
    }

    logs.push(`\n📊 Resumen: ${migrated} archivos migrados, ${errors} errores`);

    // VACUUM
    logs.push('🔄 Ejecutando VACUUM...');
    await pool.query('VACUUM ANALYZE container_costs');
    await pool.query('VACUUM ANALYZE bolsas_anticipos');
    logs.push('✅ VACUUM completado');

    res.json({ success: true, migrated, errors, logs });
  } catch (error: any) {
    logs.push(`❌ Error fatal: ${error.message}`);
    res.status(500).json({ success: false, error: error.message, logs });
  }
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
app.put('/api/auth/profile-photo', authenticateToken, updateProfilePhoto);

// --- RUTAS DE CLIENTES LEGACY (Migración) ---
// Públicas (para registro)
app.post('/api/legacy/claim', claimLegacyAccount);
app.get('/api/legacy/verify/:boxId', verifyLegacyBox);
app.post('/api/legacy/verify-name', verifyLegacyName);
// Protegidas (para admin)
app.post('/api/legacy/import', authenticateToken, requireRole(ROLES.SUPER_ADMIN), uploadMiddleware, importLegacyClients);
app.get('/api/legacy/clients', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.WAREHOUSE_OPS), getLegacyClients);
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

// Cambiar contraseña de usuario (solo super_admin)
app.put('/api/admin/users/:id/password', authenticateToken, requireMinLevel(ROLES.DIRECTOR), async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id as string);
    const { newPassword, requireChange } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Actualizar contraseña y opcionalmente marcar para cambio obligatorio
    const result = await pool.query(
      `UPDATE users 
       SET password = $1, 
           must_change_password = $2
       WHERE id = $3 
       RETURNING id, full_name, email`,
      [hashedPassword, requireChange || false, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    console.log(`🔐 [SUPER_ADMIN] Contraseña ${requireChange ? 'reseteada' : 'cambiada'} para usuario ${result.rows[0].email} por ${req.user?.email}`);
    
    res.json({ 
      success: true, 
      message: requireChange 
        ? 'Contraseña reseteada. El usuario deberá cambiarla en su próximo inicio de sesión.'
        : 'Contraseña actualizada correctamente',
      user: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

// --- RUTAS DE ADMINISTRACIÓN (solo staff y superiores) ---
app.get('/api/admin/dashboard', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), (req: AuthRequest, res: Response) => {
  res.json({
    message: 'Bienvenido al panel de administración',
    usuario: req.user,
    timestamp: new Date().toISOString()
  });
});

// --- RUTA DE RESUMEN DEL DASHBOARD ---
app.get('/api/dashboard/summary', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getDashboardSummary);

// --- RUTA DE DASHBOARD COUNTER STAFF (Mostrador) ---
app.get('/api/dashboard/counter-staff', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getCounterStaffDashboard);

// --- RUTA DE DASHBOARD CLIENTE (Portal del Cliente) ---
app.get('/api/dashboard/client', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // 1. Obtener datos del usuario
    const userQuery = await pool.query(`
      SELECT id, full_name, email, box_id, phone, wallet_balance, 
             used_credit, credit_limit, has_credit
      FROM users WHERE id = $1
    `, [userId]);
    
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const user = userQuery.rows[0];
    const boxId = user.box_id;

    // Buscar legacy_client_id del usuario (para contenedores FCL)
    let legacyClientId: number | null = null;
    if (boxId) {
      const lcRes = await pool.query('SELECT id FROM legacy_clients WHERE box_id = $1 LIMIT 1', [boxId]);
      legacyClientId = lcRes.rows[0]?.id || null;
    }

    // 2. Contar paquetes por estado (usando user_id, no box_id)
    // Separar PO Box USA de Aéreo China
    const packagesStatsQuery = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status::text IN ('in_transit')) as en_transito,
        COUNT(*) FILTER (WHERE status::text IN ('received', 'customs', 'reempacado')) as en_bodega,
        COUNT(*) FILTER (WHERE status::text = 'ready_pickup') as listos_recoger,
        COUNT(*) FILTER (WHERE status::text = 'delivered' AND delivered_at >= NOW() - INTERVAL '30 days') as entregados_mes,
        COALESCE(SUM(COALESCE(assigned_cost_mxn, saldo_pendiente, 0)) FILTER (WHERE client_paid = FALSE AND status::text NOT IN ('cancelled', 'returned', 'delivered')), 0) as saldo_pendiente,
        COALESCE(SUM(COALESCE(assigned_cost_mxn, saldo_pendiente, 0)) FILTER (WHERE client_paid = FALSE AND status::text NOT IN ('cancelled', 'returned', 'delivered') AND service_type = 'POBOX_USA'), 0) as saldo_pobox,
        COALESCE(SUM(COALESCE(assigned_cost_mxn, saldo_pendiente, 0)) FILTER (WHERE client_paid = FALSE AND status::text NOT IN ('cancelled', 'returned', 'delivered') AND service_type = 'AIR_CHN_MX'), 0) as saldo_aereo
      FROM packages
      WHERE user_id = $1
    `, [userId]);

    // 2b. Contar órdenes marítimas (por user_id O por shipping_mark)
    const maritimeStatsQuery = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status IN ('in_transit', 'in_warehouse', 'shipped', 'at_port', 'loading')) as en_transito,
        COUNT(*) FILTER (WHERE status IN ('received_cedis', 'ready_pickup')) as listos_recoger,
        COUNT(*) FILTER (WHERE status = 'delivered' AND delivered_at >= NOW() - INTERVAL '30 days') as entregados_mes,
        COALESCE(SUM(COALESCE(assigned_cost_mxn, saldo_pendiente, 0)) FILTER (WHERE payment_status != 'paid' AND status NOT IN ('cancelled', 'delivered')), 0) as saldo_pendiente
      FROM maritime_orders
      WHERE user_id = $1 OR UPPER(shipping_mark) = UPPER($2)
    `, [userId, boxId]);

    const stats = packagesStatsQuery.rows[0];
    const maritimeStats = maritimeStatsQuery.rows[0];

    // 2c. Contar envíos DHL shipments
    let dhlStats = { en_bodega: 0, saldo_pendiente: 0 };
    try {
      const dhlStatsQuery = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status IN ('received_mty', 'inspected', 'pending_payment', 'pending_inspection')) as en_bodega,
          COALESCE(SUM(COALESCE(import_cost_usd, 0)) FILTER (WHERE paid_at IS NULL AND status NOT IN ('cancelled', 'delivered')), 0) as saldo_pendiente
        FROM dhl_shipments
        WHERE user_id = $1 OR box_id = $2
      `, [userId, boxId]);
      dhlStats = dhlStatsQuery.rows[0] || dhlStats;
    } catch (err) {
      console.log('DHL stats error:', (err as Error).message);
    }

    // 2d. Contar paquetes TDI Aéreo China (china_receipts)
    // Los paquetes aéreos tienen saldo_pendiente o assigned_cost_mxn
    // Si no tienen costo asignado, estimamos con $21 USD/kg (tarifa estándar)
    let chinaAirStats = { saldo_pendiente: 0, paquetes_pendientes: 0 };
    try {
      const chinaAirStatsQuery = await pool.query(`
        SELECT 
          COALESCE(SUM(
            CASE 
              WHEN saldo_pendiente IS NOT NULL THEN saldo_pendiente
              WHEN assigned_cost_mxn IS NOT NULL THEN assigned_cost_mxn
              ELSE COALESCE(total_weight, 0) * 21  -- Estimado $21 USD/kg si no hay costo
            END
          ) FILTER (WHERE COALESCE(payment_status, 'pending') != 'paid' AND status NOT IN ('cancelled', 'delivered')), 0) as saldo_pendiente,
          COUNT(*) FILTER (WHERE COALESCE(payment_status, 'pending') != 'paid' AND status NOT IN ('cancelled', 'delivered')) as paquetes_pendientes
        FROM china_receipts
        WHERE user_id = $1 OR UPPER(shipping_mark) = UPPER($2)
      `, [userId, boxId]);
      chinaAirStats = chinaAirStatsQuery.rows[0] || chinaAirStats;
      console.log('[Dashboard] China Air stats:', chinaAirStats, 'for user', userId, 'boxId', boxId);
    } catch (err) {
      console.log('China Air stats error:', (err as Error).message);
    }

    // 3. Obtener paquetes activos del cliente (PO Box USA y Aéreo China)
    const packagesQuery = await pool.query(`
      SELECT 
        id,
        -- Usar child_no como tracking si tiene formato AIR, sino tracking_internal
        CASE WHEN child_no IS NOT NULL AND child_no LIKE 'AIR%' THEN child_no ELSE tracking_internal END as tracking,
        tracking_provider,
        description as descripcion,
        service_type as servicio,
        CASE 
          WHEN service_type = 'POBOX_USA' THEN 'air'
          WHEN service_type = 'AIR_CHN_MX' THEN 'china_air'
          WHEN service_type = 'SEA_CHN_MX' THEN 'maritime'
          ELSE 'air'
        END as shipment_type,
        status::text as status,
        CASE status::text 
          WHEN 'received' THEN 'En Bodega'
          WHEN 'in_transit' THEN 'En Tránsito'
          WHEN 'customs' THEN 'En Aduana'
          WHEN 'ready_pickup' THEN 'Listo para Recoger'
          WHEN 'delivered' THEN 'Entregado'
          WHEN 'processing' THEN 'Procesando'
          WHEN 'reempacado' THEN 'Reempacado'
          WHEN 'received_china' THEN 'Recibido China'
          WHEN 'received_origin' THEN 'En Bodega China'
          WHEN 'at_customs' THEN 'En Aduana'
          WHEN 'in_transit_mx' THEN 'En Ruta México'
          WHEN 'received_cedis' THEN 'En CEDIS'
          ELSE status::text
        END as status_label,
        COALESCE(eta::text, 'Por confirmar') as fecha_estimada,
        COALESCE(assigned_cost_mxn, saldo_pendiente, 0) as monto,
        client_paid,
        assigned_address_id as delivery_address_id,
        assigned_address_id,
        CASE 
          WHEN assigned_address_id IS NOT NULL THEN true
          WHEN (destination_address IS NOT NULL 
                AND destination_address != 'Pendiente de asignar' 
                AND destination_contact IS NOT NULL) THEN true
          ELSE false
        END as has_delivery_instructions,
        created_at,
        updated_at,
        is_master,
        master_id,
        has_gex,
        gex_folio,
        weight,
        CASE 
          WHEN dimensions IS NOT NULL AND dimensions != '' 
            THEN REPLACE(dimensions, 'x', ' × ') || ' cm'
          WHEN long_cm IS NOT NULL AND width_cm IS NOT NULL AND height_cm IS NOT NULL 
            THEN CONCAT(long_cm, ' × ', width_cm, ' × ', height_cm, ' cm')
          WHEN pkg_length IS NOT NULL AND pkg_width IS NOT NULL AND pkg_height IS NOT NULL 
            THEN CONCAT(pkg_length, ' × ', pkg_width, ' × ', pkg_height, ' cm')
          ELSE NULL
        END as dimensions,
        single_cbm as cbm,
        declared_value,
        total_boxes,
        image_url,
        destination_address,
        destination_city,
        destination_contact,
        air_sale_price,
        air_price_per_kg,
        air_tariff_type,
        pro_name,
        pobox_venta_usd,
        registered_exchange_rate
      FROM packages
      WHERE (user_id = $1 OR box_id = $2)
        AND status::text NOT IN ('delivered', 'cancelled', 'returned')
        AND (is_master = true OR master_id IS NULL)
      ORDER BY 
        CASE WHEN status::text = 'ready_pickup' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 200
    `, [userId, boxId]);

    // 3b. Obtener órdenes marítimas activas del cliente
    // Buscar por user_id O por shipping_mark = box_id
    const maritimeOrdersQuery = await pool.query(`
      SELECT 
        id,
        ordersn as tracking,
        'MARITIMO' as tracking_provider,
        COALESCE(goods_name, summary_description, 'Carga Marítima') as descripcion,
        'SEA_CHN_MX' as servicio,
        'maritime' as shipment_type,
        status,
        CASE status 
          WHEN 'in_warehouse' THEN 'En Bodega China'
          WHEN 'in_transit' THEN '🚢 En Tránsito Marítimo'
          WHEN 'shipped' THEN '🚢 Ya Zarpó'
          WHEN 'at_port' THEN '⚓ En Puerto'
          WHEN 'loading' THEN '📦 Cargando'
          WHEN 'customs_mx' THEN '🛃 Aduana México'
          WHEN 'in_transit_mx' THEN '🚛 En Ruta México'
          WHEN 'received_cedis' THEN '✅ En CEDIS'
          WHEN 'ready_pickup' THEN '📍 Listo para Recoger'
          WHEN 'delivered' THEN '✅ Entregado'
          ELSE status
        END as status_label,
        COALESCE(container_number, bl_number, 'En tránsito') as fecha_estimada,
        COALESCE(assigned_cost_mxn, saldo_pendiente, 0) as monto,
        CASE WHEN payment_status = 'paid' THEN true ELSE false END as client_paid,
        delivery_address_id,
        NULL as assigned_address_id,
        created_at,
        COALESCE(summary_boxes, 0) as total_boxes,
        COALESCE(summary_weight, weight) as weight,
        COALESCE(summary_volume, volume) as cbm,
        NULL as dimensions,
        estimated_cost as declared_value,
        NULL as image_url,
        NULL as destination_address,
        NULL as destination_city,
        NULL as destination_contact,
        false as is_master,
        NULL as master_id,
        has_gex,
        gex_folio,
        assigned_cost_usd as maritime_sale_price_usd,
        merchandise_type,
        'MXN' as monto_currency,
        registered_exchange_rate
      FROM maritime_orders
      WHERE (user_id = $1 OR UPPER(shipping_mark) = UPPER($2))
        AND status NOT IN ('delivered', 'cancelled')
      ORDER BY 
        CASE WHEN status = 'ready_pickup' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 50
    `, [userId, boxId]);

    // 3c. Obtener paquetes DHL activos del cliente (si existe la tabla y tiene relación)
    let dhlPackagesRows: any[] = [];
    try {
      // DHL packages se vinculan por nombre de cliente o branch
      const dhlQuery = await pool.query(`
        SELECT 
          dp.id,
          dp.tracking_number as tracking,
          'DHL' as tracking_provider,
          COALESCE(dp.description, 'Paquete DHL') as descripcion,
          'DHL_MTY' as servicio,
          'dhl' as shipment_type,
          dp.status,
          CASE dp.status 
            WHEN 'received' THEN '📦 Recibido CEDIS MTY'
            WHEN 'pending_release' THEN '⏳ Pendiente Liberación'
            WHEN 'released' THEN '✅ Liberado'
            WHEN 'delivered' THEN '✅ Entregado'
            ELSE dp.status
          END as status_label,
          'CEDIS MTY' as fecha_estimada,
          0 as monto,
          false as client_paid,
          NULL as delivery_address_id,
          NULL as assigned_address_id,
          dp.created_at
        FROM dhl_packages dp
        JOIN users u ON (
          LOWER(dp.client_name) LIKE '%' || LOWER(u.full_name) || '%'
          OR LOWER(dp.client_name) LIKE '%' || LOWER(u.box_id) || '%'
        )
        WHERE u.id = $1
          AND dp.status NOT IN ('delivered', 'cancelled')
        ORDER BY dp.created_at DESC
        LIMIT 10
      `, [userId]);
      dhlPackagesRows = dhlQuery.rows;
    } catch (err) {
      // Tabla DHL no existe o error, continuar sin DHL
      console.log('DHL packages query error:', (err as Error).message);
    }

    // 3e. Obtener envíos DHL Shipments (AA DHL con inspección)
    let dhlShipmentRows: any[] = [];
    try {
      const dhlShipQuery = await pool.query(`
        SELECT 
          ds.id,
          ds.inbound_tracking as tracking,
          COALESCE(ds.national_tracking, 'DHL') as tracking_provider,
          COALESCE(ds.description, 'Paquete DHL') as descripcion,
          'AA_DHL' as servicio,
          'dhl' as shipment_type,
          ds.status,
          CASE ds.status 
            WHEN 'pending_inspection' THEN '🔍 Pendiente Inspección'
            WHEN 'received_mty' THEN '📦 Recibido MTY'
            WHEN 'inspected' THEN '✅ Inspeccionado'
            WHEN 'pending_payment' THEN '💳 Pendiente de Pago'
            WHEN 'paid' THEN '✅ Pagado'
            WHEN 'dispatched' THEN '🚚 Enviado'
            WHEN 'delivered' THEN '✅ Entregado'
            ELSE ds.status
          END as status_label,
          'CEDIS MTY' as fecha_estimada,
          COALESCE(ds.import_cost_usd, 0) as monto,
          CASE WHEN ds.paid_at IS NOT NULL THEN true ELSE false END as client_paid,
          ds.delivery_address_id,
          NULL as assigned_address_id,
          ds.created_at,
          false as is_master,
          NULL as master_id,
          ds.has_gex,
          ds.gex_folio,
          ds.weight_kg as weight,
          CASE 
            WHEN ds.length_cm IS NOT NULL AND ds.width_cm IS NOT NULL AND ds.height_cm IS NOT NULL 
              THEN CONCAT(ds.length_cm, ' × ', ds.width_cm, ' × ', ds.height_cm, ' cm')
            ELSE NULL
          END as dimensions,
          ds.product_type,
          ds.saldo_pendiente,
          ds.monto_pagado,
          ds.import_cost_usd as dhl_sale_price_usd,
          'USD' as monto_currency
        FROM dhl_shipments ds
        WHERE (ds.user_id = $1 OR ds.box_id = $2)
          AND ds.status NOT IN ('delivered', 'cancelled')
        ORDER BY ds.created_at DESC
        LIMIT 50
      `, [userId, boxId]);
      dhlShipmentRows = dhlShipQuery.rows;
    } catch (err) {
      console.log('DHL shipments query error:', (err as Error).message);
    }

    // 3f. Obtener contenedores FCL del cliente (vinculados por client_user_id o legacy_client_id)
    let containerRows: any[] = [];
    try {
      const containerConditions = ['c.client_user_id = $1'];
      const containerParams: any[] = [userId];
      if (legacyClientId) {
        containerConditions.push(`c.legacy_client_id = $${containerParams.length + 1}`);
        containerParams.push(legacyClientId);
      }
      const containerQuery = await pool.query(`
        SELECT 
          c.id,
          c.container_number as tracking,
          COALESCE(c.carrier_name, 'MARITIMO') as tracking_provider,
          COALESCE(c.goods_description, 'Contenedor ' || c.container_number) as descripcion,
          'FCL_CHN_MX' as servicio,
          'maritime' as shipment_type,
          c.status,
          CASE c.status 
            WHEN 'in_transit' THEN '🚢 En Tránsito Marítimo'
            WHEN 'at_port' THEN '⚓ En Puerto'
            WHEN 'customs_mx' THEN '🛃 Aduana México'
            WHEN 'in_transit_mx' THEN '🚛 En Ruta México'
            WHEN 'received_cedis' THEN '✅ En CEDIS'
            WHEN 'ready_pickup' THEN '📍 Listo para Recoger'
            WHEN 'delivered' THEN '✅ Entregado'
            ELSE c.status
          END as status_label,
          COALESCE(c.vessel_name, c.bl_number, 'En tránsito') as fecha_estimada,
          COALESCE(c.sale_price, 0) as monto,
          false as client_paid,
          NULL as delivery_address_id,
          NULL as assigned_address_id,
          c.created_at,
          c.total_packages as total_boxes,
          c.total_weight_kg as weight,
          c.total_cbm as cbm,
          NULL as dimensions,
          NULL as declared_value,
          NULL as image_url,
          NULL as destination_address,
          NULL as destination_city,
          NULL as destination_contact,
          false as is_master,
          NULL as master_id,
          c.has_gex,
          c.gex_folio,
          c.sale_price as maritime_sale_price_usd,
          'FCL' as merchandise_type,
          COALESCE(c.sale_price_currency, 'MXN') as monto_currency,
          c.eta,
          c.bl_number,
          c.vessel_name
        FROM containers c
        WHERE (${containerConditions.join(' OR ')})
          AND c.status NOT IN ('delivered', 'cancelled')
        ORDER BY 
          CASE WHEN c.status = 'ready_pickup' THEN 0 ELSE 1 END,
          c.created_at DESC
        LIMIT 200
      `, containerParams);
      containerRows = containerQuery.rows;
    } catch (err) {
      console.log('Containers query error:', (err as Error).message);
    }

    // 3d. Cargar paquetes hijos (guías incluidas) para los reempaques/masters
    const masterIds = packagesQuery.rows
      .filter((p: any) => p.is_master === true)
      .map((p: any) => p.id);
    
    let childrenByMaster: Record<number, any[]> = {};
    if (masterIds.length > 0) {
      const childrenResult = await pool.query(`
        SELECT 
          id, master_id, tracking_internal, tracking_provider, 
          description, weight, pkg_length, pkg_width, pkg_height,
          single_cbm, declared_value,
          box_number, status::text as status
        FROM packages 
        WHERE master_id = ANY($1) 
        ORDER BY box_number, id
      `, [masterIds]);
      
      childrenResult.rows.forEach((child: any) => {
        const masterId = child.master_id;
        if (masterId) {
          if (!childrenByMaster[masterId]) {
            childrenByMaster[masterId] = [];
          }
          childrenByMaster[masterId].push({
            id: child.id,
            tracking: child.tracking_internal,
            tracking_provider: child.tracking_provider,
            description: child.description,
            weight: child.weight ? parseFloat(child.weight) : null,
            dimensions: child.pkg_length && child.pkg_width && child.pkg_height 
              ? `${child.pkg_length}×${child.pkg_width}×${child.pkg_height} cm` 
              : null,
            cbm: child.single_cbm ? parseFloat(child.single_cbm) : null,
            declared_value: child.declared_value ? parseFloat(child.declared_value) : null,
            box_number: child.box_number,
            status: child.status
          });
        }
      });
    }

    // Combinar todos los paquetes y agregar guías incluidas a los masters
    // Para los masters, calcular totales de los hijos
    const packagesWithChildren = packagesQuery.rows.map((pkg: any) => {
      const children = pkg.is_master ? (childrenByMaster[pkg.id] || []) : [];
      
      // Para masters, usar valores del paquete master si existen, sino calcular desde hijos
      let finalWeight = pkg.weight ? parseFloat(pkg.weight) : 0;
      let finalCbm = pkg.cbm ? parseFloat(pkg.cbm) : 0;
      let finalDeclaredValue = pkg.declared_value ? parseFloat(pkg.declared_value) : 0;
      
      if (pkg.is_master && children.length > 0) {
        // Solo calcular desde hijos si el master no tiene el valor
        if (!finalWeight) {
          finalWeight = children.reduce((sum: number, c: any) => sum + (c.weight || 0), 0);
        }
        if (!finalCbm) {
          finalCbm = children.reduce((sum: number, c: any) => sum + (c.cbm || 0), 0);
        }
        if (!finalDeclaredValue) {
          finalDeclaredValue = children.reduce((sum: number, c: any) => sum + (c.declared_value || 0), 0);
        }
      }
      
      return {
        ...pkg,
        weight: finalWeight || null,
        cbm: finalCbm || null,
        declared_value: finalDeclaredValue || null,
        included_guides: children,
        total_guides: children.length
      };
    });

    const allPackages = [
      ...packagesWithChildren,
      ...maritimeOrdersQuery.rows.map((mo: any) => ({
        ...mo,
        total_boxes: mo.total_boxes ? parseInt(mo.total_boxes) : null,
        weight: mo.weight ? parseFloat(mo.weight) : null,
        cbm: mo.cbm ? parseFloat(mo.cbm) : null,
        monto: mo.monto ? parseFloat(mo.monto) : 0,
        declared_value: mo.declared_value ? parseFloat(mo.declared_value) : null,
      })),
      ...dhlPackagesRows,
      ...dhlShipmentRows,
      ...containerRows.map((c: any) => ({
        ...c,
        total_boxes: c.total_boxes ? parseInt(c.total_boxes) : null,
        weight: c.weight ? parseFloat(c.weight) : null,
        cbm: c.cbm ? parseFloat(c.cbm) : null,
        monto: c.monto ? parseFloat(c.monto) : 0,
        maritime_sale_price_usd: c.maritime_sale_price_usd ? parseFloat(c.maritime_sale_price_usd) : null,
      })),
    ].sort((a, b) => {
      // Primero los listos para recoger
      if (a.status === 'ready_pickup' && b.status !== 'ready_pickup') return -1;
      if (b.status === 'ready_pickup' && a.status !== 'ready_pickup') return 1;
      // Luego por fecha de creación
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // 4. Obtener facturas recientes (si la tabla existe)
    let invoicesRows: any[] = [];
    try {
      const invoicesQuery = await pool.query(`
        SELECT 
          id,
          folio_fiscal as folio,
          fecha_emision as fecha,
          total,
          status,
          pdf_url,
          xml_url
        FROM facturas
        WHERE user_id = $1
        ORDER BY fecha_emision DESC
        LIMIT 10
      `, [userId]);
      invoicesRows = invoicesQuery.rows;
    } catch (err) {
      // Tabla facturas no existe, continuar sin facturas
      console.log('Tabla facturas no disponible');
    }

    // Contar contenedores activos para stats
    const containerStatsInTransit = containerRows.filter((c: any) => 
      ['in_transit', 'at_port', 'loading'].includes(c.status)
    ).length;
    const containerStatsReady = containerRows.filter((c: any) => 
      ['received_cedis', 'ready_pickup'].includes(c.status)
    ).length;
    const containerSaldoPendiente = containerRows.reduce((sum: number, c: any) => {
      const price = parseFloat(c.monto) || 0;
      return c.client_paid ? sum : sum + price;
    }, 0);

    // 5. Obtener tipos de cambio por servicio desde exchange_rate_config
    const tipoCambioPorServicio: Record<string, number> = {};
    let tipoCambioBase = 18.00;
    try {
      const fxConfigRes = await pool.query('SELECT servicio, tipo_cambio_final, ultimo_tc_api FROM exchange_rate_config WHERE estado = true');
      for (const row of fxConfigRes.rows) {
        tipoCambioPorServicio[row.servicio] = parseFloat(row.tipo_cambio_final) || 18.00;
        if (row.ultimo_tc_api) tipoCambioBase = parseFloat(row.ultimo_tc_api) || tipoCambioBase;
      }
    } catch (err) {
      console.log('Exchange rate config not available, using defaults');
    }

    // 6. Construir respuesta
    res.json({
      stats: {
        casillero: boxId,
        direccion_usa: {
          nombre: user.full_name,
          direccion: `2819 Perkins Lane, Suite ${boxId}`,
          ciudad: 'Laredo',
          estado: 'TX',
          zip: '78045',
        },
        paquetes: {
          en_transito: (parseInt(stats.en_transito) || 0) + (parseInt(maritimeStats.en_transito) || 0) + containerStatsInTransit,
          en_bodega: (parseInt(stats.en_bodega) || 0) + (parseInt(String(dhlStats.en_bodega)) || 0),
          listos_recoger: (parseInt(stats.listos_recoger) || 0) + (parseInt(maritimeStats.listos_recoger) || 0) + containerStatsReady,
          entregados_mes: (parseInt(stats.entregados_mes) || 0) + (parseInt(maritimeStats.entregados_mes) || 0),
        },
        financiero: {
          saldo_pendiente: (parseFloat(stats.saldo_pendiente) || 0) + (parseFloat(maritimeStats.saldo_pendiente) || 0) + (parseFloat(dhlStats.saldo_pendiente as any) || 0) + containerSaldoPendiente + (parseFloat(chinaAirStats.saldo_pendiente as any) || 0),
          // Desglose por tipo de servicio con moneda correcta
          saldo_por_servicio: [
            { servicio: 'PO Box USA', monto: parseFloat(stats.saldo_pobox) || 0, moneda: 'MXN', icono: '📦' },
            { servicio: 'Aéreo China', monto: (parseFloat(stats.saldo_aereo) || 0) + (parseFloat(chinaAirStats.saldo_pendiente as any) || 0), moneda: 'MXN', icono: '✈️' },
            { servicio: 'Marítimo China', monto: parseFloat(maritimeStats.saldo_pendiente) || 0, moneda: 'MXN', icono: '🚢' },
            { servicio: 'Liberación MTY', monto: parseFloat(dhlStats.saldo_pendiente as any) || 0, moneda: 'MXN', icono: '📮' },
            { servicio: 'Contenedores FCL', monto: containerSaldoPendiente, moneda: 'MXN', icono: '🏗️' },
          ].filter(s => s.monto > 0),
          saldo_favor: parseFloat(user.wallet_balance) || 0,
          credito_disponible: user.has_credit 
            ? (parseFloat(user.credit_limit) - parseFloat(user.used_credit)) 
            : 0,
          ultimo_pago: 'N/A', // TODO: Obtener del historial de pagos
        },
      },
      packages: allPackages,
      invoices: invoicesRows,
      tipo_cambio_por_servicio: tipoCambioPorServicio,
      tipo_cambio_base: tipoCambioBase,
    });
  } catch (error: any) {
    console.error('Error en dashboard cliente:', error);
    res.status(500).json({ error: 'Error al cargar dashboard', details: error.message });
  }
});

// Historial de paquetes entregados del cliente
app.get('/api/packages/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Obtener paquetes entregados de la tabla packages
    const packagesQuery = await pool.query(`
      SELECT 
        id,
        tracking_internal as tracking,
        tracking_provider,
        description as descripcion,
        service_type as servicio,
        CASE 
          WHEN service_type = 'POBOX_USA' THEN 'air'
          WHEN service_type = 'AIR_CHN_MX' THEN 'china_air'
          WHEN service_type = 'SEA_CHN_MX' THEN 'maritime'
          ELSE 'air'
        END as shipment_type,
        status,
        'Entregado' as status_label,
        COALESCE(TO_CHAR(delivered_at, 'DD Mon YYYY'), TO_CHAR(updated_at, 'DD Mon YYYY')) as fecha_entrega,
        COALESCE(assigned_cost_mxn, 0) as monto,
        received_by as recibio,
        destination_city as branch_name,
        weight,
        CASE 
          WHEN dimensions IS NOT NULL AND dimensions != '' 
            THEN REPLACE(dimensions, 'x', ' × ') || ' cm'
          WHEN long_cm IS NOT NULL AND width_cm IS NOT NULL AND height_cm IS NOT NULL 
            THEN CONCAT(long_cm, ' × ', width_cm, ' × ', height_cm, ' cm')
          WHEN pkg_length IS NOT NULL AND pkg_width IS NOT NULL AND pkg_height IS NOT NULL 
            THEN CONCAT(pkg_length, ' × ', pkg_width, ' × ', pkg_height, ' cm')
          ELSE NULL
        END as dimensions,
        single_cbm as cbm,
        declared_value,
        created_at,
        updated_at,
        is_master,
        total_boxes,
        has_gex,
        gex_folio,
        client_paid,
        image_url,
        air_sale_price,
        air_price_per_kg,
        air_tariff_type,
        pobox_venta_usd,
        registered_exchange_rate
      FROM packages
      WHERE user_id = $1
        AND status = 'delivered'
        AND (is_master = true OR master_id IS NULL)
      ORDER BY COALESCE(delivered_at, updated_at) DESC
      LIMIT 50
    `, [userId]);

    // Cargar guías incluidas para los masters del historial
    const masterIds = packagesQuery.rows
      .filter((p: any) => p.is_master === true)
      .map((p: any) => p.id);
    
    let childrenByMaster: Record<number, any[]> = {};
    if (masterIds.length > 0) {
      const childrenResult = await pool.query(`
        SELECT 
          id, master_id, tracking_internal as tracking, tracking_provider, 
          description, weight, pkg_length, pkg_width, pkg_height,
          single_cbm, declared_value,
          box_number, status::text as status
        FROM packages 
        WHERE master_id = ANY($1) 
        ORDER BY box_number, id
      `, [masterIds]);
      
      childrenResult.rows.forEach((child: any) => {
        const masterId = child.master_id;
        if (masterId) {
          if (!childrenByMaster[masterId]) {
            childrenByMaster[masterId] = [];
          }
          childrenByMaster[masterId].push({
            id: child.id,
            tracking: child.tracking,
            tracking_provider: child.tracking_provider,
            description: child.description,
            weight: child.weight ? parseFloat(child.weight) : null,
            dimensions: child.pkg_length && child.pkg_width && child.pkg_height 
              ? `${child.pkg_length}×${child.pkg_width}×${child.pkg_height} cm` 
              : null,
            cbm: child.single_cbm ? parseFloat(child.single_cbm) : null,
            declared_value: child.declared_value ? parseFloat(child.declared_value) : null,
            box_number: child.box_number,
            status: child.status
          });
        }
      });
    }

    // Agregar guías incluidas a los masters
    const packagesWithChildren = packagesQuery.rows.map((pkg: any) => ({
      ...pkg,
      included_guides: pkg.is_master ? (childrenByMaster[pkg.id] || []) : [],
      total_guides: pkg.is_master ? (childrenByMaster[pkg.id]?.length || 0) : 0
    }));

    // Obtener órdenes marítimas entregadas
    let maritimeDelivered: any[] = [];
    try {
      const maritimeQuery = await pool.query(`
        SELECT 
          id,
          order_number as tracking,
          COALESCE(consolidation_code, 'Marítimo') as descripcion,
          'MAR_CHN_MX' as servicio,
          'maritime' as shipment_type,
          status,
          'Entregado' as status_label,
          TO_CHAR(updated_at, 'DD Mon YYYY') as fecha_entrega,
          COALESCE(total_cost, 0) as monto,
          NULL as recibio,
          'Marítimo China' as branch_name,
          total_cbm as weight_lbs,
          created_at,
          updated_at,
          false as is_master,
          NULL as has_gex,
          CASE WHEN payment_status = 'paid' THEN true ELSE false END as client_paid
        FROM maritime_orders
        WHERE user_id = $1
          AND status = 'delivered'
        ORDER BY updated_at DESC
        LIMIT 20
      `, [userId]);
      maritimeDelivered = maritimeQuery.rows;
    } catch (err) {
      // Maritime table might not exist
    }

    // Combinar resultados
    const allHistory = [
      ...packagesWithChildren,
      ...maritimeDelivered
    ].sort((a, b) => new Date(b.fecha_entrega || 0).getTime() - new Date(a.fecha_entrega || 0).getTime());

    res.json({ 
      packages: allHistory,
      total: allHistory.length
    });
  } catch (error: any) {
    console.error('Error en historial de paquetes:', error);
    res.status(500).json({ error: 'Error al cargar historial', details: error.message });
  }
});

// --- RUTA PARA VERIFICAR PERMISOS ---
app.get('/api/auth/verify', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({
    valid: true,
    user: req.user,
    message: 'Token válido'
  });
});

// --- RUTAS DE PAQUETES ---
// Crear paquete (Bodega o superior - para recepción en sucursal y bodega)
app.post('/api/packages', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), createPackage);

// Listar todos los paquetes (Staff o superior)
app.get('/api/packages', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getPackages);

// Estadísticas de paquetes (Staff o superior)
app.get('/api/packages/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getPackageStats);

// Buscar paquete por tracking (cualquier usuario autenticado)
app.get('/api/packages/track/:tracking', authenticateToken, getPackageByTracking);

// Paquetes de un cliente específico (Staff o superior)
app.get('/api/packages/client/:boxId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getPackagesByClient);

// --- RUTAS PARA SALIDA DE PAQUETES (PO BOX USA) ---
// IMPORTANTE: Estas rutas deben estar ANTES de /api/packages/:id
app.get('/api/packages/outbound-ready', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getOutboundReadyPackages);
app.post('/api/packages/create-outbound', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), createOutboundConsolidation);

// Obtener instrucciones de reempaque pendientes (Staff o superior)
app.get('/api/packages/repack-instructions', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getRepackInstructions);

// Bulk assign delivery with document uploads (client-facing)
app.post('/api/packages/assign-delivery', authenticateToken, uploadDeliveryDocs, bulkAssignDelivery);
app.get('/api/packages/saved-constancia', authenticateToken, getSavedConstancia);

// Obtener detalle de paquete por ID (usuario dueño o staff+)
app.get('/api/packages/:id', authenticateToken, getPackageById);

// Obtener etiquetas para imprimir (Bodega o superior)
app.get('/api/packages/:id/labels', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getPackageLabels);

// Actualizar estatus de paquete (Bodega o superior)
app.patch('/api/packages/:id/status', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updatePackageStatus);

// Actualizar cliente de un paquete (Bodega o superior)
app.patch('/api/packages/:id/client', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updatePackageClient);

// Solicitar reempaque/consolidación de paquetes (Usuario autenticado)
app.post('/api/packages/repack', authenticateToken, requestRepack);

// 🔍 Rastreo de paquete por tracking
app.get('/api/packages/track/:tracking', authenticateToken, async (req: Request, res: Response) => {
    try {
        const tracking = req.params.tracking as string;
        const userId = (req as any).user?.userId;
        
        if (!tracking || tracking.length < 3) {
            return res.status(400).json({ error: 'Tracking inválido' });
        }
        
        const searchTerm = tracking.toUpperCase();
        
        // Buscar en packages (PO Box USA)
        let result = await pool.query(`
            SELECT p.*, u.full_name, u.box_id
            FROM packages p
            JOIN users u ON p.user_id = u.id
            WHERE (UPPER(p.tracking_internal) = $1 OR UPPER(p.tracking_provider) = $1)
              AND p.user_id = $2
        `, [searchTerm, userId]);
        
        if (result.rows.length > 0) {
            const pkg = result.rows[0];
            return res.json({
                id: pkg.id,
                tracking_internal: pkg.tracking_internal,
                tracking_provider: pkg.tracking_provider,
                description: pkg.description || null,
                weight: pkg.weight ? parseFloat(pkg.weight) : null,
                dimensions: pkg.pkg_length && pkg.pkg_width && pkg.pkg_height 
                    ? `${pkg.pkg_length}×${pkg.pkg_width}×${pkg.pkg_height} cm` : null,
                status: pkg.status,
                carrier: pkg.carrier,
                received_at: pkg.received_at,
                delivered_at: pkg.delivered_at,
                created_at: pkg.created_at,
                shipment_type: 'air',
                received_by: pkg.received_by || null,
            });
        }
        
        // Buscar en maritime_orders
        result = await pool.query(`
            SELECT mo.* FROM maritime_orders mo
            WHERE (UPPER(mo.ordersn) = $1 OR UPPER(mo.bl_number) = $1 OR UPPER(mo.ship_number) = $1)
              AND mo.user_id = $2
        `, [searchTerm, userId]);
        
        if (result.rows.length > 0) {
            const pkg = result.rows[0];
            return res.json({
                id: pkg.id + 100000,
                tracking_internal: pkg.ordersn,
                tracking_provider: pkg.ship_number || pkg.bl_number,
                description: pkg.goods_name || 'Envío Marítimo',
                weight: pkg.weight ? parseFloat(pkg.weight) : null,
                volume: pkg.volume ? parseFloat(pkg.volume) : null,
                status: pkg.status,
                carrier: 'Marítimo China',
                received_at: pkg.status === 'received_china' ? pkg.created_at : null,
                delivered_at: pkg.status === 'delivered' ? pkg.updated_at : null,
                created_at: pkg.created_at,
                shipment_type: 'maritime',
                received_by: null,
            });
        }
        
        // Buscar en china_receipts (TDI Aéreo)
        result = await pool.query(`
            SELECT cr.*, u.full_name FROM china_receipts cr
            JOIN users u ON cr.user_id = u.id
            WHERE (UPPER(cr.ordersn) = $1 OR UPPER(cr.awb_number) = $1)
              AND cr.user_id = $2
        `, [searchTerm, userId]);
        
        if (result.rows.length > 0) {
            const pkg = result.rows[0];
            return res.json({
                id: pkg.id + 200000,
                tracking_internal: pkg.ordersn,
                tracking_provider: pkg.awb_number,
                description: pkg.goods_name || 'Envío Aéreo China',
                weight: pkg.weight ? parseFloat(pkg.weight) : null,
                status: pkg.status,
                carrier: 'TDI Aéreo China',
                received_at: pkg.created_at,
                delivered_at: pkg.status === 'delivered' ? pkg.updated_at : null,
                created_at: pkg.created_at,
                shipment_type: 'china_air',
                received_by: null,
            });
        }
        
        return res.status(404).json({ error: 'Paquete no encontrado' });
        
    } catch (error) {
        console.error('Error en rastreo:', error);
        return res.status(500).json({ error: 'Error al buscar paquete' });
    }
});

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

// --- RUTAS DE PAGOS NUEVAS - GATEWAY INTEGRATIONS ---
app.post('/api/payments/openpay/card', authenticateToken, processOpenPayCard);
app.post('/api/payments/paypal/create', authenticateToken, createPayPalPayment);
app.post('/api/payments/branch/reference', authenticateToken, createBranchPayment);

// --- CALLBACKS Y WEBHOOKS DE PAGOS (sin auth, son redirecciones de pasarelas) ---
app.get('/api/payments/openpay/callback', handleOpenpayPaymentCallback);
app.post('/api/payments/openpay/webhook', handleOpenpayPaymentWebhook);
app.get('/api/payments/paypal/callback', handlePayPalPaymentCallback);

// --- RUTA DE PRUEBA PARA CONFIRMAR PAGOS ---
app.post('/api/payments/test/confirm', authenticateToken, testConfirmPayment);

// --- RUTAS DE FACTURACIÓN ---
app.get('/api/fiscal/data', authenticateToken, getFiscalData);
app.put('/api/fiscal/data', authenticateToken, updateFiscalData);
app.get('/api/fiscal/invoices', authenticateToken, getFacturasUsuario);

// --- RUTAS DE PAGOS PO BOX (Múltiples métodos) - MULTISUCURSAL ---
app.post('/api/pobox/payment/create', authenticateToken, createPoboxPaypalPayment);      // PayPal
app.post('/api/pobox/payment/capture', authenticateToken, capturePoboxPaypalPayment);    // Captura PayPal
app.post('/api/pobox/payment/openpay/create', authenticateToken, createPoboxOpenpayPayment);  // OpenPay tarjeta
app.post('/api/pobox/payment/cash/create', authenticateToken, createPoboxCashPayment);   // Efectivo/Transferencia
app.get('/api/pobox/payment/status/:paymentId', authenticateToken, getPoboxPaymentStatus);
app.post('/api/pobox/payment/cash/confirm', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), confirmPoboxCashPayment); // Admin confirma pago efectivo
app.get('/api/pobox/payment/history', authenticateToken, getPoboxPaymentHistory); // Historial del cliente
app.get('/api/admin/pobox/payments/pending', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getPoboxPendingPayments); // Admin: Pagos pendientes
app.post('/webhooks/pobox/openpay', handlePoboxOpenpayWebhook); // Webhook OpenPay (sin auth)
app.get('/webhooks/pobox/openpay/callback', handlePoboxOpenpayCallback); // Callback después de pago (sin auth)

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

// --- RUTA DE BÚSQUEDA DE CÓDIGO POSTAL (SEPOMEX) ---
app.get('/api/zipcode/:cp', async (req: Request, res: Response) => {
    try {
        const cp = req.params.cp as string;
        if (!/^\d{5}$/.test(cp)) {
            res.status(400).json({ error: 'Código postal inválido (debe ser 5 dígitos)' });
            return;
        }

        // Opción 1: API pública de SEPOMEX México (sin token)
        try {
            const sepomexRes = await axios.get(
                `https://sepomex.icalialabs.com/api/v1/zip_codes?zip_code=${cp}`,
                { timeout: 5000 }
            );
            if (sepomexRes.data && sepomexRes.data.zip_codes && sepomexRes.data.zip_codes.length > 0) {
                const items = sepomexRes.data.zip_codes;
                const first = items[0];
                const colonies: string[] = items.map((item: any) => item.d_asenta).filter(Boolean);
                res.json({
                    city: first.d_mnpio || first.D_mnpio || '',
                    state: first.d_estado || first.D_estado || '',
                    colonies: [...new Set(colonies)].sort(),
                    country: 'México'
                });
                return;
            }
        } catch (sepomexErr: any) {
            console.log('SEPOMEX Icalia API no disponible:', sepomexErr?.message || '');
        }

        // Opción 2: zippopotam.us (confiable, gratuita)
        try {
            const zipRes = await axios.get(`https://api.zippopotam.us/MX/${cp}`, { timeout: 5000 });
            if (zipRes.data && zipRes.data.places && zipRes.data.places.length > 0) {
                const places = zipRes.data.places;
                const state = places[0]?.state || '';
                const colonies = places.map((p: any) => p['place name']).filter(Boolean);
                // zippopotam retorna colonias como place names
                res.json({
                    city: places[0]?.['place name'] || '',
                    state,
                    colonies: [...new Set(colonies)].sort(),
                    country: 'México'
                });
                return;
            }
        } catch (zipErr: any) {
            console.log('Zippopotam API no disponible:', zipErr?.message || '');
        }

        // Opción 3: API copomex (solo si se configura un token real en env)
        const copomexToken = process.env.COPOMEX_TOKEN;
        if (copomexToken) {
            try {
                const copomexRes = await axios.get(
                    `https://api.copomex.com/query/info_cp/${cp}?type=simplified&token=${copomexToken}`,
                    { timeout: 5000 }
                );
                if (copomexRes.data && !copomexRes.data.error && copomexRes.data.response) {
                    const data = copomexRes.data.response;
                    const items = Array.isArray(data) ? data : [data];
                    const first = items[0];
                    const colonies: string[] = items.map((item: any) => item.asentamiento).filter(Boolean);
                    res.json({
                        city: first.municipio || first.ciudad || '',
                        state: first.estado || '',
                        colonies: [...new Set(colonies)].sort(),
                        country: 'México'
                    });
                    return;
                }
            } catch (copomexErr) {
                console.log('Copomex API no disponible');
            }
        }

        res.status(404).json({ error: 'No se encontraron datos para este código postal' });
    } catch (error) {
        console.error('Error buscando código postal:', error);
        res.status(500).json({ error: 'Error al buscar código postal' });
    }
});

// --- RUTAS PARA APP MÓVIL: MIS MÉTODOS DE PAGO ---
app.get('/api/payment-methods', authenticateToken, getMyPaymentMethods);
app.post('/api/payment-methods', authenticateToken, createPaymentMethod);
app.delete('/api/payment-methods/:id', authenticateToken, deletePaymentMethod);
app.put('/api/payment-methods/:id/default', authenticateToken, setDefaultPaymentMethod);

// --- RUTA PARA OBTENER INSTRUCCIONES DEL CLIENTE POR BOX ID (para recepción inteligente) ---
// Nivel COUNTER_STAFF para que personal de mostrador pueda dar de alta paquetes
app.get('/api/client/instructions/:boxId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getClientInstructions);

// --- RUTAS DE COMISIONES Y REFERIDOS ---
// Validar código de referido (público, para registro)
app.get('/api/referral/validate/:code', validateReferralCode);

// Mi código de referido (usuario autenticado)
app.get('/api/referral/my-code', authenticateToken, getMyReferralCode);

// Admin: Configuración de tarifas de comisiones y tipos de servicio
app.get('/api/admin/commissions', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getCommissionRates);
app.put('/api/admin/commissions', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateCommissionRate);
app.post('/api/admin/service-types', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createServiceType);
app.delete('/api/admin/service-types/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteServiceType);

// Admin: Estadísticas de referidos
app.get('/api/admin/commissions/stats', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getCommissionStats);

// Admin: Gestión de comisiones generadas
app.get('/api/admin/commissions/ledger', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getAdvisorCommissionsList);
app.get('/api/admin/commissions/by-advisor', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getCommissionsByAdvisor);
app.post('/api/admin/commissions/pay', authenticateToken, requireMinLevel(ROLES.DIRECTOR), markCommissionsAsPaid);
app.post('/api/admin/commissions/backfill', authenticateToken, requireMinLevel(ROLES.DIRECTOR), runCommissionBackfill);

// Admin: Referidos de un asesor específico
app.get('/api/admin/referrals/:advisorId', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getReferralsByAdvisor);

// --- TIPOS DE SERVICIO (Logistics Services) ---
app.get('/api/admin/logistics-services', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getLogisticsServices);
app.put('/api/admin/logistics-services/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateLogisticsService);

// --- RUTAS DE ASESORES (Gestión de Jerarquía) ---
app.get('/api/admin/advisors', authenticateToken, requireMinLevel(ROLES.ADMIN), getAdvisors);
app.post('/api/admin/advisors', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createAdvisor);

// --- RUTAS DE VERIFICACIÓN (Usuario) ---
app.get('/api/verification/status', authenticateToken, getVerificationStatus);

// --- RUTAS DE VERIFICACIÓN ADMIN (Revisión Manual KYC) ---
app.get('/api/admin/verifications/pending', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getPendingVerifications);
app.get('/api/admin/verifications/stats', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getVerificationStats);
app.post('/api/admin/verifications/:userId/approve', authenticateToken, requireMinLevel(ROLES.DIRECTOR), approveVerification);
app.post('/api/admin/verifications/:userId/reject', authenticateToken, requireMinLevel(ROLES.DIRECTOR), rejectVerification);

// --- RUTAS DE FACTURACIÓN FISCAL ---
// Admin: Gestión de empresas emisoras
app.get('/api/admin/fiscal/emitters', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getFiscalEmitters);
app.post('/api/admin/fiscal/emitters', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createFiscalEmitter);
app.put('/api/admin/fiscal/emitters', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateFiscalEmitter);
app.post('/api/admin/fiscal/assign-service', authenticateToken, requireMinLevel(ROLES.DIRECTOR), assignEmitterToService);
app.get('/api/admin/invoices', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getAllInvoices);
app.post('/api/admin/invoices/cancel', authenticateToken, requireMinLevel(ROLES.DIRECTOR), cancelInvoice);

// Admin: Configuración de servicios por empresa (qué empresa cobra cada servicio)
app.get('/api/admin/fiscal/service-config', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getServiceCompanyConfig);
app.put('/api/admin/fiscal/service-config/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateServiceCompanyConfig);
app.get('/api/admin/fiscal/service-emitter/:service_type', authenticateToken, getEmitterByServiceType);

// ============================================
// OPENPAY MULTI-EMPRESA - COBRANZA SPEI AUTOMATIZADA
// ============================================
// Configuración por empresa
app.get('/api/admin/openpay/empresas', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getEmpresasOpenpay);
app.get('/api/admin/openpay/config/:empresa_id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getOpenpayConfig);
app.post('/api/admin/openpay/config', authenticateToken, requireMinLevel(ROLES.DIRECTOR), saveOpenpayConfig);

// Configuración bancaria por empresa
app.get('/api/admin/empresa/bank/:empresa_id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getBankConfig);
app.post('/api/admin/empresa/bank', authenticateToken, requireMinLevel(ROLES.DIRECTOR), saveBankConfig);

// Configuración PayPal por empresa
app.get('/api/admin/empresa/paypal/:empresa_id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getPaypalConfig);
app.post('/api/admin/empresa/paypal', authenticateToken, requireMinLevel(ROLES.DIRECTOR), savePaypalConfig);

// Configuración completa de empresa (todos los métodos de pago)
app.get('/api/admin/empresa/full-config/:empresa_id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getEmpresaFullConfig);

// Gestión de clientes y CLABEs
app.post('/api/admin/openpay/create-customer', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), createOpenpayCustomer);
app.post('/api/admin/openpay/generate-clabe-batch', authenticateToken, requireMinLevel(ROLES.DIRECTOR), generateClabeBatch);
app.get('/api/admin/openpay/user-clabe/:user_id', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getUserClabe);
// Reportes y dashboard
app.get('/api/admin/openpay/payments', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getOpenpayPaymentHistory);
app.get('/api/admin/openpay/dashboard', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getOpenpayDashboard);
app.get('/api/admin/openpay/applications/:log_id', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getPaymentApplications);
// Webhook (público, recibe notificaciones de Openpay por empresa)
app.post('/webhooks/openpay/:empresa_id', handleOpenpayWebhookMultiEmpresa);
// Cliente: obtener su CLABE para pagar
app.get('/api/my-clabe', authenticateToken, async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) return res.status(401).json({ error: 'No autorizado' });
  (req as any).params = { user_id: userId };
  return getUserClabe(req, res);
});

// Facturación por servicio
app.get('/api/admin/service-fiscal/all', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getAllServiceFiscalConfig);
app.get('/api/admin/service-fiscal/:serviceType', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getServiceFiscalConfig);
app.post('/api/admin/service-fiscal/assign', authenticateToken, requireMinLevel(ROLES.DIRECTOR), assignFiscalToService);
app.post('/api/admin/service-fiscal/remove', authenticateToken, requireMinLevel(ROLES.DIRECTOR), removeFiscalFromService);
app.post('/api/admin/service-fiscal/set-default', authenticateToken, requireMinLevel(ROLES.DIRECTOR), setDefaultFiscalForService);
app.get('/api/admin/service-invoices/:serviceType', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getServiceInvoices);
app.post('/api/admin/service-invoices', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), createServiceInvoice);
app.post('/api/admin/service-invoices/:id/stamp', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), stampServiceInvoice);
app.get('/api/admin/service-invoicing-summary', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getServiceInvoicingSummary);

// Direcciones de servicio (Admin)
app.get('/api/admin/service-instructions/all', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getAllServiceInstructions);
app.get('/api/admin/service-instructions/:serviceType', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getServiceInstructions);
app.put('/api/admin/service-instructions/:serviceType', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateServiceInstructions);
app.get('/api/admin/service-addresses/all', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getAllServiceAddresses);
app.get('/api/admin/service-addresses/:serviceType', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getServiceAddresses);
app.post('/api/admin/service-addresses', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createServiceAddress);
app.put('/api/admin/service-addresses/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateServiceAddress);
app.delete('/api/admin/service-addresses/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteServiceAddress);
app.post('/api/admin/service-addresses/:id/set-primary', authenticateToken, requireMinLevel(ROLES.DIRECTOR), setPrimaryAddress);

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
app.post('/api/admin/exchange-rate', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateExchangeRate);
app.get('/api/admin/exchange-rate/history', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getExchangeRateHistory);

// Proveedores de pago (Admin)
app.get('/api/admin/payment-providers', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getPaymentProviders);
app.post('/api/admin/payment-providers', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createPaymentProvider);
app.put('/api/admin/payment-providers', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updatePaymentProvider);

// Configuración por cliente (Admin)
app.get('/api/admin/client-settings/:userId', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getClientPaymentSettings);
app.post('/api/admin/client-settings', authenticateToken, requireMinLevel(ROLES.DIRECTOR), saveClientPaymentSettings);

// Solicitudes de pago (Admin)
app.get('/api/admin/supplier-payments', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getAllSupplierPayments);
app.put('/api/admin/supplier-payments/status', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateSupplierPaymentStatus);
app.get('/api/admin/supplier-payments/stats', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getSupplierPaymentStats);

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
app.get('/api/admin/price-lists', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getPriceLists);
app.post('/api/admin/price-lists', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createPriceList);
app.delete('/api/admin/price-lists/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deletePriceList);

// Admin: Reglas de precio
app.get('/api/admin/pricing-rules/:priceListId', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getPricingRules);
app.post('/api/admin/pricing-rules', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createPricingRule);
app.put('/api/admin/pricing-rules/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updatePricingRule);
app.delete('/api/admin/pricing-rules/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deletePricingRule);

// Admin: Servicios logísticos
app.post('/api/admin/logistics-services', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createLogisticsService);
app.put('/api/admin/logistics-services/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateLogisticsService);

// Admin: Asignar lista de precios a cliente
app.put('/api/admin/users/:userId/price-list', authenticateToken, requireMinLevel(ROLES.DIRECTOR), assignPriceListToUser);

// ========== MOTOR DE TARIFAS MARÍTIMO ==========

// Categorías de carga
app.get('/api/admin/pricing-categories', authenticateToken, requireMinLevel(ROLES.ADMIN), getPricingCategories);
app.post('/api/admin/pricing-categories', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createPricingCategory);
app.put('/api/admin/pricing-categories/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updatePricingCategory);

// Tarifas por rango/CBM
app.get('/api/admin/pricing-tiers', authenticateToken, requireMinLevel(ROLES.ADMIN), getPricingTiers);
app.post('/api/admin/pricing-tiers', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createPricingTier);
app.put('/api/admin/pricing-tiers', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updatePricingTiers);
app.delete('/api/admin/pricing-tiers/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deletePricingTier);

// Toggle VIP pricing para clientes
app.put('/api/admin/users/:id/vip-pricing', authenticateToken, requireMinLevel(ROLES.ADMIN), toggleUserVipPricing);

// Calculadora de costos marítimos (puede ser pública o autenticada)
app.post('/api/maritime/calculate', calculateMaritimeCost);

// ========== TARIFAS DE FLETE NACIONAL (TERRESTRE) ==========
app.get('/api/admin/national-freight-rates', authenticateToken, requireMinLevel(ROLES.ADMIN), getAllNationalRates);
app.post('/api/admin/national-freight-rates', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createNationalRate);
app.put('/api/admin/national-freight-rates/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), updateNationalRate);
app.delete('/api/admin/national-freight-rates/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteNationalRate);
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
app.post('/api/admin/last-mile/quote-direct', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), quoteShipmentDirect);
app.post('/api/admin/last-mile/dispatch', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), dispatchShipment);
app.get('/api/admin/last-mile/reprint/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), reprintLabel);

// ========== API PAQUETE EXPRESS ==========
app.get('/api/admin/paquete-express/config', authenticateToken, requireMinLevel(ROLES.ADMIN), pqtxGetConfig);
app.post('/api/admin/paquete-express/login', authenticateToken, requireMinLevel(ROLES.ADMIN), pqtxLogin);
app.post('/api/admin/paquete-express/quote', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), pqtxQuote);
app.post('/api/admin/paquete-express/shipment', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), pqtxCreateShipment);
app.post('/api/admin/paquete-express/pickup', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), pqtxSchedulePickup);
app.post('/api/admin/paquete-express/cancel', authenticateToken, requireMinLevel(ROLES.ADMIN), pqtxCancel);
app.get('/api/admin/paquete-express/track/:trackingNumber', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), pqtxTrack);
app.get('/api/admin/paquete-express/label/pdf/:trackingNumber', pqtxLabelPdf); // Sin auth: se abre en nueva pestaña del navegador
app.get('/api/admin/paquete-express/label/zpl/:trackingNumber', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), pqtxLabelZpl);
app.get('/api/admin/paquete-express/shipments', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), pqtxListShipments);

// ========== OPCIONES DE PAQUETERÍA POR SERVICIO ==========
app.get('/api/admin/carrier-options', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getCarrierOptions);
app.post('/api/admin/carrier-options/upload-icon', authenticateToken, requireMinLevel(ROLES.ADMIN), carrierIconUpload.single('icon'), uploadCarrierIcon);
app.post('/api/admin/carrier-options', authenticateToken, requireMinLevel(ROLES.ADMIN), createCarrierOption);
app.put('/api/admin/carrier-options/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), updateCarrierOption);
app.delete('/api/admin/carrier-options/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), deleteCarrierOption);
app.patch('/api/admin/carrier-options/:id/toggle', authenticateToken, requireMinLevel(ROLES.ADMIN), toggleCarrierOption);
// Endpoint público (para clientes) - opciones por tipo de servicio
app.get('/api/carrier-options/by-service/:serviceType', authenticateToken, getCarrierOptionsByService);

// Endpoint público para cotizar paquetería (app móvil)
// Devuelve opciones locales + Skydropx (si está habilitado)
app.post('/api/shipping/quote', authenticateToken, quoteShipping);
// Cotización Paquete Express con regla de utilidad (para app móvil)
app.post('/api/shipping/pqtx-quote', authenticateToken, pqtxClientQuote);

// ========== PANEL DE BODEGA MULTI-SUCURSAL ==========
// Info del empleado y su sucursal
app.get('/api/warehouse/branch-info', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), getWorkerBranchInfo);
// Escáner inteligente
app.post('/api/warehouse/scan', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), processWarehouseScan);
// Historial y estadísticas
app.get('/api/warehouse/scan-history', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), getScanHistory);
app.get('/api/warehouse/daily-stats', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), getDailyStats);
// Sucursales (público para empleados)
app.get('/api/warehouse/branches', authenticateToken, getBranches);
// Validación de supervisor (para DHL)
app.post('/api/warehouse/validate-supervisor', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), validateSupervisor);
// Actualizar PIN de supervisor (gerentes/admins)
app.post('/api/warehouse/update-supervisor-pin', authenticateToken, updateSupervisorPin);
// Historial de autorizaciones
app.get('/api/warehouse/supervisor-authorizations', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getSupervisorAuthorizations);
// Recepción rápida DHL
app.post('/api/warehouse/dhl-reception', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), processDhlReception);
// Inventario de sucursal
app.get('/api/warehouse/inventory', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getBranchInventory);

// ========== GESTIÓN DE SUCURSALES (ADMIN) ==========
// GET /api/admin/users - Obtener usuarios con información de sucursal
app.get('/api/admin/users', authenticateToken, requireMinLevel(ROLES.ADMIN), async (req: AuthRequest, res: Response) => {
  try {
    const includeBranch = req.query.include_branch === 'true';
    
    let query = `
      SELECT u.id, u.full_name, u.email, u.role, u.branch_id
      ${includeBranch ? ', b.name as branch_name' : ''}
      FROM users u
      ${includeBranch ? 'LEFT JOIN branches b ON u.branch_id = b.id' : ''}
      WHERE u.role IN ('warehouse_ops', 'counter_staff', 'repartidor', 'customer_service', 'branch_manager')
      ORDER BY u.full_name
    `;
    
    const result = await pool.query(query);
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// GET /api/admin/users/search - Buscar usuarios/clientes por Box ID, nombre o email
app.get('/api/admin/users/search', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string' || q.trim().length < 1) {
      res.status(400).json({ error: 'Término de búsqueda requerido' });
      return;
    }
    
    const searchTerm = q.trim();
    
    // Buscar por box_id exacto, o por nombre/email parcial
    const result = await pool.query(`
      SELECT id, full_name, email, box_id, phone, role
      FROM users 
      WHERE role = 'client'
        AND (
          UPPER(box_id) = UPPER($1)
          OR UPPER(full_name) LIKE UPPER($2)
          OR UPPER(email) LIKE UPPER($2)
          OR phone LIKE $3
          OR id::text = $1
        )
      ORDER BY 
        CASE WHEN UPPER(box_id) = UPPER($1) THEN 0 ELSE 1 END,
        full_name
      LIMIT 10
    `, [searchTerm, `%${searchTerm}%`, `%${searchTerm}%`]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error buscando usuarios:', error);
    res.status(500).json({ error: 'Error al buscar usuarios' });
  }
});

// CRUD completo de sucursales
app.get('/api/admin/branches', authenticateToken, requireMinLevel(ROLES.ADMIN), getAllBranches);
app.post('/api/admin/branches', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createBranch);
app.put('/api/admin/branches/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateBranch);
app.delete('/api/admin/branches/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteBranch);
// Asignación de empleados
app.post('/api/admin/assign-branch', authenticateToken, requireMinLevel(ROLES.ADMIN), assignWorkerToBranch);
// Geocerca de sucursales
app.post('/api/attendance/validate-geofence', authenticateToken, validateGeofence);
app.get('/api/branches/:id/geofence', authenticateToken, requireMinLevel(ROLES.ADMIN), getBranchGeofence);

// ========== DHL MONTERREY (AA DHL) ==========
// Tarifas de venta (precio al cliente)
app.get('/api/admin/dhl/rates', authenticateToken, requireMinLevel(ROLES.ADMIN), getDhlRates);
app.put('/api/admin/dhl/rates/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateDhlRate);
// Tarifas de costo (lo que nos cuesta a nosotros)
app.get('/api/admin/dhl/cost-rates', authenticateToken, requireMinLevel(ROLES.ADMIN), getDhlCostRates);
app.put('/api/admin/dhl/cost-rates/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateDhlCostRate);
// Costeo de envíos (lista de cajas con costos)
app.get('/api/admin/dhl/costing', authenticateToken, requireMinLevel(ROLES.ADMIN), getDhlCosting);
app.post('/api/admin/dhl/costing/assign', authenticateToken, requireMinLevel(ROLES.ADMIN), assignDhlCost);
app.post('/api/admin/dhl/costing/auto-assign', authenticateToken, requireMinLevel(ROLES.ADMIN), autoAssignDhlCosts);
app.post('/api/admin/dhl/costing/mark-paid', authenticateToken, requireMinLevel(ROLES.DIRECTOR), markDhlCostPaid);
app.get('/api/admin/dhl/costing/payment-batches', authenticateToken, requireMinLevel(ROLES.ADMIN), getDhlPaymentBatches);
app.get('/api/admin/dhl/costing/profitability', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getDhlProfitability);
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

// Configuración de ubicaciones (Admin/Director)
app.get('/api/admin/warehouse-locations', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getWarehouseLocations);
app.put('/api/admin/users/:id/warehouse-location', authenticateToken, requireMinLevel(ROLES.DIRECTOR), assignWarehouseLocation);

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

// Callback de MoJie con datos encriptados DES (público para webhook)
app.post('/api/china/callback', mojieCallbackEncrypted);

// Panel administrativo de recepciones China
app.get('/api/china/receipts', authenticateToken, getChinaReceipts);
app.post('/api/china/receipts', authenticateToken, createChinaReceipt); // Captura manual
app.get('/api/china/receipts/:id', authenticateToken, getChinaReceiptDetail);
app.put('/api/china/receipts/:id/status', authenticateToken, updateChinaReceiptStatus);
app.post('/api/china/receipts/:id/assign', authenticateToken, assignClientToReceipt);
app.get('/api/china/stats', authenticateToken, getChinaStats);
app.get('/api/china/air-guides', authenticateToken, getAirDaughterGuides);
app.get('/api/china/air-guides/stats', authenticateToken, getAirDaughterStats);
app.get('/api/china/callback-logs', authenticateToken, getCallbackLogs); // Logs de diagnóstico

// Pull desde MJCustomer API (consultar en lugar de recibir webhook)
app.post('/api/china/mjcustomer/login', authenticateToken, loginMJCustomerEndpoint);
app.get('/api/china/pull/:orderCode', authenticateToken, pullFromMJCustomer);
app.post('/api/china/pull-batch', authenticateToken, pullBatchFromMJCustomer);
app.put('/api/china/config/token', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateMJCustomerToken);

// Rastreo de FNO y trayectoria (consulta sin guardar)
app.get('/api/china/track/:fno', authenticateToken, trackFNO);
app.get('/api/china/trajectory/:childNo', authenticateToken, getTrajectory);

// ========== GARANTÍA EXTENDIDA (GEX) ==========

// Tipo de cambio
app.get('/api/gex/exchange-rate', authenticateToken, getExchangeRate);
app.post('/api/gex/exchange-rate', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateGexExchangeRate);

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

// ========== PANEL DEL ASESOR (self-service) ==========
app.get('/api/advisor/dashboard', authenticateToken, getAdvisorDashboard);
app.get('/api/advisor/clients', authenticateToken, getAdvisorClients);
app.get('/api/advisor/clients/:clientId/wallet', authenticateToken, getClientWallet);
app.post('/api/advisor/clients/:clientId/notes', authenticateToken, saveAdvisorNote);
app.get('/api/advisor/shipments', authenticateToken, getAdvisorShipments);
app.get('/api/advisor/shipments/:id/children', authenticateToken, getRepackChildren);
app.get('/api/advisor/commissions', authenticateToken, getAdvisorCommissions);
app.get('/api/advisor/team', authenticateToken, getAdvisorTeam);
app.get('/api/advisor/client-tickets', authenticateToken, getAdvisorClientTickets);
app.get('/api/advisor/client-tickets/:ticketId', authenticateToken, getAdvisorTicketDetail);
app.get('/api/advisor/notifications', authenticateToken, getAdvisorNotifications);
app.get('/api/advisor/notifications/unread-count', authenticateToken, getAdvisorUnreadCount);

// ========== CRM - SOLICITUDES DE ASESOR ==========

// App: Buscar asesor por código (pre-validación)
app.get('/api/advisor/lookup/:code', authenticateToken, lookupAdvisor);

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
app.post('/api/admin/crm/promotions', authenticateToken, requireMinLevel(ROLES.DIRECTOR), saveRecoveryPromotion);
app.post('/api/admin/crm/recovery/action', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), executeRecoveryAction);
app.get('/api/admin/crm/recovery/history/:userId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getRecoveryHistory);
app.post('/api/admin/crm/recovery/detect', authenticateToken, requireMinLevel(ROLES.DIRECTOR), detectAtRiskClients);

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

// Cliente: Validar que una guía pertenezca al cliente
app.get('/api/support/validate-tracking', authenticateToken, validateTracking);

// Cliente: Enviar mensaje al chat de soporte (con soporte para imágenes)
app.post('/api/support/message', authenticateToken, uploadSupportImages, handleSupportMessage);

// Cliente: Ver mis tickets
app.get('/api/support/tickets', authenticateToken, getMyTickets);

// Cliente: Ver mensajes de un ticket
app.get('/api/support/ticket/:id/messages', authenticateToken, getTicketMessages);

// Cliente: Responder a su ticket
app.post('/api/support/ticket/:id/message', authenticateToken, clientReplyTicket);

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
app.post('/api/admin/notifications/broadcast', authenticateToken, requireMinLevel(ROLES.DIRECTOR), sendBroadcastNotification);

// ========== COSTEO TDI AÉREO (MASTER AIR WAYBILLS) ==========

// Admin: Estadísticas de guías aéreas (incluye china_receipts)
app.get('/api/master-cost/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMasterAwbStats);

// Admin: Listar guías de china_receipts (TDI Aéreo China)
app.get('/api/master-cost/china-receipts', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getChinaReceiptsList);

// Admin: Obtener paquetes de un china_receipt específico
app.get('/api/master-cost/china-receipts/:id/packages', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getChinaReceiptPackages);

// Admin: Reporte de utilidad
app.get('/api/master-cost/profit-report', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getProfitReport);

// Admin: Listar todas las guías master
app.get('/api/master-cost', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), listMasterAwbs);

// Admin: Buscar/Crear guía específica
app.get('/api/master-cost/:awb', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMasterAwbData);

// Admin: Guardar y calcular costos
app.post('/api/master-cost', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), saveMasterCost);

// Admin: Eliminar guía
app.delete('/api/master-cost/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteMasterAwb);

// ========== MÓDULO MARÍTIMO (Contenedores y Costeo) ==========

// Estadísticas marítimas
app.get('/api/maritime/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMaritimeStats);

// Contenedores
app.get('/api/maritime/containers', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getContainers);

// Rutas específicas ANTES de :id para evitar conflictos
// Upload de PDFs para costos
const costUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max
app.post('/api/maritime/containers/upload-cost-pdf', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), costUpload.single('file'), uploadCostPdf);

// Descarga de PDFs (proxy para S3)
app.get('/api/maritime/containers/download-pdf', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), downloadPdf);

// Extracción de datos de Nota de Débito con IA
app.post('/api/maritime/containers/extract-debit-note', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), costUpload.single('file'), extractDebitNoteFromPdf);

// Rutas con parámetros
app.get('/api/maritime/containers/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getContainerDetail);
app.post('/api/maritime/containers', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createContainer);
app.put('/api/maritime/containers/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateContainer);
app.put('/api/maritime/containers/:id/status', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateContainerStatus);
app.delete('/api/maritime/containers/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteContainer);

// Costos de contenedor
app.get('/api/maritime/containers/:containerId/costs', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getContainerCosts);
app.put('/api/maritime/containers/:containerId/costs', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateContainerCosts);

// Envíos marítimos (Recepciones)
app.get('/api/maritime/shipments', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getMaritimeShipments);
app.post('/api/maritime/shipments', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), createMaritimeShipment);
app.put('/api/maritime/shipments/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updateMaritimeShipment);
app.post('/api/maritime/shipments/assign-container', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), assignShipmentToContainer);
app.post('/api/maritime/shipments/:id/assign-client', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), assignClientToShipment);
app.put('/api/maritime/shipments/:id/receive-cedis', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), receiveAtCedis);
app.delete('/api/maritime/shipments/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteMaritimeShipment);

// Tarifas Marítimas (Costo por CBM)
app.get('/api/maritime/rates', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMaritimeRates);
app.get('/api/maritime/rates/active', authenticateToken, getActiveMaritimeRate);
app.post('/api/maritime/rates', authenticateToken, requireMinLevel(ROLES.ADMIN), createMaritimeRate);
app.put('/api/maritime/rates/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), updateMaritimeRate);
app.delete('/api/maritime/rates/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteMaritimeRate);
app.post('/api/maritime/calculate-cost', authenticateToken, calculateShipmentCost);

// Utilidades por Contenedor
app.get('/api/maritime/containers/:containerId/profit', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getContainerProfitBreakdown);

// ========== GESTIÓN FCL - CONTENEDORES DEDICADOS ==========
// Listar contenedores FCL con filtros
app.get('/api/maritime/fcl/containers', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: AuthRequest, res: Response) => {
    try {
        const { status, search } = req.query;
        
        // FCL/Dedicados = contenedores con legacy_client_id asignado (dedicados a un cliente)
        // sale_price se guarda al momento de crear/asignar el contenedor (precio congelado)
        let query = `
            SELECT c.*, 
                mr.code as route_code,
                mr.name as route_name,
                lc.box_id as client_box_id,
                lc.full_name as client_name,
                COALESCE(
                    (SELECT SUM(amount) FROM container_extra_costs ec WHERE ec.container_id = c.id),
                    0
                ) as total_extra_costs
            FROM containers c
            LEFT JOIN maritime_routes mr ON mr.id = c.route_id
            LEFT JOIN legacy_clients lc ON lc.id = c.legacy_client_id
            WHERE c.legacy_client_id IS NOT NULL
        `;
        const params: any[] = [];
        let paramIndex = 1;

        if (status && status !== 'all') {
            query += ` AND c.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (search) {
            query += ` AND (c.container_number ILIKE $${paramIndex} OR c.bl_number ILIKE $${paramIndex} OR c.reference_code ILIKE $${paramIndex} OR lc.full_name ILIKE $${paramIndex} OR lc.box_id ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += ' ORDER BY c.created_at DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching FCL containers:', error);
        res.status(500).json({ error: 'Error al obtener contenedores FCL' });
    }
});

// Stats FCL - Contenedores dedicados (con legacy_client_id)
app.get('/api/maritime/fcl/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (_req: AuthRequest, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE legacy_client_id IS NOT NULL) as total_fcl,
                COUNT(*) FILTER (WHERE legacy_client_id IS NOT NULL AND status = 'in_transit') as en_transito,
                COUNT(*) FILTER (WHERE legacy_client_id IS NOT NULL AND status = 'in_warehouse') as en_bodega,
                COUNT(*) FILTER (WHERE legacy_client_id IS NOT NULL AND status = 'delivered') as entregados,
                COALESCE(
                    (SELECT SUM(ec.amount) 
                     FROM container_extra_costs ec 
                     JOIN containers c ON c.id = ec.container_id 
                     WHERE c.legacy_client_id IS NOT NULL),
                    0
                ) as total_extra_costs
            FROM containers
        `);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching FCL stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas FCL' });
    }
});

// Obtener gastos extras de un contenedor
app.get('/api/maritime/fcl/containers/:containerId/extra-costs', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: AuthRequest, res: Response) => {
    try {
        const { containerId } = req.params;
        
        const costsResult = await pool.query(`
            SELECT ec.*, u.full_name as created_by_name
            FROM container_extra_costs ec
            LEFT JOIN users u ON u.id = ec.created_by
            WHERE ec.container_id = $1
            ORDER BY ec.created_at DESC
        `, [containerId]);

        const totalResult = await pool.query(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM container_extra_costs
            WHERE container_id = $1
        `, [containerId]);

        res.json({
            costs: costsResult.rows,
            total: totalResult.rows[0].total
        });
    } catch (error) {
        console.error('Error fetching extra costs:', error);
        res.status(500).json({ error: 'Error al obtener gastos extras' });
    }
});

// Agregar gasto extra a un contenedor
app.post('/api/maritime/fcl/containers/:containerId/extra-costs', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: AuthRequest, res: Response) => {
    try {
        const { containerId } = req.params;
        const { concept, amount, currency, notes } = req.body;
        const userId = req.user?.userId;

        if (!concept || !amount) {
            res.status(400).json({ error: 'Concepto y monto son requeridos' });
            return;
        }

        const result = await pool.query(`
            INSERT INTO container_extra_costs (container_id, concept, amount, currency, notes, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [containerId, concept, amount, currency || 'MXN', notes, userId]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error adding extra cost:', error);
        res.status(500).json({ error: 'Error al agregar gasto extra' });
    }
});

// Eliminar gasto extra
app.delete('/api/maritime/fcl/containers/:containerId/extra-costs/:costId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: AuthRequest, res: Response) => {
    try {
        const { containerId, costId } = req.params;

        await pool.query(`
            DELETE FROM container_extra_costs 
            WHERE id = $1 AND container_id = $2
        `, [costId, containerId]);

        res.json({ message: 'Gasto eliminado correctamente' });
    } catch (error) {
        console.error('Error deleting extra cost:', error);
        res.status(500).json({ error: 'Error al eliminar gasto extra' });
    }
});

// ========== MÓDULO DE ANTICIPOS A PROVEEDORES ==========
// Upload para comprobantes de anticipos
const anticipoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Proveedores
app.get('/api/anticipos/proveedores', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getProveedoresAnticipos);
app.get('/api/anticipos/proveedores/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getProveedorById);
app.post('/api/anticipos/proveedores', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createProveedor);
app.put('/api/anticipos/proveedores/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateProveedor);

// Bolsas de Anticipos (Depósitos)
app.get('/api/anticipos/bolsas', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getBolsasAnticipos);
app.get('/api/anticipos/bolsas/disponibles', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getBolsasDisponibles);
app.post('/api/anticipos/bolsas', authenticateToken, requireMinLevel(ROLES.DIRECTOR), anticipoUpload.single('comprobante'), createBolsaAnticipo);
app.put('/api/anticipos/bolsas/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateBolsaAnticipo);
app.delete('/api/anticipos/bolsas/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteBolsaAnticipo);
app.get('/api/anticipos/bolsas/:bolsaId/asignaciones', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAsignacionesByBolsa);
app.get('/api/anticipos/bolsas/:bolsaId/referencias', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getReferenciasByBolsa);

// Referencias de Anticipos (nuevo sistema)
app.get('/api/anticipos/referencias/disponibles', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getReferenciasDisponibles);
app.get('/api/anticipos/referencias/validas', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getReferenciasValidas);
app.post('/api/anticipos/referencias/validar', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), validarReferenciasExisten);
app.post('/api/anticipos/referencias/asignar', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), asignarReferenciaAContainer);

// Anticipos por contenedor
app.get('/api/anticipos/container/:containerId/anticipos', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAnticiposByContainer);

// Asignaciones de Anticipos
app.get('/api/anticipos/container/:containerId/asignaciones', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAsignacionesByContainer);
app.post('/api/anticipos/asignar', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), asignarAnticipo);
app.delete('/api/anticipos/asignaciones/:id/revertir', authenticateToken, requireMinLevel(ROLES.DIRECTOR), revertirAsignacion);

// Estadísticas de Anticipos
app.get('/api/anticipos/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAnticiposStats);

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

// Asignación masiva de precios a órdenes en contenedores
app.post('/api/maritime-api/pricing/bulk-assign', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), bulkAssignPricing);

// Monitoreo y estadísticas
app.get('/api/maritime-api/sync/logs', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getSyncLogs);
app.get('/api/maritime-api/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMaritimeApiStats);

// Rutas marítimas (lectura: todos los autenticados, escritura: counter_staff+)
app.get('/api/maritime-api/routes', authenticateToken, getMaritimeRoutes);
app.post('/api/maritime-api/routes', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createMaritimeRoute);
app.put('/api/maritime-api/routes/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateMaritimeRoute);
app.delete('/api/maritime-api/routes/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), deleteMaritimeRoute);

// ========== TARIFAS FCL POR CLIENTE/RUTA ==========
app.get('/api/admin/fcl-rates/base-price', authenticateToken, getFclBasePrice);
app.get('/api/admin/fcl-rates/clients', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getFclClientRates);
app.post('/api/admin/fcl-rates/client', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), upsertFclClientRate);
app.delete('/api/admin/fcl-rates/client/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), deleteFclClientRate);
app.get('/api/admin/fcl-rates/calculate/:clientId', authenticateToken, calculateEffectiveFclPrice);

// ========== INSTRUCCIONES DE ENTREGA - CLIENTE MÓVIL ==========
// Endpoints para que los clientes puedan asignar dirección de entrega a sus LOGs marítimos
app.put('/api/maritime-api/orders/:id/delivery-instructions', authenticateToken, updateDeliveryInstructions);
app.get('/api/maritime-api/my-orders/:id', authenticateToken, getMyMaritimeOrderDetail);

// Endpoint GENÉRICO para instrucciones de entrega (USA, Marítimo, China Air, DHL)
app.put('/api/packages/:packageType/:packageId/delivery-instructions', authenticateToken, assignDeliveryInstructions);

// ========== MÓDULO DE INVENTARIO POR SERVICIO ==========

// Items de inventario
app.get('/api/inventory/:serviceType/items', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getInventoryItems);
app.post('/api/inventory/:serviceType/items', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createInventoryItem);
app.put('/api/inventory/:serviceType/items/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateInventoryItem);
app.delete('/api/inventory/:serviceType/items/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteInventoryItem);

// Movimientos de inventario
app.post('/api/inventory/:serviceType/movement', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), registerInventoryMovement);
app.get('/api/inventory/:serviceType/movements', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getInventoryMovements);
app.post('/api/inventory/:serviceType/bulk-movement', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), bulkInventoryMovement);

// Estadísticas y alertas
app.get('/api/inventory/:serviceType/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getInventoryStats);
app.get('/api/inventory/:serviceType/alerts', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getInventoryAlerts);
app.get('/api/inventory/:serviceType/categories', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getInventoryCategories);

// ============================================================
// PROVEEDORES (CRUD)
// ============================================================
app.get('/api/suppliers', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getSuppliers);
app.get('/api/suppliers/consolidaciones-pendientes', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getConsolidacionesPendientes);
app.get('/api/suppliers/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getSupplierById);
app.get('/api/suppliers/:id/consolidations', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getSupplierConsolidations);
app.post('/api/suppliers', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createSupplier);
app.put('/api/suppliers/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateSupplier);
app.put('/api/suppliers/consolidations/:consolidationId/status', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateConsolidationStatus);
app.delete('/api/suppliers/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteSupplier);

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
app.post('/api/admin/facebook/simulate', authenticateToken, requireMinLevel(ROLES.DIRECTOR), simulateMessage);

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
  bulkAssignPermissions,
  getAllPanels,
  getUserPanelPermissions,
  updateUserPanelPermissions,
  getMyPanelPermissions,
  listUsersWithPanelPermissions,
  getPanelModules,
  getUserModulePermissions,
  updateUserModulePermissions,
  getMyModulePermissions
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

// Mailgun correos aéreos
app.post('/api/webhooks/email/air-inbound', handleInboundAirEmail);

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
app.post('/api/admin/credit/update', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateCreditLine);

// Admin: Ver todos los usuarios con crédito
app.get('/api/admin/credit/users', authenticateToken, requireMinLevel(ROLES.ADMIN), getCreditUsers);

// Admin: Resumen financiero general
app.get('/api/admin/finance/summary', authenticateToken, requireMinLevel(ROLES.ADMIN), getFinancialSummary);

// Admin: Panel de Riesgo y Crédito B2B - Todos los clientes
app.get('/api/admin/finance/clients', authenticateToken, requireMinLevel(ROLES.ADMIN), getClientsFinancialStatus);

// Admin: Actualizar línea de crédito de un cliente específico
app.put('/api/admin/finance/clients/:clientId/credit', authenticateToken, requireMinLevel(ROLES.ADMIN), updateClientCredit);

// ========== BILLETERA DIGITAL Y SISTEMA DE REFERIDOS ==========

// Billetera: Obtener saldo (disponible y pendiente)
app.get('/api/billetera/saldo', authenticateToken, getWalletBalance);

// Billetera: Obtener resumen con últimas transacciones
app.get('/api/billetera/resumen', authenticateToken, getWalletSummary);

// Billetera: Obtener historial de transacciones
app.get('/api/billetera/transacciones', authenticateToken, getWalletTransactions);

// Billetera: Aplicar saldo a un pago
app.post('/api/billetera/aplicar', authenticateToken, applyToPayment);

// Referidos: Obtener mi código de referido
app.get('/api/referidos/mi-codigo', authenticateToken, getReferralCode);

// Referidos: Validar un código (público para registro)
app.get('/api/referidos/validar/:code', validateReferralCodeNew);

// Referidos: Registrar código de referido (después del registro)
app.post('/api/referidos/registrar', authenticateToken, registerReferral);

// Referidos: Obtener mis referidos
app.get('/api/referidos/mis-referidos', authenticateToken, getMyReferrals);

// Referidos: Obtener mi referidor
app.get('/api/referidos/mi-referidor', authenticateToken, getMyReferrer);

// Referidos: Configuración pública del programa
app.get('/api/referidos/configuracion', getReferralSettings);

// Admin: Depositar saldo manualmente
app.post('/api/admin/billetera/depositar', authenticateToken, requireMinLevel(ROLES.ADMIN), adminDeposit);

// Admin: Retirar saldo manualmente
app.post('/api/admin/billetera/retirar', authenticateToken, requireMinLevel(ROLES.ADMIN), adminWithdraw);

// Admin: Top referidores
app.get('/api/admin/referidos/top', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getTopReferrers);

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
      GROUP BY sc.id, sc.service, sc.company_name
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

// ============================================
// DASHBOARD DE COBRANZA Y FLUJO DE EFECTIVO - MULTI-EMPRESA
// Unifica ingresos de Caja Chica + SPEI (Openpay) por empresa
// ============================================
app.get('/api/admin/finance/dashboard', authenticateToken, requireMinLevel(ROLES.ADMIN), async (req: Request, res: Response): Promise<any> => {
  try {
    const { date_from, date_to, empresa_id, service_type } = req.query;
    
    // Fechas por defecto: hoy y mes actual
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startDate = date_from ? new Date(date_from as string) : startOfMonth;
    const endDate = date_to ? new Date(date_to as string) : today;
    
    // Filtro por tipo de servicio (opcional)
    const serviceFilter = service_type ? service_type as string : null;

    // ============================================
    // EMPRESAS CON OPENPAY CONFIGURADO
    // ============================================
    const empresasRes = await pool.query(`
      SELECT 
        fe.id,
        fe.alias,
        fe.rfc,
        fe.openpay_merchant_id,
        fe.openpay_production_mode,
        COALESCE(scc.service_type, 'general') as servicio_asignado,
        scc.service_name
      FROM fiscal_emitters fe
      LEFT JOIN service_company_config scc ON scc.emitter_id = fe.id
      WHERE fe.is_active = TRUE AND fe.openpay_configured = TRUE
      ORDER BY fe.alias
    `);

    // ============================================
    // KPIs PRINCIPALES - CONSOLIDADOS Y POR EMPRESA
    // ============================================

    // 1. Ingresos totales del día (Efectivo + SPEI) - CONSOLIDADO
    const ingresosHoyRes = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as efectivo_hoy
      FROM caja_chica_transacciones
      WHERE DATE(created_at) = CURRENT_DATE
        ${serviceFilter ? "AND service_type = $1" : ""}
    `, serviceFilter ? [serviceFilter] : []);
    
    // SPEI por empresa
    const speiPorEmpresaRes = await pool.query(`
      SELECT 
        empresa_id,
        COALESCE(SUM(monto_recibido), 0) as spei_bruto,
        COALESCE(SUM(monto_neto), 0) as spei_neto
      FROM openpay_webhook_logs
      WHERE DATE(fecha_pago) = CURRENT_DATE
        AND estatus_procesamiento = 'procesado'
        AND (tipo_pago = 'spei' OR tipo_pago IS NULL)
        ${serviceFilter ? "AND service_type = $1" : ""}
      GROUP BY empresa_id
    `, serviceFilter ? [serviceFilter] : []);

    // PayPal del día
    const paypalHoyRes = await pool.query(`
      SELECT 
        COALESCE(SUM(monto_recibido), 0) as paypal_bruto,
        COALESCE(SUM(monto_neto), 0) as paypal_neto
      FROM openpay_webhook_logs
      WHERE DATE(fecha_pago) = CURRENT_DATE
        AND estatus_procesamiento = 'procesado'
        AND tipo_pago = 'paypal'
        ${serviceFilter ? "AND service_type = $1" : ""}
    `, serviceFilter ? [serviceFilter] : []);

    // 2. Ingresos del mes actual - SPEI por empresa (solo SPEI)
    const speiMesPorEmpresaRes = await pool.query(`
      SELECT 
        owl.empresa_id,
        fe.alias as empresa_nombre,
        fe.rfc,
        COALESCE(SUM(owl.monto_recibido), 0) as spei_bruto,
        COALESCE(SUM(owl.monto_neto), 0) as spei_neto,
        COUNT(*) as total_transacciones
      FROM openpay_webhook_logs owl
      LEFT JOIN fiscal_emitters fe ON owl.empresa_id = fe.id
      WHERE owl.fecha_pago >= $1 AND owl.fecha_pago <= $2
        AND owl.estatus_procesamiento = 'procesado'
        AND (owl.tipo_pago = 'spei' OR owl.tipo_pago IS NULL)
        ${serviceFilter ? "AND owl.service_type = $3" : ""}
      GROUP BY owl.empresa_id, fe.alias, fe.rfc
      ORDER BY spei_bruto DESC
    `, serviceFilter ? [startOfMonth, today, serviceFilter] : [startOfMonth, today]);

    // PayPal del mes
    const paypalMesRes = await pool.query(`
      SELECT 
        COALESCE(SUM(monto_recibido), 0) as paypal_bruto,
        COALESCE(SUM(monto_neto), 0) as paypal_neto
      FROM openpay_webhook_logs
      WHERE fecha_pago >= $1 AND fecha_pago <= $2
        AND estatus_procesamiento = 'procesado'
        AND tipo_pago = 'paypal'
        ${serviceFilter ? "AND service_type = $3" : ""}
    `, serviceFilter ? [startOfMonth, today, serviceFilter] : [startOfMonth, today]);

    // Efectivo del mes
    const ingresosMesRes = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as efectivo_mes
      FROM caja_chica_transacciones
      WHERE created_at >= $1 AND created_at <= $2
        ${serviceFilter ? "AND service_type = $3" : ""}
    `, serviceFilter ? [startOfMonth, today, serviceFilter] : [startOfMonth, today]);

    // 3. Cartera Vencida Total (filtrada por servicio si aplica)
    const carteraRes = await pool.query(`
      SELECT 
        COALESCE(SUM(COALESCE(saldo_pendiente, assigned_cost_mxn)), 0) as cartera_total,
        COUNT(*) as guias_pendientes
      FROM packages
      WHERE (payment_status IN ('pending', 'partial') OR payment_status IS NULL)
        AND assigned_cost_mxn > 0
        AND COALESCE(saldo_pendiente, assigned_cost_mxn) > 0
        ${serviceFilter ? "AND service_type = $1" : ""}
    `, serviceFilter ? [serviceFilter] : []);

    // 4. Saldo en caja chica (filtrado por servicio si aplica)
    const saldoCajaRes = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) as saldo_caja
      FROM caja_chica_transacciones
      ${serviceFilter ? "WHERE service_type = $1" : ""}
    `, serviceFilter ? [serviceFilter] : []);

    // ============================================
    // INGRESOS POR SERVICIO (Multi-empresa)
    // ============================================
    const ingresosPorServicioRes = await pool.query(`
      SELECT 
        COALESCE(p.service_type, 'otros') as servicio,
        COUNT(*) as cantidad,
        COALESCE(SUM(p.assigned_cost_mxn), 0) as monto_total
      FROM packages p
      WHERE p.payment_status = 'paid'
        AND p.updated_at >= $1 AND p.updated_at <= $2
        ${serviceFilter ? "AND p.service_type = $3" : ""}
      GROUP BY p.service_type
      ORDER BY monto_total DESC
    `, serviceFilter ? [startDate, endDate, serviceFilter] : [startDate, endDate]);

    // ============================================
    // TRANSACCIONES RECIENTES (con filtro de servicio)
    // ============================================
    const transaccionesRes = await pool.query(`
      (
        SELECT 
          t.id,
          t.created_at as fecha_hora,
          u.full_name as cliente,
          t.monto as monto_bruto,
          t.monto as monto_neto,
          0 as comision,
          'efectivo' as metodo,
          t.concepto,
          'Caja CC' as origen,
          'completado' as estatus,
          t.service_type
        FROM caja_chica_transacciones t
        LEFT JOIN users u ON t.cliente_id = u.id
        WHERE t.tipo = 'ingreso' 
          AND t.created_at >= $1 AND t.created_at <= $2
          ${serviceFilter ? "AND t.service_type = $3" : ""}
        ORDER BY t.created_at DESC
        LIMIT 50
      )
      UNION ALL
      (
        SELECT 
          owl.id,
          owl.fecha_pago as fecha_hora,
          u.full_name as cliente,
          owl.monto_recibido as monto_bruto,
          owl.monto_neto,
          owl.monto_recibido - owl.monto_neto as comision,
          COALESCE(owl.tipo_pago, 'spei') as metodo,
          owl.concepto,
          COALESCE(fe.alias, 'Empresa') as origen,
          owl.estatus_procesamiento as estatus,
          owl.service_type
        FROM openpay_webhook_logs owl
        LEFT JOIN users u ON owl.user_id = u.id
        LEFT JOIN fiscal_emitters fe ON owl.empresa_id = fe.id
        WHERE owl.estatus_procesamiento = 'procesado'
          AND owl.fecha_pago >= $1 AND owl.fecha_pago <= $2
          ${serviceFilter ? "AND owl.service_type = $3" : ""}
        ORDER BY owl.fecha_pago DESC
        LIMIT 50
      )
      ORDER BY fecha_hora DESC
      LIMIT 100
    `, serviceFilter ? [startDate, endDate, serviceFilter] : [startDate, endDate]);

    // Calcular totales consolidados
    const efectivoHoy = parseFloat(ingresosHoyRes.rows[0].efectivo_hoy) || 0;
    const speiHoyTotal = speiPorEmpresaRes.rows.reduce((sum: number, r: any) => sum + parseFloat(r.spei_bruto || 0), 0);
    const speiNetoHoyTotal = speiPorEmpresaRes.rows.reduce((sum: number, r: any) => sum + parseFloat(r.spei_neto || 0), 0);
    const paypalHoy = parseFloat(paypalHoyRes.rows[0]?.paypal_bruto || 0);
    const paypalNetoHoy = parseFloat(paypalHoyRes.rows[0]?.paypal_neto || 0);
    const efectivoMes = parseFloat(ingresosMesRes.rows[0].efectivo_mes) || 0;
    const speiMesTotal = speiMesPorEmpresaRes.rows.reduce((sum: number, r: any) => sum + parseFloat(r.spei_bruto || 0), 0);
    const speiNetoMesTotal = speiMesPorEmpresaRes.rows.reduce((sum: number, r: any) => sum + parseFloat(r.spei_neto || 0), 0);
    const paypalMes = parseFloat(paypalMesRes.rows[0]?.paypal_bruto || 0);
    const paypalNetoMes = parseFloat(paypalMesRes.rows[0]?.paypal_neto || 0);
    const comisionesMes = (speiMesTotal - speiNetoMesTotal) + (paypalMes - paypalNetoMes);
    const totalMes = efectivoMes + speiMesTotal + paypalMes;

    res.json({
      success: true,
      fecha_consulta: new Date(),
      periodo: { desde: startDate, hasta: endDate },
      filtro_servicio: serviceFilter,
      
      // Empresas con OpenPay configurado
      empresas: empresasRes.rows,
      
      // KPIs principales CONSOLIDADOS
      kpis: {
        ingresos_hoy: efectivoHoy + speiHoyTotal + paypalHoy,
        ingresos_hoy_neto: efectivoHoy + speiNetoHoyTotal + paypalNetoHoy,
        ingresos_mes: efectivoMes + speiMesTotal + paypalMes,
        ingresos_mes_neto: efectivoMes + speiNetoMesTotal + paypalNetoMes,
        spei_hoy: speiHoyTotal,
        spei_hoy_neto: speiNetoHoyTotal,
        spei_mes: speiMesTotal,
        spei_mes_neto: speiNetoMesTotal,
        paypal_hoy: paypalHoy,
        paypal_mes: paypalMes,
        efectivo_hoy: efectivoHoy,
        efectivo_mes: efectivoMes,
        cartera_vencida: parseFloat(carteraRes.rows[0].cartera_total) || 0,
        guias_pendientes: parseInt(carteraRes.rows[0].guias_pendientes) || 0,
        saldo_caja: parseFloat(saldoCajaRes.rows[0].saldo_caja) || 0,
        comisiones_mes: comisionesMes
      },
      
      // DESGLOSE POR EMPRESA (nuevo)
      ingresos_por_empresa: speiMesPorEmpresaRes.rows.map((r: any) => ({
        empresa_id: r.empresa_id,
        empresa_nombre: r.empresa_nombre || 'Sin asignar',
        rfc: r.rfc || 'N/A',
        spei_bruto: parseFloat(r.spei_bruto) || 0,
        spei_neto: parseFloat(r.spei_neto) || 0,
        comisiones: parseFloat(r.spei_bruto) - parseFloat(r.spei_neto) || 0,
        transacciones: parseInt(r.total_transacciones) || 0
      })),
      
      // Distribución para gráfica de pastel
      distribucion_metodos: {
        efectivo: efectivoMes,
        spei: speiMesTotal,
        paypal: paypalMes
      },
      porcentajes: {
        efectivo: totalMes > 0 
          ? ((efectivoMes / totalMes) * 100).toFixed(1)
          : '0',
        spei: totalMes > 0 
          ? ((speiMesTotal / totalMes) * 100).toFixed(1)
          : '0',
        paypal: totalMes > 0 
          ? ((paypalMes / totalMes) * 100).toFixed(1)
          : '0'
      },
      
      // Ingresos por servicio
      ingresos_por_servicio: ingresosPorServicioRes.rows.map((r: any) => ({
        servicio: r.servicio,
        cantidad: parseInt(r.cantidad) || 0,
        monto: parseFloat(r.monto_total) || 0
      })),
      
      // Transacciones recientes
      transacciones: transaccionesRes.rows.map((t: any) => ({
        id: t.id,
        fecha_hora: t.fecha_hora,
        cliente: t.cliente || 'Sin cliente',
        monto_bruto: parseFloat(t.monto_bruto) || 0,
        monto_neto: parseFloat(t.monto_neto) || 0,
        comision: parseFloat(t.comision) || 0,
        metodo: t.metodo,
        concepto: t.concepto,
        origen: t.origen,
        estatus: t.estatus,
        service_type: t.service_type
      })),
      
      // Servicios disponibles para filtrar
      servicios_disponibles: [
        { value: 'POBOX_USA', label: 'PO Box USA' },
        { value: 'AIR_CHN_MX', label: 'Aéreo China' },
        { value: 'SEA_CHN_MX', label: 'Marítimo China' },
        { value: 'AA_DHL', label: 'Nacional DHL' }
      ]
    });
  } catch (error: any) {
    console.error('Error getting finance dashboard:', error);
    res.status(500).json({ error: 'Error obteniendo dashboard financiero', details: error.message });
  }
});

// ============================================
// BUSCAR PAGO PENDIENTE POR REFERENCIA
// Para cuando el cliente llega con su referencia
// Permitir acceso a mostrador (counter_staff) para Caja PO Box
// ============================================
app.get('/api/admin/finance/search-payment', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: Request, res: Response): Promise<any> => {
  try {
    const { ref } = req.query;
    
    if (!ref) {
      return res.status(400).json({ error: 'Referencia es requerida' });
    }

    const refStr = (ref as string).toUpperCase().trim();

    // Buscar en openpay_webhook_logs (pagos pendientes)
    const paymentLog = await pool.query(`
      SELECT 
        owl.id,
        owl.transaction_id as referencia,
        owl.user_id,
        owl.monto_recibido as monto,
        owl.concepto,
        owl.fecha_pago,
        owl.estatus_procesamiento as status,
        owl.service_type,
        owl.payload_json,
        u.full_name as cliente_nombre,
        u.email as cliente_email,
        u.phone as cliente_telefono,
        fe.alias as empresa_alias
      FROM openpay_webhook_logs owl
      LEFT JOIN users u ON owl.user_id = u.id
      LEFT JOIN fiscal_emitters fe ON owl.empresa_id = fe.id
      WHERE owl.transaction_id ILIKE $1
      ORDER BY owl.fecha_pago DESC
      LIMIT 1
    `, [`%${refStr}%`]);

    if (paymentLog.rows.length === 0) {
      // Buscar también en pobox_payments
      const poboxPayment = await pool.query(`
        SELECT 
          p.id,
          p.payment_reference as referencia,
          p.user_id,
          p.amount as monto,
          p.package_ids,
          p.status,
          p.expires_at,
          p.created_at,
          u.full_name as cliente_nombre,
          u.email as cliente_email,
          u.phone as cliente_telefono
        FROM pobox_payments p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.payment_reference ILIKE $1
        ORDER BY p.created_at DESC
        LIMIT 1
      `, [`%${refStr}%`]);

      if (poboxPayment.rows.length === 0) {
        // ============================================
        // BUSCAR TAMBIÉN EN PAQUETES POR TRACKING
        // Para paquetes Pick Up u otros con saldo pendiente
        // ============================================
        const packageResult = await pool.query(`
          SELECT 
            p.id,
            p.tracking_internal,
            p.description,
            p.status,
            p.carrier,
            p.assigned_cost_mxn,
            p.saldo_pendiente,
            p.national_shipping_cost,
            p.user_id,
            u.full_name as cliente_nombre,
            u.email as cliente_email,
            u.phone as cliente_telefono,
            u.box_id
          FROM packages p
          LEFT JOIN users u ON p.user_id = u.id
          WHERE p.tracking_internal ILIKE $1
          ORDER BY p.created_at DESC
          LIMIT 1
        `, [`%${refStr}%`]);

        if (packageResult.rows.length === 0) {
          return res.status(404).json({ 
            error: 'Referencia no encontrada',
            message: `No se encontró ningún pago con referencia: ${refStr}`
          });
        }

        // Encontrado un paquete directo
        const pkg = packageResult.rows[0];
        const montoPendiente = parseFloat(pkg.saldo_pendiente) || parseFloat(pkg.assigned_cost_mxn) || parseFloat(pkg.national_shipping_cost) || 0;
        const isPickup = pkg.carrier && pkg.carrier.toLowerCase().includes('pick up');

        return res.json({
          success: true,
          source: 'package_direct',
          isPickup: isPickup,
          payment: {
            id: null,
            referencia: pkg.tracking_internal,
            monto: montoPendiente,
            status: pkg.status === 'ready_pickup' ? 'pending_payment' : pkg.status,
            created_at: null
          },
          cliente: {
            id: pkg.user_id,
            nombre: pkg.cliente_nombre,
            email: pkg.cliente_email,
            telefono: pkg.cliente_telefono,
            box_id: pkg.box_id
          },
          guias: [{
            id: pkg.id,
            tracking_internal: pkg.tracking_internal,
            description: pkg.description,
            assigned_cost_mxn: montoPendiente,
            carrier: pkg.carrier,
            status: pkg.status
          }],
          puede_confirmar: pkg.status === 'ready_pickup' || montoPendiente > 0
        });
      }

      // Obtener guías asociadas
      const payment = poboxPayment.rows[0];
      let packageIds = [];
      try {
        packageIds = typeof payment.package_ids === 'string' 
          ? JSON.parse(payment.package_ids) 
          : payment.package_ids;
      } catch (e) {}

      let guias: any[] = [];
      if (packageIds.length > 0) {
        const guiasRes = await pool.query(
          `SELECT id, tracking_internal, description, assigned_cost_mxn FROM packages WHERE id = ANY($1)`,
          [packageIds]
        );
        guias = guiasRes.rows;
      }

      return res.json({
        success: true,
        source: 'pobox_payments',
        payment: {
          id: payment.id,
          referencia: payment.referencia,
          monto: parseFloat(payment.monto) || 0,
          status: payment.status,
          expires_at: payment.expires_at,
          created_at: payment.created_at
        },
        cliente: {
          id: payment.user_id,
          nombre: payment.cliente_nombre,
          email: payment.cliente_email,
          telefono: payment.cliente_telefono
        },
        guias: guias,
        puede_confirmar: payment.status === 'pending_payment'
      });
    }

    // Encontrado en openpay_webhook_logs
    const payment = paymentLog.rows[0];
    let packageIds = [];
    let guias: any[] = [];
    
    try {
      const payload = typeof payment.payload_json === 'string' 
        ? JSON.parse(payment.payload_json) 
        : payment.payload_json;
      packageIds = payload?.packageIds || [];
    } catch (e) {}

    if (packageIds.length > 0) {
      const guiasRes = await pool.query(
        `SELECT id, tracking_internal, description, assigned_cost_mxn FROM packages WHERE id = ANY($1)`,
        [packageIds]
      );
      guias = guiasRes.rows;
    }

    res.json({
      success: true,
      source: 'openpay_webhook_logs',
      payment: {
        id: payment.id,
        referencia: payment.referencia,
        monto: parseFloat(payment.monto) || 0,
        concepto: payment.concepto,
        status: payment.status,
        fecha_pago: payment.fecha_pago,
        service_type: payment.service_type,
        empresa: payment.empresa_alias
      },
      cliente: {
        id: payment.user_id,
        nombre: payment.cliente_nombre,
        email: payment.cliente_email,
        telefono: payment.cliente_telefono
      },
      guias: guias,
      puede_confirmar: payment.status === 'pending_payment'
    });

  } catch (error: any) {
    console.error('Error searching payment:', error);
    res.status(500).json({ error: 'Error buscando pago', details: error.message });
  }
});

// ============================================
// CONFIRMAR PAGO EN EFECTIVO/SUCURSAL
// Cuando el admin recibe el pago del cliente
// Permitir acceso a mostrador (counter_staff) para Caja PO Box
// ============================================
app.post('/api/admin/finance/confirm-payment', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { referencia, metodo_confirmacion = 'efectivo', notas, received_by, moneda_recibida = 'MXN', monto_recibido, tipo_cambio } = req.body;
    const adminId = req.user?.userId;
    const adminName = req.user?.email?.split('@')[0] || `User ${adminId}`;
    const receiverName = received_by || null; // Nombre de quien recibe el paquete

    if (!referencia) {
      return res.status(400).json({ error: 'Referencia es requerida' });
    }

    const refStr = referencia.toUpperCase().trim();
    const currency = moneda_recibida === 'USD' ? 'USD' : 'MXN'; // Default MXN

    // Buscar el pago pendiente en openpay_webhook_logs
    const pendingPayment = await pool.query(`
      SELECT * FROM openpay_webhook_logs 
      WHERE transaction_id = $1 AND estatus_procesamiento = 'pending_payment'
    `, [refStr]);

    // ============================================
    // SI NO ESTÁ EN OPENPAY, BUSCAR PAQUETE DIRECTO (Pick Up)
    // ============================================
    if (pendingPayment.rows.length === 0) {
      // Buscar paquete por tracking (para Pick Up u otros pagos directos)
      const packageResult = await pool.query(`
        SELECT 
          p.id,
          p.tracking_internal,
          p.user_id,
          p.status,
          p.carrier,
          p.service_type,
          p.assigned_cost_mxn,
          p.saldo_pendiente,
          p.national_shipping_cost,
          u.full_name as cliente_nombre,
          u.box_id as cliente_box_id
        FROM packages p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.tracking_internal ILIKE $1
        LIMIT 1
      `, [`%${refStr}%`]);

      if (packageResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Pago no encontrado o ya procesado',
          message: 'Verifica que la referencia sea correcta y el pago esté pendiente'
        });
      }

      // Procesar pago directo de paquete (Pick Up o entrega en sucursal)
      const pkg = packageResult.rows[0];
      console.log('📦 Paquete encontrado:', {
        tracking: pkg.tracking_internal,
        status: pkg.status,
        carrier: pkg.carrier,
        saldo_pendiente: pkg.saldo_pendiente,
        assigned_cost_mxn: pkg.assigned_cost_mxn,
        national_shipping_cost: pkg.national_shipping_cost,
        user_id: pkg.user_id
      });
      
      const montoPendiente = parseFloat(pkg.saldo_pendiente) || parseFloat(pkg.assigned_cost_mxn) || parseFloat(pkg.national_shipping_cost) || 0;
      console.log('💰 Monto pendiente calculado:', montoPendiente);
      
      // Es pickup si: el carrier contiene "pick up" O si el status es "ready_pickup"
      const isPickup = (pkg.carrier && pkg.carrier.toLowerCase().includes('pick up')) || pkg.status === 'ready_pickup';

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Marcar paquete como pagado Y entregado (siempre si está en ready_pickup o es pickup)
        const newStatus = isPickup ? 'delivered' : pkg.status;
        
        // Actualizar paquete - condicional según si es pickup
        if (isPickup) {
          await client.query(`
            UPDATE packages SET
              client_paid = TRUE,
              client_paid_at = CURRENT_TIMESTAMP,
              saldo_pendiente = 0,
              payment_status = 'paid',
              status = $2,
              delivered_at = CURRENT_TIMESTAMP,
              received_by = COALESCE($3, received_by)
            WHERE id = $1
          `, [pkg.id, newStatus, receiverName]);
        } else {
          await client.query(`
            UPDATE packages SET
              client_paid = TRUE,
              client_paid_at = CURRENT_TIMESTAMP,
              saldo_pendiente = 0,
              payment_status = 'paid',
              status = $2
            WHERE id = $1
          `, [pkg.id, newStatus]);
        }

        // 2. Registrar en movimientos_financieros
        // Para PO Box USA (Hidalgo TX), usar sucursal 6 (Mostrador Hidalgo TX)
        const isPOBoxUSA = pkg.service_type === 'POBOX_USA' || (pkg.tracking_internal && pkg.tracking_internal.startsWith('US-'));
        const branchId = isPOBoxUSA ? 6 : 1;
        const billeteraResult = await client.query(`
          SELECT id, saldo_actual FROM billeteras_sucursal 
          WHERE sucursal_id = $1 AND is_default = true AND is_active = true
          LIMIT 1
        `, [branchId]);
        
        if (billeteraResult.rows.length > 0) {
          const billetera = billeteraResult.rows[0];
          const saldoAnterior = parseFloat(billetera.saldo_actual) || 0;
          const nuevoSaldo = saldoAnterior + montoPendiente;
          
          await client.query(`
            UPDATE billeteras_sucursal SET saldo_actual = $1 WHERE id = $2
          `, [nuevoSaldo, billetera.id]);
          
          await client.query(`
            INSERT INTO movimientos_financieros (
              sucursal_id, billetera_id, tipo_movimiento, monto, 
              monto_antes, monto_despues, nota_descriptiva, referencia,
              usuario_id, usuario_nombre, status, created_at
            ) VALUES (
              $1, $2, 'ingreso', $3, $4, $5, $6, $7, $8, $9, 'confirmado', CURRENT_TIMESTAMP
            )
          `, [
            branchId,
            billetera.id,
            montoPendiente,
            saldoAnterior,
            nuevoSaldo,
            `Pago ${metodo_confirmacion.toUpperCase()} - ${isPickup ? 'Pick Up' : 'PO Box'} - 1 paquete`,
            pkg.tracking_internal,
            adminId,
            adminName
          ]);
          
          // También registrar en caja_chica_transacciones para que aparezca en la UI
          // Si el pago es en USD, usar el monto_recibido, si es MXN usar montoPendiente
          const montoParaCaja = currency === 'USD' && monto_recibido ? monto_recibido : montoPendiente;
          
          await client.query(`
            INSERT INTO caja_chica_transacciones (
              tipo, monto, concepto, cliente_id, admin_id, admin_name, 
              saldo_despues_movimiento, categoria, notas, currency, referencia
            ) VALUES (
              'ingreso', $1, $2, $3, $4, $5, $6, 'cobro_guias', $7, $8, $9
            )
          `, [
            montoParaCaja,
            `Pago ${metodo_confirmacion.toUpperCase()} PO Box - 1 paquete`,
            pkg.user_id,
            adminId,
            adminName,
            nuevoSaldo,
            currency === 'USD' 
              ? `Pago en USD (TC: ${tipo_cambio || 'N/A'})` 
              : `Pago con ${metodo_confirmacion} en mostrador`,
            currency,
            pkg.tracking_internal // Guardar la referencia/tracking
          ]);
        }

        await client.query('COMMIT');

        // Generar comisiones para el paquete pagado
        generateCommissionsForPackages([pkg.id]).catch(err =>
          console.error('Error generando comisiones (confirm-payment pick up):', err)
        );

        console.log(`✅ Pago Pick Up confirmado: ${pkg.tracking_internal} - $${montoPendiente} MXN por ${adminName || adminId}`);

        return res.json({
          success: true,
          message: isPickup ? 'Pago confirmado y paquete entregado' : 'Pago confirmado exitosamente',
          referencia: pkg.tracking_internal,
          monto: montoPendiente,
          metodo: metodo_confirmacion,
          paquetes_actualizados: 1,
          confirmado_por: adminName || adminId,
          status_nuevo: newStatus,
          isPickup: isPickup
        });

      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('❌ Error en confirm-payment (pick up flow):', err.message, err.stack);
        throw err;
      } finally {
        client.release();
      }
    }

    // ============================================
    // FLUJO ORIGINAL: PAGO DESDE OPENPAY_WEBHOOK_LOGS
    // ============================================
    const payment = pendingPayment.rows[0];
    let packageIds = [];
    try {
      const payload = typeof payment.payload_json === 'string' 
        ? JSON.parse(payment.payload_json) 
        : payment.payload_json;
      packageIds = payload?.packageIds || [];
    } catch (e) {}

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Actualizar registro en openpay_webhook_logs como procesado
      await client.query(`
        UPDATE openpay_webhook_logs SET
          estatus_procesamiento = 'procesado',
          processed_at = CURRENT_TIMESTAMP,
          concepto = concepto || ' | Confirmado por ' || $2 || ' via ' || $3
        WHERE id = $1
      `, [payment.id, adminName || adminId, metodo_confirmacion]);

      // 2. Actualizar pobox_payments si existe
      await client.query(`
        UPDATE pobox_payments SET
          status = 'paid',
          paid_at = CURRENT_TIMESTAMP
        WHERE payment_reference = $1
      `, [refStr]);

      // 3. Marcar los paquetes como pagados
      if (packageIds.length > 0) {
        await client.query(`
          UPDATE packages SET
            client_paid = TRUE,
            client_paid_at = CURRENT_TIMESTAMP,
            saldo_pendiente = 0,
            payment_status = 'paid'
          WHERE id = ANY($1)
        `, [packageIds]);
      }

      // 4. Registrar en movimientos_financieros y actualizar billetera
      const branchId = 1; // TODO: obtener del usuario cuando esté disponible
      
      // Obtener billetera default (efectivo) de la sucursal
      const billeteraResult = await client.query(`
        SELECT id, saldo_actual FROM billeteras_sucursal 
        WHERE sucursal_id = $1 AND is_default = true AND is_active = true
        LIMIT 1
      `, [branchId]);
      
      if (billeteraResult.rows.length > 0) {
        const billetera = billeteraResult.rows[0];
        const saldoAnterior = parseFloat(billetera.saldo_actual) || 0;
        const nuevoSaldo = saldoAnterior + parseFloat(payment.monto_recibido);
        
        // Actualizar saldo de la billetera
        await client.query(`
          UPDATE billeteras_sucursal SET saldo_actual = $1 WHERE id = $2
        `, [nuevoSaldo, billetera.id]);
        
        // Insertar en movimientos_financieros (nuevo sistema)
        await client.query(`
          INSERT INTO movimientos_financieros (
            sucursal_id, billetera_id, tipo_movimiento, monto, 
            monto_antes, monto_despues, nota_descriptiva, referencia,
            usuario_id, usuario_nombre, status, created_at
          ) VALUES (
            $1, $2, 'ingreso', $3, $4, $5, $6, $7, $8, $9, 'confirmado', CURRENT_TIMESTAMP
          )
        `, [
          branchId,
          billetera.id,
          payment.monto_recibido,
          saldoAnterior,
          nuevoSaldo,
          `Pago ${metodo_confirmacion === 'efectivo' ? 'efectivo' : 'SPEI'} ref: ${refStr} - ${packageIds.length} paquete(s)`,
          refStr,
          adminId,
          adminName
        ]);
      }

      await client.query('COMMIT');

      // Generar comisiones para paquetes pagados
      if (packageIds.length > 0) {
        generateCommissionsForPackages(packageIds).catch(err =>
          console.error('Error generando comisiones (confirm-payment webhook flow):', err)
        );
      }

      console.log(`✅ Pago confirmado: ${refStr} - $${payment.monto_recibido} por ${adminName || adminId}`);

      res.json({
        success: true,
        message: 'Pago confirmado exitosamente',
        referencia: refStr,
        monto: parseFloat(payment.monto_recibido) || 0,
        metodo: metodo_confirmacion,
        paquetes_actualizados: packageIds.length,
        confirmado_por: adminName || adminId
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (error: any) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: 'Error confirmando pago', details: error.message });
  }
});

// ============================================
// CONFIRMAR PAGO BULK - MÚLTIPLES PAQUETES
// Para entrega de varios paquetes al mismo cliente
// ============================================
app.post('/api/admin/finance/confirm-payment-bulk', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { referencias, metodo_confirmacion = 'tarjeta', notas, received_by, monto_total_usd, moneda_recibida = 'MXN', tipo_cambio } = req.body;
    const adminId = req.user?.userId;
    const adminName = req.user?.email?.split('@')[0] || `User ${adminId}`;
    const receiverName = received_by || null;
    const currency = moneda_recibida === 'USD' ? 'USD' : 'MXN';

    if (!referencias || !Array.isArray(referencias) || referencias.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos una referencia' });
    }

    console.log(`📦 Procesando pago bulk de ${referencias.length} paquetes`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const processedPackages: string[] = [];
      let totalMonto = 0;
      let clienteId: number | null = null;
      let clienteBoxId = '';

      // Procesar cada paquete
      for (const referencia of referencias) {
        const refStr = referencia.toUpperCase().trim();
        
        // Buscar paquete
        const packageResult = await client.query(`
          SELECT 
            p.id,
            p.tracking_internal,
            p.user_id,
            p.status,
            p.carrier,
            p.service_type,
            p.saldo_pendiente,
            p.assigned_cost_mxn,
            p.national_shipping_cost,
            u.full_name as cliente_nombre,
            u.box_id as cliente_box_id
          FROM packages p
          LEFT JOIN users u ON p.user_id = u.id
          WHERE p.tracking_internal ILIKE $1
          LIMIT 1
        `, [`%${refStr}%`]);

        if (packageResult.rows.length === 0) {
          console.log(`⚠️ Paquete no encontrado: ${refStr}`);
          continue;
        }

        const pkg = packageResult.rows[0];
        const montoPaquete = parseFloat(pkg.saldo_pendiente) || parseFloat(pkg.assigned_cost_mxn) || parseFloat(pkg.national_shipping_cost) || 3; // Default $3 USD para PO Box
        
        // Guardar datos del cliente
        if (!clienteId) {
          clienteId = pkg.user_id;
          clienteBoxId = pkg.cliente_box_id || '';
        }

        // Marcar paquete como pagado y entregado
        await client.query(`
          UPDATE packages SET
            client_paid = TRUE,
            client_paid_at = CURRENT_TIMESTAMP,
            saldo_pendiente = 0,
            payment_status = 'paid',
            status = 'delivered',
            delivered_at = CURRENT_TIMESTAMP,
            received_by = COALESCE($2, received_by)
          WHERE id = $1
        `, [pkg.id, receiverName]);

        processedPackages.push(pkg.tracking_internal);
        totalMonto += montoPaquete;
        console.log(`✅ Paquete procesado: ${pkg.tracking_internal} - $${montoPaquete}`);
      }

      if (processedPackages.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'No se encontraron paquetes válidos para procesar' });
      }

      // Registrar en billetera y movimientos financieros
      const branchId = 6; // Mostrador Hidalgo TX para PO Box USA
      const billeteraResult = await client.query(`
        SELECT id, saldo_actual FROM billeteras_sucursal 
        WHERE sucursal_id = $1 AND is_default = true AND is_active = true
        LIMIT 1
      `, [branchId]);

      if (billeteraResult.rows.length > 0) {
        const billetera = billeteraResult.rows[0];
        const saldoAnterior = parseFloat(billetera.saldo_actual) || 0;
        const nuevoSaldo = saldoAnterior + (monto_total_usd || totalMonto);

        await client.query(`
          UPDATE billeteras_sucursal SET saldo_actual = $1 WHERE id = $2
        `, [nuevoSaldo, billetera.id]);

        await client.query(`
          INSERT INTO movimientos_financieros (
            sucursal_id, billetera_id, tipo_movimiento, monto, 
            monto_antes, monto_despues, nota_descriptiva, referencia,
            usuario_id, usuario_nombre, status, created_at
          ) VALUES (
            $1, $2, 'ingreso', $3, $4, $5, $6, $7, $8, $9, 'confirmado', CURRENT_TIMESTAMP
          )
        `, [
          branchId,
          billetera.id,
          monto_total_usd || totalMonto,
          saldoAnterior,
          nuevoSaldo,
          `Pago ${metodo_confirmacion.toUpperCase()} PO Box - ${processedPackages.length} paquete(s)`,
          processedPackages.join(', '),
          adminId,
          adminName
        ]);

        // Registrar en caja_chica_transacciones
        await client.query(`
          INSERT INTO caja_chica_transacciones (
            tipo, monto, concepto, cliente_id, admin_id, admin_name, 
            saldo_despues_movimiento, categoria, notas, currency, referencia
          ) VALUES (
            'ingreso', $1, $2, $3, $4, $5, $6, 'cobro_guias', $7, $8, $9
          )
        `, [
          monto_total_usd || totalMonto,
          `Pago ${metodo_confirmacion.toUpperCase()} PO Box - ${processedPackages.length} paquete(s)`,
          clienteId,
          adminId,
          adminName,
          nuevoSaldo,
          currency === 'USD' 
            ? `Pago en USD (TC: ${tipo_cambio || 'N/A'}) - Recibido por: ${receiverName}`
            : (notas || `Pago con ${metodo_confirmacion} en mostrador - Recibido por: ${receiverName}`),
          currency,
          processedPackages.join(', ') // Guardar los tracking como referencia
        ]);
      }

      await client.query('COMMIT');

      // Generar comisiones para paquetes pagados en bulk
      // Necesitamos los IDs de los paquetes procesados
      if (processedPackages.length > 0) {
        const bulkPkgResult = await pool.query(
          'SELECT id FROM packages WHERE tracking_internal = ANY($1)',
          [processedPackages]
        );
        const bulkPkgIds = bulkPkgResult.rows.map(r => r.id);
        if (bulkPkgIds.length > 0) {
          generateCommissionsForPackages(bulkPkgIds).catch(err =>
            console.error('Error generando comisiones (confirm-payment-bulk):', err)
          );
        }
      }

      console.log(`✅ Pago bulk confirmado: ${processedPackages.length} paquetes - $${monto_total_usd || totalMonto} USD por ${adminName}`);

      res.json({
        success: true,
        message: `${processedPackages.length} paquete(s) entregados y pagados exitosamente`,
        referencias: processedPackages,
        monto_total: monto_total_usd || totalMonto,
        metodo: metodo_confirmacion,
        paquetes_actualizados: processedPackages.length,
        confirmado_por: adminName
      });

    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('❌ Error en confirm-payment-bulk:', err.message, err.stack);
      throw err;
    } finally {
      client.release();
    }

  } catch (error: any) {
    console.error('Error en pago bulk:', error);
    res.status(500).json({ error: 'Error confirmando pago bulk', details: error.message });
  }
});

// ============================================
// ELIMINAR REFERENCIA DE PAGO PENDIENTE
// Elimina de openpay_webhook_logs y pobox_payments
// ============================================
app.delete('/api/admin/finance/pending-payment/:referencia', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const referencia = req.params.referencia as string;
    const adminId = req.user?.userId;
    const adminName = req.user?.email?.split('@')[0] || `User ${adminId}`;

    if (!referencia) {
      return res.status(400).json({ error: 'Referencia es requerida' });
    }

    const refStr = referencia.toUpperCase().trim();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Eliminar de openpay_webhook_logs
      const webhookResult = await client.query(`
        DELETE FROM openpay_webhook_logs 
        WHERE transaction_id = $1 AND estatus_procesamiento = 'pending_payment'
        RETURNING id, user_id, monto_recibido
      `, [refStr]);

      // 2. Eliminar de pobox_payments
      const poboxResult = await client.query(`
        DELETE FROM pobox_payments 
        WHERE payment_reference = $1 AND status IN ('pending', 'pending_payment')
        RETURNING id, user_id, amount, package_ids
      `, [refStr]);

      // Verificar si se eliminó algo
      const webhookDeleted = webhookResult.rowCount || 0;
      const poboxDeleted = poboxResult.rowCount || 0;

      if (webhookDeleted === 0 && poboxDeleted === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ 
          error: 'Referencia no encontrada',
          message: 'No se encontró ningún pago pendiente con esa referencia'
        });
      }

      await client.query('COMMIT');

      console.log(`🗑️ Referencia eliminada: ${refStr} por ${adminName} (webhook: ${webhookDeleted}, pobox: ${poboxDeleted})`);

      res.json({
        success: true,
        message: 'Referencia eliminada correctamente',
        referencia: refStr,
        eliminado_de: {
          openpay_webhook_logs: webhookDeleted,
          pobox_payments: poboxDeleted
        },
        eliminado_por: adminName
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (error: any) {
    console.error('Error deleting payment reference:', error);
    res.status(500).json({ error: 'Error eliminando referencia', details: error.message });
  }
});

// ============================================
// LISTAR PAGOS PENDIENTES POR CONFIRMAR
// Incluye: openpay_webhook_logs + pobox_payments
// ============================================
app.get('/api/admin/finance/pending-payments', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), async (req: Request, res: Response): Promise<any> => {
  try {
    const { service_type, branch_id, limit = 50 } = req.query;

    // 1. Obtener pagos de openpay_webhook_logs
    let whereClause1 = "WHERE owl.estatus_procesamiento = 'pending_payment'";
    const params1: any[] = [];
    let paramIndex1 = 1;

    if (branch_id) {
      whereClause1 += ` AND owl.branch_id = $${paramIndex1++}`;
      params1.push(branch_id);
    }

    if (service_type) {
      whereClause1 += ` AND owl.service_type = $${paramIndex1++}`;
      params1.push(service_type);
    }

    const webhookResult = await pool.query(`
      SELECT 
        owl.id,
        owl.transaction_id as referencia,
        owl.user_id,
        owl.monto_recibido as monto,
        owl.concepto,
        owl.fecha_pago as created_at,
        owl.service_type as tipo_servicio,
        owl.payment_method,
        owl.branch_id,
        u.full_name as cliente,
        u.email as cliente_email,
        u.phone as telefono,
        fe.alias as empresa,
        fe.bank_name as banco,
        fe.bank_clabe as clabe,
        b.name as sucursal_nombre,
        'webhook' as source
      FROM openpay_webhook_logs owl
      LEFT JOIN users u ON owl.user_id = u.id
      LEFT JOIN fiscal_emitters fe ON owl.empresa_id = fe.id
      LEFT JOIN branches b ON owl.branch_id = b.id
      ${whereClause1}
      ORDER BY owl.fecha_pago DESC
    `, params1);

    // 2. Obtener pagos pendientes de pobox_payments (cash pendiente de confirmar)
    let whereClause2 = "WHERE pp.status IN ('pending', 'pending_payment') AND pp.payment_method = 'cash'";
    const params2: any[] = [];

    const poboxResult = await pool.query(`
      SELECT 
        pp.id,
        pp.payment_reference as referencia,
        pp.user_id,
        pp.amount as monto,
        pp.package_ids,
        pp.created_at,
        'POBOX_USA' as tipo_servicio,
        pp.payment_method,
        u.full_name as cliente,
        u.email as cliente_email,
        u.phone as telefono,
        'pobox' as source
      FROM pobox_payments pp
      LEFT JOIN users u ON pp.user_id = u.id
      ${whereClause2}
      ORDER BY pp.created_at DESC
    `, params2);

    // Combinar resultados
    const webhookPayments = webhookResult.rows.map((r: any) => ({
      id: r.id,
      referencia: r.referencia,
      monto: parseFloat(r.monto) || 0,
      concepto: r.concepto,
      created_at: r.created_at,
      tipo_servicio: r.tipo_servicio,
      payment_method: r.payment_method || 'cash',
      cliente: r.cliente || 'Cliente desconocido',
      cliente_email: r.cliente_email,
      telefono: r.telefono,
      empresa: r.empresa,
      banco: r.banco,
      clabe: r.clabe,
      branch_id: r.branch_id,
      sucursal_nombre: r.sucursal_nombre,
      guias: r.concepto,
      source: 'webhook'
    }));

    const poboxPayments = poboxResult.rows.map((r: any) => {
      let packageCount = 0;
      try {
        if (r.package_ids) {
          const parsed = typeof r.package_ids === 'string' ? JSON.parse(r.package_ids) : r.package_ids;
          packageCount = Array.isArray(parsed) ? parsed.length : 0;
        }
      } catch (e) {
        packageCount = 0;
      }
      
      return {
        id: r.id,
        referencia: r.referencia,
        monto: parseFloat(r.monto) || 0,
        concepto: `Pago PO Box - ${packageCount} paquetes`,
        created_at: r.created_at,
        tipo_servicio: r.tipo_servicio,
        payment_method: r.payment_method || 'cash',
        cliente: r.cliente || 'Cliente desconocido',
        cliente_email: r.cliente_email,
        telefono: r.telefono,
        empresa: null,
        banco: null,
        clabe: null,
        branch_id: null,
        sucursal_nombre: null,
        guias: r.package_ids,
        source: 'pobox'
      };
    });

    // Unir y ordenar por fecha
    const allPayments = [...webhookPayments, ...poboxPayments]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, Number(limit));

    res.json({
      success: true,
      count: allPayments.length,
      pending_payments: allPayments
    });

  } catch (error: any) {
    console.error('Error getting pending payments:', error);
    res.status(500).json({ error: 'Error obteniendo pagos pendientes', details: error.message });
  }
});

// ============================================
// OBTENER DETALLES DE GUÍAS POR REFERENCIA DE PAGO
// ============================================
app.get('/api/admin/finance/payment-details/:referencia', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), async (req: Request, res: Response): Promise<any> => {
  try {
    const { referencia } = req.params;

    // 1. Buscar el pago en pobox_payments
    const paymentResult = await pool.query(`
      SELECT 
        pp.id,
        pp.user_id,
        pp.package_ids,
        pp.amount,
        pp.currency,
        pp.payment_method,
        pp.payment_reference,
        pp.external_order_id,
        pp.status,
        pp.expires_at,
        pp.created_at,
        u.full_name as cliente,
        u.email as cliente_email,
        u.phone as cliente_telefono
      FROM pobox_payments pp
      LEFT JOIN users u ON pp.user_id = u.id
      WHERE pp.payment_reference = $1
      LIMIT 1
    `, [referencia]);

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const payment = paymentResult.rows[0];
    
    // 2. Parsear package_ids
    let packageIds: number[] = [];
    try {
      packageIds = typeof payment.package_ids === 'string' 
        ? JSON.parse(payment.package_ids) 
        : payment.package_ids;
    } catch (e) {
      packageIds = [];
    }

    // 3. Obtener detalles de las guías
    let guias: any[] = [];
    if (packageIds.length > 0) {
      const guiasResult = await pool.query(`
        SELECT 
          p.id,
          p.tracking_internal as tracking_interno,
          p.tracking_provider as tracking_proveedor,
          p.description as descripcion,
          p.weight,
          p.pkg_length,
          p.pkg_width,
          p.pkg_height,
          p.assigned_cost_mxn as costo,
          p.saldo_pendiente,
          p.monto_pagado,
          p.client_paid,
          p.status,
          p.received_at,
          p.declared_value
        FROM packages p
        WHERE p.id = ANY($1)
        ORDER BY p.id
      `, [packageIds]);
      
      guias = guiasResult.rows.map(g => {
        // Calcular volumen desde dimensiones
        const length = g.pkg_length ? parseFloat(g.pkg_length) : 0;
        const width = g.pkg_width ? parseFloat(g.pkg_width) : 0;
        const height = g.pkg_height ? parseFloat(g.pkg_height) : 0;
        const volumen = (length && width && height) ? (length * width * height / 1000000) : null;
        
        return {
          id: g.id,
          tracking_interno: g.tracking_interno,
          tracking_proveedor: g.tracking_proveedor,
          descripcion: g.descripcion || 'Sin descripción',
          peso: g.weight ? parseFloat(g.weight) : null,
          volumen: volumen,
          dimensiones: (length && width && height) ? `${length}×${width}×${height} cm` : null,
          costo: g.costo ? parseFloat(g.costo) : 0,
          saldo_pendiente: g.saldo_pendiente ? parseFloat(g.saldo_pendiente) : 0,
          monto_pagado: g.monto_pagado ? parseFloat(g.monto_pagado) : 0,
          pagado: g.client_paid || false,
          status: g.status,
          fecha_recepcion: g.received_at,
          valor_declarado: g.declared_value ? parseFloat(g.declared_value) : null
        };
      });
    }

    res.json({
      success: true,
      payment: {
        id: payment.id,
        referencia: payment.payment_reference,
        monto: parseFloat(payment.amount) || 0,
        currency: payment.currency,
        payment_method: payment.payment_method,
        status: payment.status,
        expires_at: payment.expires_at,
        created_at: payment.created_at
      },
      cliente: {
        nombre: payment.cliente || 'Desconocido',
        email: payment.cliente_email,
        telefono: payment.cliente_telefono
      },
      guias,
      total_guias: guias.length,
      total_peso: guias.reduce((sum, g) => sum + (g.peso || 0), 0),
      total_costo: guias.reduce((sum, g) => sum + (g.costo || 0), 0)
    });

  } catch (error: any) {
    console.error('Error getting payment details:', error);
    res.status(500).json({ error: 'Error obteniendo detalles del pago', details: error.message });
  }
});

// Exportar datos a CSV para contabilidad
app.get('/api/admin/finance/export', authenticateToken, requireMinLevel(ROLES.ADMIN), async (req: Request, res: Response): Promise<any> => {
  try {
    const { date_from, date_to, format = 'csv' } = req.query;
    
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startDate = date_from ? new Date(date_from as string) : startOfMonth;
    const endDate = date_to ? new Date(date_to as string) : today;

    // Obtener todas las transacciones del período
    const result = await pool.query(`
      (
        SELECT 
          t.created_at as fecha,
          u.full_name as cliente,
          u.box_id,
          t.monto as monto_bruto,
          t.monto as monto_neto,
          0 as comision_openpay,
          'Efectivo' as metodo_pago,
          'Caja CC' as empresa_receptora,
          t.concepto as concepto,
          t.admin_name as registrado_por,
          COALESCE(
            (SELECT string_agg(p.tracking_internal || ' ($' || pa.monto_aplicado || ')', '; ') 
             FROM payment_applications pa 
             JOIN packages p ON pa.package_id = p.id 
             WHERE pa.transaction_id = t.id), 
            'Sin desglose'
          ) as detalle_guias
        FROM caja_chica_transacciones t
        LEFT JOIN users u ON t.cliente_id = u.id
        WHERE t.tipo = 'ingreso' 
          AND t.categoria = 'cobro_guias'
          AND t.created_at >= $1 AND t.created_at <= $2
      )
      UNION ALL
      (
        SELECT 
          owl.fecha_pago as fecha,
          u.full_name as cliente,
          u.box_id,
          owl.monto_recibido as monto_bruto,
          owl.monto_neto,
          owl.monto_recibido - owl.monto_neto as comision_openpay,
          'Transferencia SPEI' as metodo_pago,
          fe.alias as empresa_receptora,
          owl.concepto,
          'Sistema Automatizado' as registrado_por,
          COALESCE(
            (SELECT string_agg(p.tracking_internal || ' ($' || opa.monto_aplicado || ')', '; ') 
             FROM openpay_payment_applications opa 
             JOIN packages p ON opa.package_id = p.id 
             WHERE opa.webhook_log_id = owl.id),
            'Sin desglose'
          ) as detalle_guias
        FROM openpay_webhook_logs owl
        LEFT JOIN users u ON owl.user_id = u.id
        LEFT JOIN fiscal_emitters fe ON owl.empresa_id = fe.id
        WHERE owl.estatus_procesamiento = 'procesado'
          AND owl.fecha_pago >= $1 AND owl.fecha_pago <= $2
      )
      ORDER BY fecha DESC
    `, [startDate, endDate]);

    if (format === 'json') {
      return res.json({ success: true, data: result.rows });
    }

    // Generar CSV
    const headers = [
      'Fecha',
      'Cliente',
      'Box ID',
      'Monto Bruto',
      'Monto Neto',
      'Comision Openpay',
      'Metodo Pago',
      'Empresa Receptora',
      'Concepto',
      'Registrado Por',
      'Detalle Guias'
    ];

    let csvContent = headers.join(',') + '\n';
    
    for (const row of result.rows) {
      const values = [
        new Date(row.fecha).toISOString().split('T')[0],
        `"${(row.cliente || '').replace(/"/g, '""')}"`,
        row.box_id || '',
        row.monto_bruto,
        row.monto_neto,
        row.comision_openpay,
        row.metodo_pago,
        `"${(row.empresa_receptora || '').replace(/"/g, '""')}"`,
        `"${(row.concepto || '').replace(/"/g, '""')}"`,
        `"${(row.registrado_por || '').replace(/"/g, '""')}"`,
        `"${(row.detalle_guias || '').replace(/"/g, '""')}"`
      ];
      csvContent += values.join(',') + '\n';
    }

    // Totales al final
    const totalBruto = result.rows.reduce((sum, r) => sum + parseFloat(r.monto_bruto), 0);
    const totalNeto = result.rows.reduce((sum, r) => sum + parseFloat(r.monto_neto), 0);
    const totalComisiones = result.rows.reduce((sum, r) => sum + parseFloat(r.comision_openpay), 0);
    
    csvContent += '\n';
    csvContent += `TOTALES,,,${totalBruto.toFixed(2)},${totalNeto.toFixed(2)},${totalComisiones.toFixed(2)},,,,\n`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=reporte_cobranza_${startDate.toISOString().split('T')[0]}_a_${endDate.toISOString().split('T')[0]}.csv`);
    res.send('\uFEFF' + csvContent); // BOM para Excel
  } catch (error) {
    console.error('Error exporting finance data:', error);
    res.status(500).json({ error: 'Error exportando datos' });
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

// Permisos de Paneles por Usuario
app.get('/api/admin/panels', authenticateToken, requireSuperAdmin(), getAllPanels);
app.get('/api/admin/panels/users', authenticateToken, requireSuperAdmin(), listUsersWithPanelPermissions);
app.get('/api/admin/panels/user/:userId', authenticateToken, requireSuperAdmin(), getUserPanelPermissions);
app.put('/api/admin/panels/user/:userId', authenticateToken, requireSuperAdmin(), updateUserPanelPermissions);
app.get('/api/panels/me', authenticateToken, getMyPanelPermissions);

// Permisos de Módulos por Usuario (granular dentro de cada panel)
app.get('/api/admin/panels/:panelKey/modules', authenticateToken, requireSuperAdmin(), getPanelModules);
app.get('/api/admin/panels/:panelKey/user/:userId/modules', authenticateToken, requireSuperAdmin(), getUserModulePermissions);
app.put('/api/admin/panels/:panelKey/user/:userId/modules', authenticateToken, requireSuperAdmin(), updateUserModulePermissions);
app.get('/api/modules/:panelKey/me', authenticateToken, getMyModulePermissions);

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

// Whitelist de correos (Lectura: Gerente+, Escritura: Admin+)
app.get('/api/admin/email/whitelist', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getWhitelist);
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

// Upload manual de documentos marítimos (FCL/LCL) - Archivos van a S3, límite 100MB
const maritimeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
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

// ========== CORREOS ENTRANTES AÉREO ==========
// Borradores aéreos (AWB + Packing List)
app.get('/api/admin/air-email/drafts', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getAirDrafts);
app.get('/api/admin/air-email/drafts/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getAirDraftById);
app.post('/api/admin/air-email/drafts/:id/approve', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), approveAirDraft);
app.post('/api/admin/air-email/drafts/:id/reject', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), rejectAirDraft);
app.post('/api/admin/air-email/drafts/:id/reextract', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), reextractAirDraft);

// Archivos de borradores aéreos
app.get('/api/admin/air-email/drafts/:id/awb-pdf', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), serveAirAwbPdf);
app.get('/api/admin/air-email/drafts/:id/excel', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), serveAirExcel);

// Stats aéreos
app.get('/api/admin/air-email/stats', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getAirEmailStats);

// Whitelist aéreo
app.get('/api/admin/air-email/whitelist', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getAirWhitelist);
app.post('/api/admin/air-email/whitelist', authenticateToken, requireMinLevel(ROLES.ADMIN), addToAirWhitelist);
app.delete('/api/admin/air-email/whitelist/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), removeFromAirWhitelist);

// Rutas aéreas (lectura: todos los autenticados, escritura: counter_staff+, eliminar: admin)
app.get('/api/admin/air-routes', authenticateToken, getAirRoutes);
app.post('/api/admin/air-routes', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createAirRoute);
app.put('/api/admin/air-routes/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateAirRoute);
app.delete('/api/admin/air-routes/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), deleteAirRoute);

// Tarifas aéreas (pricing por ruta y tipo)
app.get('/api/admin/air-tariffs', authenticateToken, getAirTariffs);
app.post('/api/admin/air-tariffs', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), saveAirTariffs);
app.get('/api/admin/air-tariffs/:routeId/history', authenticateToken, getRoutePriceHistory);

// Brackets de costo proveedor por ruta (lo que nos cobran)
app.get('/api/admin/air-cost-brackets/:routeId', authenticateToken, getAirCostBrackets);
app.post('/api/admin/air-cost-brackets/:routeId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), saveAirCostBrackets);

// Tarifas personalizadas por cliente
app.get('/api/admin/air-client-tariffs/search-clients', authenticateToken, searchClientsForTariffs);
app.get('/api/admin/air-client-tariffs/clients', authenticateToken, getClientsWithCustomTariffs);
app.get('/api/admin/air-client-tariffs', authenticateToken, getClientTariffs);
app.post('/api/admin/air-client-tariffs', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), saveClientTariff);
app.post('/api/admin/air-client-tariffs/bulk', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), saveClientTariffsBulk);
app.delete('/api/admin/air-client-tariffs/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), deleteClientTariff);

// ========== GESTIÓN CAJO ==========
app.get('/api/cajo/guides', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getCajoGuides);
app.get('/api/cajo/stats', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getCajoStats);
app.get('/api/cajo/overfee', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getCajoOverfee);
app.post('/api/cajo/overfee', authenticateToken, requireMinLevel(ROLES.ADMIN), saveCajoOverfee);
app.get('/api/cajo/guides/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getCajoGuideById);
app.put('/api/cajo/guides/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updateCajoGuide);
app.put('/api/cajo/guides/batch-status', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), batchUpdateCajoStatus);
app.delete('/api/cajo/guides/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), deleteCajoGuide);
app.get('/api/cajo/by-mawb/:mawb', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getCajoByMawb);
app.get('/api/cajo/mawbs', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), listCajoMawbs);

// ========== COSTEO AIR WAYBILL (Modal estilo marítimo) ==========
app.get('/api/awb-costs/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAwbCostStats);
app.get('/api/awb-costs', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), listAwbCosts);
app.get('/api/awb-costs/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAwbCostDetail);
app.put('/api/awb-costs/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), saveAwbCosts);
app.get('/api/awb-costs/:id/profit', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAwbCostProfit);
app.get('/api/awb-costs/:id/calc-release-costs', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), calcReleaseCosts);
app.post('/api/awb-costs/:id/upload-document', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), uploadAwbDocument, handleAwbDocumentUpload);
app.delete('/api/awb-costs/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteAwbCost);

// Upload manual aéreo (AWB PDF + Packing List Excel)
const airUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
app.post('/api/admin/air-email/upload-manual',
  authenticateToken,
  requireMinLevel(ROLES.WAREHOUSE_OPS),
  airUpload.fields([
    { name: 'awb', maxCount: 1 },
    { name: 'packingList', maxCount: 1 }
  ]),
  uploadManualAirShipment
);

// ========== MÓDULO DE RECURSOS HUMANOS ==========
// Públicos (empleados)
app.get('/api/hr/privacy-notice', getPrivacyNotice);
app.get('/api/hr/advisor-privacy-notice', getAdvisorPrivacyNotice);

// Empleados autenticados
app.post('/api/hr/accept-privacy', authenticateToken, acceptPrivacyNotice);
app.post('/api/hr/accept-advisor-privacy', authenticateToken, acceptAdvisorPrivacyNotice);
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

// ========== MÓDULO DE REPARTIDOR - CARGA Y ENTREGA ==========
// Ruta del día
app.get('/api/driver/route-today', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), getDriverRouteToday);

// Scan-to-Load: Carga de paquetes a la unidad
app.post('/api/driver/scan-load', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), scanPackageToLoad);

// Retorno a bodega: Paquetes no entregados
app.get('/api/driver/packages-to-return', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), getPackagesToReturn);
app.post('/api/driver/scan-return', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), scanPackageReturn);

// Confirmación de entrega
app.post('/api/driver/confirm-delivery', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), confirmDelivery);
app.get('/api/driver/deliveries-today', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), getDeliveriesToday);

// Verificar paquete antes de entregar
app.get('/api/driver/verify-package/:barcode', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), verifyPackageForDelivery);

// ============================================
// COTIZADOR PÚBLICO UNIVERSAL
// Endpoint para obtener todas las tarifas y calcular cotizaciones
// ============================================

// GET /api/public/rates - Obtener tarifas de referencia de todos los servicios
app.get('/api/public/rates', async (_req: Request, res: Response) => {
  try {
    // 1. Tipo de cambio actual
    const fxRes = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
    const fxRate = parseFloat(fxRes.rows[0]?.rate || '20.00');

    // 2. Tarifas Marítimo China (precio base por CBM)
    const maritimoRes = await pool.query(`
      SELECT pt.min_cbm, pt.max_cbm, pt.price, pt.is_flat_fee
      FROM pricing_tiers pt
      JOIN pricing_categories pc ON pt.category_id = pc.id
      WHERE pc.name = 'Generico' AND pt.is_active = true
      ORDER BY pt.min_cbm ASC LIMIT 1
    `);
    const maritimoBase = parseFloat(maritimoRes.rows[0]?.price || '39');

    // 3. Tarifas Aéreo China (obtener tarifa G - Genérico de la ruta activa)
    const aereoRes = await pool.query(`
      SELECT at.price_per_kg
      FROM air_tariffs at
      JOIN air_routes ar ON at.route_id = ar.id
      WHERE ar.is_active = true AND at.tariff_type = 'G' AND at.is_active = true
      ORDER BY ar.id ASC LIMIT 1
    `);
    const aereoBase = parseFloat(aereoRes.rows[0]?.price_per_kg || '8');

    // 4. Tarifas PO Box USA (nivel 1 - precio base)
    const poboxRes = await pool.query(`
      SELECT costo FROM pobox_tarifas_volumen
      WHERE estado = true ORDER BY nivel ASC LIMIT 1
    `);
    const poboxBase = parseFloat(poboxRes.rows[0]?.costo || '39');
    // Convertir a precio por libra aprox ($39 USD / ~11.13 CBM mínimo)
    const poboxPorLibra = 3.50; // Tarifa fija por libra

    // 5. Tarifas DHL (Standard)
    const dhlRes = await pool.query(`
      SELECT price_usd FROM dhl_rates
      WHERE rate_type = 'STANDARD' AND is_active = true LIMIT 1
    `);
    const dhlStandard = parseFloat(dhlRes.rows[0]?.price_usd || '145');

    // DHL High Value
    const dhlHvRes = await pool.query(`
      SELECT price_usd FROM dhl_rates
      WHERE rate_type = 'HIGH_VALUE' AND is_active = true LIMIT 1
    `);
    const dhlHighValue = parseFloat(dhlHvRes.rows[0]?.price_usd || '225');

    res.json({
      tipo_cambio: fxRate,
      servicios: [
        {
          id: 'maritimo',
          nombre: 'Marítimo China',
          descripcion: 'Envío por mar desde China. Ideal para volúmenes grandes.',
          tiempo_estimado: '45-60 días',
          unidad: 'CBM',
          precio_base_usd: maritimoBase,
          precio_base_mxn: maritimoBase * fxRate,
          icono: '🚢',
          notas: 'Incluye entrega en Monterrey. Mínimo cobrable: 0.010 m³',
        },
        {
          id: 'aereo',
          nombre: 'Aéreo China',
          descripcion: 'Envío por avión desde China. Para envíos urgentes y pequeños.',
          tiempo_estimado: '10-15 días',
          unidad: 'kg',
          precio_base_usd: aereoBase,
          precio_base_mxn: aereoBase * fxRate,
          icono: '✈️',
          notas: 'Precio por kilogramo. Se usa el mayor entre peso real y volumétrico.',
        },
        {
          id: 'pobox',
          nombre: 'PO Box USA',
          descripcion: 'Casillero en USA para compras en Amazon, eBay, tiendas online.',
          tiempo_estimado: '5-10 días',
          unidad: 'paquete',
          precio_base_usd: 39,
          precio_base_mxn: 39 * fxRate,
          icono: '📦',
          notas: 'Compras en Amazon, eBay y tiendas USA. Precio base desde $39 USD.',
        },
        {
          id: 'dhl',
          nombre: 'DHL Nacional',
          descripcion: 'Liberación de paquetes DHL en Monterrey.',
          tiempo_estimado: '1-3 días',
          unidad: 'liberación',
          precio_base_usd: dhlStandard,
          precio_base_mxn: dhlStandard * fxRate,
          icono: '📮',
          notas: 'Liberación + entrega local. High Value: $' + dhlHighValue + ' USD',
        },
      ],
    });
  } catch (error: any) {
    console.error('Error obteniendo tarifas públicas:', error);
    res.status(500).json({ error: 'Error al obtener tarifas' });
  }
});

// POST /api/public/quote - Cotizador universal
app.post('/api/public/quote', async (req: Request, res: Response) => {
  try {
    const { servicio, largo, ancho, alto, peso, cantidad = 1, categoria } = req.body;

    if (!servicio) {
      return res.status(400).json({ error: 'El tipo de servicio es requerido' });
    }

    // Tipo de cambio
    const fxRes = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
    const fxRate = parseFloat(fxRes.rows[0]?.rate || '20.00');

    let resultado: any = {
      servicio,
      tipo_cambio: fxRate,
      moneda: 'USD',
    };

    switch (servicio) {
      case 'maritimo': {
        if (!largo || !ancho || !alto) {
          return res.status(400).json({ error: 'Dimensiones (largo, ancho, alto en cm) son requeridas' });
        }
        
        // Calcular CBM
        let cbm = (parseFloat(largo) * parseFloat(ancho) * parseFloat(alto)) / 1000000;
        const cbmOriginal = cbm;
        
        // Mínimo cobrable
        if (cbm < 0.01) cbm = 0.01;
        
        // Redondeo 0.76-0.99 → 1
        const decimal = cbm - Math.floor(cbm);
        if (decimal >= 0.76) cbm = Math.ceil(cbm);
        
        cbm *= cantidad;

        // Obtener tarifa
        const cat = categoria || 'Generico';
        const tierRes = await pool.query(`
          SELECT pt.price, pt.is_flat_fee
          FROM pricing_tiers pt
          JOIN pricing_categories pc ON pt.category_id = pc.id
          WHERE pc.name ILIKE $1 AND pt.is_active = true
            AND $2 >= pt.min_cbm AND ($2 <= pt.max_cbm OR pt.max_cbm IS NULL)
          ORDER BY pt.min_cbm ASC LIMIT 1
        `, [cat, cbm]);

        let precioUsd = 0;
        let tipoCalculo = 'por_cbm';
        if (tierRes.rows.length > 0) {
          const tier = tierRes.rows[0];
          if (!tier.is_flat_fee) {
            precioUsd = cbm * parseFloat(tier.price);
          } else {
            precioUsd = parseFloat(tier.price);
            tipoCalculo = 'precio_fijo';
          }
        } else {
          // Fallback
          precioUsd = cbm * 39;
        }

        resultado = {
          ...resultado,
          cbm_calculado: cbmOriginal.toFixed(4),
          cbm_cobrable: cbm.toFixed(4),
          cantidad,
          categoria: cat,
          tipo_calculo: tipoCalculo,
          precio_usd: precioUsd.toFixed(2),
          precio_mxn: (precioUsd * fxRate).toFixed(2),
          tiempo_estimado: '45-60 días',
        };
        break;
      }

      case 'aereo': {
        if (!peso && (!largo || !ancho || !alto)) {
          return res.status(400).json({ error: 'Peso o dimensiones son requeridas' });
        }

        // Calcular peso volumétrico
        const pesoReal = parseFloat(peso) || 0;
        const pesoVol = largo && ancho && alto 
          ? (parseFloat(largo) * parseFloat(ancho) * parseFloat(alto)) / 5000 
          : 0;
        const pesoCobrable = Math.max(pesoReal, pesoVol) * cantidad;

        // Obtener tarifa
        const tariffType = categoria || 'G'; // G = Genérico
        const tariffRes = await pool.query(`
          SELECT at.price_per_kg
          FROM air_tariffs at
          JOIN air_routes ar ON at.route_id = ar.id
          WHERE ar.is_active = true AND at.tariff_type = $1 AND at.is_active = true
          ORDER BY ar.id ASC LIMIT 1
        `, [tariffType]);

        const precioPorKg = parseFloat(tariffRes.rows[0]?.price_per_kg || '8');
        const precioUsd = pesoCobrable * precioPorKg;

        resultado = {
          ...resultado,
          peso_real: pesoReal.toFixed(2),
          peso_volumetrico: pesoVol.toFixed(2),
          peso_cobrable: pesoCobrable.toFixed(2),
          cantidad,
          categoria: tariffType === 'L' ? 'Logotipo' : tariffType === 'S' ? 'Sensible' : tariffType === 'F' ? 'Flat' : 'Genérico',
          precio_por_kg: precioPorKg,
          precio_usd: precioUsd.toFixed(2),
          precio_mxn: (precioUsd * fxRate).toFixed(2),
          tiempo_estimado: '10-15 días',
        };
        break;
      }

      case 'pobox': {
        // PO Box se cotiza SOLO por dimensiones (CBM)
        if (!largo || !ancho || !alto) {
          return res.status(400).json({ error: 'Dimensiones (largo, ancho, alto en cm) son requeridas para PO Box' });
        }

        // Calcular CBM
        let cbm = (parseFloat(largo) * parseFloat(ancho) * parseFloat(alto)) / 1000000;
        if (cbm < 0.010) cbm = 0.010;

        let precioUsd = 0;
        let nivel = 1;

        // Buscar tarifa por CBM
        const tarifaRes = await pool.query(`
          SELECT nivel, costo, tipo_cobro FROM pobox_tarifas_volumen
          WHERE estado = true AND $1 >= cbm_min AND ($1 <= cbm_max OR cbm_max IS NULL)
          ORDER BY nivel ASC LIMIT 1
        `, [cbm]);

        if (tarifaRes.rows.length > 0) {
          const t = tarifaRes.rows[0];
          nivel = t.nivel;
          if (t.tipo_cobro === 'fijo') {
            precioUsd = parseFloat(t.costo);
          } else {
            precioUsd = cbm * parseFloat(t.costo);
          }
        } else {
          precioUsd = 39; // Fallback - precio base mínimo
        }

        precioUsd *= cantidad;

        // Obtener tipo de cambio específico para PO Box
        const tcRes = await pool.query(`
          SELECT tipo_cambio_final FROM exchange_rate_config
          WHERE servicio = 'pobox_usa' AND estado = TRUE LIMIT 1
        `);
        const tcPobox = parseFloat(tcRes.rows[0]?.tipo_cambio_final || fxRate.toString());

        resultado = {
          ...resultado,
          cbm_calculado: cbm.toFixed(4),
          nivel_tarifa: nivel,
          cantidad,
          precio_usd: precioUsd.toFixed(2),
          precio_mxn: (precioUsd * tcPobox).toFixed(2),
          tipo_cambio: tcPobox,
          tiempo_estimado: '5-10 días',
        };
        break;
      }

      case 'dhl': {
        // DHL requiere peso y dimensiones, máximo 40 kg por caja
        if (!peso) {
          return res.status(400).json({ error: 'Peso (kg) es requerido para DHL' });
        }

        const pesoKg = parseFloat(peso);
        if (pesoKg > 40) {
          return res.status(400).json({ 
            error: '⚠️ El peso excede 40 kg por caja. Este embarque no puede enviarse por DHL.',
            sugerencia: 'Te recomendamos usar el servicio Aéreo desde China para embarques mayores a 40 kg.',
            alternativa: 'aereo'
          });
        }

        const tipo = categoria || 'STANDARD';
        
        const rateRes = await pool.query(`
          SELECT price_usd, rate_name, description FROM dhl_rates
          WHERE rate_type = $1 AND is_active = true LIMIT 1
        `, [tipo]);

        // Si no hay tarifa, usar fallback
        let rate;
        if (rateRes.rows.length === 0) {
          // Tarifa por defecto
          rate = {
            price_usd: tipo === 'HIGH_VALUE' ? 225 : 145,
            rate_name: tipo === 'HIGH_VALUE' ? 'Alto Valor' : 'Estándar',
            description: tipo === 'HIGH_VALUE' ? 'Paquetes de alto valor (refacciones)' : 'Paquetes estándar (accesorios/mixtos)',
          };
        } else {
          rate = rateRes.rows[0];
        }

        const precioUsd = parseFloat(rate.price_usd) * cantidad;

        // Calcular peso volumétrico si hay dimensiones
        let pesoVol = 0;
        if (largo && ancho && alto) {
          pesoVol = (parseFloat(largo) * parseFloat(ancho) * parseFloat(alto)) / 5000;
        }

        resultado = {
          ...resultado,
          tipo_tarifa: tipo,
          nombre_tarifa: rate.rate_name,
          descripcion: rate.description,
          cantidad,
          peso_real: pesoKg.toFixed(2),
          peso_volumetrico: pesoVol > 0 ? pesoVol.toFixed(2) : null,
          precio_usd: precioUsd.toFixed(2),
          precio_mxn: (precioUsd * fxRate).toFixed(2),
          tiempo_estimado: '1-3 días',
          nota: 'Máximo 40 kg por caja. No incluye impuestos de importación.',
        };
        break;
      }

      default:
        return res.status(400).json({ error: `Servicio "${servicio}" no reconocido. Use: maritimo, aereo, pobox, dhl` });
    }

    res.json(resultado);
  } catch (error: any) {
    console.error('Error en cotización pública:', error);
    res.status(500).json({ error: 'Error al calcular cotización' });
  }
});

// ============================================
// TARIFAS PO BOX USA
// ============================================
// Cotizador público
app.post('/api/pobox/cotizar', calcularCotizacionPOBox);
// Gestión de tarifas de volumen (Admin)
app.get('/api/admin/pobox/tarifas-volumen', authenticateToken, requireRole('super_admin'), getTarifasVolumen);
app.put('/api/admin/pobox/tarifas-volumen/:id', authenticateToken, requireRole('super_admin'), updateTarifaVolumen);
app.post('/api/admin/pobox/tarifas-volumen', authenticateToken, requireRole('super_admin'), createTarifaVolumen);
// Gestión de servicios extra (Admin)
app.get('/api/admin/pobox/servicios-extra', authenticateToken, requireRole('super_admin'), getServiciosExtra);
app.put('/api/admin/pobox/servicios-extra/:id', authenticateToken, requireRole('super_admin'), updateServicioExtra);
app.post('/api/admin/pobox/servicios-extra', authenticateToken, requireRole('super_admin'), createServicioExtra);

// ============================================
// COSTEO PO BOX USA
// Fórmula: Costo = (Volumen Ajustado / 10,780) × 75
// ============================================
app.get('/api/pobox/costing/config', authenticateToken, getCostingConfig);
app.post('/api/pobox/costing/config', authenticateToken, requireRole('super_admin'), saveCostingConfig);
app.get('/api/pobox/costing/packages', authenticateToken, getCostingPackages);
app.put('/api/pobox/costing/packages/:id', authenticateToken, requireRole('super_admin'), updatePackageCost);
app.post('/api/pobox/costing/mark-paid', authenticateToken, requireRole('super_admin'), markPackagesAsPaid);
app.get('/api/pobox/costing/payment-history', authenticateToken, getPaymentHistory);
app.get('/api/pobox/costing/utilidades', authenticateToken, requireRole('admin', 'super_admin'), getUtilidadesData);

// ============================================
// CONFIGURACIÓN TIPO DE CAMBIO
// ============================================
// Obtener configuración completa
app.get('/api/admin/exchange-rate/config', authenticateToken, requireRole('super_admin'), getExchangeRateConfig);
// Obtener tipo de cambio por servicio
app.get('/api/exchange-rate/:servicio', authenticateToken, getExchangeRateByService);
// Actualizar configuración
app.put('/api/admin/exchange-rate/config/:id', authenticateToken, requireRole('super_admin'), updateExchangeRateConfig);
// Crear nueva configuración
app.post('/api/admin/exchange-rate/config', authenticateToken, requireRole('super_admin'), createExchangeRateConfig);
// Refrescar todos los tipos de cambio desde API
app.post('/api/admin/exchange-rate/refresh', authenticateToken, requireRole('super_admin'), refreshAllExchangeRates);
// Historial de tipos de cambio
app.get('/api/admin/exchange-rate/history', authenticateToken, requireRole('super_admin'), getExchangeHistory);
// Estado del sistema de tipo de cambio
app.get('/api/admin/exchange-rate/system-status', authenticateToken, requireRole('super_admin'), getExchangeRateSystemStatus);
// Alertas de tipo de cambio
app.get('/api/admin/exchange-rate/alerts', authenticateToken, requireRole('super_admin'), getExchangeRateAlerts);
// Resolver alerta
app.put('/api/admin/exchange-rate/alerts/:id/resolve', authenticateToken, requireRole('super_admin'), resolveExchangeRateAlert);

// ============================================
// CARRUSEL DE LA APP MÓVIL
// ============================================
// Configuración de multer para imágenes del carrusel
// Usar memoria para poder subir a S3
const carouselStorage = multer.memoryStorage();
const carouselDiskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'carousel');
    // Crear directorio si no existe
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `slide-${uniqueSuffix}${ext}`);
  }
});

// Usar memoria si S3 está configurado, disco si no
const useS3 = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET);
const carouselUpload = multer({ 
  storage: useS3 ? carouselStorage : carouselDiskStorage, 
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo JPG, PNG, WEBP, GIF'));
    }
  }
});

// API Pública (para la app)
app.get('/api/carousel/slides', getActiveSlides);
app.post('/api/carousel/slides/:key/click', registerSlideClick);
// Admin - CRUD
app.get('/api/admin/carousel/slides', authenticateToken, requireRole('super_admin'), getAllSlides);
app.get('/api/admin/carousel/slides/:id', authenticateToken, requireRole('super_admin'), getSlideById);
app.post('/api/admin/carousel/slides', authenticateToken, requireRole('super_admin'), createSlide);
app.put('/api/admin/carousel/slides/:id', authenticateToken, requireRole('super_admin'), updateSlide);
app.delete('/api/admin/carousel/slides/:id', authenticateToken, requireRole('super_admin'), deleteSlide);
// Admin - Acciones especiales
app.put('/api/admin/carousel/reorder', authenticateToken, requireRole('super_admin'), reorderSlides);
app.patch('/api/admin/carousel/slides/:id/toggle', authenticateToken, requireRole('super_admin'), toggleSlideActive);
app.post('/api/admin/carousel/slides/:id/duplicate', authenticateToken, requireRole('super_admin'), duplicateSlide);
app.get('/api/admin/carousel/stats', authenticateToken, requireRole('super_admin'), getCarouselStats);
// Admin - Upload de imágenes
app.post('/api/admin/carousel/upload', authenticateToken, requireRole('super_admin'), carouselUpload.single('image'), uploadSlideImage);

// ============================================
// TESORERÍA SUCURSAL (Sistema de Caja Chica por Sucursal)
// Billeteras, movimientos, categorías y cortes de caja
// ============================================
import {
  getBilleterasSucursal,
  createBilletera,
  updateBilletera,
  getCategoriasFinancieras,
  createCategoriaFinanciera,
  getTesoreriaDashboard,
  getMovimientosFinancieros,
  registrarMovimiento,
  registrarTransferencia,
  abrirCorteCaja,
  cerrarCorteCaja,
  getHistorialCortes,
  auditarCorte,
} from './tesoreriaSucursalController';

// Dashboard y estadísticas
app.get('/api/tesoreria/sucursal/:sucursalId/dashboard', authenticateToken, getTesoreriaDashboard);

// Billeteras
app.get('/api/tesoreria/sucursal/:sucursalId/billeteras', authenticateToken, getBilleterasSucursal);
app.post('/api/tesoreria/billetera', authenticateToken, createBilletera);
app.put('/api/tesoreria/billetera/:id', authenticateToken, updateBilletera);

// Categorías financieras
app.get('/api/tesoreria/categorias', authenticateToken, getCategoriasFinancieras);
app.post('/api/tesoreria/categorias', authenticateToken, createCategoriaFinanciera);

// Movimientos
app.get('/api/tesoreria/sucursal/:sucursalId/movimientos', authenticateToken, getMovimientosFinancieros);
app.post('/api/tesoreria/sucursal/:sucursalId/movimientos', authenticateToken, registrarMovimiento);
app.post('/api/tesoreria/movimiento', authenticateToken, registrarMovimiento);
app.post('/api/tesoreria/transferencia', authenticateToken, registrarTransferencia);

// Cortes de caja
app.get('/api/tesoreria/sucursal/:sucursalId/cortes', authenticateToken, getHistorialCortes);
app.post('/api/tesoreria/corte/abrir', authenticateToken, abrirCorteCaja);
app.post('/api/tesoreria/corte/cerrar', authenticateToken, cerrarCorteCaja);
app.post('/api/tesoreria/corte/auditar', authenticateToken, auditarCorte);

// Upload de evidencias para tesorería
import { uploadToS3 } from './s3Service';
const evidenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

app.post('/api/uploads/evidence', authenticateToken, evidenceUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'No se proporcionó archivo' });
      return;
    }
    
    const timestamp = Date.now();
    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const key = `tesoreria/evidencias/${timestamp}_${req.user?.userId || 0}.${ext}`;
    
    const url = await uploadToS3(req.file.buffer, key, req.file.mimetype);
    
    res.json({ url, key });
  } catch (error) {
    console.error('Error uploading evidence:', error);
    res.status(500).json({ message: 'Error al subir evidencia' });
  }
});

// ============================================
// CAJA CC (Control de Cobros a Clientes)
// Módulo para gestión de pagos de clientes
// Soporta pagos parciales y multi-guía
// ============================================
app.get('/api/caja-chica/stats', authenticateToken, getCajaChicaStats);
app.get('/api/caja-chica/buscar-cliente', authenticateToken, buscarCliente);
app.get('/api/caja-chica/buscar-referencia', authenticateToken, buscarPorReferencia);
app.post('/api/caja-chica/confirmar-pago-referencia', authenticateToken, confirmarPagoReferencia);
app.get('/api/caja-chica/cliente/:clienteId/guias-pendientes', authenticateToken, getGuiasPendientesCliente);
app.get('/api/caja-chica/cliente/:clienteId/historial-pagos', authenticateToken, getHistorialPagosCliente);
app.post('/api/caja-chica/pago-cliente', authenticateToken, registrarPagoCliente);
app.post('/api/caja-chica/ingreso', authenticateToken, registrarIngreso);
app.post('/api/caja-chica/egreso', authenticateToken, registrarEgreso);
app.get('/api/caja-chica/transacciones', authenticateToken, getTransacciones);
app.get('/api/caja-chica/transacciones/:id', authenticateToken, getDetalleTransaccion);
app.get('/api/caja-chica/buscar-guia', authenticateToken, buscarGuiaParaCobro);
app.post('/api/caja-chica/corte', authenticateToken, realizarCorte);
app.get('/api/caja-chica/cortes', authenticateToken, getCortes);
app.post('/api/caja-chica/pagar-consolidacion', authenticateToken, pagarConsolidacionProveedor);

// ============================================
// DATOS FISCALES Y FACTURACIÓN CFDI 4.0
// Para emisión de facturas electrónicas con Facturapi
// ============================================
app.get('/api/fiscal/data', authenticateToken, getFiscalData);
app.post('/api/fiscal/data', authenticateToken, updateFiscalData);
app.get('/api/fiscal/catalogos/regimenes', authenticateToken, getRegimenesFiscales);
app.get('/api/fiscal/catalogos/usos-cfdi', authenticateToken, getUsosCFDI);
app.get('/api/fiscal/facturas', authenticateToken, getFacturasUsuario);
app.post('/api/fiscal/retry-invoice', authenticateToken, retryPendingInvoice);

// ============================================
// CUSTOMER SERVICE - CARTERA VENCIDA
// Gestión de cargos, descuentos y cartera vencida
// Incluye firma digital para abandono de mercancía
// ============================================
// Ajustes Financieros (Cargos/Descuentos)
app.get('/api/cs/ajustes/:servicio/:tracking', authenticateToken, getAjustesGuia);
app.post('/api/cs/ajustes', authenticateToken, createAjuste);
app.delete('/api/cs/ajustes/:id', authenticateToken, deleteAjuste);

// Cartera Vencida Dashboard
app.get('/api/cs/cartera/dashboard', authenticateToken, getCarteraDashboard);
app.get('/api/cs/cartera/cliente/:clienteId', authenticateToken, getCarteraCliente);
app.get('/api/cs/cartera/buscar', authenticateToken, searchGuiasCS);

// Resumen Financiero de Guía
app.get('/api/cs/guia/:servicio/:tracking/resumen', authenticateToken, getResumenFinancieroGuia);

// Abandono y Firma Digital
app.post('/api/cs/abandono/generar', authenticateToken, generarDocumentoAbandono);

// Solicitudes de Descuento
app.post('/api/cs/descuentos/solicitar', authenticateToken, createDiscountRequest);
app.get('/api/cs/descuentos/pendientes', authenticateToken, getDiscountRequests);
app.get('/api/cs/descuentos/stats', authenticateToken, getDiscountStats);
app.post('/api/cs/descuentos/:id/resolver', authenticateToken, resolveDiscountRequest);
app.get('/api/firma-abandono/:token', getDocumentoAbandono); // Público
app.post('/api/firma-abandono/:token', firmarDocumentoAbandono); // Público

// ============================================
// DOCUMENTOS LEGALES - Super Admin
// Gestión de contratos y avisos de privacidad
// ============================================
app.get('/api/legal-documents', authenticateToken, requireRole('super_admin'), getAllLegalDocuments);
app.get('/api/legal-documents/:type', authenticateToken, getLegalDocumentByType);
app.post('/api/legal-documents', authenticateToken, requireRole('super_admin'), createLegalDocument);
app.put('/api/legal-documents/:id', authenticateToken, requireRole('super_admin'), updateLegalDocument);
app.get('/api/legal-documents/:id/history', authenticateToken, requireRole('super_admin'), getLegalDocumentHistory);

// Endpoints públicos para apps
app.get('/api/public/legal/service-contract', getPublicServiceContract);
app.get('/api/public/legal/privacy-notice', getPublicPrivacyNotice);

// Manejador de rutas no encontradas (404) - Devolver JSON en lugar de HTML
app.use((_req: Request, res: Response) => {
  res.status(404).json({ 
    error: 'Endpoint no encontrado',
    message: 'La ruta solicitada no existe en esta API'
  });
});

// Manejador de errores global - Siempre devolver JSON
app.use((err: Error, _req: Request, res: Response, _next: any) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo salió mal'
  });
});

// Iniciar CRON Jobs para automatización
import { initCronJobs } from './cronJobs';

// Iniciar servidor (escuchar en todas las interfaces para acceso desde móvil)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 EntregaX API corriendo en http://localhost:${PORT}`);
  console.log(`📱 Acceso móvil: http://192.168.1.107:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Login: POST http://localhost:${PORT}/api/auth/login`);
  console.log(`📝 Registro: POST http://localhost:${PORT}/api/auth/register`);
  
  // Iniciar tareas programadas
  initCronJobs();
});
