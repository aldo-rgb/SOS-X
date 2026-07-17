// EntregaX Backend API v2.1.0
import './instrument'; // Sentry.init() ANTES de importar express
import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import axios from 'axios';
import { initSentry, errorReporter } from './sentry';
import {
  validateBody,
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  googleAuthSchema,
  appleAuthSchema,
  sendPhoneCodeSchema,
  verifyPhoneCodeSchema,
  createPaymentOrderSchema,
  capturePaymentOrderSchema,
  payPoboxInternalSchema,
  applyCreditPoboxSchema,
  applyWalletPoboxSchema,
  createMyAddressSchema,
  updateMyAddressSchema,
  setDefaultForServiceSchema,
  createClientAddressSchema,
  requestRepackSchema,
} from './validation/schemas';
import { paymentLimiter, verifyLimiter } from './rateLimiter';

// En producción se silencian logs de depuración/info para evitar exponer PII o payloads sensibles.
// Se conservan console.warn y console.error para operaciones.
if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEBUG_LOGS !== 'true') {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}

import { pool } from './db';
import { generateCommissionsForPackages, generateGexCommissionFromWarranty } from './commissionService';
import { translateTexts } from './translationController';
import { 
  registerUser, 
  loginUser, 
  getAllUsers, 
  getProfile, 
  authenticateToken,
  requireRole,
  requireMinLevel,
  getDashboardSummary,
  getBranchManagerDashboard,
  getCounterStaffDashboard,
  changePassword,
  forgotPassword,
  resetPassword,
  updateProfile,
  updateProfilePhoto,
  getAdvisors as getAdvisorsList,
  getMyAdvisor,
  assignAdvisor,
  updateUser,
  ROLES,
  AuthRequest,
  logoutUser,
  deleteMyAccount
} from './authController';
import { send2FACode, toggle2FA, changeEmail, notifyPhoneChanged } from './accountSecurityController';
import { googleAuth, appleAuth, socialAuthStatus } from './socialAuthController';
import {
  sendPhoneVerificationCode,
  verifyPhoneCode,
  phoneVerificationStatus,
} from './phoneVerificationController';
import { whatsappStatus, sendVerificationCodeWhatsapp } from './whatsappService';
import jsonwebtokenLib from 'jsonwebtoken';

/**
 * Middleware "optionalAuth" — decodifica JWT si viene, pero no rechaza si falta.
 * Útil para endpoints que sirven ambos: usuarios logueados (PUT phone) y
 * usuarios en flujo de registro (sin JWT todavía).
 */
const optionalAuth = (req: any, _res: any, next: any) => {
  try {
    const auth = req.headers?.authorization || '';
    let token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token && req.cookies?.token) token = req.cookies.token;
    if (token) {
      const decoded = jsonwebtokenLib.verify(
        token,
        process.env.JWT_SECRET || 'fallback_secret'
      ) as any;
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      };
    }
  } catch {
    // Token inválido → ignoramos silenciosamente
  }
  next();
};
import {
  createPackage,
  getPackages,
  getPackageByTracking,
  uploadNationalGuide,
  streamNationalGuide,
  uploadMaritimeNationalGuide,
  streamMaritimeNationalGuide,
  uploadDhlNationalGuide,
  streamDhlNationalGuide,
  updatePackageStatus,
  getPackageChildren,
  getPackagesByClient,
  getPackageStats,
  getPackageLabels,
  getMyPackages,
  setPackageLabel,
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
  updatePackageClient,
  getPackageMovementsByTracking,
  getPackageMovementsById,
  deletePackage,
  batchAttachImage,
  startBulkMaster,
  addBulkBoxToMaster,
  updateBulkMaster,
  removeBulkBoxFromMaster,
  notifyBulkMasterReception,
  cancelBulkMaster,
  getUnassignedPackages,
  searchClients
} from './packageController';
import {
  uploadConstancia as csfUploadHandler,
  getConstanciaStatus as csfStatusHandler,
  uploadConstanciaForClient as csfUploadForClientHandler,
  getClientConstanciaStatus as csfClientStatusHandler,
} from './fiscalConstanciaController';
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
  getVerificationDetails,
  approveVerification,
  rejectVerification,
  reanalyzeVerification,
  getVerificationStats,
  verifyLegacyTerms
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
  setDefaultPaymentMethod,
  getAdvisorClientAddresses,
  setAdvisorClientDefaultForService,
  createAdvisorClientAddress,
  deleteAdvisorClientAddress
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
  toggleAdvisorRecovery,
  toggleAdvisorActive,
} from './commissionController';
import {
  getFiscalEmitters,
  createFiscalEmitter,
  updateFiscalEmitter,
  deleteFiscalEmitter,
  assignEmitterToService,
  getUserFiscalProfiles,
  createFiscalProfile,
  updateFiscalProfile,
  deleteFiscalProfile,
  generateInvoice,
  getUserInvoices,
  getAllInvoices,
  cancelInvoice,
  getInvoiceCancellationStatus,
  respondInvoiceCancellation,
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
  getWidgetToken as getBelvoWidgetToken,
  registerLink as registerBelvoLink,
  getLinks as getBelvoLinks,
  deleteLinkHandler as deleteBelvoLink,
  syncTransactions as syncBelvoTransactions,
  getTransactions as getBelvoTransactions,
  getStats as getBelvoStats,
  manualMatch as belvoManualMatch,
  ignoreTransaction as belvoIgnoreTransaction,
  webhookHandler as handleBelvoWebhook,
} from './belvoController';
import {
  getWidgetToken as getSyncfyWidgetToken,
  registerLink as registerSyncfyLink,
  getLinks as getSyncfyLinks,
  deleteLinkHandler as deleteSyncfyLink,
  syncTransactions as syncSyncfyTransactions,
  getStats as getSyncfyStats,
  manualMatch as syncfyManualMatch,
  ignoreTransaction as syncfyIgnoreTransaction,
  webhookHandler as handleSyncfyWebhook,
} from './syncfyController';
import {
  getFacturamaConfig,
  saveFacturamaConfig,
  testFacturamaConnection,
  syncFacturamaReceived,
  registerFacturamaWebhook,
  syncFacturamaPortal,
  handleFacturamaWebhook,
  listAccountsPayable,
  approveAccountPayable,
  rejectAccountPayable,
  markPayablePaid,
} from './facturamaController';
import {
  getFacturapiConfig,
  saveFacturapiConfig,
  testFacturapiConnection,
  syncFacturapiReceived,
  downloadFacturapiAttachment,
  handleFacturapiWebhook,
  runFacturapiSyncAll,
} from './facturapiController';
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
  createPaymentRequest as _createEntangledRequestV1Unused,
  getMyPaymentRequests as getMyEntangledRequests,
  getPaymentRequestDetail as getEntangledRequestDetail,
  getAllPaymentRequests as getAllEntangledRequests,
  webhookFacturaGenerada as entangledWebhookFactura,
  webhookPagoProveedor as entangledWebhookProveedor,
  listMySuppliers as listMyEntangledSuppliers,
  createMySupplier as createMyEntangledSupplier,
  updateMySupplier as updateMyEntangledSupplier,
  deleteMySupplier as deleteMyEntangledSupplier,
  getMyFiscalProfile as getMyEntangledFiscalProfile,
  upsertMyFiscalProfile as upsertMyEntangledFiscalProfile,
  getPricingConfig as getEntangledPricingConfig,
  updatePricingConfig as updateEntangledPricingConfig,
  quotePayment as quoteEntangledPayment,
  uploadProofToRequest as uploadEntangledProof,
  listUserPricing as listEntangledUserPricing,
  upsertUserPricing as upsertEntangledUserPricing,
  deleteUserPricing as deleteEntangledUserPricing,
  listProviders as listEntangledProviders,
  listActiveProvidersPublic as listEntangledProvidersPublic,
  createProvider as createEntangledProvider,
  updateProvider as updateEntangledProvider,
  deleteProvider as deleteEntangledProvider,
  adminListSuppliersAggregated as adminListEntangledSuppliers,
  adminGetSupplierDetail as adminGetEntangledSupplierDetail,
} from './entangledController';
import {
  createPaymentRequestV2 as createEntangledRequestV2,
  createAdvisorXpayRequest,
  getAdvisorXpayClients,
  getAdvisorXpayRequests,
  deleteAdvisorXpayRequest,
  getAdvisorXpaySuppliers,
  createAdvisorXpaySupplier,
  updateAdvisorXpaySupplier,
  deleteAdvisorXpaySupplier,
  getAdvisorXpayFiscalProfile,
  upsertAdvisorXpayFiscalProfile,
  getExchangeRate as getEntangledExchangeRate,
  searchConceptosProxy as searchEntangledConceptos,
  asignacionProxy as entangledAsignacion,
  syncRequestFromEntangled as entangledSyncRequest,
  proxyEntangledDocumento as entangledProxyDocumento,
  cleanupTestRequests as entangledCleanupRequests,
  getServiceConfigAdmin as getEntangledServiceConfigAdmin,
  updateServiceConfig as updateEntangledServiceConfig,
  getMyServiceConfig as getMyEntangledServiceConfig,
  listUserServicePricing as listEntangledUserServicePricing,
  upsertUserServicePricing as upsertEntangledUserServicePricing,
  deleteUserServicePricing as deleteEntangledUserServicePricing,
  webhookFacturaGeneradaV2 as entangledWebhookFacturaV2,
  webhookPagoProveedorV2 as entangledWebhookProveedorV2,
  webhookOrdenesV2 as entangledWebhookOrdenesV2,
  rotateApiKeyAdmin as rotateEntangledApiKey,
  syncProveedoresFromRemote as syncEntangledProveedoresFromRemote,
  listClaveSatHistory as listEntangledClaveSatHistory,
} from './entangledControllerV2';
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
import { quotePOBox, quoteAirChina } from './quoteController';
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
  getSupervisorAuthorizations,
  listSupervisors,
  adminSetSupervisorPin,
  adminGenerateSupervisorPin,
  getMySupervisorPin
} from './warehouseController';
import {
  listAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
  uploadAssetFile,
  markMaintenanceDone,
} from './branchAssetsController';
import {
  scanPackageToLoad,
  getDriverRouteToday,
  scanPackageReturn,
  getPackagesToReturn,
  confirmDelivery,
  confirmDeliveryBulk,
  getDeliveriesToday,
  verifyPackageForDelivery,
  checkCarrierGuideAvailable,
  paqueteriaHandoffScan
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
  pagarConsolidacionProveedor,
  pagarMultiplesConsolidaciones,
  deleteTransaccion,
  updateTransaccion,
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
  searchClients as searchClientsWarranty
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
  getAdvisorUnreadCount,
  getAdvisorPackages,
  assignAdvisorShipmentInstructions,
  assignClientToPackage,
  getAdvisorShipmentDetail
} from './advisorPanelController';
import {
  requestAdvisor,
  lookupAdvisor,
  getCrmLeads,
  getAvailableAdvisors,
  assignAdvisorManually,
  updateLeadStatus,
  createLeadFromSupport,
  bulkWhatsapp,
  getBulkWhatsappDefaults,
  getLeadGroups,
  createLeadGroup,
  deleteLeadGroup,
  addLeadsToGroup,
  removeLeadsFromGroup,
  getBlacklist,
  addToBlacklist,
  removeFromBlacklist,
  updateLeadPhone,
  assignLeadAdvisor,
  getBulkTemplates,
  createBulkTemplate,
  updateBulkTemplate,
  deleteBulkTemplate,
  uploadBulkTemplateImage,
  trackClickRedirect,
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
  bulkCreateProspects,
  getSalesReport,
  getSalesReportByAdvisor,
  getSalesReportServiceItems,
  getChurnReport,
  getCRMDashboard,
  getAdvisorsForCRM,
  getTeamLeaders,
  changeClientAdvisor,
  resetClientPassword,
  toggleClientActive,
  toggleClientBroker
} from './crmController';
import {
  getWelcomeKits,
  searchKitClient,
  createWelcomeKit,
  updateWelcomeKit,
  deleteWelcomeKit,
  getKitProducts,
  createKitProduct,
  updateKitProduct,
  deleteKitProduct,
  uploadKitProductPhoto,
  getMyKit,
  selectKitGift,
} from './welcomeKitController';
import {
  getSequences,
  updateSequence,
  enrollInSequence,
  unenrollFromSequence,
} from './waSequenceController';
import {
  verifyWhatsappWebhook,
  handleWhatsappWebhook,
  debugWabaSubs,
} from './whatsappWebhookController';
import {
  handleSupportMessage,
  getMyTickets,
  getTicketMessages,
  clientReplyTicket,
  getAdminTickets,
  getSupportStats,
  adminReplyTicket,
  resolveTicket,
  reactivateTicket,
  assignTicket,
  archiveTicket,
  uploadSupportImages,
  uploadAdminReplyFiles,
  aiEnhanceMessage,
  aiTranslateMessage,
  validateTracking,
  submitBoxIdClaim,
  uploadBoxIdClaimFiles,
  getBoxIdClaims,
  resolveBoxIdClaim,
  getDepartments,
  getSupportAgents,
  transferTicket,
  getAdminTicketMessages,
  ensureDepartmentsSchema,
  signSupportImage,
  createFormalQuoteRequest,
  uploadFormalQuoteFiles,
  createAdvisorQuoteRequest,
  uploadAdvisorQuoteFiles,
} from './supportController';
import {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  archiveNotification,
  archiveAllNotifications,
  archiveBulkNotifications,
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
  listTrajectoryNames,
  recalcChinaStatuses,
  getChinaStatusHistory,
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
  getContainerStatusHistory,
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
  getContainerProfitBreakdown,
  getWeekSavedAddresses,
  assignWeekContainerAddress,
  updateContainerReference,
  updateContainerSalePrice,
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
  getAnticiposStats,
  updateReferenciaMonto,
  revalidarReferenciasBolsa,
  desasignarReferencia,
  setAjusteMontoAnticipo
} from './anticiposController';
import {
  getProveedoresTransporte,
  createProveedorTransporte,
  updateProveedorTransporte,
  getBolsasTransporte,
  createBolsaTransporte,
  deleteBolsaTransporte,
  getReferenciasByBolsaTransporte,
  getTransporteByContainer,
  getReferenciasValidasTransporte,
  getStatsTransporte
} from './transporteController';
import {
  getProveedoresDemora,
  createProveedorDemora,
  updateProveedorDemora,
  getBolsasDemora,
  createBolsaDemora,
  deleteBolsaDemora,
  getReferenciasByBolsaDemora,
  getDemoraByContainer,
  getReferenciasValidasDemora,
  getStatsDemora
} from './demoraController';
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
  saveAirStartupTiers,
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
  getTdiProductTypes,
  getTdiStats,
  listTdiShipments,
  uploadTdiPhotos,
  getTdiShipmentDetail,
  deleteTdiShipment,
  updateTdiShipment,
  startTdiSerial,
  addTdiBox,
  listTdiInTransit,
  updateTdiAwb,
  removeTdiBox,
  updateTdiBox,
  listTdiOutboundReady,
  dispatchTdiBoxes,
} from './tdiExpressController';
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
  chat as cajitoChat,
  getMyConversations as cajitoGetMyConversations,
  getConversation as cajitoGetConversation,
  getAudit as cajitoGetAudit,
  getHealth as cajitoGetHealth,
  getMyAccess as cajitoGetMyAccess,
  clientLookup as cajitoClientLookup,
  ticketLookup as cajitoTicketLookup,
} from './cajitoController';
import {
  listAwbCosts,
  getAwbCostDetail,
  saveAwbCosts,
  getAwbCostStats,
  getAwbCostProfit,
  calcReleaseCosts,
  deleteAwbCost,
  updateAwbCostReference,
  uploadAwbDocument,
  handleAwbDocumentUpload
} from './airWaybillCostController';
import {
  listInTransitAwbs,
  getAwbPackages,
  scanAwbPackage,
  finalizeAwbReception,
  getAirInventory
} from './airWaybillReceptionController';
import {
  listInTransitContainers,
  getContainerOrders,
  scanContainerOrder,
  finalizeContainerReception,
  reportPartialBoxes,
  getSeaInventory
} from './maritimeContainerReceptionController';
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
  updateOrderStatus as updateMaritimeOrderStatus,
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
  requireElpApiKey,
  elpListContainers,
  elpGetDocuments,
  elpDownloadZip,
  elpReceiveStatus,
  elpAdminListContainers,
  elpAdminStats,
  elpAdminResendNotify,
  elpAdminGetSettings,
  elpAdminUpdateSettings,
} from './elpController';
import {
  importLegacyClients,
  getLegacyClients,
  getLegacyStats,
  claimLegacyAccount,
  verifyLegacyBox,
  verifyLegacyName,
  deleteLegacyClient,
  getLegacyClientExternalData,
  proxyIneImage,
  getLegacyQuotesPendings,
  setChartback,
  setChartbackI,
  getAdvisorChartbackClients,
  getAdvisorChartbackClientCargo,
  getAdvisorChartbackHistory,
  chartbackAction,
  assignChartbackAdvisor,
  getAdminChartbackClients,
  getChartbackClientCargo,
  adminMarkRecovered,
  uploadMiddleware,
  syncExternalLegacyClients,
  listCustomersForExternalSync
} from './legacyController';
import {
  listWallets as pcListWallets,
  getWalletDetail as pcGetWalletDetail,
  fundBranch as pcFundBranch,
  advanceDriver as pcAdvanceDriver,
  acceptAdvance as pcAcceptAdvance,
  listMyAdvances as pcListMyAdvances,
  registerExpense as pcRegisterExpense,
  registerBranchExpense as pcRegisterBranchExpense,
  getMyWallet as pcGetMyWallet,
  listPendingExpenses as pcListPendingExpenses,
  approveExpense as pcApproveExpense,
  rejectExpense as pcRejectExpense,
  closeRouteSettlement as pcCloseRouteSettlement,
  listSettlements as pcListSettlements,
  listAssignableDrivers as pcListDrivers,
  listBranchesWithBalance as pcListBranches,
  getPettyCashStats as pcGetStats,
  getCategories as pcGetCategories,
  listRouteBlocks as pcListRouteBlocks,
  createRouteBlock as pcCreateRouteBlock,
  finalizeRouteBlock as pcFinalizeRouteBlock,
  listAllRouteBlocks as pcListAllRouteBlocks,
  deleteMovement as pcDeleteMovement,
  updateMovement as pcUpdateMovement,
} from './pettyCashController';
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
  getTopReferrers,
  getAllReferidos,
  updateReferralSettings
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
  checkOpenpayAvailable,
  createPayPalPayment,
  createBranchPayment,
  testConfirmPayment,
  handleOpenpayPaymentCallback,
  verifyOpenpayCharge,
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
  pqtxGenerateForPackage,
  pqtxOcurreQuote,
} from './paqueteExpressController';
import {
  getMaritimeOrderBoxes,
  upsertMaritimeOrderBox,
  generatePqtxForMaritimeOrder,
} from './relabelingMaritimeController';
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
import { listExcludedZips, addExcludedZip, removeExcludedZip } from './mtyMetroController';
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
  getDhlProfitability,
  deleteDhlShipment,
  updateDhlShipmentProductType,
  getDhlImportTaxSetting,
  getDhlImportTaxExpenses,
  updateDhlImportTaxSetting,
  updateDhlShipmentStatus
} from './dhlController';
import {
  getPrivacyNotice,
  getAdvisorPrivacyNotice,
  acceptPrivacyNotice,
  acceptAdvisorPrivacyNotice,
  saveEmployeeOnboarding,
  checkIn,
  checkOut,
  reopenCheckout,
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
  deleteVehicleHandler,
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
  checkUpcomingMaintenance,
  proxyVehicleFile
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
  // Saldo a favor
  createSaldoFavorRequest,
  getSaldoFavorRequests,
  getSaldoFavorStats,
  resolveSaldoFavorRequest,
  // Cron helpers
  actualizarCarteraVencida,
  sincronizarCartera,
  // Abandono
  getAbandonosListosProceso,
  // Reasignación de cliente
  reassignPackageClient
} from './customerServiceController';
import {
  getAllLegalDocuments,
  getLegalDocumentByType,
  updateLegalDocument,
  createLegalDocument,
  getLegalDocumentHistory,
  restoreLegalDocumentVersion,
  getPublicServiceContract,
  getPublicPrivacyNotice,
  getPublicAdvisorPrivacyNotice,
  renderPublicPrivacyPoliciesPage,
  renderAccountDeletionPage
} from './legalDocumentsController';
import {
  createPoboxPaypalPayment,
  capturePoboxPaypalPayment,
  createPoboxOpenpayPayment,
  createPoboxCashPayment,
  getPoboxPaymentStatus,
  confirmPoboxCashPayment,
  handlePoboxOpenpayWebhook,
  generateInvoiceForPoboxPaymentByRef,
  markMastersPaidIfChildrenPaid,
  handlePoboxOpenpayCallback,
  getPoboxPendingPayments,
  getPoboxPaymentHistory,
  cancelPoboxPaymentOrder,
  payPoboxOrderInternal,
  applyCreditToPoboxOrder,
  revertCreditFromPoboxOrder,
  applyWalletToPoboxOrder,
  revertWalletFromPoboxOrder,
  normalizeServiceForCredit
} from './poboxPaymentController';
import {
  getMyEmitters,
  getPendingStampSummary,
  getEmitterSummary,
  listEmitterInvoices,
  downloadEmittedInvoiceFile,
  listPendingStamp,
  archivePendingStamp,
  resendInvoiceEmail,
  emitManualCFDI,
  searchFiscalClients,
  createManualInvoice,
  listAccountants,
  grantAccountantPermission,
  revokeAccountantPermission,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustProductStock,
  cancelEmittedInvoice,
  deleteEmittedInvoice,
  listReceivedInvoices,
  getReceivedInvoiceDetail,
  uploadReceivedInvoice,
  importReceivedInvoiceToInventory,
  deleteReceivedInvoice,
  listBankMovements,
  syncBankMovements,
} from './accountingController';
import {
  listInTransitConsolidations,
  getConsolidationPackages,
  receiveConsolidation,
  getDelayedPackages,
  getPartialReceptions,
  markPackageAsFound,
  markPackageAsLost,
  markPackagesAsLostBulk,
  getLostPackages,
} from './poboxConsolidationController';
import {
  uploadVoucher, confirmVoucherAmount, completeVoucherPayment,
  getOrderVouchers, deleteVoucher,
  getAdminPendingVouchers, getAdminOrderVouchers, approveVoucher, rejectVoucher,
  getVoucherStats, getServiceWalletBalances
} from './voucherController';
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

// ============================================
// HELPER: Activar warranties GEX automáticamente cuando los paquetes se pagan
// ============================================
async function activateGexForPaidPackages(packageIds: number[]): Promise<void> {
  try {
    if (!packageIds || packageIds.length === 0) return;
    // Find packages with GEX that have a gex_folio
    const result = await pool.query(`
      SELECT DISTINCT gex_folio FROM packages 
      WHERE id = ANY($1) AND has_gex = true AND gex_folio IS NOT NULL
    `, [packageIds]);
    
    if (result.rows.length === 0) return;
    
    const folios = result.rows.map((r: any) => r.gex_folio);
    
    // Also check maritime_orders and dhl_shipments for GEX
    const maritimeResult = await pool.query(`
      SELECT DISTINCT gex_folio FROM maritime_orders 
      WHERE gex_folio = ANY($1) AND has_gex = true
    `, [folios]);
    
    // Activate warranties that are still pending
    const updated = await pool.query(`
      UPDATE warranties
      SET status = 'active', activated_at = NOW(), paid_at = COALESCE(paid_at, NOW())
      WHERE gex_folio = ANY($1) AND status IN ('generated', 'pending_payment')
      RETURNING gex_folio, id
    `, [folios]);

    if (updated.rowCount && updated.rowCount > 0) {
      console.log(`🛡️ GEX auto-activadas: ${updated.rows.map((r: any) => r.gex_folio).join(', ')}`);
      // Generar comisiones GEX del asesor (idempotente).
      for (const r of updated.rows) {
        generateGexCommissionFromWarranty(Number(r.id)).catch((err: any) =>
          console.error('Error comisión GEX auto-activación:', err)
        );
      }
    }
  } catch (err: any) {
    console.error('Error activando GEX automáticamente:', err.message);
  }
}

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Sentry: capturar errores no manejados (no-op si no hay SENTRY_DSN)
initSentry(app);

const allowedOrigins = [
  ...(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  process.env.FRONTEND_URL,
  // Dominios de producción conocidos
  'https://entregax.app',
  'https://www.entregax.app',
  'https://admin.entregax.app',
  'https://app.entregax.app',
  'https://x-pay.direct',
  'https://www.x-pay.direct',
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean) as string[];

const uniqueAllowedOrigins = Array.from(new Set(allowedOrigins));

// Patrones regex (subdominios Vercel, dominios propios).
// Se puede extender vía CORS_ALLOWED_ORIGIN_PATTERNS (coma-separado, regex).
const allowedOriginPatterns: RegExp[] = [
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)?entregax\.app$/i,
  ...(process.env.CORS_ALLOWED_ORIGIN_PATTERNS || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      try { return new RegExp(p); } catch { return null; }
    })
    .filter(Boolean) as RegExp[],
];
const bodyLimit = process.env.BODY_LIMIT || '50mb';

const authRateWindowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const authRateMax = Number(process.env.AUTH_RATE_LIMIT_MAX || 20);
const authRateStore = new Map<string, { count: number; resetAt: number }>();

const authRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const item = authRateStore.get(key);

  if (!item || now > item.resetAt) {
    authRateStore.set(key, { count: 1, resetAt: now + authRateWindowMs });
    return next();
  }

  if (item.count >= authRateMax) {
    return res.status(429).json({
      error: 'Demasiados intentos. Intenta de nuevo más tarde.',
    });
  }

  item.count += 1;
  authRateStore.set(key, item);
  next();
};

setInterval(() => {
  const now = Date.now();
  for (const [key, item] of authRateStore.entries()) {
    if (now > item.resetAt) {
      authRateStore.delete(key);
    }
  }
}, 60 * 1000);

// Middlewares
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.set('etag', false);

// Helmet: CSP + headers de seguridad estandarizados.
// crossOriginResourcePolicy 'cross-origin' permite servir /uploads desde otros orígenes.
// CSP en "report-only" inicialmente para no romper inline-styles de MUI/Recharts.
app.use(helmet({
  contentSecurityPolicy: false, // habilitar gradualmente cuando todo esté nonce-ificado
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
}));

// cookie-parser: necesario para leer la cookie HttpOnly 'token' como fallback
// cuando el cliente web ya migró a sesión por cookie. La app móvil sigue usando
// Bearer header (no envía cookies), así que ambos mundos conviven.
app.use(cookieParser(process.env.COOKIE_SECRET || process.env.JWT_SECRET || 'fallback_cookie_secret'));

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

app.use((_req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);
  (res as any).json = (payload: any) => {
    // Sanitización deshabilitada temporalmente para debug de onboarding
    return originalJson(payload);
  };
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (uniqueAllowedOrigins.length === 0 || uniqueAllowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (allowedOriginPatterns.some((re) => re.test(origin))) {
      return callback(null, true);
    }
    console.warn(`[CORS] Origen bloqueado: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-App-Version', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
  credentials: true,
}));

app.use(express.json({
  limit: bodyLimit,
  // Capturamos el raw body para verificación HMAC de webhooks (ENTANGLED, etc.)
  verify: (req: any, _res, buf: Buffer) => {
    if (buf && buf.length) req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ limit: bodyLimit, extended: true }));
app.use(express.text({ limit: bodyLimit, type: ['text/plain', 'text/html'] })); // Para callbacks encriptados de MoJie

// Servir archivos estáticos de uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── TESTER USERS ─────────────────────────────────────────────────────────────
// Usuarios "tester": inmunes a todos los toggles globales del Sistema de Pagos
// y al modo mantenimiento. Útil para validar funcionalidad en producción
// mientras el resto del sistema esté apagado para clientes reales.
// Se puede ampliar vía env var TESTER_EMAILS (CSV).
const TESTER_EMAILS = new Set<string>(
  [
    'aldocampos@entregax.com',
    'aldocampos@grupolsd.com',
    ...((process.env.TESTER_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)),
  ].map(e => e.toLowerCase())
);

export function isTesterEmail(email?: string | null): boolean {
  return !!email && TESTER_EMAILS.has(String(email).toLowerCase().trim());
}

/**
 * Decodifica el JWT del request (Authorization: Bearer o cookie 'token')
 * sin lanzar excepción. Devuelve null si no hay token válido.
 */
function decodeRequestJwt(req: Request): { userId?: number; email?: string; role?: string } | null {
  try {
    const auth = req.headers.authorization;
    let token: string | null = (auth && auth.startsWith('Bearer ')) ? auth.slice(7) : null;
    if (!token) {
      const cookieToken = (req as any).cookies?.token;
      if (cookieToken) token = cookieToken;
    }
    if (!token) return null;
    return jsonwebtokenLib.verify(token, process.env.JWT_SECRET || 'fallback_secret') as any;
  } catch {
    return null;
  }
}

/** True si el request viene de un usuario tester (por JWT). */
async function isTesterRequest(req: Request): Promise<boolean> {
  const decoded = decodeRequestJwt(req);
  if (!decoded) return false;
  if (isTesterEmail(decoded.email)) return true;
  // Fallback: si el JWT no trae email (poco probable), consultar DB.
  if (decoded.userId) {
    try {
      const r = await pool.query('SELECT email FROM users WHERE id = $1 LIMIT 1', [decoded.userId]);
      return isTesterEmail(r.rows[0]?.email);
    } catch { return false; }
  }
  return false;
}

// ── MAINTENANCE MODE ─────────────────────────────────────────────────────────
let _maintenanceCache: { enabled: boolean; ts: number } | null = null;
const MAINTENANCE_CACHE_TTL_MS = 10_000;

async function isMaintenanceModeEnabled(): Promise<boolean> {
  const now = Date.now();
  if (_maintenanceCache && now - _maintenanceCache.ts < MAINTENANCE_CACHE_TTL_MS) {
    return _maintenanceCache.enabled;
  }
  try {
    const r = await pool.query(
      `SELECT config_value FROM system_configurations WHERE config_key = 'maintenance_mode' AND is_active = TRUE LIMIT 1`
    );
    const enabled = r.rows[0]?.config_value?.enabled === true;
    _maintenanceCache = { enabled, ts: now };
    return enabled;
  } catch {
    return false;
  }
}

app.use(async (req: Request, res: Response, next: NextFunction) => {
  if (
    req.path === '/health' ||
    req.path === '/api/system/payment-status' ||
    req.path.startsWith('/api/admin/system/maintenance')
  ) return next();

  const maintenance = await isMaintenanceModeEnabled();
  if (!maintenance) return next();

  const decoded = decodeRequestJwt(req);
  if (decoded) {
    // Admins/super_admins siempre pueden entrar
    if (decoded.role === 'super_admin' || decoded.role === 'admin') return next();
    // Usuarios tester: inmunes al modo mantenimiento
    if (isTesterEmail(decoded.email)) return next();
  }
  res.status(503).json({ error: 'Sistema en mantenimiento. Por favor intenta de nuevo más tarde.', maintenance: true });
});
// ─────────────────────────────────────────────────────────────────────────────

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

// Diagnóstico de Sentry: revela si el SDK está activo + dispara error de prueba.
// Protegido por header X-Sentry-Test-Token = process.env.SENTRY_TEST_TOKEN
app.get('/api/_sentry-diagnostic', (req: Request, res: Response) => {
  const token = req.header('x-sentry-test-token');
  const expected = process.env.SENTRY_TEST_TOKEN;
  if (!expected || token !== expected) {
    return res.status(404).json({ error: 'Not found' });
  }
  const dsnConfigured = Boolean(process.env.SENTRY_DSN);
  const mode = req.query.mode as string | undefined;
  if (mode === 'throw') {
    // Forzar error no manejado -> debe llegar a Sentry vía setupExpressErrorHandler
    throw new Error('SENTRY_DIAGNOSTIC_TEST_ERROR: este error es de prueba, debe aparecer en Sentry');
  }
  return res.status(200).json({
    sentry_dsn_configured: dsnConfigured,
    node_env: process.env.NODE_ENV || 'development',
    sentry_release: process.env.SENTRY_RELEASE || null,
    hint: dsnConfigured
      ? 'Sentry SDK debería estar activo. Llama de nuevo con ?mode=throw para forzar un evento de prueba.'
      : 'SENTRY_DSN no está configurado. Agrégalo en Railway → Variables.',
  });
});

// DEBUG: Verificar conexión a base de datos
app.get('/health/db', authenticateToken, requireRole('super_admin'), async (_req: Request, res: Response) => {
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
// GET /api/s3/sign?url=<s3url> — firma una URL privada de S3 (cualquier rol autenticado)
app.get('/api/s3/sign', authenticateToken, async (req: Request, res: Response) => {
  const url = String(req.query.url || '').trim();
  if (!url) return res.status(400).json({ error: 'url requerida' });
  try {
    const { signS3UrlIfNeeded } = await import('./s3Service');
    const signed = await signS3UrlIfNeeded(url, 3600);
    return res.json({ signed_url: signed || url });
  } catch (e: any) {
    return res.json({ signed_url: url }); // fallback: devolver la URL original
  }
});

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

// Migración: MJCustomer FCL sync (pageByClearance)
app.get('/api/migrate/mjcustomer-fcl', async (_req: Request, res: Response) => {
  try {
    await pool.query(`
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS mj_container_id BIGINT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS mj_last_sync TIMESTAMP;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS cn_status_en TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS cn_status_ch TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS service_type TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS planned_departure TIMESTAMP;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS actual_departure TIMESTAMP;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS actual_arrival TIMESTAMP;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS unloaded_at TIMESTAMP;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS delivery_pdf_url TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS port_name TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS ship_carrier_code TEXT;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_containers_container_number
          ON containers (container_number) WHERE container_number IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_containers_bl_number
          ON containers (bl_number) WHERE bl_number IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_containers_mj_container_id
          ON containers (mj_container_id) WHERE mj_container_id IS NOT NULL;
    `);
    // Índice para acelerar route-today del repartidor: la subconsulta
    // NOT EXISTS (... master_id = p.id) hacía seq scan por fila (O(n²)).
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_packages_master_id
          ON packages (master_id) WHERE master_id IS NOT NULL;
    `);
    // Índices para el escaneo de carga del repartidor (scanPackageToLoad): el
    // match por tracking usaba to_jsonb + seq scan (~19s). Con estos índices
    // funcionales el match exacto case-insensitive es instantáneo.
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_packages_tracking_provider ON packages (tracking_provider) WHERE tracking_provider IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_packages_child_no ON packages (child_no) WHERE child_no IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_packages_ti_upper ON packages (UPPER(tracking_internal));
      CREATE INDEX IF NOT EXISTS idx_packages_tp_upper ON packages (UPPER(tracking_provider));
      CREATE INDEX IF NOT EXISTS idx_packages_cn_upper ON packages (UPPER(child_no));
      CREATE INDEX IF NOT EXISTS idx_packages_current_branch_id ON packages (current_branch_id) WHERE current_branch_id IS NOT NULL;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mjcustomer_sync_log (
        id SERIAL PRIMARY KEY,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMP,
        triggered_by TEXT NOT NULL,
        items_fetched INTEGER NOT NULL DEFAULT 0,
        items_created INTEGER NOT NULL DEFAULT 0,
        items_updated INTEGER NOT NULL DEFAULT 0,
        items_conflict INTEGER NOT NULL DEFAULT 0,
        pages_fetched INTEGER NOT NULL DEFAULT 0,
        success BOOLEAN NOT NULL DEFAULT FALSE,
        error_message TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mj_sync_log_started_at
          ON mjcustomer_sync_log (started_at DESC);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mjcustomer_sync_conflicts (
        id SERIAL PRIMARY KEY,
        detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
        conflict_type TEXT NOT NULL,
        mj_container_id BIGINT,
        cabinet_no TEXT,
        bill_no TEXT,
        existing_container_id INTEGER REFERENCES containers(id) ON DELETE SET NULL,
        payload JSONB,
        resolved BOOLEAN NOT NULL DEFAULT FALSE,
        resolved_at TIMESTAMP,
        resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mj_sync_conflicts_unresolved
          ON mjcustomer_sync_conflicts (resolved, detected_at DESC);
    `);
    res.json({ success: true, message: 'Migración MJCustomer FCL aplicada: columnas + indices + tablas log/conflicts' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Preview de revert: lista los contenedores creados por el sync MJCustomer
// que son candidatos a borrar (sin actividad operativa propia en nuestro sistema).
app.get('/api/migrate/mjcustomer-fcl-revert-preview', async (_req: Request, res: Response) => {
  try {
    const safe = await pool.query(`
      SELECT c.id, c.container_number, c.bl_number, c.mj_container_id,
             c.created_at, c.status, c.eta,
             (SELECT COUNT(*)::int FROM maritime_shipments p WHERE p.container_id = c.id) AS packages_count,
             (SELECT COUNT(*)::int FROM container_costs cc WHERE cc.container_id = c.id) AS costs_count
        FROM containers c
       WHERE c.mj_container_id IS NOT NULL
         AND (c.eta IS NULL OR c.eta < CURRENT_DATE)
       ORDER BY c.created_at DESC
    `);
    const rows = safe.rows;
    const deletable = rows.filter((r: any) => (r.packages_count || 0) === 0);
    const blocked = rows.filter((r: any) => (r.packages_count || 0) > 0);
    res.json({
      success: true,
      total_synced: rows.length,
      deletable_count: deletable.length,
      blocked_count: blocked.length,
      deletable_sample: deletable.slice(0, 10),
      blocked_sample: blocked.slice(0, 10),
      hint: 'POST /api/migrate/mjcustomer-fcl-revert?confirm=YES_DELETE para borrar los deletable',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Revert real: borra los contenedores creados por el sync MJCustomer que no
// tienen paquetes asociados (operacion no iniciada en nuestro sistema).
// Requiere ?confirm=YES_DELETE en la URL para evitar borrados accidentales.
app.post('/api/migrate/mjcustomer-fcl-revert', async (req: Request, res: Response) => {
  try {
    if (req.query.confirm !== 'YES_DELETE') {
      return res.status(400).json({
        success: false,
        error: 'Falta confirm=YES_DELETE en la URL para autorizar el borrado.',
      });
    }
    // Identificar candidatos: contenedores creados por el sync MJCustomer,
    // sin paquetes y con ETA pasada/nula (carga historica/entregada que no
    // pertenece a nuestra operacion activa).
    const candidates = await pool.query(`
      SELECT c.id
        FROM containers c
       WHERE c.mj_container_id IS NOT NULL
         AND (c.eta IS NULL OR c.eta < CURRENT_DATE)
         AND NOT EXISTS (SELECT 1 FROM maritime_shipments p WHERE p.container_id = c.id)
    `);
    const ids = candidates.rows.map((r: any) => r.id);
    if (ids.length === 0) {
      return res.json({ success: true, deleted: 0, message: 'No hay contenedores que revertir.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Limpiar TODAS las tablas que tengan FK hacia containers(id).
      // Enumeramos las FKs dinamicamente para no perder ninguna tabla.
      const fkRes = await client.query(`
        SELECT
          tc.table_name AS referencing_table,
          kcu.column_name AS referencing_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'containers'
          AND ccu.column_name = 'id'
          AND tc.table_name <> 'containers'
      `);
      const cleanup = fkRes.rows.map((r: any) =>
        `DELETE FROM "${r.referencing_table}" WHERE "${r.referencing_column}" = ANY($1::int[])`
      );
      for (let i = 0; i < cleanup.length; i++) {
        const sp = `sp_revert_${i}`;
        await client.query(`SAVEPOINT ${sp}`);
        try {
          await client.query(cleanup[i]!, [ids]);
          await client.query(`RELEASE SAVEPOINT ${sp}`);
        } catch (_e) {
          // Si la tabla tiene FKs propias que bloquean (ej: anticipo_referencias
          // -> anticipos), el savepoint rollback evita perder la tx principal.
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        }
      }
      const del = await client.query(
        `DELETE FROM containers WHERE id = ANY($1::int[]) RETURNING id`,
        [ids]
      );
      await client.query('COMMIT');
      return res.json({ success: true, deleted: del.rowCount, deleted_ids: del.rows.map((r: any) => r.id) });
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS brand_type VARCHAR(50) DEFAULT 'pending';
      ALTER TABLE maritime_orders ALTER COLUMN brand_type SET DEFAULT 'pending';
      ALTER TABLE maritime_orders ALTER COLUMN merchandise_type SET DEFAULT 'pending';
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS has_battery BOOLEAN DEFAULT false;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS has_liquid BOOLEAN DEFAULT false;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS is_pickup BOOLEAN DEFAULT false;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS summary_boxes INTEGER;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS summary_weight DECIMAL(10,2);
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS summary_volume DECIMAL(10,4);
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS summary_description TEXT;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS missing_on_arrival BOOLEAN DEFAULT FALSE;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS missing_reported_at TIMESTAMP;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS received_boxes INTEGER;
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
      monitoreo: 'Monitoreo (solo lectura)',
      client: 'Cliente final'
    }
  });
});

// --- RUTAS DE AUTENTICACIÓN ---
app.post('/api/auth/register', authRateLimit, validateBody(registerSchema), registerUser);
app.post('/api/auth/login', authRateLimit, validateBody(loginSchema), loginUser);
app.post('/api/auth/logout', logoutUser);
// Password recovery — rate limit es importante porque si alguien
// pega un email a /forgot-password en bucle, mandaríamos N correos.
app.post('/api/auth/forgot-password', authRateLimit, validateBody(forgotPasswordSchema), forgotPassword);
app.post('/api/auth/reset-password', authRateLimit, validateBody(resetPasswordSchema), resetPassword);
app.get('/api/auth/profile', authenticateToken, getProfile);
app.post('/api/auth/change-password', authenticateToken, validateBody(changePasswordSchema), changePassword);
app.put('/api/auth/update-profile', authenticateToken, updateProfile);
app.put('/api/auth/profile-photo', authenticateToken, updateProfilePhoto);
// Account Deletion (Google Play + App Store 2024) — requiere password + confirm="ELIMINAR"
app.delete('/api/auth/account', authenticateToken, deleteMyAccount);

// ── Seguridad de cuenta: 2FA + cambio de email ──────────────────────────────
app.post('/api/auth/2fa/send-code', authenticateToken, send2FACode);
app.post('/api/auth/2fa/toggle', authenticateToken, toggle2FA);
app.post('/api/auth/change-email', authenticateToken, changeEmail);

// --- SIGN IN WITH GOOGLE / APPLE (feature flags via env) ---
// Si GOOGLE_OAUTH_CLIENT_IDS / APPLE_AUDIENCES no están configuradas,
// los handlers responden 503 y el frontend simplemente no muestra el botón.
app.get('/api/auth/social/status', socialAuthStatus);
app.post('/api/auth/google', authRateLimit, validateBody(googleAuthSchema), googleAuth);
app.post('/api/auth/apple', authRateLimit, validateBody(appleAuthSchema), appleAuth);

// --- VERIFICACIÓN DE TELÉFONO POR WHATSAPP (OTP de 6 dígitos) ---
// send-code y verify-code aceptan request con o sin JWT:
//   - Sin JWT: para flujo de registro/legacy (usuario recién creado)
//   - Con JWT: para cambio de teléfono de usuario logueado
app.get('/api/auth/phone/status', phoneVerificationStatus);
app.get('/api/whatsapp/status', (_req, res) => res.json(whatsappStatus()));

// Endpoint de diagnóstico temporal — permite probar envío directo de WhatsApp
app.post('/api/whatsapp/test', authenticateToken, async (req: any, res) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (!['super_admin', 'admin', 'director'].includes(role)) {
    return res.status(403).json({ error: 'Solo admins' });
  }
  const { phone, name, folio } = req.body;
  if (!phone) return res.status(400).json({ error: 'Falta phone' });
  const { sendTicketConfirmation, normalizePhone } = await import('./whatsappService');
  const normalized = normalizePhone(phone);
  try {
    await sendTicketConfirmation(phone, name || 'Test', folio || 'TEST-0001');
    res.json({ ok: true, normalized, phone, message: 'Enviado — revisa WhatsApp y logs de Railway' });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});
app.post(
  '/api/auth/phone/send-code',
  authRateLimit,
  validateBody(sendPhoneCodeSchema),
  optionalAuth,
  sendPhoneVerificationCode
);
app.post(
  '/api/auth/phone/verify-code',
  authRateLimit,
  validateBody(verifyPhoneCodeSchema),
  optionalAuth,
  verifyPhoneCode
);

// --- VERIFICACIÓN DE WHATSAPP ---
app.post('/api/auth/whatsapp/send-otp', authRateLimit, authenticateToken, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.id;
    // Migrate column if needed
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_verified BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_otp VARCHAR(10)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_otp_expires_at TIMESTAMP`);

    const userRow = await pool.query(`SELECT phone FROM users WHERE id = $1`, [userId]);
    const phone = userRow.rows[0]?.phone;
    if (!phone) return res.status(400).json({ error: 'No tienes un teléfono registrado. Agrega tu número primero.' });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    await pool.query(
      `UPDATE users SET whatsapp_otp = $1, whatsapp_otp_expires_at = $2 WHERE id = $3`,
      [code, expires, userId]
    );

    const result = await sendVerificationCodeWhatsapp({ phone, code });
    if (!result.ok && !result.skipped) {
      return res.status(500).json({ error: result.error || 'No se pudo enviar el código por WhatsApp' });
    }
    res.json({ success: true, phone, skipped: result.skipped || false });
  } catch (err: any) {
    console.error('whatsapp send-otp error:', err);
    res.status(500).json({ error: 'Error enviando código' });
  }
});

app.post('/api/auth/whatsapp/verify-otp', authRateLimit, authenticateToken, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Código requerido' });

    const row = await pool.query(
      `SELECT whatsapp_otp, whatsapp_otp_expires_at FROM users WHERE id = $1`,
      [userId]
    );
    const { whatsapp_otp, whatsapp_otp_expires_at } = row.rows[0] || {};
    if (!whatsapp_otp) return res.status(400).json({ error: 'No hay código pendiente. Solicita uno nuevo.' });
    if (new Date() > new Date(whatsapp_otp_expires_at)) return res.status(400).json({ error: 'El código expiró. Solicita uno nuevo.' });
    if (String(code).trim() !== String(whatsapp_otp).trim()) return res.status(400).json({ error: 'Código incorrecto.' });

    await pool.query(
      `UPDATE users SET whatsapp_verified = TRUE, whatsapp_otp = NULL, whatsapp_otp_expires_at = NULL WHERE id = $1`,
      [userId]
    );
    res.json({ success: true });
  } catch (err: any) {
    console.error('whatsapp verify-otp error:', err);
    res.status(500).json({ error: 'Error verificando código' });
  }
});

// --- RUTAS DE CLIENTES LEGACY (Migración) ---
// Públicas (para registro)
app.post('/api/legacy/claim', authRateLimit, claimLegacyAccount);
app.get('/api/legacy/verify/:boxId', verifyLegacyBox);
app.post('/api/legacy/verify-name', verifyLegacyName);
// Endpoint público para sincronización inversa: sistema EX consulta nuestros clientes (autenticado con API key)
app.get('/api/external/customers', listCustomersForExternalSync);

// Protegidas (para admin)
app.post('/api/legacy/import', authenticateToken, requireRole(ROLES.SUPER_ADMIN), uploadMiddleware, importLegacyClients);
app.post('/api/legacy/sync-external', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER, ROLES.DIRECTOR), syncExternalLegacyClients);
app.get('/api/legacy/clients', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.WAREHOUSE_OPS), getLegacyClients);
app.get('/api/legacy/stats', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER), getLegacyStats);
app.post('/api/legacy/clients/chartback', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER, ROLES.DIRECTOR), setChartback);
app.post('/api/legacy/clients/chartback-i', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER, ROLES.DIRECTOR), setChartbackI);
app.delete('/api/legacy/clients/:id', authenticateToken, requireRole(ROLES.SUPER_ADMIN), deleteLegacyClient);
app.get('/api/legacy/clients/:boxId/external', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.WAREHOUSE_OPS, ROLES.CUSTOMER_SERVICE), getLegacyClientExternalData);
app.get('/api/legacy/ine-proxy', authenticateToken, proxyIneImage);
app.get('/api/legacy/quotes/pendings', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.WAREHOUSE_OPS, ROLES.CUSTOMER_SERVICE), getLegacyQuotesPendings);
app.get('/api/legacy/quotes/pendings/:boxId', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.WAREHOUSE_OPS, ROLES.CUSTOMER_SERVICE), getLegacyQuotesPendings);

// Multer + S3 upload helper para registrar gastos desde la app
const pcExpenseUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })
  .fields([
    { name: 'evidence', maxCount: 1 },
    { name: 'odometer_photo', maxCount: 1 },
    { name: 'xml', maxCount: 1 }
  ]);

const handlePettyCashExpenseUpload = async (req: any, _res: any, next: any) => {
  try {
    const files = (req.files || {}) as Record<string, Express.Multer.File[] | undefined>;
    const uploaded: any = {};
    const userId = req.user?.userId ?? req.user?.id ?? 'anon';

    const { uploadToS3 } = require('./s3Service');
    if (files.evidence?.[0]) {
      const f = files.evidence[0];
      const key = `petty-cash/expenses/${userId}/${Date.now()}-evidence-${f.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      uploaded.evidence_url = await uploadToS3(f.buffer, key, f.mimetype || 'image/jpeg');
    }
    if (files.odometer_photo?.[0]) {
      const f = files.odometer_photo[0];
      const key = `petty-cash/expenses/${userId}/${Date.now()}-odo-${f.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      uploaded.odometer_photo_url = await uploadToS3(f.buffer, key, f.mimetype || 'image/jpeg');
    }
    if (files.xml?.[0]) {
      const f = files.xml[0];
      const key = `petty-cash/expenses/${userId}/${Date.now()}-${f.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      uploaded.xml_url = await uploadToS3(f.buffer, key, 'application/xml');
    }
    req.uploadedFiles = uploaded;
    next();
  } catch (err) {
    console.error('petty cash upload error', err);
    next(err);
  }
};

// --- Endpoints WEB / ADMIN (sucursales + finanzas) ---
const PCASH_ADMIN_ROLES = [
  ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR,
  ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT, ROLES.OPERACIONES
];
app.get('/api/admin/petty-cash/stats', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcGetStats);
app.get('/api/admin/petty-cash/categories', authenticateToken, pcGetCategories);
app.get('/api/admin/petty-cash/wallets', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcListWallets);
app.get('/api/admin/petty-cash/wallets/:id', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcGetWalletDetail);
app.get('/api/admin/petty-cash/branches', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcListBranches);
app.get('/api/admin/petty-cash/drivers', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcListDrivers);
app.post('/api/admin/petty-cash/fund-branch', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), pcFundBranch);
app.post('/api/admin/petty-cash/advance-driver', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcAdvanceDriver);
app.get('/api/admin/petty-cash/pending', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcListPendingExpenses);
app.post('/api/admin/petty-cash/movements/:id/approve', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcApproveExpense);
app.post('/api/admin/petty-cash/movements/:id/reject', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcRejectExpense);
app.delete('/api/admin/petty-cash/movements/:id', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcDeleteMovement);
app.put('/api/admin/petty-cash/movements/:id', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcUpdateMovement);
app.post('/api/admin/petty-cash/route-settle', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcCloseRouteSettlement);
app.get('/api/admin/petty-cash/settlements', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcListSettlements);

// --- Endpoints MOBILE / CHOFER ---
app.get('/api/petty-cash/categories', authenticateToken, pcGetCategories);
app.get('/api/petty-cash/my-wallet', authenticateToken, pcGetMyWallet);
app.get('/api/petty-cash/my-advances', authenticateToken, pcListMyAdvances);
app.post('/api/petty-cash/advances/:id/accept', authenticateToken, pcAcceptAdvance);
app.post('/api/petty-cash/expenses', authenticateToken, pcExpenseUpload, handlePettyCashExpenseUpload, pcRegisterExpense);
app.post('/api/petty-cash/branch-expenses', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcExpenseUpload, handlePettyCashExpenseUpload, pcRegisterBranchExpense);
app.get('/api/petty-cash/route-blocks', authenticateToken, pcListRouteBlocks);
app.post('/api/petty-cash/route-blocks', authenticateToken, pcCreateRouteBlock);
app.post('/api/petty-cash/route-blocks/:id/finalize', authenticateToken, pcFinalizeRouteBlock);
app.get('/api/admin/petty-cash/route-blocks', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), pcListAllRouteBlocks);

// Usuario: editar/borrar propio gasto PENDIENTE
app.patch('/api/petty-cash/my-expenses/:id', authenticateToken, pcExpenseUpload, handlePettyCashExpenseUpload, async (req: any, res: any) => {
  try {
    const userId = (req as any).user?.userId;
    const movId = parseInt(req.params.id, 10);
    if (!userId || !movId) return res.status(400).json({ error: 'Parámetros inválidos' });
    const { category, amount_mxn, concept } = req.body || {};
    const mov = await pool.query(`SELECT id, status, created_by FROM petty_cash_movements WHERE id=$1`, [movId]);
    if (!mov.rows.length) return res.status(404).json({ error: 'Gasto no encontrado' });
    if (Number(mov.rows[0].created_by) !== userId) return res.status(403).json({ error: 'No autorizado' });
    if (mov.rows[0].status !== 'pending') return res.status(400).json({ error: 'Solo se pueden editar gastos pendientes' });
    const uploaded = req.uploadedFiles || {};
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (category) { updates.push(`category=$${idx++}`); params.push(category); }
    if (amount_mxn) { const n = parseFloat(amount_mxn); if (n > 0) { updates.push(`amount_mxn=$${idx++}`); params.push(n); } }
    if (concept !== undefined) { updates.push(`concept=$${idx++}`); params.push(concept || null); }
    if (uploaded.evidence_url) { updates.push(`evidence_url=$${idx++}`); params.push(uploaded.evidence_url); }
    if (!updates.length) return res.status(400).json({ error: 'Sin cambios' });
    params.push(movId);
    await pool.query(`UPDATE petty_cash_movements SET ${updates.join(',')} WHERE id=$${idx}`, params);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[PATCH my-expenses]', err);
    return res.status(500).json({ error: err?.message || 'Error al actualizar gasto' });
  }
});
app.delete('/api/petty-cash/my-expenses/:id', authenticateToken, async (req: any, res: any) => {
  const userId = (req as any).user?.userId;
  const movId = parseInt(req.params.id, 10);
  if (!userId || !movId) return res.status(400).json({ error: 'Parámetros inválidos' });
  const mov = await pool.query(`SELECT id, status, created_by FROM petty_cash_movements WHERE id=$1`, [movId]);
  if (!mov.rows.length) return res.status(404).json({ error: 'Gasto no encontrado' });
  if (Number(mov.rows[0].created_by) !== userId) return res.status(403).json({ error: 'No autorizado' });
  if (mov.rows[0].status !== 'pending') return res.status(400).json({ error: 'Solo se pueden borrar gastos pendientes' });
  await pool.query(`DELETE FROM petty_cash_movements WHERE id=$1`, [movId]);
  return res.json({ success: true });
});


// --- RUTAS DE ASESORES ---
app.get('/api/users/advisors', authenticateToken, getAdvisorsList);
app.get('/api/users/my-advisor', authenticateToken, getMyAdvisor);
app.post('/api/users/assign-advisor', authenticateToken, assignAdvisor);

// --- RUTAS DE USUARIOS (protegida por rol) ---
// Solo admin y gerentes pueden ver todos los usuarios
app.get('/api/users', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER), getAllUsers);
// Actualizar usuario (admin y superiores)
app.put('/api/admin/users/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), updateUser);

// Resetear verificación de identidad de un usuario (super_admin) — pone
// la cuenta como "aún no aceptó términos / no verificada" para que el
// usuario tenga que rehacer el flujo del onboarding (paso 4 incluido).
// Útil cuando se usó la cuenta para pruebas o el cliente quiere
// reiniciar el proceso. Acepta lookup por id o por email.
app.post('/api/admin/users/reset-verification', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { userId, email } = req.body;
    if (!userId && !email) {
      return res.status(400).json({ error: 'Indica userId o email' });
    }
    const result = await pool.query(
      `UPDATE users SET
         verification_status = 'not_started',
         is_verified = false,
         ine_front_url = NULL,
         ine_back_url = NULL,
         selfie_url = NULL,
         signature_url = NULL,
         verification_submitted_at = NULL,
         ai_verification_reason = NULL,
         rejection_reason = NULL,
         privacy_accepted_at = NULL,
         privacy_accepted_ip = NULL
       WHERE ${userId ? 'id = $1' : 'LOWER(email) = LOWER($1)'}
       RETURNING id, email, full_name, role, verification_status, is_verified, privacy_accepted_at`,
      [userId || email]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    console.log(`🔄 [RESET-VERIFICATION] Usuario #${result.rows[0].id} (${result.rows[0].email}) reseteado por user #${req.user?.userId}`);
    return res.json({ success: true, user: result.rows[0] });
  } catch (err: any) {
    console.error('[RESET-VERIFICATION]', err.message);
    return res.status(500).json({ error: 'Error al resetear verificación' });
  }
});

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

// --- RUTA DE DASHBOARD GERENTE DE SUCURSAL ---
app.get('/api/dashboard/branch-manager', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getBranchManagerDashboard);

// --- RUTA DE DASHBOARD COUNTER STAFF (Mostrador) ---
app.get('/api/dashboard/counter-staff', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getCounterStaffDashboard);

// --- RUTA: Tipos de cambio y costos del sistema (monitor de APIs) ---
// Devuelve el estado actual de:
//   - Tipo de cambio ENTANGLED (proveedor default activo)
//   - Tipo de cambio PO Box USA (exchange_rate_config.servicio='pobox_usa')
//   - Costo por kilo TDI Aéreo (air_routes activo, no TDI-EXPRES)
// Se usa en el dashboard de admin/super_admin/director para detectar si una
// API de tipo de cambio o de costos dejó de actualizarse.
app.get('/api/dashboard/system-rates', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (_req: AuthRequest, res: Response) => {
  try {
    const STALE_HOURS = 24; // > 24h sin actualizar => "sin cambios" / posible API caída

    const [entangledRes, poboxRes, tdiRes, tdiFxRes, tdiExpressRes] = await Promise.all([
      pool.query(
        `SELECT name, code,
                (tipo_cambio_usd + COALESCE(override_tipo_cambio_usd, 0)) AS tipo_cambio_usd,
                (tipo_cambio_rmb + COALESCE(override_tipo_cambio_rmb, 0)) AS tipo_cambio_rmb,
                (override_tipo_cambio_usd IS NOT NULL AND override_tipo_cambio_usd <> 0) AS has_override_usd,
                (override_tipo_cambio_rmb IS NOT NULL AND override_tipo_cambio_rmb <> 0) AS has_override_rmb,
                updated_at
           FROM entangled_providers
          WHERE is_active = true
          ORDER BY is_default DESC, sort_order ASC, id ASC
          LIMIT 1`
      ),
      pool.query(
        `SELECT tipo_cambio_final, ultimo_tc_api, sobreprecio, ultima_actualizacion
           FROM exchange_rate_config
          WHERE servicio = 'pobox_usa' AND estado = TRUE
          LIMIT 1`
      ),
      pool.query(
        `SELECT r.code, r.name, r.origin_airport, r.destination_airport,
                r.origin_city, r.destination_city,
                r.cost_per_kg_usd, r.updated_at,
                (SELECT t.price_per_kg FROM air_tariffs t
                  WHERE t.route_id = r.id AND t.tariff_type = 'G' AND t.is_active = true
                    AND t.price_per_kg > 0
                  ORDER BY t.id DESC LIMIT 1) AS price_generic_usd
           FROM air_routes r
          WHERE r.is_active = true AND r.code <> 'TDI-EXPRES'
          ORDER BY r.id ASC
          LIMIT 1`
      ),
      pool.query(
        `SELECT tipo_cambio_final, ultima_actualizacion
           FROM exchange_rate_config
          WHERE servicio = 'tdi' AND estado = TRUE
          LIMIT 1`
      ),
      pool.query(
        `SELECT r.code, r.name, r.origin_airport, r.destination_airport,
                r.origin_city, r.destination_city,
                r.cost_per_kg_usd, r.updated_at,
                (SELECT t.price_per_kg FROM air_tariffs t
                  WHERE t.route_id = r.id AND t.tariff_type = 'G' AND t.is_active = true
                    AND t.price_per_kg > 0
                  ORDER BY t.id DESC LIMIT 1) AS price_generic_usd
           FROM air_routes r
          WHERE r.is_active = true AND r.code = 'TDI-EXPRES'
          ORDER BY r.id ASC
          LIMIT 1`
      ),
    ]);

    const hoursSince = (d: any): number | null => {
      if (!d) return null;
      const ts = new Date(d).getTime();
      if (isNaN(ts)) return null;
      return (Date.now() - ts) / (1000 * 60 * 60);
    };

    const entangled = entangledRes.rows[0] || null;
    const pobox = poboxRes.rows[0] || null;
    const tdi = tdiRes.rows[0] || null;
    const tdiFx = tdiFxRes.rows[0] || null;
    const tdiExpress = tdiExpressRes.rows[0] || null;

    const entH = hoursSince(entangled?.updated_at);
    const poboxH = hoursSince(pobox?.ultima_actualizacion);
    const tdiH = hoursSince(tdi?.updated_at);
    const tdiExpressH = hoursSince(tdiExpress?.updated_at);

    return res.json({
      stale_hours_threshold: STALE_HOURS,
      entangled: entangled
        ? {
            provider: entangled.name,
            name: entangled.name,
            code: entangled.code,
            tipo_cambio_usd: Number(entangled.tipo_cambio_usd),
            tipo_cambio_rmb: Number(entangled.tipo_cambio_rmb),
            has_override_usd: !!entangled.has_override_usd,
            has_override_rmb: !!entangled.has_override_rmb,
            updated_at: entangled.updated_at,
            hours_since_update: entH,
            stale: entH === null ? true : entH > STALE_HOURS,
          }
        : null,
      pobox: pobox
        ? {
            tipo_cambio_final: Number(pobox.tipo_cambio_final),
            ultimo_tc_api: pobox.ultimo_tc_api !== null ? Number(pobox.ultimo_tc_api) : null,
            sobreprecio: pobox.sobreprecio !== null ? Number(pobox.sobreprecio) : null,
            updated_at: pobox.ultima_actualizacion,
            hours_since_update: poboxH,
            stale: poboxH === null ? true : poboxH > STALE_HOURS,
          }
        : null,
      tdi_air: tdi
        ? {
            route_code: tdi.code,
            route_name: tdi.name,
            origin_airport: tdi.origin_airport || null,
            destination_airport: tdi.destination_airport || null,
            origin_city: tdi.origin_city || null,
            destination_city: tdi.destination_city || null,
            cost_per_kg_usd: Number(tdi.cost_per_kg_usd),
            price_generic_usd: tdi.price_generic_usd !== null && tdi.price_generic_usd !== undefined
              ? Number(tdi.price_generic_usd)
              : Number(tdi.cost_per_kg_usd) + 8,
            tipo_cambio_final: tdiFx ? Number(tdiFx.tipo_cambio_final) : null,
            updated_at: tdi.updated_at,
            hours_since_update: tdiH,
            stale: tdiH === null ? true : tdiH > STALE_HOURS,
          }
        : null,
      tdi_express: tdiExpress
        ? {
            route_code: tdiExpress.code,
            route_name: tdiExpress.name,
            origin_airport: tdiExpress.origin_airport || null,
            destination_airport: tdiExpress.destination_airport || null,
            origin_city: tdiExpress.origin_city || null,
            destination_city: tdiExpress.destination_city || null,
            cost_per_kg_usd: Number(tdiExpress.cost_per_kg_usd),
            price_generic_usd: tdiExpress.price_generic_usd !== null && tdiExpress.price_generic_usd !== undefined
              ? Number(tdiExpress.price_generic_usd)
              : Number(tdiExpress.cost_per_kg_usd) + 8,
            tipo_cambio_final: tdiFx ? Number(tdiFx.tipo_cambio_final) : null,
            updated_at: tdiExpress.updated_at,
            hours_since_update: tdiExpressH,
            stale: tdiExpressH === null ? true : tdiExpressH > STALE_HOURS,
          }
        : null,
    });
  } catch (err) {
    console.error('[dashboard/system-rates]', err);
    return res.status(500).json({ error: 'Error consultando tipos de cambio del sistema' });
  }
});

// POST /api/dashboard/notify-stale-rates — notifica a customer_service y soporte_tecnico cuando TDI aéreo está desactualizado
app.post('/api/dashboard/notify-stale-rates', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { service } = req.body as { service: string };
    const label = service === 'tdi_express' ? 'TDI Express' : 'TDI Aéreo';
    const msg = `⚠️ El precio ${label} necesita actualizarse. Accede al panel de tarifas para actualizar el costo por kg.`;

    const usersRes = await pool.query(
      `SELECT id FROM users WHERE role IN ('customer_service', 'soporte_tecnico') AND is_active = TRUE`
    );
    if (usersRes.rows.length === 0) return (res as any).json({ sent: 0 });

    for (const u of usersRes.rows) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES ($1, 'system_alert', 'Tarifa desactualizada', $2, $3)
         ON CONFLICT DO NOTHING`,
        [u.id, msg, JSON.stringify({ service, action: 'update_rate' })]
      ).catch(() => {});
    }
    return (res as any).json({ sent: usersRes.rows.length });
  } catch (err: any) {
    console.error('[notify-stale-rates]', err.message);
    return (res as any).status(500).json({ error: err.message });
  }
});

// --- INVENTARIO POR TIPO DE SERVICIO ---
// GET /api/packages/service-inventory?service=tdi_aereo&limit=200&offset=0&search=
app.get('/api/packages/service-inventory', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const service = String(req.query.service || 'tdi_aereo');
    const limit  = Math.min(5000, parseInt(String(req.query.limit  || '200')));
    const offset = parseInt(String(req.query.offset || '0'));
    const search = String(req.query.search || '').trim();
    const dateFrom = String(req.query.date_from || '');
    const dateTo   = String(req.query.date_to   || '');
    const statusFilter = String(req.query.status || '').trim();

    let rows: any[] = [];
    let total = 0;

    const JOIN_USERS = `LEFT JOIN users u ON p.user_id = u.id`;
    const JOIN_USERS_DHL = `LEFT JOIN users u ON d.user_id = u.id`;

    if (service === 'tdi_aereo') {
      const filterParams: any[] = [];
      let baseWhere = `(p.service_type = 'AIR_CHN_MX')`;
      if (search) { filterParams.push(`%${search}%`); filterParams.push(search); baseWhere += ` AND (p.tracking_internal ILIKE $${filterParams.length-1} OR p.child_no ILIKE $${filterParams.length-1} OR p.international_tracking ILIKE $${filterParams.length-1} OR UPPER(u.box_id) = UPPER($${filterParams.length}) OR u.full_name ILIKE $${filterParams.length-1})`; }
      if (dateFrom) { filterParams.push(dateFrom); baseWhere += ` AND DATE(p.received_at AT TIME ZONE 'America/Monterrey') >= $${filterParams.length}::date`; }
      if (dateTo)   { filterParams.push(dateTo);   baseWhere += ` AND DATE(p.received_at AT TIME ZONE 'America/Monterrey') <= $${filterParams.length}::date`; }
      if (statusFilter) { filterParams.push(statusFilter); baseWhere += ` AND p.status = $${filterParams.length}`; }

      // base_guia: strip sufijo -NNN de child_no para identificar el envío consolidado
      const BASE_EXPR = `CASE WHEN p.child_no IS NOT NULL AND p.child_no != '' THEN REGEXP_REPLACE(p.child_no, '-[0-9]+$', '') ELSE p.tracking_internal END`;

      const TDI_SEL = `COALESCE(NULLIF(p.child_no,''), p.tracking_internal) AS guia,
                       p.id AS pkg_id, p.tracking_internal AS guia_corta,
                       p.international_tracking AS guia_origen,
                       ${BASE_EXPR} AS base_guia,
                       p.received_at, p.updated_at, p.status,
                       u.box_id AS box_id, u.full_name AS cliente_nombre,
                       p.national_carrier AS paqueteria, p.national_tracking AS guia_salida,
                       COALESCE(p.costing_paid, FALSE) AS costing_paid,
                       (p.delivery_address_id IS NOT NULL OR p.assigned_address_id IS NOT NULL OR p.national_tracking IS NOT NULL) AS has_instructions`;

      // COUNT = grupos distintos (no paquetes individuales)
      const cr = await pool.query(`SELECT COUNT(DISTINCT ${BASE_EXPR}) FROM packages p ${JOIN_USERS} WHERE ${baseWhere}`, filterParams);
      total = parseInt(cr.rows[0].count);

      if (search) {
        // Modo búsqueda: devolver plano con base_guia como metadato
        const qp = [...filterParams, limit, offset];
        rows = (await pool.query(`SELECT ${TDI_SEL} FROM packages p ${JOIN_USERS} WHERE ${baseWhere} ORDER BY p.received_at DESC LIMIT $${qp.length-1} OFFSET $${qp.length}`, qp)).rows.map((r: any) => ({ ...r, children: [] }));
      } else {
        // Modo agrupado: paginar por envío (base_guia), embeber todas las piezas
        const qp = [...filterParams, limit, offset];
        const groupsRes = await pool.query(
          `SELECT ${BASE_EXPR} AS bg FROM packages p ${JOIN_USERS} WHERE ${baseWhere} GROUP BY ${BASE_EXPR} ORDER BY MAX(p.received_at) DESC LIMIT $${qp.length-1} OFFSET $${qp.length}`,
          qp
        );
        const baseGuias: string[] = groupsRes.rows.map((r: any) => r.bg).filter(Boolean);
        if (baseGuias.length === 0) {
          rows = [];
        } else {
          // Traer todas las piezas de los grupos seleccionados (sin límite)
          const allRes = await pool.query(
            `SELECT ${TDI_SEL} FROM packages p ${JOIN_USERS} WHERE (p.service_type = 'AIR_CHN_MX') AND ${BASE_EXPR} = ANY($1::text[]) ORDER BY ${BASE_EXPR} DESC, p.id`,
            [baseGuias]
          );
          // Agrupar por base_guia
          const groupMap = new Map<string, { master?: any; pieces: any[] }>();
          baseGuias.forEach((bg: string) => groupMap.set(bg, { pieces: [] }));
          allRes.rows.forEach((r: any) => {
            const bg: string = r.base_guia;
            if (!groupMap.has(bg)) return;
            const g = groupMap.get(bg)!;
            if (r.guia === bg) g.master = r; // paquete master real (guía sin sufijo)
            else g.pieces.push(r);
          });
          // Un row por grupo: master real o row virtual con datos agregados
          rows = baseGuias.map((bg: string) => {
            const g = groupMap.get(bg);
            if (!g) return null;
            const pieces = g.pieces;
            if (g.master) return { ...g.master, children: pieces };
            if (pieces.length > 0) {
              const latest = pieces.reduce((a: any, b: any) => new Date(a.updated_at || 0) > new Date(b.updated_at || 0) ? a : b);
              return { ...pieces[0], guia: bg, guia_corta: bg,
                costing_paid: pieces.some((c: any) => c.costing_paid),
                has_instructions: pieces.some((c: any) => c.has_instructions),
                updated_at: latest.updated_at, status: latest.status,
                children: pieces };
            }
            return null;
          }).filter(Boolean);
        }
      }

    } else if (service === 'tdi_express') {
      const params: any[] = [];
      let where = `(p.service_type = 'tdi_express' OR (p.service_type = 'AIR_CHN_MX' AND p.air_source = 'tdi_express'))`;
      if (search) { params.push(`%${search}%`); params.push(search); where += ` AND (p.tracking_internal ILIKE $${params.length-1} OR p.international_tracking ILIKE $${params.length-1} OR UPPER(u.box_id) = UPPER($${params.length}) OR u.full_name ILIKE $${params.length-1})`; }
      if (dateFrom) { params.push(dateFrom); where += ` AND DATE(p.received_at AT TIME ZONE 'America/Monterrey') >= $${params.length}::date`; }
      if (dateTo)   { params.push(dateTo);   where += ` AND DATE(p.received_at AT TIME ZONE 'America/Monterrey') <= $${params.length}::date`; }
      if (statusFilter) { params.push(statusFilter); where += ` AND p.status = $${params.length}`; }
      // Para TDI Express: tracking_internal ES la guía principal (TDX-...), child_no no aplica
      const q = `SELECT p.tracking_internal AS guia,
                        NULL AS guia_corta,
                        p.international_tracking AS guia_origen,
                        p.received_at, p.updated_at, p.status,
                        u.box_id AS box_id,
                        u.full_name AS cliente_nombre, p.national_carrier AS paqueteria,
                        p.national_tracking AS guia_salida,
                        COALESCE(p.costing_paid, FALSE) AS costing_paid,
                        (p.delivery_address_id IS NOT NULL OR p.assigned_address_id IS NOT NULL OR p.national_tracking IS NOT NULL) AS has_instructions
                   FROM packages p ${JOIN_USERS}
                  WHERE ${where} ORDER BY p.received_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
      params.push(limit, offset);
      const r = await pool.query(q, params);
      rows = r.rows;
      const cr = await pool.query(`SELECT COUNT(*) FROM packages p ${JOIN_USERS} WHERE ${where}`, params.slice(0, -2));
      total = parseInt(cr.rows[0].count);

    } else if (service === 'pobox_usa') {
      // PO Box: algunos paquetes tienen user_id NULL pero sí tienen p.box_id
      // JOIN doble: primero por user_id, luego por box_id como fallback
      const PB_JOIN = `LEFT JOIN users u ON p.user_id = u.id OR (p.user_id IS NULL AND p.box_id IS NOT NULL AND UPPER(p.box_id) = UPPER(u.box_id))
                       LEFT JOIN legacy_clients lc ON p.user_id IS NULL AND p.box_id IS NOT NULL AND UPPER(p.box_id) = UPPER(lc.box_id) AND u.id IS NULL`;
      const params: any[] = [];
      let where = `p.service_type = 'POBOX_USA' AND NOT EXISTS (SELECT 1 FROM packages c WHERE c.master_id = p.id LIMIT 1)`;
      if (search) { params.push(`%${search}%`); params.push(search); where += ` AND (p.tracking_internal ILIKE $${params.length-1} OR p.tracking_provider ILIKE $${params.length-1} OR UPPER(COALESCE(u.box_id, lc.box_id, p.box_id)) = UPPER($${params.length}) OR COALESCE(u.full_name, lc.full_name) ILIKE $${params.length-1})`; }
      if (dateFrom) { params.push(dateFrom); where += ` AND DATE(p.received_at AT TIME ZONE 'America/Monterrey') >= $${params.length}::date`; }
      if (dateTo)   { params.push(dateTo);   where += ` AND DATE(p.received_at AT TIME ZONE 'America/Monterrey') <= $${params.length}::date`; }
      if (statusFilter) { params.push(statusFilter); where += ` AND p.status = $${params.length}`; }
      const q = `SELECT p.id AS pkg_id, p.tracking_internal AS guia,
                        COALESCE(NULLIF(p.tracking_provider,''), p.international_tracking) AS guia_origen,
                        p.origin_carrier AS guia_origen_carrier,
                        p.received_at, p.updated_at, p.status,
                        COALESCE(u.box_id, lc.box_id, p.box_id) AS box_id,
                        COALESCE(u.full_name, lc.full_name) AS cliente_nombre,
                        p.national_carrier AS paqueteria,
                        p.national_tracking AS guia_salida,
                        COALESCE(p.client_paid, p.costing_paid, FALSE) AS costing_paid,
                        (p.delivery_address_id IS NOT NULL OR p.assigned_address_id IS NOT NULL OR p.national_tracking IS NOT NULL OR p.needs_instructions = FALSE) AS has_instructions,
                        (p.delivery_address_id IS NOT NULL OR p.assigned_address_id IS NOT NULL) AS has_delivery_address,
                        NULLIF(p.child_no, '') AS guia_us_saved
                   FROM packages p ${PB_JOIN}
                  WHERE ${where} ORDER BY p.received_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
      params.push(limit, offset);
      const r = await pool.query(q, params);
      rows = r.rows;
      const cr = await pool.query(`SELECT COUNT(*) FROM packages p ${PB_JOIN} WHERE ${where}`, params.slice(0,-2));
      total = parseInt(cr.rows[0].count);

    } else if (service === 'maritimo') {
      // Marítimo China: tabla maritime_orders (ordersn = LOG...), NO packages
      const params: any[] = [];
      let where = `1=1`;
      if (search) { params.push(`%${search}%`); params.push(search); where += ` AND (mo.ordersn ILIKE $${params.length-1} OR UPPER(u.box_id) = UPPER($${params.length}) OR UPPER(mo.shipping_mark) = UPPER($${params.length}) OR u.full_name ILIKE $${params.length-1})`; }
      if (dateFrom) { params.push(dateFrom); where += ` AND DATE(mo.created_at AT TIME ZONE 'America/Monterrey') >= $${params.length}::date`; }
      if (dateTo)   { params.push(dateTo);   where += ` AND DATE(mo.created_at AT TIME ZONE 'America/Monterrey') <= $${params.length}::date`; }
      if (statusFilter) { params.push(statusFilter); where += ` AND mo.status = $${params.length}`; }
      const q = `SELECT mo.ordersn AS guia, NULL AS guia_origen,
                        mo.created_at AS received_at, mo.updated_at, mo.status,
                        COALESCE(u.box_id, mo.shipping_mark) AS box_id,
                        u.full_name AS cliente_nombre,
                        mo.national_carrier AS paqueteria, mo.national_tracking AS guia_salida,
                        (mo.payment_status = 'paid') AS costing_paid,
                        (mo.delivery_address_id IS NOT NULL OR mo.national_tracking IS NOT NULL OR mo.instructions_confirmed = TRUE) AS has_instructions,
                        mo.national_label_url IS NOT NULL AS has_label
                   FROM maritime_orders mo LEFT JOIN users u ON mo.user_id = u.id
                  WHERE ${where} ORDER BY mo.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
      params.push(limit, offset);
      const r = await pool.query(q, params);
      rows = r.rows;
      const cr = await pool.query(`SELECT COUNT(*) FROM maritime_orders mo LEFT JOIN users u ON mo.user_id = u.id WHERE ${where}`, params.slice(0,-2));
      total = parseInt(cr.rows[0].count);

    } else if (service === 'dhl') {
      // DHL Monterrey: tabla dhl_shipments
      // inbound_tracking a veces es JJD (guía hija); el número de 10 dígitos es la guía principal
      const params: any[] = [];
      let where = '1=1';
      if (search) { params.push(`%${search}%`); params.push(search); where += ` AND (d.inbound_tracking ILIKE $${params.length-1} OR d.secondary_tracking ILIKE $${params.length-1} OR UPPER(u.box_id) = UPPER($${params.length}) OR u.full_name ILIKE $${params.length-1})`; }
      if (dateFrom) { params.push(dateFrom); where += ` AND DATE(d.inspected_at AT TIME ZONE 'America/Monterrey') >= $${params.length}::date`; }
      if (dateTo)   { params.push(dateTo);   where += ` AND DATE(d.inspected_at AT TIME ZONE 'America/Monterrey') <= $${params.length}::date`; }
      if (statusFilter) { params.push(statusFilter); where += ` AND d.status = $${params.length}`; }
      const q = `SELECT
                        -- Si inbound_tracking empieza con JJD, el número real es secondary_tracking
                        CASE WHEN d.inbound_tracking LIKE 'JJD%' THEN COALESCE(d.secondary_tracking, d.inbound_tracking)
                             ELSE d.inbound_tracking END AS guia,
                        -- guia_hija: el JJD si está en inbound, o secondary si inbound es el número real
                        CASE WHEN d.inbound_tracking LIKE 'JJD%' THEN d.inbound_tracking
                             ELSE d.secondary_tracking END AS guia_origen,
                        d.inspected_at AS received_at, d.updated_at,
                        COALESCE(d.status, 'received_mty') AS status,
                        u.box_id AS box_id, u.full_name AS cliente_nombre,
                        d.national_carrier AS paqueteria, d.national_tracking AS guia_salida,
                        (d.cost_payment_status = 'paid') AS costing_paid,
                        (d.national_label_url IS NOT NULL) AS has_label,
                        -- Instrucciones asignadas: dirección de entrega O paquetería
                        -- nacional (ej. EntregaX Local MTY no tiene guía nacional) O
                        -- guía de salida.
                        (d.delivery_address_id IS NOT NULL OR d.national_carrier IS NOT NULL OR d.national_tracking IS NOT NULL) AS has_instructions
                   FROM dhl_shipments d LEFT JOIN users u ON d.user_id = u.id
                  WHERE ${where} ORDER BY d.inspected_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
      params.push(limit, offset);
      const r = await pool.query(q, params);
      rows = r.rows;
      const cr = await pool.query(`SELECT COUNT(*) FROM dhl_shipments d LEFT JOIN users u ON d.user_id = u.id WHERE ${where}`, params.slice(0,-2));
      total = parseInt(cr.rows[0].count);
    }

    return res.json({ total, rows });
  } catch (err: any) {
    console.error('[service-inventory]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

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
             used_credit, credit_limit, has_credit,
             is_verified, verification_status
      FROM users WHERE id = $1
    `, [userId]);

    if (userQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = userQuery.rows[0];
    const boxId = user.box_id;

    // 🔒 Bloqueo de verificación — cliente solo ve sus paquetes/saldos
    // cuando AMBOS flags están alineados:
    //   - is_verified = TRUE (lo lee la UI de perfil para el badge)
    //   - verification_status ∈ {'verified','approved'}
    // Si están desalineados (caso real: status='verified' pero
    // is_verified=false porque la migración no actualizó ambas
    // columnas) tratamos al cliente como pendiente. Mejor falso
    // negativo que filtrar guías.
    const verificationStatus = String(user.verification_status || '').toLowerCase();
    const statusApproved = verificationStatus === 'approved' || verificationStatus === 'verified';
    const flagApproved = user.is_verified === true;
    const isClientApproved = statusApproved && flagApproved;
    console.log(
      `🔒 [dashboard/client] user=${userId} is_verified=${user.is_verified} ` +
      `verification_status="${user.verification_status}" → approved=${isClientApproved}`
    );
    if (!isClientApproved) {
      return res.json({
        verificationGated: true,
        verificationStatus: user.verification_status || 'not_started',
        isVerified: !!user.is_verified,
        stats: {
          en_transito: 0, en_bodega: 0, listos_recoger: 0, entregados_mes: 0,
          saldo_pendiente: 0, saldo_pobox: 0, saldo_aereo: 0,
        },
        packages: [],
        invoices: [],
      });
    }

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
         OR (user_id IS NULL AND EXISTS (
           SELECT 1 FROM china_receipts cr
           WHERE (cr.user_id = $1 OR UPPER(cr.shipping_mark) = UPPER($2))
             AND (
               UPPER(packages.tracking_provider) = UPPER(cr.fno)
               OR UPPER(packages.tracking_provider) LIKE UPPER(cr.fno) || '-%'
               OR UPPER(packages.child_no) = UPPER(cr.fno)
               OR UPPER(packages.child_no) LIKE UPPER(cr.fno) || '-%'
             )
         ))
    `, [userId, boxId]);

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
    let hasPqtxShipmentsTable = false;
    try {
      const pqtxTableCheck = await pool.query(`
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'pqtx_shipments'
        LIMIT 1
      `);
      hasPqtxShipmentsTable = pqtxTableCheck.rows.length > 0;
    } catch {
      hasPqtxShipmentsTable = false;
    }

    const packagesQuery = await pool.query(`
      SELECT 
        id,
        -- Usar child_no como tracking si tiene formato AIR, sino tracking_internal
        CASE WHEN child_no IS NOT NULL AND child_no LIKE 'AIR%' THEN child_no ELSE tracking_internal END as tracking,
        tracking_provider,
        description as descripcion,
        custom_label,
        service_type as servicio,
        CASE
          WHEN service_type = 'POBOX_USA' THEN 'air'
          WHEN service_type = 'AIR_CHN_MX' THEN 'china_air'
          WHEN service_type = 'SEA_CHN_MX' THEN 'maritime'
          WHEN service_type = 'tdi_express' OR air_source = 'tdi_express' THEN 'china_air'
          ELSE 'air'
        END as shipment_type,
        status::text as status,
        CASE
          -- Flujo específico PO Box USA
          WHEN service_type = 'POBOX_USA' AND status::text = 'ready_pickup' THEN 'En Ruta'
          WHEN service_type = 'POBOX_USA' AND status::text = 'received' AND dispatched_at IS NULL THEN 'Recibido CEDIS HIDALGO TX'
          WHEN service_type = 'POBOX_USA' AND status::text = 'in_transit' THEN 'EN TRANSITO A MTY NL'
          WHEN service_type = 'POBOX_USA' AND status::text = 'received' AND dispatched_at IS NOT NULL THEN 'RECIBIDO EN CEDIS MTY'
          WHEN service_type = 'POBOX_USA' AND status::text IN ('received_mty', 'received_cedis') THEN 'RECIBIDO EN CEDIS MTY'
          WHEN service_type = 'POBOX_USA' AND status::text = 'processing' THEN 'Procesando'
          WHEN service_type = 'POBOX_USA' AND status::text IN ('out_for_delivery', 'en_ruta_entrega') THEN 'En Ruta'
          WHEN service_type = 'POBOX_USA' AND status::text IN ('shipped', 'sent', 'enviado') THEN 'ENVIADO'
          WHEN service_type = 'POBOX_USA' AND status::text = 'delivered' THEN
            CASE
              WHEN COALESCE(received_by, '') <> '' THEN 'ENTREGADO'
              ELSE 'ENTREGADO'
            END

          -- Flujo específico TDI Aéreo China
          WHEN service_type = 'AIR_CHN_MX' AND status::text = 'received_china' THEN 'Recibido China'
          WHEN service_type = 'AIR_CHN_MX' AND status::text = 'received_origin' THEN 'En Bodega China'
          WHEN service_type = 'AIR_CHN_MX' AND status::text = 'in_transit' THEN 'En Tránsito'
          WHEN service_type = 'AIR_CHN_MX' AND status::text = 'at_customs' THEN 'En Aduana'
          WHEN service_type = 'AIR_CHN_MX' AND status::text = 'in_transit_mx' THEN 'En Ruta Cedis México'
          WHEN service_type = 'AIR_CHN_MX' AND status::text = 'received_cedis' THEN 'En CEDIS'
          WHEN service_type = 'AIR_CHN_MX' AND status::text = 'ready_pickup' THEN 'Listo Recoger'
          WHEN service_type = 'AIR_CHN_MX' AND status::text = 'in_transit_mty' THEN 'EN TRÁNSITO A MTY, N.L.'
          WHEN service_type = 'AIR_CHN_MX' AND status::text IN ('processing', 'customs') THEN 'Procesando - Guía impresa'
          WHEN service_type = 'AIR_CHN_MX' AND status::text = 'out_for_delivery' THEN 'EN RUTA'
          WHEN service_type = 'AIR_CHN_MX' AND status::text IN ('shipped', 'sent', 'enviado') THEN 'ENVIADO'
          -- eVISA prepagado = handoff para dispersión en MTY → "ENVIADO", no "Entregado".
          WHEN service_type = 'AIR_CHN_MX' AND status::text = 'delivered' AND LOWER(COALESCE(national_carrier, '')) IN ('evisa_pre', 'evisapre', 'evisa') THEN 'ENVIADO'
          WHEN service_type = 'AIR_CHN_MX' AND status::text = 'delivered' THEN 'Entregado'

          -- Flujo general
          WHEN status::text = 'received' THEN 'En Bodega'
          WHEN status::text = 'in_transit' THEN 'En Tránsito'
          WHEN status::text = 'customs' THEN 'En Aduana'
          WHEN status::text = 'ready_pickup' THEN 'Listo para Recoger'
          WHEN status::text = 'delivered' THEN 'Entregado'
          WHEN status::text = 'processing' THEN 'Procesando'
          WHEN status::text = 'reempacado' THEN 'Reempacado'
          WHEN status::text = 'received_china' THEN 'Recibido China'
          WHEN status::text = 'received_origin' THEN 'En Bodega China'
          WHEN status::text = 'at_customs' THEN 'En Aduana'
          WHEN status::text = 'in_transit_mx' THEN 'En Ruta México'
          WHEN status::text = 'received_cedis' THEN 'En CEDIS'
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
        air_chargeable_weight,
        air_tariff_type,
        pro_name,
        pobox_venta_usd,
        pobox_service_cost,
        pobox_cost_usd,
        pobox_tarifa_nivel,
        registered_exchange_rate,
        national_carrier,
        national_shipping_cost,
        national_tracking,
        is_collect,
        collect_carrier,
        ${hasPqtxShipmentsTable ? `(
          SELECT UPPER(
            REGEXP_REPLACE(
              COALESCE((regexp_match(ps.folio_porte, '([A-Za-z]{2,}[0-9][A-Za-z0-9]+)'))[1], ps.folio_porte),
              '\\s+',
              '',
              'g'
            )
          )
          FROM pqtx_shipments ps
          WHERE UPPER(ps.tracking_number) = UPPER(packages.national_tracking)
            AND COALESCE(ps.folio_porte, '') <> ''
          ORDER BY ps.created_at DESC NULLS LAST, ps.id DESC
          LIMIT 1
        )` : 'NULL'} as carrier_service_request_code,
        carrier,
        gex_total_cost,
        instructions_assigned_by_id,
        (SELECT u2.full_name FROM users u2 WHERE u2.id = packages.instructions_assigned_by_id LIMIT 1) as instructions_assigned_by_name
      FROM packages
      WHERE (
        user_id = $1
        OR box_id = $2
        -- Incluir paquetes SIN CLIENTE cuyo FNO está asignado en china_receipts
        -- (por user_id directo o por shipping_mark=box_id para clientes legacy)
        OR (user_id IS NULL AND EXISTS (
          SELECT 1 FROM china_receipts cr
          WHERE (cr.user_id = $1 OR UPPER(cr.shipping_mark) = UPPER($2))
            AND (
              UPPER(packages.tracking_provider) = UPPER(cr.fno)
              OR UPPER(packages.tracking_provider) LIKE UPPER(cr.fno) || '-%'
              OR UPPER(packages.child_no) = UPPER(cr.fno)
              OR UPPER(packages.child_no) LIKE UPPER(cr.fno) || '-%'
            )
        ))
      )
        AND status::text NOT IN ('cancelled', 'returned')
        -- Los enviados/entregados (aunque estén pagados) permanecen visibles en el
        -- panel 48 horas tras enviarse/entregarse; después pasan solo al historial.
        AND NOT (
          status::text IN ('shipped', 'delivered') AND client_paid = true
          AND COALESCE(delivered_at, updated_at) < NOW() - INTERVAL '48 hours'
        )
        AND (
          status::text NOT IN ('delivered', 'sent')
          OR COALESCE(delivered_at, updated_at) >= NOW() - INTERVAL '48 hours'
        )
        AND (is_master = true OR master_id IS NULL)
      ORDER BY
        CASE WHEN status::text = 'ready_pickup' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 999
    `, [userId, boxId]);

    // 3b. Obtener órdenes marítimas activas del cliente
    // Buscar por user_id O por shipping_mark = box_id
    const maritimeOrdersQuery = await pool.query(`
      SELECT 
        id,
        ordersn as tracking,
        'MARITIMO' as tracking_provider,
        COALESCE(goods_name, summary_description, 'Carga Marítima') as descripcion,
        custom_label,
        'SEA_CHN_MX' as servicio,
        'maritime' as shipment_type,
        status,
        CASE status 
          WHEN 'received_china' THEN '📦 Recibido en China'
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
        COALESCE(
          (SELECT ct.eta::text FROM containers ct WHERE ct.id = maritime_orders.container_id),
          'En tránsito'
        ) as fecha_estimada,
        COALESCE(assigned_cost_mxn, saldo_pendiente, 0) as monto,
        CASE WHEN payment_status = 'paid' THEN true ELSE false END as client_paid,
        delivery_address_id,
        NULL as assigned_address_id,
        CASE WHEN delivery_address_id IS NOT NULL THEN true ELSE false END as has_delivery_instructions,
        created_at,
        COALESCE(summary_boxes, 0) as total_boxes,
        COALESCE(summary_weight, weight) as weight,
        COALESCE(summary_volume, volume) as cbm,
        NULL as dimensions,
        COALESCE(estimated_cost, (SELECT w.invoice_value_usd FROM warranties w WHERE w.gex_folio = maritime_orders.gex_folio LIMIT 1)) as declared_value,
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
        brand_type,
        'MXN' as monto_currency,
        registered_exchange_rate,
        national_carrier,
        national_shipping_cost,
        national_tracking,
        (SELECT w.total_cost_mxn FROM warranties w WHERE w.gex_folio = maritime_orders.gex_folio LIMIT 1) as gex_total_cost
      FROM maritime_orders
      WHERE (user_id = $1 OR UPPER(shipping_mark) = UPPER($2))
        AND status <> 'cancelled'
        -- Entregados permanecen 48h en el panel; luego solo en historial.
        AND (status <> 'delivered' OR updated_at >= NOW() - INTERVAL '48 hours')
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
          COALESCE(ds.secondary_tracking, ds.inbound_tracking) as tracking,
          CASE WHEN ds.secondary_tracking IS NOT NULL THEN ds.inbound_tracking ELSE NULL END as dhl_child_tracking,
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
          COALESCE(ds.total_cost_mxn, ds.saldo_pendiente,
            NULLIF(COALESCE(ds.import_cost_mxn,0) + COALESCE(ds.import_tax_mxn,0) + COALESCE(ds.national_cost_mxn,0), 0), 0)
            + CASE WHEN ds.has_gex THEN COALESCE((SELECT w.total_cost_mxn FROM warranties w WHERE w.gex_folio = ds.gex_folio LIMIT 1), 0) ELSE 0 END
            as monto,
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
          GREATEST(0,
            COALESCE(ds.total_cost_mxn, ds.saldo_pendiente,
              NULLIF(COALESCE(ds.import_cost_mxn,0) + COALESCE(ds.import_tax_mxn,0) + COALESCE(ds.national_cost_mxn,0), 0), 0)
            + CASE WHEN ds.has_gex THEN COALESCE((SELECT w.total_cost_mxn FROM warranties w WHERE w.gex_folio = ds.gex_folio LIMIT 1), 0) ELSE 0 END
            - COALESCE(ds.monto_pagado, 0)
          ) as saldo_pendiente,
          ds.monto_pagado,
          ds.import_cost_usd as dhl_sale_price_usd,
          'MXN' as monto_currency,
          CASE WHEN ds.delivery_address_id IS NOT NULL THEN true ELSE false END as has_delivery_instructions,
          false as needs_instructions,
          ds.national_carrier,
          NULL::numeric as national_shipping_cost,
          ds.national_tracking,
          ds.import_cost_usd as declared_value,
          COALESCE(ds.import_tax_mxn, 0) as import_tax_mxn,
          ds.exchange_rate,
          NULL::numeric as gex_total_cost,
          COALESCE(ds.total_cost_mxn, ds.saldo_pendiente,
            NULLIF(COALESCE(ds.import_cost_mxn,0) + COALESCE(ds.import_tax_mxn,0) + COALESCE(ds.national_cost_mxn,0), 0), 0)
            + CASE WHEN ds.has_gex THEN COALESCE((SELECT w.total_cost_mxn FROM warranties w WHERE w.gex_folio = ds.gex_folio LIMIT 1), 0) ELSE 0 END
            as assigned_cost_mxn
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
          COALESCE(c.eta::text, 'En tránsito') as fecha_estimada,
          COALESCE(c.sale_price, 0) as monto,
          false as client_paid,
          c.delivery_address_id,
          c.delivery_address_id as assigned_address_id,
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
          c.vessel_name,
          CASE WHEN c.delivery_address_id IS NOT NULL THEN true ELSE false END as has_delivery_instructions,
          c.national_carrier,
          COALESCE(c.national_shipping_cost, 0) as national_shipping_cost,
          c.delivery_notes as notes
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
          id, master_id, tracking_internal, tracking_provider, child_no,
          description, weight, pkg_length, pkg_width, pkg_height,
          single_cbm, declared_value,
          box_number, status::text as status,
          pobox_venta_usd, pobox_cost_usd, pobox_service_cost,
          pobox_tarifa_nivel, registered_exchange_rate,
          national_shipping_cost, gex_total_cost, air_sale_price,
          air_price_per_kg, air_chargeable_weight,
          assigned_cost_mxn, monto_pagado, saldo_pendiente
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
          // Para hijos AIR, el "tracking" que ve el cliente en la etiqueta
          // impresa es el child_no (AIR2610265SCHJM-040), no el
          // tracking_internal interno (US-XXXX). Igual lógica que en el query
          // del master para que la búsqueda local matchee.
          const displayTracking = (child.child_no && String(child.child_no).startsWith('AIR'))
            ? child.child_no
            : child.tracking_internal;
          childrenByMaster[masterId].push({
            id: child.id,
            tracking: displayTracking,
            child_no: child.child_no || null,
            tracking_internal: child.tracking_internal,
            tracking_provider: child.tracking_provider,
            description: child.description,
            weight: child.weight ? parseFloat(child.weight) : null,
            dimensions: child.pkg_length && child.pkg_width && child.pkg_height 
              ? `${child.pkg_length}×${child.pkg_width}×${child.pkg_height} cm` 
              : null,
            cbm: child.single_cbm ? parseFloat(child.single_cbm) : null,
            declared_value: child.declared_value ? parseFloat(child.declared_value) : null,
            box_number: child.box_number,
            status: child.status,
            pobox_venta_usd: child.pobox_venta_usd != null ? parseFloat(child.pobox_venta_usd) : null,
            pobox_cost_usd: child.pobox_cost_usd != null ? parseFloat(child.pobox_cost_usd) : null,
            pobox_service_cost: child.pobox_service_cost != null ? parseFloat(child.pobox_service_cost) : null,
            pobox_tarifa_nivel: child.pobox_tarifa_nivel != null ? Number(child.pobox_tarifa_nivel) : null,
            registered_exchange_rate: child.registered_exchange_rate != null ? parseFloat(child.registered_exchange_rate) : null,
            national_shipping_cost: child.national_shipping_cost != null ? parseFloat(child.national_shipping_cost) : null,
            gex_total_cost: child.gex_total_cost != null ? parseFloat(child.gex_total_cost) : null,
            air_sale_price: child.air_sale_price != null ? parseFloat(child.air_sale_price) : null,
            air_price_per_kg: child.air_price_per_kg != null ? parseFloat(child.air_price_per_kg) : null,
            air_chargeable_weight: child.air_chargeable_weight != null ? parseFloat(child.air_chargeable_weight) : null,
            assigned_cost_mxn: child.assigned_cost_mxn != null ? parseFloat(child.assigned_cost_mxn) : null,
            monto_pagado: child.monto_pagado != null ? parseFloat(child.monto_pagado) : null,
            saldo_pendiente: child.saldo_pendiente != null ? parseFloat(child.saldo_pendiente) : null,
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
        total_guides: children.length,
        // Origen para la etiqueta personalizada (tabla packages → source 'air')
        label_source: 'air',
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
        // Origen para la etiqueta personalizada (tabla maritime_orders)
        label_source: 'maritime',
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

    // 3b. Enriquecer paquetes (tabla packages) con cargos extra registrados en
    //     guias_ajustes_financieros (cargo_extra suma, descuento resta). Se
    //     incluyen los cargos del master + sus guías hijas.
    //     Los cargos en USD se convierten a MXN con el TC de TDI (único servicio
    //     que registra USD por ahora); MXN se dejan tal cual.
    try {
      // TC USD → MXN (fallback 1 si no hay config)
      let tcUsdToMxn = 1;
      try {
        const tcRes = await pool.query(`
          SELECT COALESCE(tipo_cambio_manual, ultimo_tc_api, 17.77) + COALESCE(sobreprecio, 0) AS tc
          FROM exchange_rate_config WHERE servicio = 'tdi' AND estado = TRUE LIMIT 1
        `);
        if (tcRes.rows.length > 0) tcUsdToMxn = Number(tcRes.rows[0].tc) || 1;
      } catch { /* fallback 1 */ }

      const idsForCharges = packagesWithChildren.flatMap((p: any) =>
        [p.id, ...((p.included_guides || []).map((c: any) => c.id))]
      ).filter((x: any) => x != null);
      if (idsForCharges.length > 0) {
        const chargesRes = await pool.query(
          `SELECT guia_id, tipo, monto, concepto, moneda
           FROM guias_ajustes_financieros
           WHERE activo = true AND guia_id = ANY($1::int[])`,
          [idsForCharges]
        );
        const chargesByGuia: Record<number, any[]> = {};
        for (const r of chargesRes.rows) {
          (chargesByGuia[r.guia_id] = chargesByGuia[r.guia_id] || []).push(r);
        }
        for (const p of packagesWithChildren) {
          const ids = [p.id, ...((p.included_guides || []).map((c: any) => c.id))];
          let total = 0;
          const list: any[] = [];
          for (const id of ids) {
            for (const c of (chargesByGuia[id] || [])) {
              const m = Number(c.monto) || 0;
              const monedaUp = String(c.moneda || 'MXN').toUpperCase();
              // Convertir a MXN sólo si la moneda es USD.
              const mMxn = monedaUp === 'USD' ? m * tcUsdToMxn : m;
              total += c.tipo === 'descuento' ? -mMxn : mMxn;
              list.push({
                tipo: c.tipo,
                monto: m,
                moneda: monedaUp,
                monto_mxn: mMxn,
                tc: monedaUp === 'USD' ? tcUsdToMxn : null,
                concepto: c.concepto,
              });
            }
          }
          p.extra_charges_total = total;      // ya en MXN
          p.extra_charges = list;             // incluye monto original y convertido
        }
      }
    } catch (e) {
      console.error('[dashboard/client] extra charges enrichment error:', e);
    }

    // 4. Obtener facturas recientes (si la tabla existe)
    let invoicesRows: any[] = [];
    try {
      // Los CFDI timbrados viven en facturas_emitidas (no en "facturas", que no
      // existe). Mostramos los del cliente, más recientes primero.
      const invoicesQuery = await pool.query(`
        SELECT
          id,
          COALESCE(folio, LEFT(uuid_sat, 8)) AS folio,
          created_at AS fecha,
          total,
          status,
          pdf_url,
          xml_url
        FROM facturas_emitidas
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      `, [userId]);
      invoicesRows = invoicesQuery.rows;
    } catch (err) {
      // Si la tabla no está disponible, continuar sin facturas
      console.log('Facturas no disponibles:', (err as Error).message);
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

    // Marcar paquetes que ya tienen una orden de pago pendiente
    const pendingOrdersRes = await pool.query(
      `SELECT package_ids FROM pobox_payments WHERE user_id = $1 AND status IN ('pending', 'pending_payment', 'pending_review')`,
      [userId]
    );
    const pendingPackageIds = new Set<number>();
    for (const row of pendingOrdersRes.rows) {
      try {
        const ids: number[] = Array.isArray(row.package_ids)
          ? row.package_ids
          : JSON.parse(row.package_ids || '[]');
        ids.forEach((id: number) => pendingPackageIds.add(Number(id)));
      } catch {}
    }

    // Firmar URLs de S3 para fotos de paquetes (bucket privado)
    const { signS3UrlIfNeeded } = await import('./s3Service');
    const allPackagesSigned = await Promise.all(allPackages.map(async (pkg: any) => {
      const withPending = pendingPackageIds.has(Number(pkg.id))
        ? { ...pkg, has_pending_payment_order: true }
        : pkg;
      if (!withPending.image_url) return withPending;
      return { ...withPending, image_url: await signS3UrlIfNeeded(withPending.image_url) };
    }));

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
      packages: allPackagesSigned,
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
        -- Aéreo China: mostrar la guía completa (child_no AIR...) no el código CN-...
        CASE WHEN child_no ILIKE 'AIR%' THEN child_no ELSE tracking_internal END as tracking,
        tracking_provider,
        description as descripcion,
        custom_label,
        service_type as servicio,
        CASE
          WHEN service_type = 'POBOX_USA' THEN 'air'
          WHEN service_type = 'AIR_CHN_MX' THEN 'china_air'
          WHEN service_type = 'SEA_CHN_MX' THEN 'maritime'
          WHEN service_type = 'tdi_express' OR air_source = 'tdi_express' THEN 'china_air'
          ELSE 'air'
        END as shipment_type,
        status,
        -- eVISA prepagado = handoff a eVISA para dispersión en MTY → "ENVIADO"
        -- (no lo entregó EntregaX directo). El resto queda "ENTREGADO".
        CASE
          WHEN LOWER(COALESCE(national_carrier, '')) IN ('evisa_pre', 'evisapre', 'evisa') THEN 'ENVIADO'
          ELSE 'ENTREGADO'
        END as status_label,
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
        pobox_service_cost,
        pobox_cost_usd,
        pobox_tarifa_nivel,
        registered_exchange_rate,
        national_carrier,
        national_tracking,
        national_label_url,
        national_shipping_cost,
        is_collect,
        collect_carrier,
        carrier,
        destination_address,
        destination_city,
        destination_contact,
        assigned_address_id,
        assigned_address_id as delivery_address_id,
        CASE 
          WHEN assigned_address_id IS NOT NULL THEN true
          WHEN (destination_address IS NOT NULL AND destination_address != 'Pendiente de asignar' AND destination_contact IS NOT NULL) THEN true
          ELSE false
        END as has_delivery_instructions
      FROM packages
      WHERE user_id = $1
        AND (
          status IN ('delivered', 'sent')
          OR (status = 'shipped' AND client_paid = true)
        )
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
          id, master_id, tracking_internal, tracking_provider, child_no,
          description, weight, pkg_length, pkg_width, pkg_height,
          single_cbm, declared_value,
          box_number, status::text as status,
          pobox_venta_usd, pobox_cost_usd, pobox_service_cost,
          pobox_tarifa_nivel, registered_exchange_rate,
          national_shipping_cost, gex_total_cost, air_sale_price,
          air_price_per_kg, air_chargeable_weight,
          assigned_cost_mxn, monto_pagado, saldo_pendiente
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
          // Igual que en /api/dashboard/client: si el child_no tiene formato AIR,
          // ese es el tracking que el cliente ve en su etiqueta — preferirlo.
          const displayTracking = (child.child_no && String(child.child_no).startsWith('AIR'))
            ? child.child_no
            : child.tracking_internal;
          childrenByMaster[masterId].push({
            id: child.id,
            tracking: displayTracking,
            child_no: child.child_no || null,
            tracking_internal: child.tracking_internal,
            tracking_provider: child.tracking_provider,
            description: child.description,
            weight: child.weight ? parseFloat(child.weight) : null,
            dimensions: child.pkg_length && child.pkg_width && child.pkg_height 
              ? `${child.pkg_length}×${child.pkg_width}×${child.pkg_height} cm` 
              : null,
            cbm: child.single_cbm ? parseFloat(child.single_cbm) : null,
            declared_value: child.declared_value ? parseFloat(child.declared_value) : null,
            box_number: child.box_number,
            status: child.status,
            pobox_venta_usd: child.pobox_venta_usd != null ? parseFloat(child.pobox_venta_usd) : null,
            pobox_cost_usd: child.pobox_cost_usd != null ? parseFloat(child.pobox_cost_usd) : null,
            pobox_service_cost: child.pobox_service_cost != null ? parseFloat(child.pobox_service_cost) : null,
            pobox_tarifa_nivel: child.pobox_tarifa_nivel != null ? Number(child.pobox_tarifa_nivel) : null,
            registered_exchange_rate: child.registered_exchange_rate != null ? parseFloat(child.registered_exchange_rate) : null,
            national_shipping_cost: child.national_shipping_cost != null ? parseFloat(child.national_shipping_cost) : null,
            gex_total_cost: child.gex_total_cost != null ? parseFloat(child.gex_total_cost) : null,
            air_sale_price: child.air_sale_price != null ? parseFloat(child.air_sale_price) : null,
            air_price_per_kg: child.air_price_per_kg != null ? parseFloat(child.air_price_per_kg) : null,
            air_chargeable_weight: child.air_chargeable_weight != null ? parseFloat(child.air_chargeable_weight) : null,
            assigned_cost_mxn: child.assigned_cost_mxn != null ? parseFloat(child.assigned_cost_mxn) : null,
            monto_pagado: child.monto_pagado != null ? parseFloat(child.monto_pagado) : null,
            saldo_pendiente: child.saldo_pendiente != null ? parseFloat(child.saldo_pendiente) : null,
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

// Subir guía(s) de paquetería nacional → fusiona a 1 PDF y lo deja disponible
// para imprimir (master + todas las hijas). Acepta 1+ archivos PDF/JPG/PNG.
const nationalGuideUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 15 } });
app.post('/api/packages/:id/national-guide', authenticateToken, nationalGuideUpload.array('files', 15), uploadNationalGuide);
app.post('/api/maritime/:id/national-guide', authenticateToken, nationalGuideUpload.array('files', 15), uploadMaritimeNationalGuide);
app.post('/api/dhl/:id/national-guide', authenticateToken, nationalGuideUpload.array('files', 15), uploadDhlNationalGuide);
// Sin auth: se abre/imprime en nueva pestaña desde el módulo de etiquetado.
app.get('/api/packages/:masterId/national-guide.pdf', streamNationalGuide);
app.get('/api/maritime/:id/national-guide.pdf', streamMaritimeNationalGuide);
app.get('/api/dhl/:id/national-guide.pdf', streamDhlNationalGuide);

// Historial de movimientos por tracking (cualquier usuario autenticado con permiso)
app.get('/api/packages/track/:tracking/movements', authenticateToken, getPackageMovementsByTracking);

// Fotos / evidencias de MoJie (China Air) por tracking. Sólo el dueño del
// paquete o staff con permiso pueden ver. Lee `evidence_urls` de la tabla
// `china_receipts` asociada al paquete.
app.get('/api/packages/track/:tracking/photos', authenticateToken, async (req: Request, res: Response) => {
  try {
    const tracking = String(req.params.tracking || '').trim();
    if (!tracking) {
      res.status(400).json({ success: false, error: 'Tracking requerido' });
      return;
    }
    const upper = tracking.toUpperCase();
    const compact = upper.replace(/[^A-Z0-9]/g, '');
    const userId = (req as any).user?.userId;
    const role = (req as any).user?.role;
    const isStaff = role && role !== 'client';

    // Buscar el paquete (acepta tracking_internal, tracking_provider, child_no)
    const pkgRes = await pool.query(
      `SELECT p.id, p.user_id, p.china_receipt_id, p.tracking_internal, p.child_no
       FROM packages p
       WHERE UPPER(p.tracking_internal) = $1
          OR UPPER(COALESCE(p.tracking_provider,'')) = $1
          OR UPPER(COALESCE(p.child_no,'')) = $1
          OR REGEXP_REPLACE(UPPER(COALESCE(p.tracking_internal,'')), '[^A-Z0-9]', '', 'g') = $2
          OR REGEXP_REPLACE(UPPER(COALESCE(p.child_no,'')), '[^A-Z0-9]', '', 'g') = $2
       ORDER BY p.id DESC
       LIMIT 1`,
      [upper, compact]
    );
    let pkg = pkgRes.rows[0];
    if (!pkg) {
      // Fallback: master Aéreo China cuya tarjeta usa el fno como tracking
      // (AIR2615662DJOtz). No existe fila en packages con ese tracking → buscar
      // el receipt directo por fno y armar un pkg virtual con sus evidencias.
      const crRes = await pool.query(
        `SELECT id, user_id, evidence_urls
         FROM china_receipts
         WHERE UPPER(fno) = $1
            OR REGEXP_REPLACE(UPPER(COALESCE(fno,'')), '[^A-Z0-9]', '', 'g') = $2
         ORDER BY id DESC
         LIMIT 1`,
        [upper, compact]
      );
      const cr = crRes.rows[0];
      if (cr) {
        pkg = {
          id: null,
          user_id: cr.user_id,
          china_receipt_id: cr.id,
          tracking_internal: upper,
          child_no: null,
        };
      }
    }
    if (!pkg) {
      res.status(404).json({ success: false, error: 'Paquete no encontrado' });
      return;
    }
    // Autorización: el dueño o staff
    if (!isStaff && pkg.user_id && Number(pkg.user_id) !== Number(userId)) {
      res.status(403).json({ success: false, error: 'No autorizado para ver este paquete' });
      return;
    }
    // Resolver fotos: primero por china_receipt_id directo; si no, por prefijo
    // del child_no (guías master virtual donde el paquete no tiene FK).
    let photos: string[] = [];
    if (pkg.china_receipt_id) {
      const r = await pool.query(
        'SELECT evidence_urls FROM china_receipts WHERE id = $1',
        [pkg.china_receipt_id]
      );
      photos = r.rows[0]?.evidence_urls || [];
    }
    if ((!photos || photos.length === 0) && pkg.tracking_internal) {
      // Master virtual: "AIR2630456Qydeh-001" → buscar receipt con fno = "AIR2630456Qydeh"
      const fnoCandidate = String(pkg.tracking_internal).toUpperCase().replace(/-\d{1,4}$/, '');
      const r = await pool.query(
        `SELECT evidence_urls FROM china_receipts
         WHERE UPPER(fno) = $1
            OR REGEXP_REPLACE(UPPER(fno), '[^A-Z0-9]', '', 'g') = $2
         LIMIT 1`,
        [fnoCandidate, fnoCandidate.replace(/[^A-Z0-9]/g, '')]
      );
      photos = r.rows[0]?.evidence_urls || [];
    }
    // Normalizar: algunos evidence_urls quedaron guardados como un string que a
    // su vez es un JSON array (doble codificación), p.ej. '["http://...png"]'.
    // Aplanar cada elemento a URLs individuales antes de firmar/servir.
    const flatUrls: string[] = [];
    const pushUrl = (v: any) => {
      if (typeof v !== 'string') return;
      const s = v.trim();
      if (!s) return;
      if (s.startsWith('[') || s.startsWith('"')) {
        try {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) { parsed.forEach(pushUrl); return; }
          if (typeof parsed === 'string') { pushUrl(parsed); return; }
        } catch { /* no era JSON, seguir */ }
      }
      if (/^https?:\/\//i.test(s)) flatUrls.push(s);
    };
    (Array.isArray(photos) ? photos : []).forEach(pushUrl);
    // Las fotos S3 privadas se firman; las de MoJie llegan por http (sin https),
    // que el ATS de iOS bloquea → las servimos por nuestro proxy https.
    const proto = (String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0] || 'https').trim();
    const host = req.get('host');
    const selfBase = host ? `${proto}://${host}` : '';
    const { signS3UrlIfNeeded } = await import('./s3Service');
    const signedPhotos = (await Promise.all(
      flatUrls.map(async (u) => {
        if (/^https?:\/\/[^/]*mojiegrupo\.com/i.test(u)) {
          return selfBase
            ? `${selfBase}/api/packages/photo-proxy?url=${encodeURIComponent(u)}`
            : u;
        }
        return await signS3UrlIfNeeded(u, 3600);
      })
    )).filter(Boolean);
    res.json({ success: true, photos: signedPhotos });
  } catch (err: any) {
    console.error('[photos] error:', err?.message);
    res.status(500).json({ success: false, error: 'Error al cargar fotos' });
  }
});

// Proxy de imágenes de MoJie (solo http, sin https) para pasar el ATS de iOS.
// Sin auth (el componente <Image> no envía headers) pero con whitelist ESTRICTO
// de host → evita SSRF. Solo sirve content-type image/*.
app.get('/api/packages/photo-proxy', async (req: Request, res: Response) => {
  try {
    const raw = String(req.query.url || '');
    let target: URL;
    try { target = new URL(raw); } catch { res.status(400).end(); return; }
    if (!/(^|\.)mojiegrupo\.com$/i.test(target.hostname)) { res.status(403).end(); return; }
    const upstream = await fetch(target.toString());
    if (!upstream.ok) { res.status(502).end(); return; }
    const ct = upstream.headers.get('content-type') || 'image/png';
    if (!/^image\//i.test(ct)) { res.status(415).end(); return; }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch (err: any) {
    console.error('[photo-proxy] error:', err?.message);
    res.status(500).end();
  }
});

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

// =========================================================================
// Constancia de Situación Fiscal (CSF) — per-cliente con vigencia 3 meses
// =========================================================================
const csfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
// Self (cliente sube la suya / asesor sube la suya)
app.post('/api/fiscal/constancia', authenticateToken, csfUpload.single('constancia'), csfUploadHandler);
app.get('/api/fiscal/constancia', authenticateToken, csfStatusHandler);
// Asesor sube en nombre de un cliente que tiene asignado
app.post('/api/advisor/clients/:clientId/constancia', authenticateToken, csfUpload.single('constancia'), csfUploadForClientHandler);
app.get('/api/advisor/clients/:clientId/constancia', authenticateToken, csfClientStatusHandler);

// 📋 Paquetes PO Box sin cliente asignado (con días en bodega) - DEBE IR ANTES DE /:id
app.get('/api/packages/unassigned', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getUnassignedPackages);
// 🔎 Búsqueda libre de clientes (users + legacy_clients) - DEBE IR ANTES DE /:id
app.get('/api/packages/search-clients', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), searchClients);

// 📷 Paquetes PO Box que necesitan foto (hijas para multi-caja, master/standalone para 1 caja)
app.get('/api/packages/pobox-photos-needed', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      WITH child_counts AS (
        SELECT master_id, COUNT(*) AS cnt
        FROM packages WHERE master_id IS NOT NULL
        GROUP BY master_id
      )
      SELECT
        p.id,
        p.tracking_internal AS tracking,
        p.tracking_provider,
        p.image_url,
        p.is_master,
        p.master_id,
        p.box_number,
        p.received_at,
        mp.tracking_internal AS master_tracking,
        COALESCE(cc_child.cnt, cc_master.cnt, 0) AS total_boxes,
        COALESCE(
          CASE WHEN p.master_id IS NOT NULL THEN mu.full_name ELSE u.full_name END,
          CASE WHEN p.master_id IS NOT NULL THEN mlc.full_name ELSE lc.full_name END
        ) AS client_name,
        COALESCE(
          CASE WHEN p.master_id IS NOT NULL THEN mu.box_id ELSE u.box_id END,
          CASE WHEN p.master_id IS NOT NULL THEN mlc.box_id ELSE lc.box_id END,
          p.box_id, mp.box_id
        ) AS client_box_id
      FROM packages p
      LEFT JOIN child_counts cc_child ON cc_child.master_id = p.master_id
      LEFT JOIN child_counts cc_master ON cc_master.master_id = p.id
      LEFT JOIN packages mp ON mp.id = p.master_id
      LEFT JOIN users u ON p.user_id = u.id AND p.master_id IS NULL
      LEFT JOIN legacy_clients lc ON p.user_id IS NULL AND p.master_id IS NULL AND UPPER(p.box_id) = UPPER(lc.box_id)
      LEFT JOIN users mu ON mp.user_id = mu.id AND p.master_id IS NOT NULL
      LEFT JOIN legacy_clients mlc ON mp.user_id IS NULL AND p.master_id IS NOT NULL AND UPPER(mp.box_id) = UPPER(mlc.box_id)
      WHERE
        p.image_url IS NULL
        AND p.status = 'received'
        -- Para hijos: el master también debe estar en 'received' (evita mostrar
        -- hijos de masters que ya salieron de CEDIS)
        AND (p.master_id IS NULL OR mp.status = 'received')
        AND (
          p.service_type = 'POBOX_USA'
          OR (p.service_type IS NULL AND (
            p.tracking_internal LIKE 'US-%'
            OR (p.master_id IS NOT NULL AND mp.tracking_internal LIKE 'US-%')
          ))
        )
        AND (
          (p.master_id IS NULL AND NOT p.is_master)
          OR (p.master_id IS NOT NULL AND cc_child.cnt >= 2)
          OR (p.is_master AND COALESCE(cc_master.cnt, 0) <= 1)
        )
      ORDER BY COALESCE(p.received_at, p.created_at) DESC
      LIMIT 500
    `);

    const packages = result.rows.map((row: any) => ({
      id: row.id,
      tracking: row.tracking,
      trackingProvider: row.tracking_provider || null,
      isMaster: row.is_master,
      masterId: row.master_id || null,
      masterTracking: row.master_tracking || null,
      boxNumber: row.box_number || null,
      totalBoxes: parseInt(row.total_boxes) || 0,
      receivedAt: row.received_at,
      client: {
        name: row.client_name || 'Sin cliente',
        boxId: row.client_box_id || 'N/A',
      },
    }));

    return res.json({ packages });
  } catch (error: any) {
    console.error('Error pobox-photos-needed:', error);
    return res.status(500).json({ error: error.message || 'Error' });
  }
});

// GET /api/packages/pobox-lookup?tracking=XXX — busca una guía por tracking
// (interno o del proveedor) para el flujo de "Agregar Fotos" con escáner global.
// Devuelve: { found, hasPhoto, package: { id, tracking, ... } }
app.get('/api/packages/pobox-lookup', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const raw = String(req.query.tracking || '').trim().toUpperCase();
    if (!raw) return res.status(400).json({ error: 'tracking requerido' });

    const result = await pool.query(`
      SELECT
        p.id,
        p.tracking_internal AS tracking,
        p.tracking_provider,
        p.image_url,
        p.is_master,
        p.master_id,
        p.box_number,
        p.status,
        mp.tracking_internal AS master_tracking,
        COALESCE(
          CASE WHEN p.master_id IS NOT NULL THEN mu.full_name ELSE u.full_name END,
          CASE WHEN p.master_id IS NOT NULL THEN mlc.full_name ELSE lc.full_name END
        ) AS client_name,
        COALESCE(
          CASE WHEN p.master_id IS NOT NULL THEN mu.box_id ELSE u.box_id END,
          CASE WHEN p.master_id IS NOT NULL THEN mlc.box_id ELSE lc.box_id END,
          p.box_id, mp.box_id
        ) AS client_box_id
      FROM packages p
      LEFT JOIN packages mp ON mp.id = p.master_id
      LEFT JOIN users u ON p.user_id = u.id AND p.master_id IS NULL
      LEFT JOIN legacy_clients lc ON p.user_id IS NULL AND p.master_id IS NULL AND UPPER(p.box_id) = UPPER(lc.box_id)
      LEFT JOIN users mu ON mp.user_id = mu.id AND p.master_id IS NOT NULL
      LEFT JOIN legacy_clients mlc ON mp.user_id IS NULL AND p.master_id IS NOT NULL AND UPPER(mp.box_id) = UPPER(mlc.box_id)
      WHERE UPPER(p.tracking_internal) = $1
         OR UPPER(p.tracking_provider) = $1
      ORDER BY p.id DESC
      LIMIT 1
    `, [raw]);

    if (result.rows.length === 0) {
      return res.json({ found: false });
    }

    const row = result.rows[0];
    return res.json({
      found: true,
      hasPhoto: !!row.image_url,
      package: {
        id: row.id,
        tracking: row.tracking,
        trackingProvider: row.tracking_provider || null,
        imageUrl: row.image_url || null,
        isMaster: row.is_master,
        masterId: row.master_id || null,
        masterTracking: row.master_tracking || null,
        boxNumber: row.box_number || null,
        status: row.status,
        client: {
          name: row.client_name || 'Sin cliente',
          boxId: row.client_box_id || 'N/A',
        },
      },
    });
  } catch (error: any) {
    console.error('Error pobox-lookup:', error);
    return res.status(500).json({ error: error.message || 'Error' });
  }
});

// Obtener detalle de paquete por ID (usuario dueño o staff+)
app.get('/api/packages/:id', authenticateToken, getPackageById);

// Obtener movimientos de guía por ID (usuario dueño o staff+)
app.get('/api/packages/:id/movements', authenticateToken, getPackageMovementsById);

// Obtener etiquetas para imprimir (Bodega o superior)
app.get('/api/packages/:id/labels', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getPackageLabels);

// Guías hijas (cajas) de una guía master — para ver/cambiar estado individual
app.get('/api/packages/:id/children', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getPackageChildren);
// Actualizar estatus de paquete (Bodega o superior)
app.patch('/api/packages/:id/status', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updatePackageStatus);

// Editar el PESO de una guía — solo Super Admin (corrección manual).
app.patch('/api/packages/:id/weight', authenticateToken, requireRole(ROLES.SUPER_ADMIN), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const weight = Number((req.body || {}).weight);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    if (!Number.isFinite(weight) || weight <= 0) return res.status(400).json({ error: 'El peso debe ser mayor a 0' });
    const upd = await pool.query(
      `UPDATE packages SET weight = $1, updated_at = NOW() WHERE id = $2 RETURNING id, weight`,
      [weight, id]
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: 'Guía no encontrada' });
    return res.json({ success: true, message: 'Peso actualizado', id, weight: Number(upd.rows[0].weight) });
  } catch (err: any) {
    console.error('[packages/:id/weight]', err.message);
    return res.status(500).json({ error: 'Error al actualizar el peso' });
  }
});

// Actualizar cliente de un paquete (Bodega o superior)
app.patch('/api/packages/:id/client', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updatePackageClient);

// DELETE package - SOLO super_admin
app.delete('/api/packages/:id', authenticateToken, requireRole('super_admin', 'branch_manager'), deletePackage);

// PATCH batch image - asigna una foto a varios paquetes (recepción en serie)
app.patch('/api/packages/batch-image', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), batchAttachImage);

// ============================================================
// SERVICIO A CLIENTE — Revertir Instrucciones de Entrega
// ============================================================
// Busca un paquete por tracking y devuelve sus instrucciones actuales
// (dirección asignada, dirección destino, estado). Permite que el agente
// de servicio a cliente revise antes de revertir.
app.get('/api/cs/instructions/lookup', authenticateToken, requireMinLevel(ROLES.CUSTOMER_SERVICE), async (req: AuthRequest, res: Response) => {
  try {
    const tracking = String(req.query.tracking || '').trim();
    if (!tracking) return res.status(400).json({ error: 'tracking es requerido' });
    // Búsqueda flexible: tracking_internal o tracking_provider, con o sin guión.
    const compact = tracking.replace(/-/g, '').toUpperCase();
    const r = await pool.query(
      `SELECT
         p.id,
         p.tracking_internal,
         p.tracking_provider,
         p.origin_carrier,
         p.user_id,
         p.box_id,
         p.service_type,
         p.status,
         CASE WHEN p.assigned_address_id IS NOT NULL
                OR p.delivery_address_id IS NOT NULL
              THEN TRUE ELSE FALSE END AS has_delivery_instructions,
         p.delivery_address_id,
         p.assigned_address_id,
         p.destination_country,
         p.destination_city,
         p.destination_address,
         p.destination_zip,
         p.destination_phone,
         p.destination_contact,
         p.national_carrier,
         p.national_tracking,
         p.national_label_url,
         p.is_master,
         p.master_id,
         p.china_receipt_id,
         cr.fno AS receipt_fno,
         u.full_name AS client_name,
         u.email AS client_email,
         a.alias AS address_alias,
         TRIM(BOTH ' ' FROM CONCAT_WS(' ',
           a.street,
           a.exterior_number,
           CASE WHEN a.interior_number IS NOT NULL AND a.interior_number <> ''
                THEN 'Int. ' || a.interior_number END,
           CASE WHEN a.neighborhood IS NOT NULL AND a.neighborhood <> ''
                THEN 'Col. ' || a.neighborhood END
         )) AS address_line,
         a.city AS address_city,
         a.state AS address_state,
         a.zip_code AS address_zip
       FROM packages p
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN addresses a ON a.id = p.assigned_address_id
       LEFT JOIN china_receipts cr ON cr.id = p.china_receipt_id
       LEFT JOIN packages mp ON mp.id = p.master_id
       WHERE UPPER(p.tracking_internal) = UPPER($1)
          OR UPPER(p.tracking_provider) = UPPER($1)
          OR REPLACE(UPPER(p.tracking_internal), '-', '') = $2
          OR REPLACE(UPPER(p.tracking_provider), '-', '') = $2
          -- Buscar por la guía del recibo aéreo (china_receipts.fno) → sus hijas
          OR UPPER(cr.fno) = UPPER($1)
          OR REPLACE(UPPER(cr.fno), '-', '') = $2
          -- Buscar por la guía del master → sus hijas
          OR UPPER(mp.tracking_internal) = UPPER($1)
          OR REPLACE(UPPER(mp.tracking_internal), '-', '') = $2
       ORDER BY p.tracking_internal
       LIMIT 40`,
      [tracking, compact]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Paquete no encontrado' });
    }
    return res.json({ success: true, results: r.rows });
  } catch (err: any) {
    console.error('[CS-INSTRUCTIONS-LOOKUP]', err.message);
    return res.status(500).json({ error: 'Error al buscar paquete' });
  }
});

// Revierte las instrucciones de entrega de un paquete: limpia
// assigned_address_id, delivery_address_id, has_delivery_instructions y
// los campos de destino que el cliente había llenado. NO toca etiquetas
// impresas (national_label_url/national_tracking) — si la guía ya tenía
// etiqueta, devolvemos error para evitar inconsistencia con la paquetería.
app.post('/api/cs/instructions/revert', authenticateToken, requireMinLevel(ROLES.CUSTOMER_SERVICE), async (req: AuthRequest, res: Response) => {
  try {
    const { packageId, reason, force } = req.body || {};
    const id = parseInt(String(packageId), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'packageId inválido' });
    // force = el agente confirmó que ya notificó a CEDIS. Permite revertir las
    // instrucciones aunque la guía ya tenga etiqueta impresa. NO se cancela ni
    // se borra la etiqueta (CEDIS la cancela por su lado).
    const forceRevert = force === true || force === 'true';

    const cur = await pool.query(
      `SELECT id, tracking_internal, assigned_address_id,
              delivery_address_id, destination_address, national_label_url,
              national_tracking, status, is_master
       FROM packages WHERE id = $1`,
      [id]
    );
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Paquete no encontrado' });
    const pkg = cur.rows[0];

    // Bloqueo de seguridad: si ya tiene etiqueta nacional impresa, el
    // paquete está comprometido con la paquetería. Revertir aquí dejaría
    // la etiqueta inconsistente y el chofer entregando a una dirección
    // que ya no existe en el sistema.
    if ((pkg.national_label_url || pkg.national_tracking) && !forceRevert) {
      return res.status(409).json({
        error: 'No se puede revertir: la guía ya tiene etiqueta impresa. Cancela primero la etiqueta de paquetería.',
        hasLabel: true,
      });
    }
    if ((pkg.national_label_url || pkg.national_tracking) && forceRevert) {
      console.warn(`[CS-INSTRUCTIONS-REVERT] Forzado con etiqueta impresa (CEDIS notificado) pkg=${id} carrier=${pkg.national_carrier || '?'} por user=${req.user?.userId}`);
    }
    if (['delivered', 'out_for_delivery', 'returned_to_warehouse'].includes(String(pkg.status))) {
      return res.status(409).json({
        error: `No se puede revertir: el paquete está en estado "${pkg.status}". Solo se puede revertir antes de salir a ruta.`,
      });
    }

    const userId = req.user?.userId || null;
    await pool.query(
      `UPDATE packages SET
         assigned_address_id = NULL,
         delivery_address_id = NULL,
         destination_address = 'Pendiente de asignar',
         destination_city = NULL,
         destination_zip = NULL,
         destination_phone = NULL,
         destination_contact = NULL,
         needs_instructions = TRUE,
         -- Revertir el marcador de "etiquetado" (national_label_url) que pone el
         -- módulo de etiquetado. Es lo que revisa la app del repartidor (has_label)
         -- para mostrar la guía en la carga: sin etiqueta ⇒ ya no aparece.
         national_label_url = NULL,
         updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Si es master, revertir también las instrucciones de TODAS sus hijas
    // (no se tocan las que ya salieron a ruta / entregadas).
    let childrenReverted = 0;
    if (pkg.is_master) {
      const childRes = await pool.query(
        `UPDATE packages SET
           assigned_address_id = NULL,
           delivery_address_id = NULL,
           destination_address = 'Pendiente de asignar',
           destination_city = NULL,
           destination_zip = NULL,
           destination_phone = NULL,
           destination_contact = NULL,
           needs_instructions = TRUE,
           national_label_url = NULL,
           updated_at = NOW()
         WHERE master_id = $1
           AND status NOT IN ('delivered', 'out_for_delivery', 'returned_to_warehouse')`,
        [id]
      );
      childrenReverted = childRes.rowCount || 0;
      console.log(`🔄 [CS-INSTRUCTIONS-REVERT] master #${id} → ${childrenReverted} hija(s) revertida(s)`);
    }

    // Audit log best-effort (fuera de transacción para que no envenene si la tabla no existe)
    pool.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, user_id, details)
       VALUES ('REVERT_DELIVERY_INSTRUCTIONS', 'packages', $1, $2, $3)`,
      [id, userId, JSON.stringify({
        tracking: pkg.tracking_internal,
        previous_assigned_address_id: pkg.assigned_address_id,
        previous_delivery_address_id: pkg.delivery_address_id,
        previous_destination_address: pkg.destination_address,
        reason: String(reason || '').trim() || null,
      })]
    ).catch(() => {});

    console.log(`🔄 [CS-INSTRUCTIONS-REVERT] pkg #${id} (${pkg.tracking_internal}) revertido por user #${userId}`);
    return res.json({ success: true, packageId: id, tracking: pkg.tracking_internal, childrenReverted });
  } catch (err: any) {
    console.error('[CS-INSTRUCTIONS-REVERT]', err.message);
    return res.status(500).json({ error: 'Error al revertir instrucciones' });
  }
});

// Recepción incremental en serie: crea master vacío y agrega hijas una por una
app.post('/api/packages/bulk-master/start', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), startBulkMaster);
app.patch('/api/packages/bulk-master/:masterId', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updateBulkMaster);
app.post('/api/packages/bulk-master/:masterId/box', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), addBulkBoxToMaster);
app.delete('/api/packages/bulk-master/:masterId/child/:childId', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), removeBulkBoxFromMaster);
app.post('/api/packages/bulk-master/:masterId/notify-reception', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), notifyBulkMasterReception);
app.delete('/api/packages/bulk-master/:masterId/cancel', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), cancelBulkMaster);

// POST /api/packages/:id/reception-photo — sube foto de recepción y la asocia al paquete
const receptionPhotoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
app.post('/api/packages/:id/reception-photo', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), receptionPhotoUpload.single('photo'), async (req: AuthRequest, res: Response) => {
  try {
    const pkgId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(pkgId)) return res.status(400).json({ error: 'id inválido' });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No se envió foto' });
    const { uploadToS3 } = await import('./s3Service');
    const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
    const key = `reception-photos/${pkgId}_${Date.now()}.${ext}`;
    const imageUrl = await uploadToS3(file.buffer, key, file.mimetype || 'image/jpeg');
    await pool.query('UPDATE packages SET image_url = $1, updated_at = NOW() WHERE id = $2', [imageUrl, pkgId]);
    res.json({ success: true, imageUrl });
  } catch (error: any) {
    console.error('❌ Error reception-photo:', error);
    res.status(500).json({ error: error.message || 'Error al subir foto' });
  }
});

// GET /api/packages/:id/children — devuelve las cajas hijas de un master
app.get('/api/packages/:id/children', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const pkgId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(pkgId)) return res.status(400).json({ error: 'ID inválido' });
    const result = await pool.query(
      `SELECT id, tracking_internal AS tracking, image_url FROM packages
       WHERE master_id = $1
       ORDER BY id ASC`,
      [pkgId]
    );
    const { signS3UrlIfNeeded } = await import('./s3Service');
    const children = await Promise.all(result.rows.map(async (row: any) => ({
      ...row,
      image_url: await signS3UrlIfNeeded(row.image_url),
    })));
    return res.json({ children });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Error' });
  }
});

//  Lookup de cliente por casillero (busca en users y legacy_clients)
app.get('/api/packages/lookup-client/:boxId', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), async (req, res) => {
  try {
    const boxId = String(req.params.boxId || '').trim().toUpperCase();
    if (!boxId) return res.status(400).json({ found: false, error: 'boxId requerido' });

    const u = await pool.query(
      'SELECT id, full_name, box_id, email, COALESCE(is_broker, false) AS is_broker FROM users WHERE UPPER(box_id) = $1 LIMIT 1',
      [boxId]
    );
    if (u.rows.length > 0) {
      const r = u.rows[0];
      return res.json({
        found: true, source: 'users',
        id: r.id, fullName: r.full_name, boxId: r.box_id, email: r.email || null,
        isBroker: r.is_broker === true,
      });
    }

    const lg = await pool.query(
      'SELECT id, full_name, box_id FROM legacy_clients WHERE UPPER(box_id) = $1 LIMIT 1',
      [boxId]
    );
    if (lg.rows.length > 0) {
      const r = lg.rows[0];
      return res.json({
        found: true, source: 'legacy',
        id: r.id, fullName: r.full_name, boxId: r.box_id, email: null,
      });
    }

    return res.json({ found: false });
  } catch (err: any) {
    console.error('[lookup-client] error:', err);
    res.status(500).json({ found: false, error: err.message });
  }
});

// Solicitar reempaque/consolidación de paquetes (Usuario autenticado)
app.post('/api/packages/repack', authenticateToken, validateBody(requestRepackSchema), requestRepack);

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
            WHERE (UPPER(cr.ordersn) = $1 OR UPPER(cr.awb_number) = $1 OR UPPER(cr.fno) = $1)
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
app.patch('/api/packages/:id/label', authenticateToken, setPackageLabel);
app.post('/api/translate', authenticateToken, translateTexts);

// Crear consolidación (solicitud de envío)
app.post('/api/consolidations', authenticateToken, createConsolidation);

// --- RUTAS ADMIN: CONSOLIDACIONES ---
app.get('/api/admin/consolidations', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAdminConsolidations);
app.put('/api/admin/consolidations/dispatch', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), dispatchConsolidation);

// --- RUTAS DE PAGOS (PayPal) ---
app.post('/api/payments/create', authenticateToken, paymentLimiter, validateBody(createPaymentOrderSchema), createPaymentOrder);
app.post('/api/payments/capture', authenticateToken, paymentLimiter, validateBody(capturePaymentOrderSchema), capturePaymentOrder);
app.get('/api/payments/status/:consolidationId', authenticateToken, getPaymentStatus);

// --- RUTAS DE PAGOS NUEVAS - GATEWAY INTEGRATIONS ---
app.post('/api/payments/openpay/card', authenticateToken, processOpenPayCard);
app.get('/api/payments/openpay/available', authenticateToken, checkOpenpayAvailable);
app.post('/api/payments/paypal/create', authenticateToken, paymentLimiter, createPayPalPayment);
app.post('/api/payments/branch/reference', authenticateToken, createBranchPayment);

// --- OPENPAY: TARJETAS GUARDADAS (Opción A) ---
import {
  getOpenpayPublicKey,
  listSavedCards,
  saveCardFromToken,
  deleteSavedCard,
  chargeSavedCard,
} from './openpaySavedCardsController';
app.get('/api/payments/openpay/public-key', authenticateToken, getOpenpayPublicKey);
app.get('/api/payments/openpay/cards', authenticateToken, listSavedCards);
app.post('/api/payments/openpay/cards', authenticateToken, saveCardFromToken);
app.delete('/api/payments/openpay/cards/:cardId', authenticateToken, deleteSavedCard);
app.post('/api/payments/openpay/charge-saved-card', authenticateToken, chargeSavedCard);

// --- CALLBACKS Y WEBHOOKS DE PAGOS (sin auth, son redirecciones de pasarelas) ---
app.get('/api/payments/openpay/callback', handleOpenpayPaymentCallback);
app.post('/api/payments/openpay/verify', authenticateToken, verifyOpenpayCharge);
app.post('/api/payments/openpay/webhook', handleOpenpayPaymentWebhook);
app.get('/api/payments/paypal/callback', handlePayPalPaymentCallback);
// PayPal webhook (firma verificada via /v1/notifications/verify-webhook-signature)
import { handlePayPalWebhook } from './paypalWebhookController';
app.post('/api/payments/paypal/webhook', handlePayPalWebhook);
// PayPal refunds (director+)
import { refundPayPalCapture, listPayPalRefunds } from './paypalRefundController';
app.post('/api/payments/paypal/refund', authenticateToken, requireMinLevel(ROLES.DIRECTOR), paymentLimiter, refundPayPalCapture);
app.get('/api/payments/paypal/refunds', authenticateToken, requireMinLevel(ROLES.DIRECTOR), listPayPalRefunds);

// --- RUTA DE PRUEBA PARA CONFIRMAR PAGOS ---
app.post('/api/payments/test/confirm', authenticateToken, testConfirmPayment);

// --- RUTAS DE FACTURACIÓN ---
app.get('/api/fiscal/data', authenticateToken, getFiscalData);
app.put('/api/fiscal/data', authenticateToken, updateFiscalData);
app.get('/api/fiscal/invoices', authenticateToken, getFacturasUsuario);

// --- RUTAS DE PAGOS PO BOX (Múltiples métodos) - MULTISUCURSAL ---
app.post('/api/pobox/payment/create', authenticateToken, paymentLimiter, createPoboxPaypalPayment);      // PayPal
app.post('/api/pobox/payment/capture', authenticateToken, paymentLimiter, capturePoboxPaypalPayment);    // Captura PayPal
app.post('/api/pobox/payment/openpay/create', authenticateToken, paymentLimiter, createPoboxOpenpayPayment);  // OpenPay tarjeta
app.post('/api/pobox/payment/cash/create', authenticateToken, createPoboxCashPayment);   // Efectivo/Transferencia
app.delete('/api/pobox/payment/order/:id', authenticateToken, cancelPoboxPaymentOrder); // Cancelar orden de pago
app.post('/api/pobox/payment/order/:id/pay-internal', authenticateToken, paymentLimiter, validateBody(payPoboxInternalSchema), payPoboxOrderInternal); // Pago con saldo/crédito
app.post('/api/pobox/payment/order/:id/apply-credit', authenticateToken, paymentLimiter, validateBody(applyCreditPoboxSchema), applyCreditToPoboxOrder); // Aplicar crédito parcial
app.post('/api/pobox/payment/order/:id/revert-credit', authenticateToken, paymentLimiter, revertCreditFromPoboxOrder); // Revertir crédito parcial
app.post('/api/pobox/payment/order/:id/apply-wallet', authenticateToken, paymentLimiter, validateBody(applyWalletPoboxSchema), applyWalletToPoboxOrder); // Aplicar saldo a favor parcial
app.post('/api/pobox/payment/order/:id/revert-wallet', authenticateToken, paymentLimiter, revertWalletFromPoboxOrder); // Revertir saldo a favor

// ========== PORTAL CONTABLE (Multi-Empresa) ==========
app.get('/api/accounting/my-emitters', authenticateToken, getMyEmitters);
app.get('/api/accounting/pending-stamp-summary', authenticateToken, getPendingStampSummary);
app.get('/api/accounting/:emitterId/summary', authenticateToken, getEmitterSummary);
app.get('/api/accounting/:emitterId/invoices', authenticateToken, listEmitterInvoices);
app.get('/api/accounting/:emitterId/invoices/:invoiceId/file', authenticateToken, downloadEmittedInvoiceFile);
app.get('/api/accounting/:emitterId/pending-stamp', authenticateToken, listPendingStamp);
app.post('/api/accounting/:emitterId/pending-stamp/:paymentId/archive', authenticateToken, archivePendingStamp);
app.post('/api/fiscal/invoice/manual', authenticateToken, emitManualCFDI);
app.get('/api/accounting/:emitterId/fiscal-clients', authenticateToken, searchFiscalClients);
app.post('/api/accounting/:emitterId/invoices/manual', authenticateToken, createManualInvoice);
app.post('/api/accounting/:emitterId/invoices/:invoiceId/cancel', authenticateToken, cancelEmittedInvoice);
app.post('/api/accounting/:emitterId/invoices/:invoiceId/resend-email', authenticateToken, resendInvoiceEmail);
app.delete('/api/accounting/:emitterId/invoices/:invoiceId', authenticateToken, deleteEmittedInvoice);
app.get('/api/accounting/accountants', authenticateToken, listAccountants);
app.post('/api/accounting/accountants/:userId/permissions', authenticateToken, grantAccountantPermission);
app.delete('/api/accounting/accountants/:userId/permissions/:emitterId', authenticateToken, revokeAccountantPermission);

// Inventarios: categorías
app.get('/api/accounting/:emitterId/categories', authenticateToken, listCategories);
app.post('/api/accounting/:emitterId/categories', authenticateToken, createCategory);
app.put('/api/accounting/:emitterId/categories/:categoryId', authenticateToken, updateCategory);
app.delete('/api/accounting/:emitterId/categories/:categoryId', authenticateToken, deleteCategory);

// Inventarios: productos
app.get('/api/accounting/:emitterId/products', authenticateToken, listProducts);
app.post('/api/accounting/:emitterId/products', authenticateToken, createProduct);
app.put('/api/accounting/:emitterId/products/:productId', authenticateToken, updateProduct);
app.delete('/api/accounting/:emitterId/products/:productId', authenticateToken, deleteProduct);
app.post('/api/accounting/:emitterId/products/:productId/stock', authenticateToken, adjustProductStock);

// Facturas recibidas
app.get('/api/accounting/:emitterId/received-invoices', authenticateToken, listReceivedInvoices);
app.get('/api/accounting/:emitterId/received-invoices/:invoiceId', authenticateToken, getReceivedInvoiceDetail);
app.post('/api/accounting/:emitterId/received-invoices/upload', authenticateToken, uploadReceivedInvoice);
app.post('/api/accounting/:emitterId/received-invoices/:invoiceId/import-inventory', authenticateToken, importReceivedInvoiceToInventory);
app.delete('/api/accounting/:emitterId/received-invoices/:invoiceId', authenticateToken, deleteReceivedInvoice);

// Movimientos bancarios (Belvo) por empresa
app.get('/api/accounting/:emitterId/bank-movements', authenticateToken, listBankMovements);
app.post('/api/accounting/:emitterId/bank-movements/sync', authenticateToken, syncBankMovements);
app.get('/api/pobox/payment/status/:paymentId', authenticateToken, getPoboxPaymentStatus);
app.post('/api/pobox/payment/cash/confirm', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), confirmPoboxCashPayment); // Admin confirma pago efectivo
app.get('/api/pobox/payment/history', authenticateToken, getPoboxPaymentHistory); // Historial del cliente
app.get('/api/admin/pobox/payments/pending', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getPoboxPendingPayments); // Admin: Pagos pendientes

// --- RUTAS DE RECEPCIÓN DE CONSOLIDACIONES PO BOX (MTY) ---
app.get('/api/admin/pobox/consolidations/in-transit', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), listInTransitConsolidations);
app.get('/api/admin/pobox/consolidations/:id/packages', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getConsolidationPackages);
app.post('/api/admin/pobox/consolidations/:id/receive', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), receiveConsolidation);
app.post('/api/admin/pobox/packages/:id/mark-found', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), markPackageAsFound);
app.post('/api/admin/pobox/packages/:id/mark-lost', authenticateToken, requireMinLevel(ROLES.CUSTOMER_SERVICE), markPackageAsLost);
app.post('/api/admin/pobox/packages/mark-lost-bulk', authenticateToken, requireMinLevel(ROLES.CUSTOMER_SERVICE), markPackagesAsLostBulk);
app.get('/api/admin/customer-service/delayed-packages', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getDelayedPackages);
app.get('/api/admin/customer-service/partial-receptions', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getPartialReceptions);
app.get('/api/admin/customer-service/lost-packages', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getLostPackages);
app.post('/webhooks/pobox/openpay', handlePoboxOpenpayWebhook); // Webhook OpenPay (sin auth)
app.get('/webhooks/pobox/openpay/callback', handlePoboxOpenpayCallback); // Callback después de pago (sin auth)

// --- RUTAS DE COMPROBANTES DE PAGO (VOUCHERS) ---
const voucherUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max
const advisorProofUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB max
app.post('/api/payment/voucher/upload', authenticateToken, voucherUpload.single('voucher'), uploadVoucher);
app.post('/api/payment/voucher/confirm', authenticateToken, confirmVoucherAmount);
app.post('/api/payment/voucher/complete', authenticateToken, completeVoucherPayment);
app.get('/api/payment/voucher/:orderId', authenticateToken, getOrderVouchers);
app.delete('/api/payment/voucher/:voucherId', authenticateToken, deleteVoucher);
app.get('/api/payment/wallet/service', authenticateToken, getServiceWalletBalances);
// Admin voucher conciliation
app.get('/api/admin/vouchers/pending', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAdminPendingVouchers);
// Contador (accountant) necesita ver el comprobante del cliente para timbrar el CFDI.
app.get('/api/admin/vouchers/order/:orderId', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), getAdminOrderVouchers);
app.get('/api/admin/vouchers/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getVoucherStats);
app.post('/api/admin/voucher/approve/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), approveVoucher);
app.post('/api/admin/voucher/reject/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), rejectVoucher);

// --- RUTAS DE VERIFICACIÓN KYC ---
app.post('/api/verify/documents', authenticateToken, verifyLimiter, uploadVerificationDocuments);
app.post('/api/verify/legacy-terms', authenticateToken, verifyLegacyTerms);
app.get('/api/verify/status', authenticateToken, getVerificationStatus);
app.get('/api/verify/address', authenticateToken, checkAddress);
app.post('/api/verify/address', authenticateToken, verifyLimiter, registerAddress);

// --- RUTAS DE DIRECCIONES Y PREFERENCIAS ---
app.get('/api/client/addresses/:userId', authenticateToken, getAddresses);
app.post('/api/client/addresses', authenticateToken, validateBody(createClientAddressSchema), createAddress);
app.put('/api/client/addresses/:id', authenticateToken, updateAddress);
app.delete('/api/client/addresses/:id', authenticateToken, deleteAddress);
app.put('/api/client/addresses/default', authenticateToken, setDefaultAddress);
app.put('/api/client/preferences', authenticateToken, savePreferences);

// --- RUTAS PARA APP MÓVIL: MIS DIRECCIONES (con token) ---
app.get('/api/addresses', authenticateToken, getMyAddresses);
app.post('/api/addresses', authenticateToken, validateBody(createMyAddressSchema), createMyAddress);
app.put('/api/addresses/:id', authenticateToken, validateBody(updateMyAddressSchema), updateMyAddress);
app.delete('/api/addresses/:id', authenticateToken, deleteMyAddress);
app.put('/api/addresses/:id/default', authenticateToken, setMyDefaultAddress);
app.put('/api/addresses/:id/default-for-service', authenticateToken, validateBody(setDefaultForServiceSchema), setMyDefaultForService);
app.get('/api/addresses/default-for/:service', authenticateToken, getDefaultAddressForService);

// --- RUTA DE BÚSQUEDA DE CÓDIGO POSTAL (SEPOMEX) ---
app.get('/api/zipcode/:cp', async (req: Request, res: Response) => {
    try {
        const cp = req.params.cp as string;
        if (!/^\d{5}$/.test(cp)) {
            res.status(400).json({ error: 'Código postal inválido (debe ser 5 dígitos)' });
            return;
        }

        // Normaliza nombres oficiales obsoletos del estado (Zippopotam y SAT
        // todavía exponen "Distrito Federal"; el SAT cambió oficialmente a
        // "Ciudad de México" desde la reforma de 2016).
        const normalizeState = (s: string): string => {
            const v = String(s || '').trim();
            if (/^(distrito federal|d\.?\s*f\.?|dif)$/i.test(v)) return 'Ciudad de México';
            return v;
        };

        // Respuesta estándar — incluimos `neighborhoods` como alias de
        // `colonies` para compatibilidad con frontends que leen cualquiera
        // de los dos nombres.
        const buildResponse = (city: string, state: string, colonies: string[]) => ({
            city,
            state: normalizeState(state),
            colonies,
            neighborhoods: colonies,
            country: 'México',
        });

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
                res.json(buildResponse(
                    first.d_mnpio || first.D_mnpio || '',
                    first.d_estado || first.D_estado || '',
                    [...new Set(colonies)].sort()
                ));
                return;
            }
        } catch (sepomexErr: any) {
            console.log('SEPOMEX Icalia API no disponible:', sepomexErr?.message || '');
        }

        // Opción 2: zippopotam.us (confiable, gratuita)
        // ⚠️ Zippopotam expone la COLONIA en `place name` (no la ciudad/municipio).
        // Antes guardábamos `place name` como `city`, lo que hacía que en la UI
        // apareciera la colonia en el campo Ciudad. Ahora el `city` se deja
        // vacío y `place name` se trata solo como una colonia más.
        try {
            const zipRes = await axios.get(`https://api.zippopotam.us/MX/${cp}`, { timeout: 5000 });
            if (zipRes.data && zipRes.data.places && zipRes.data.places.length > 0) {
                const places = zipRes.data.places;
                const state = places[0]?.state || '';
                const colonies: string[] = places.map((p: any) => p['place name']).filter(Boolean);
                res.json(buildResponse('', state, [...new Set(colonies)].sort()));
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
                    res.json(buildResponse(
                        first.municipio || first.ciudad || '',
                        first.estado || '',
                        [...new Set(colonies)].sort()
                    ));
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
app.patch('/api/admin/advisors/:id/recovery', authenticateToken, requireMinLevel(ROLES.ADMIN), toggleAdvisorRecovery);
app.patch('/api/admin/advisors/:id/active', authenticateToken, requireMinLevel(ROLES.ADMIN), toggleAdvisorActive);

// --- RUTAS DE VERIFICACIÓN (Usuario) ---
app.get('/api/verification/status', authenticateToken, getVerificationStatus);

// --- RUTAS DE VERIFICACIÓN ADMIN (Revisión Manual KYC) ---
// soporte_tecnico puede verificar identidad (pero no descuentos — ese control va en el frontend)
const canVerifyIdentity = requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.CUSTOMER_SERVICE, ROLES.COUNTER_STAFF, ROLES.SOPORTE_TECNICO);
app.get('/api/admin/verifications/pending', authenticateToken, canVerifyIdentity, getPendingVerifications);
app.get('/api/admin/verifications/stats', authenticateToken, canVerifyIdentity, getVerificationStats);
app.get('/api/admin/verifications/:userId/details', authenticateToken, canVerifyIdentity, getVerificationDetails);
app.post('/api/admin/verifications/:userId/approve', authenticateToken, canVerifyIdentity, approveVerification);
app.post('/api/admin/verifications/:userId/reject', authenticateToken, canVerifyIdentity, rejectVerification);
app.post('/api/admin/verifications/:userId/reanalyze', authenticateToken, canVerifyIdentity, reanalyzeVerification);

// --- RUTAS DE FACTURACIÓN FISCAL ---
// Acceso de SOLO LECTURA a la lista de empresas + conexión Syncfy para el
// contador (accountant). En la sección "Empresas" el contador ve únicamente la
// columna Syncfy (mismo nivel de visibilidad que el director, pero más acotado).
const requireEmpresasSyncfyAccess = requireRole(ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT);
// Admin: Gestión de empresas emisoras
app.get('/api/admin/fiscal/emitters', authenticateToken, requireEmpresasSyncfyAccess, getFiscalEmitters);
app.post('/api/admin/fiscal/emitters', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createFiscalEmitter);
app.put('/api/admin/fiscal/emitters', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateFiscalEmitter);
app.delete('/api/admin/fiscal/emitters/:id', authenticateToken, requireRole(ROLES.SUPER_ADMIN), deleteFiscalEmitter);
app.post('/api/admin/fiscal/assign-service', authenticateToken, requireMinLevel(ROLES.DIRECTOR), assignEmitterToService);
app.get('/api/admin/invoices', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getAllInvoices);
app.post('/api/admin/invoices/cancel', authenticateToken, requireMinLevel(ROLES.DIRECTOR), cancelInvoice);
app.get('/api/admin/invoices/:invoiceId/cancellation-status', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getInvoiceCancellationStatus);
app.post('/api/admin/invoices/respond-cancellation', authenticateToken, requireMinLevel(ROLES.DIRECTOR), respondInvoiceCancellation);

// Admin: Configuración de servicios por empresa (qué empresa cobra cada servicio)
app.get('/api/admin/fiscal/service-config', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getServiceCompanyConfig);
app.put('/api/admin/fiscal/service-config/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateServiceCompanyConfig);
app.get('/api/admin/fiscal/service-emitter/:service_type', authenticateToken, getEmitterByServiceType);

// ============================================
// OPENPAY MULTI-EMPRESA - COBRANZA SPEI AUTOMATIZADA
// ============================================
// Configuración por empresa
app.get('/api/admin/openpay/empresas', authenticateToken, requireEmpresasSyncfyAccess, getEmpresasOpenpay);
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

// ============================================
// BELVO - EXTRACCIÓN AUTOMÁTICA DE MOVIMIENTOS BANCARIOS
// ============================================
app.post('/api/admin/belvo/widget-token', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getBelvoWidgetToken);
app.get('/api/admin/belvo/links', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getBelvoLinks);
app.post('/api/admin/belvo/links', authenticateToken, requireMinLevel(ROLES.DIRECTOR), registerBelvoLink);
app.delete('/api/admin/belvo/links/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteBelvoLink);
app.post('/api/admin/belvo/sync', authenticateToken, requireMinLevel(ROLES.DIRECTOR), syncBelvoTransactions);
app.get('/api/admin/belvo/transactions', authenticateToken, requireMinLevel(ROLES.ADMIN), getBelvoTransactions);
app.get('/api/admin/belvo/stats', authenticateToken, requireMinLevel(ROLES.ADMIN), getBelvoStats);
app.post('/api/admin/belvo/match', authenticateToken, requireMinLevel(ROLES.ADMIN), belvoManualMatch);
app.post('/api/admin/belvo/ignore', authenticateToken, requireMinLevel(ROLES.ADMIN), belvoIgnoreTransaction);
// Webhook (público, recibe notificaciones de Belvo)
app.post('/api/webhooks/belvo', handleBelvoWebhook);

// ============================================
// SYNCFY (Paybook) - REEMPLAZO DE BELVO
// Multi-empresa: cada fiscal_emitter tiene su propio id_user.
// ============================================
app.post('/api/admin/syncfy/widget-token', authenticateToken, requireEmpresasSyncfyAccess, getSyncfyWidgetToken);
app.get('/api/admin/syncfy/links', authenticateToken, requireEmpresasSyncfyAccess, getSyncfyLinks);
app.post('/api/admin/syncfy/links', authenticateToken, requireEmpresasSyncfyAccess, registerSyncfyLink);
app.delete('/api/admin/syncfy/links/:id', authenticateToken, requireEmpresasSyncfyAccess, deleteSyncfyLink);
app.post('/api/admin/syncfy/sync', authenticateToken, requireEmpresasSyncfyAccess, syncSyncfyTransactions);
app.get('/api/admin/syncfy/stats', authenticateToken, requireEmpresasSyncfyAccess, getSyncfyStats);
app.post('/api/admin/syncfy/match', authenticateToken, requireMinLevel(ROLES.ADMIN), syncfyManualMatch);
app.post('/api/admin/syncfy/ignore', authenticateToken, requireMinLevel(ROLES.ADMIN), syncfyIgnoreTransaction);
// Webhook (público, recibe notificaciones de Syncfy)
app.post('/api/webhooks/syncfy', handleSyncfyWebhook);

// ============================================
// FACTURAMA — Recepción automática de CFDI multi-emisor + Cuentas por Pagar
// ============================================
app.get('/api/admin/facturama/config/:emitterId', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getFacturamaConfig);
app.post('/api/admin/facturama/config', authenticateToken, requireMinLevel(ROLES.DIRECTOR), saveFacturamaConfig);
app.post('/api/admin/facturama/test/:emitterId', authenticateToken, requireMinLevel(ROLES.DIRECTOR), testFacturamaConnection);
app.post('/api/admin/facturama/sync/:emitterId', authenticateToken, requireMinLevel(ROLES.DIRECTOR), syncFacturamaReceived);
app.post('/api/admin/facturama/sync-portal/:emitterId', authenticateToken, requireMinLevel(ROLES.DIRECTOR), syncFacturamaPortal);
app.post('/api/admin/facturama/register-webhook/:emitterId', authenticateToken, requireMinLevel(ROLES.DIRECTOR), registerFacturamaWebhook);
// Webhook público (firma validada con secret por emisor)
app.post('/api/webhooks/facturama/:emitterId', handleFacturamaWebhook);

// ============================================
// FACTURAPI — Descarga de CFDIs recibidos (Cuentas por Pagar)
// (Facturama queda dedicado a EMISIÓN; Facturapi a DESCARGA de recibidas)
// ============================================
app.get('/api/admin/facturapi/config/:emitterId', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getFacturapiConfig);
app.put('/api/admin/facturapi/config/:emitterId', authenticateToken, requireMinLevel(ROLES.DIRECTOR), saveFacturapiConfig);
app.post('/api/admin/facturapi/test/:emitterId', authenticateToken, requireMinLevel(ROLES.DIRECTOR), testFacturapiConnection);
app.post('/api/admin/facturapi/sync/:emitterId', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), syncFacturapiReceived);
app.get('/api/admin/facturapi/:emitterId/download/:type/:facturapiId', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), downloadFacturapiAttachment);
// Webhook público (Facturapi → backend) para sincronización en tiempo real
app.post('/api/webhooks/facturapi/:emitterId', handleFacturapiWebhook);
// Cuentas por Pagar (admin/director/super_admin/contador con permiso al emisor)
app.get('/api/accounting/:emitterId/payables', authenticateToken, listAccountsPayable);
app.post('/api/accounting/:emitterId/payables/:invoiceId/approve', authenticateToken, approveAccountPayable);
app.post('/api/accounting/:emitterId/payables/:invoiceId/reject', authenticateToken, rejectAccountPayable);
app.post('/api/accounting/:emitterId/payables/:invoiceId/pay', authenticateToken, markPayablePaid);
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

// ========== ENTANGLED (Triangulación internacional) ==========
// Multer en memoria para el comprobante (multipart) — v2
const entangledRequestUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});
// Cliente final (v2: multipart con comprobante)
app.post(
  '/api/entangled/payment-requests',
  authenticateToken,
  entangledRequestUpload.single('comprobante'),
  (req: Request, res: Response) => createEntangledRequestV2(req, res)
);
app.get('/api/entangled/payment-requests/me', authenticateToken, getMyEntangledRequests);
// Xpay Asesor: el asesor crea operaciones a nombre de un cliente asignado.
app.get('/api/advisor/xpay/clients', authenticateToken, getAdvisorXpayClients);
app.get('/api/advisor/xpay/payment-requests', authenticateToken, getAdvisorXpayRequests);
app.post('/api/advisor/xpay/payment-requests', authenticateToken, entangledRequestUpload.single('comprobante'), createAdvisorXpayRequest);
app.delete('/api/advisor/xpay/payment-requests/:id', authenticateToken, deleteAdvisorXpayRequest);
// Libreta de proveedores del cliente, operada por su asesor
app.get('/api/advisor/xpay/suppliers', authenticateToken, getAdvisorXpaySuppliers);
app.post('/api/advisor/xpay/suppliers', authenticateToken, createAdvisorXpaySupplier);
app.put('/api/advisor/xpay/suppliers/:id', authenticateToken, updateAdvisorXpaySupplier);
app.delete('/api/advisor/xpay/suppliers/:id', authenticateToken, deleteAdvisorXpaySupplier);
app.get('/api/entangled/payment-requests/:id', authenticateToken, getEntangledRequestDetail);
// Admin
app.get('/api/admin/entangled/payment-requests', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getAllEntangledRequests);
// Service config v2 (XPAY commission por servicio)
app.get('/api/entangled/service-config', authenticateToken, getMyEntangledServiceConfig);
app.get('/api/admin/entangled/service-config', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getEntangledServiceConfigAdmin);
app.put('/api/admin/entangled/service-config', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateEntangledServiceConfig);
// Override por usuario y servicio (admin)
app.get('/api/admin/entangled/user-service-pricing', authenticateToken, requireMinLevel(ROLES.DIRECTOR), listEntangledUserServicePricing);
app.put('/api/admin/entangled/user-service-pricing/:userId/:servicio', authenticateToken, requireMinLevel(ROLES.DIRECTOR), upsertEntangledUserServicePricing);
app.delete('/api/admin/entangled/user-service-pricing/:userId/:servicio', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteEntangledUserServicePricing);
// Proxies a la API de ENTANGLED
app.get('/api/entangled/exchange-rate', authenticateToken, getEntangledExchangeRate);
app.get('/api/entangled/conceptos/search', authenticateToken, searchEntangledConceptos);
app.post('/api/entangled/asignacion', authenticateToken, entangledAsignacion);
app.post('/api/entangled/payment-requests/:id/sync', authenticateToken, entangledSyncRequest);
app.get('/api/entangled/payment-requests/:id/documento/:tipo', authenticateToken, entangledProxyDocumento);
app.post('/api/entangled/payment-requests/cleanup', authenticateToken, entangledCleanupRequests);
// Rotación de API key (admin)
app.post('/api/admin/entangled/rotate-api-key', authenticateToken, requireMinLevel(ROLES.DIRECTOR), rotateEntangledApiKey);
app.post('/api/admin/entangled/providers/sync', authenticateToken, requireMinLevel(ROLES.DIRECTOR), syncEntangledProveedoresFromRemote);
// Proveedores de envío (beneficiarios) por cliente
app.get('/api/entangled/suppliers', authenticateToken, (req, res) => listMyEntangledSuppliers(req, res));
app.post('/api/entangled/suppliers', authenticateToken, (req, res) => createMyEntangledSupplier(req, res));
app.put('/api/entangled/suppliers/:id', authenticateToken, (req, res) => updateMyEntangledSupplier(req, res));
app.delete('/api/entangled/suppliers/:id', authenticateToken, (req, res) => deleteMyEntangledSupplier(req, res));
// Perfil fiscal reutilizable, pricing y cotización
app.get('/api/entangled/fiscal-profile', authenticateToken, (req, res) => getMyEntangledFiscalProfile(req, res));
app.get('/api/entangled/clave-sat-history', authenticateToken, listEntangledClaveSatHistory);
app.put('/api/entangled/fiscal-profile', authenticateToken, (req, res) => upsertMyEntangledFiscalProfile(req, res));
// Xpay asesor: perfil fiscal del cliente (precarga + guardar a su nombre)
app.get('/api/advisor/xpay/fiscal-profile', authenticateToken, getAdvisorXpayFiscalProfile);
app.put('/api/advisor/xpay/fiscal-profile', authenticateToken, upsertAdvisorXpayFiscalProfile);
app.get('/api/entangled/pricing', authenticateToken, getEntangledPricingConfig);
app.put('/api/admin/entangled/pricing', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateEntangledPricingConfig);
app.post('/api/entangled/quote', authenticateToken, quoteEntangledPayment);
// Override de porcentaje_compra por usuario (admin)
app.get('/api/admin/entangled/user-pricing', authenticateToken, requireMinLevel(ROLES.DIRECTOR), listEntangledUserPricing);
app.put('/api/admin/entangled/user-pricing/:userId', authenticateToken, requireMinLevel(ROLES.DIRECTOR), upsertEntangledUserPricing);
app.delete('/api/admin/entangled/user-pricing/:userId', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteEntangledUserPricing);
// Proveedores ENTANGLED — CRUD admin + listado público para clientes
app.get('/api/entangled/providers', authenticateToken, listEntangledProvidersPublic);
app.get('/api/admin/entangled/providers', authenticateToken, requireMinLevel(ROLES.DIRECTOR), listEntangledProviders);
app.post('/api/admin/entangled/providers', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createEntangledProvider);
app.put('/api/admin/entangled/providers/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateEntangledProvider);
app.delete('/api/admin/entangled/providers/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteEntangledProvider);
// ADMIN: base de datos global de proveedores (beneficiarios) agregada por número de cuenta
app.get('/api/admin/entangled/suppliers-db', authenticateToken, requireMinLevel(ROLES.DIRECTOR), adminListEntangledSuppliers);
app.get('/api/admin/entangled/suppliers-db/:cuenta', authenticateToken, requireMinLevel(ROLES.DIRECTOR), adminGetEntangledSupplierDetail);
// Subida diferida de comprobante (URL pre-existente)
app.post('/api/entangled/payment-requests/:id/upload-proof', authenticateToken, uploadEntangledProof);
// Subida de comprobante como archivo (multipart/form-data)
const entangledProofUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
// Wrapper que captura errores de multer (p.ej. sin boundary, archivo muy grande)
// y los convierte en respuestas JSON con CORS headers correctos.
const handleMulterError = (err: any, req: Request, res: Response, next: any) => {
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.name === 'MulterError')) {
    return res.status(400).json({ error: err.message || 'Error al procesar el archivo' });
  }
  next(err);
};
app.post('/api/entangled/payment-requests/:id/upload-proof-file', authenticateToken, entangledProofUpload.single('comprobante'), handleMulterError, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const id = Number(req.params.id);
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const { pool: dbPool } = await import('./db');
    const owner = await dbPool.query(
      'SELECT user_id, advisor_id, entangled_transaccion_id FROM entangled_payment_requests WHERE id = $1', [id]
    );
    if (!owner.rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });
    // Acceso: el cliente dueño, el asesor que la creó, o staff con rol elevado
    const ownerUserId = Number(owner.rows[0].user_id);
    const ownerAdvisorId = owner.rows[0].advisor_id != null ? Number(owner.rows[0].advisor_id) : null;
    const role = String(req.user?.role || '').toLowerCase();
    const elevatedRoles = ['super_admin', 'admin', 'director', 'branch_manager'];
    const allowed = ownerUserId === Number(userId)
      || (ownerAdvisorId != null && ownerAdvisorId === Number(userId))
      || elevatedRoles.includes(role);
    if (!allowed) return res.status(403).json({ error: 'Sin acceso' });

    // Backfill de tc_cliente_final para solicitudes antiguas: si el frontend
    // envía un TC en el body y la columna está vacía, lo persistimos antes de
    // reenviar a ENTANGLED. COALESCE evita pisar un TC ya guardado.
    const tcFromBody = Number((req.body as any)?.tc_cliente_final);
    if (Number.isFinite(tcFromBody) && tcFromBody > 0) {
      try {
        await dbPool.query(
          `UPDATE entangled_payment_requests
              SET tc_cliente_final = COALESCE(tc_cliente_final, $1),
                  updated_at = NOW()
            WHERE id = $2`,
          [tcFromBody, id]
        );
      } catch (e) {
        console.warn('[ENTANGLED] backfill tc_cliente_final:', e);
      }
    }

    // 1) Persistir el comprobante (sube a S3 si está configurado)
    const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const key = `entangled/comprobantes/${id}_${Date.now()}.${ext}`;
    const { uploadToS3, isS3Configured } = await import('./s3Service');
    let url: string;
    if (isS3Configured()) {
      url = await uploadToS3(req.file.buffer, key, req.file.mimetype);
    } else {
      url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }
    await dbPool.query(
      `UPDATE entangled_payment_requests SET
         op_comprobante_cliente_url = $2,
         comprobante_subido_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [id, url]
    );

    // Enviar xpay_pago_confirmado al cliente cuando sube su comprobante (fire-and-forget)
    try {
      const { sendXPayPagoConfirmado } = await import('./whatsappService');
      const waRow = await dbPool.query(
        `SELECT u.full_name, u.phone,
                epr.referencia_pago, epr.op_monto, epr.op_divisa_destino,
                epr.op_beneficiario_nombre
           FROM entangled_payment_requests epr
           JOIN users u ON u.id = epr.user_id
          WHERE epr.id = $1 LIMIT 1`,
        [id]
      );
      const wu = waRow.rows[0];
      if (wu?.phone) {
        const montoFmt = `$${Number(wu.op_monto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${wu.op_divisa_destino || 'USD'}`;
        console.log(`[XPAY WA] Enviando xpay_pago_confirmado a ${wu.phone} ref=${wu.referencia_pago}`);
        void sendXPayPagoConfirmado({
          phone: wu.phone,
          nombre: wu.full_name || '',
          referencia: wu.referencia_pago || '',
          monto: montoFmt,
          beneficiario: wu.op_beneficiario_nombre || '',
        });
      } else {
        console.warn(`[XPAY WA] Usuario sin teléfono para xpay_pago_confirmado, solicitud ${id}`);
      }
    } catch (waErr) {
      console.warn('[XPAY WA] Error enviando xpay_pago_confirmado:', waErr);
    }

    // 2) Si la solicitud aún NO ha sido enviada a ENTANGLED (no tiene
    //    transaccion_id), este es el momento de enviarla con el comprobante.
    if (!owner.rows[0].entangled_transaccion_id) {
      const { sendPendingRequestToEntangled } = await import('./entangledControllerV2');
      // Saneamos el filename: ENTANGLED rechaza nombres con espacios, paréntesis
      // o caracteres no-ASCII con "No se pudo subir el comprobante a
      // almacenamiento". Usamos sólo [a-zA-Z0-9._-] y la extensión original.
      const safeFilename = `comprobante_${id}_${Date.now()}.${ext}`;
      const result = await sendPendingRequestToEntangled(
        id,
        req.file.buffer,
        safeFilename,
        req.file.mimetype
      );
      return res.status(result.status).json({
        ok: result.ok,
        comprobante_url: url,
        ...result.payload,
      });
    }

    // 3) Comprobante adicional/reemplazo para una solicitud ya enviada:
    //    re-enviar a ENTANGLED para que actualicen el comprobante en su sistema.
    //    Antes solo se guardaba localmente y nunca llegaba al proveedor.
    const transaccionId = String(owner.rows[0].entangled_transaccion_id);
    let forwardOk = false;
    let forwardError: string | undefined;
    try {
      const ext2 = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
      const safeFilename = `comprobante_${id}_${Date.now()}.${ext2}`;
      const { uploadComprobanteToTransaccion } = await import('./entangledServiceV2');
      const up = await uploadComprobanteToTransaccion(transaccionId, {
         buffer: req.file.buffer,
         filename: safeFilename,
         mimetype: req.file.mimetype || 'application/octet-stream',
      });
      forwardOk = !!up.ok;
      if (!up.ok) forwardError = up.error || 'No se pudo enviar comprobante a ENTANGLED';
      else {
        await dbPool.query(
          `UPDATE entangled_payment_requests
              SET estatus_global = CASE WHEN estatus_global IN ('pendiente','esperando_comprobante','error_envio') THEN 'en_proceso' ELSE estatus_global END,
                  comprobante_subido_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1`,
          [id]
        );
      }
    } catch (e: any) {
      forwardError = e?.message || 'Error inesperado enviando comprobante a ENTANGLED';
      console.error('[ENTANGLED] forward comprobante:', e);
    }

    const r = await dbPool.query(
      `SELECT id, referencia_pago, op_comprobante_cliente_url, comprobante_subido_at,
              entangled_transaccion_id, estatus_global
         FROM entangled_payment_requests WHERE id = $1`,
      [id]
    );
    if (!forwardOk) {
      return res.status(502).json({
        ok: false,
        error: forwardError || 'No se pudo enviar el comprobante a ENTANGLED',
        comprobante_url: url,
        request: r.rows[0],
      });
    }
    return res.json({
      ok: true,
      message: 'Comprobante enviado a ENTANGLED.',
      comprobante_url: url,
      request: r.rows[0],
      entangled_transaccion_id: transaccionId,
    });
  } catch (err: any) {
    console.error('[ENTANGLED] upload-proof-file:', err);
    return res.status(500).json({ error: 'Error al subir comprobante' });
  }
});
// Webhooks v2 — verificación HMAC SHA-256 sobre el raw body capturado por
// el `verify` callback de express.json (req.rawBody). Esto evita usar
// express.raw route-specific que ya no aplicaría tras express.json global.
app.post('/api/entangled/webhook/factura-generada', entangledWebhookFacturaV2);
app.post('/api/entangled/webhook/pago-proveedor', entangledWebhookProveedorV2);
// webhook_ordenes — orden.cancelada / orden.cuenta.cambiada (dirigido a asesores)
app.post('/api/entangled/webhook/ordenes', entangledWebhookOrdenesV2);

// Webhooks legacy (v1) — siguen activos para compatibilidad mientras ENTANGLED
// no haya migrado del todo. Si en producción ya están en v2, estas rutas
// pueden retirarse.
app.post('/api/webhooks/entangled-facturas', entangledWebhookFactura);
app.post('/api/webhooks/entangled-proveedores', entangledWebhookProveedor);

// ========== MOTOR DE PRECIOS (PRICING ENGINE) ==========

// Servicios logísticos (Público)
app.get('/api/logistics/services', getLogisticsServices);

// Cotizador (Cliente autenticado)
app.post('/api/quotes/calculate', authenticateToken, calculateQuoteEndpoint);
// Endpoints adicionales para cotizar PO Box USA y TDI Aéreo China
// directo desde la app móvil (incluye GEX opcional centralizado).
app.post('/api/quotes/pobox', authenticateToken, quotePOBox);
app.post('/api/quotes/air-china', authenticateToken, quoteAirChina);

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
app.post('/api/admin/paquete-express/ocurre-quote', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), pqtxOcurreQuote);
app.post('/api/admin/paquete-express/shipment', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), pqtxCreateShipment);
app.post('/api/admin/paquete-express/pickup', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), pqtxSchedulePickup);
app.post('/api/admin/paquete-express/cancel', authenticateToken, requireMinLevel(ROLES.ADMIN), pqtxCancel);
app.get('/api/admin/paquete-express/track/:trackingNumber', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), pqtxTrack);
app.get('/api/admin/paquete-express/label/pdf/:trackingNumber', pqtxLabelPdf); // Sin auth: se abre en nueva pestaña del navegador
app.get('/api/admin/paquete-express/label/zpl/:trackingNumber', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), pqtxLabelZpl);
app.get('/api/admin/paquete-express/shipments', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), pqtxListShipments);
app.post('/api/admin/paquete-express/generate-for-package', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), pqtxGenerateForPackage);

// 🔗 Vincular packages a una guía PQTX existente (admin manual fix para legacy)
// POST body: { packageIds: number[], pqtxTracking?: string, pqtxShipmentId?: number }
app.post('/api/admin/paquete-express/link-packages', authenticateToken, requireMinLevel(ROLES.ADMIN), async (req: any, res: any) => {
  try {
    const { packageIds, pqtxTracking, pqtxShipmentId } = req.body || {};
    if (!Array.isArray(packageIds) || packageIds.length === 0) {
      return res.status(400).json({ error: 'packageIds requerido (array no vacío)' });
    }
    let psId = pqtxShipmentId;
    if (!psId && pqtxTracking) {
      const psRes = await pool.query(`SELECT id FROM pqtx_shipments WHERE tracking_number = $1 LIMIT 1`, [pqtxTracking]);
      if (psRes.rows.length === 0) return res.status(404).json({ error: 'pqtx_shipment no encontrado' });
      psId = psRes.rows[0].id;
    }
    if (!psId) return res.status(400).json({ error: 'pqtxTracking o pqtxShipmentId requerido' });

    const result = await pool.query(
      `UPDATE packages SET pqtx_shipment_id = $1, updated_at = NOW() WHERE id = ANY($2::int[]) RETURNING id, tracking_internal`,
      [psId, packageIds]
    );
    res.json({ success: true, linked: result.rowCount, packages: result.rows, pqtxShipmentId: psId });
  } catch (e: any) {
    console.error('link-packages error:', e);
    res.status(500).json({ error: e.message });
  }
});

// 🔓 Desvincular packages (poner pqtx_shipment_id = NULL)
app.post('/api/admin/paquete-express/unlink-packages', authenticateToken, requireMinLevel(ROLES.ADMIN), async (req: any, res: any) => {
  try {
    const { packageIds } = req.body || {};
    if (!Array.isArray(packageIds) || packageIds.length === 0) {
      return res.status(400).json({ error: 'packageIds requerido' });
    }
    const result = await pool.query(
      `UPDATE packages SET pqtx_shipment_id = NULL, updated_at = NOW() WHERE id = ANY($1::int[]) RETURNING id`,
      [packageIds]
    );
    res.json({ success: true, unlinked: result.rowCount });
  } catch (e: any) {
    console.error('unlink-packages error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Maritime relabeling: capture per-box dimensions and generate PQTX guide
app.get('/api/admin/relabeling/maritime/:orderId/boxes', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getMaritimeOrderBoxes);
// Marcar guía externa como etiqueta impresa (al descargar guia_externa en módulo de etiquetado)
// Super admin: marcar paquete como pagado manualmente (client_paid + costing_paid)
app.patch('/api/admin/packages/:id/mark-paid-manual', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const pkgId = parseInt(req.params.id as string);
    if (!pkgId) return res.status(400).json({ error: 'ID inválido' });
    // Actualiza el master y todos sus hijos (o solo la guía si no tiene master)
    await pool.query(
      `UPDATE packages
       SET client_paid = TRUE,
           payment_status = 'paid',
           saldo_pendiente = 0,
           monto_pagado = COALESCE(NULLIF(monto_pagado, 0), NULLIF(pobox_service_cost, 0), NULLIF(assigned_cost_mxn, 0), NULLIF(air_sale_price, 0), 1),
           updated_at = NOW()
       WHERE id    = COALESCE((SELECT master_id FROM packages WHERE id = $1 AND master_id IS NOT NULL), $1)
          OR master_id = COALESCE((SELECT master_id FROM packages WHERE id = $1 AND master_id IS NOT NULL), $1)`,
      [pkgId]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Super admin: desmarcar pago (revertir mark-paid-manual)
app.patch('/api/admin/packages/:id/unmark-paid-manual', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const pkgId = parseInt(req.params.id as string);
    if (!pkgId) return res.status(400).json({ error: 'ID inválido' });
    await pool.query(
      `UPDATE packages
       SET client_paid = FALSE,
           payment_status = 'pending',
           monto_pagado = 0,
           saldo_pendiente = COALESCE(NULLIF(pobox_service_cost, 0), NULLIF(assigned_cost_mxn, 0), NULLIF(air_sale_price, 0), NULLIF(pobox_venta_usd, 0), 0),
           updated_at = NOW()
       WHERE id    = COALESCE((SELECT master_id FROM packages WHERE id = $1 AND master_id IS NOT NULL), $1)
          OR master_id = COALESCE((SELECT master_id FROM packages WHERE id = $1 AND master_id IS NOT NULL), $1)`,
      [pkgId]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Super admin: marcar instrucción como confirmada (needs_instructions = FALSE + label url)
app.patch('/api/admin/packages/:id/mark-instructions-manual', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const pkgId = parseInt(req.params.id as string);
    if (!pkgId) return res.status(400).json({ error: 'ID inválido' });
    await pool.query(
      `UPDATE packages SET needs_instructions = FALSE, national_label_url = COALESCE(national_label_url, 'manual-printed'), updated_at = NOW() WHERE id = $1 OR master_id = $1`,
      [pkgId]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/packages/:id/mark-label-printed', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), async (req: AuthRequest, res: Response) => {
  try {
    const pkgId = parseInt(req.params.id as string);
    if (!pkgId) return res.status(400).json({ error: 'ID inválido' });
    // Marcar master y todas sus hijas
    await pool.query(
      `UPDATE packages SET national_label_url = COALESCE(national_label_url, 'manual-printed'), updated_at = NOW()
       WHERE id = $1 OR master_id = $1`,
      [pkgId]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/relabeling/maritime/:orderId/box', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), upsertMaritimeOrderBox);
app.post('/api/admin/relabeling/maritime/:orderId/generate-pqtx', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), generatePqtxForMaritimeOrder);

// ========== OPCIONES DE PAQUETERÍA POR SERVICIO ==========
app.get('/api/admin/carrier-options', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getCarrierOptions);
app.post('/api/admin/carrier-options/upload-icon', authenticateToken, requireMinLevel(ROLES.ADMIN), carrierIconUpload.single('icon'), uploadCarrierIcon);
app.post('/api/admin/carrier-options', authenticateToken, requireMinLevel(ROLES.ADMIN), createCarrierOption);
app.put('/api/admin/carrier-options/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), updateCarrierOption);
app.delete('/api/admin/carrier-options/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), deleteCarrierOption);
app.patch('/api/admin/carrier-options/:id/toggle', authenticateToken, requireMinLevel(ROLES.ADMIN), toggleCarrierOption);
// Endpoint público (para clientes) - opciones por tipo de servicio
app.get('/api/carrier-options/by-service/:serviceType', authenticateToken, getCarrierOptionsByService);

// Zona metropolitana MTY: exclusiones de CP (Nacional México → Administración)
app.get('/api/admin/mty-metro/excluded-zips', authenticateToken, requireMinLevel(ROLES.ADMIN), listExcludedZips);
app.post('/api/admin/mty-metro/excluded-zips', authenticateToken, requireMinLevel(ROLES.ADMIN), addExcludedZip);
app.delete('/api/admin/mty-metro/excluded-zips/:zip', authenticateToken, requireMinLevel(ROLES.ADMIN), removeExcludedZip);

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
// Listar supervisores con PIN (admin)
app.get('/api/warehouse/supervisors', authenticateToken, listSupervisors);
// Admin asigna PIN a cualquier supervisor
app.put('/api/warehouse/admin-set-supervisor-pin', authenticateToken, adminSetSupervisorPin);
// Admin genera codigo aleatorio largo (para QR/codigo de barras)
app.post('/api/warehouse/admin-generate-supervisor-pin', authenticateToken, adminGenerateSupervisorPin);
// Usuario obtiene su propio PIN para mostrar QR
app.get('/api/warehouse/my-supervisor-pin', authenticateToken, getMySupervisorPin);
// Recepción rápida DHL
app.post('/api/warehouse/dhl-reception', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), processDhlReception);
// Inventario de sucursal
app.get('/api/warehouse/inventory', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getBranchInventory);

// ========== GESTIÓN DE SUCURSALES (ADMIN) ==========
// GET /api/admin/users - Obtener usuarios con información de sucursal
app.get('/api/admin/users', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), async (req: AuthRequest, res: Response) => {
  try {
    const includeBranch = req.query.include_branch === 'true';
    
    let query = `
      SELECT u.id, u.full_name, u.email, u.role, u.branch_id
      ${includeBranch ? ', b.name as branch_name' : ''}
      FROM users u
      ${includeBranch ? 'LEFT JOIN branches b ON u.branch_id = b.id' : ''}
      WHERE u.role IN ('warehouse_ops', 'counter_staff', 'repartidor', 'customer_service', 'branch_manager', 'monitoreo', 'accountant', 'contador', 'advisor', 'sub_advisor', 'operaciones', 'director', 'admin', 'super_admin', 'abogado')
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

    // Buscar por box_id exacto, o por nombre/email parcial. Incluye también
    // clientes LEGACY no reclamados (sin cuenta users todavía): así recepción
    // (p.ej. DHL) puede recibir a un cliente histórico por su Box ID. Los legacy
    // ya reclamados tienen su fila en users y se encuentran arriba, por eso solo
    // agregamos los NO reclamados (claimed_by_user_id IS NULL) para no duplicar.
    const result = await pool.query(`
      SELECT * FROM (
        SELECT id, full_name, email, box_id, phone, role, FALSE AS is_legacy
        FROM users
        WHERE role = 'client'
          AND (
            UPPER(box_id) = UPPER($1)
            OR UPPER(full_name) LIKE UPPER($2)
            OR UPPER(email) LIKE UPPER($2)
            OR phone LIKE $3
            OR id::text = $1
          )
        UNION ALL
        SELECT NULL::int AS id, full_name, email, box_id, phone, 'client' AS role, TRUE AS is_legacy
        FROM legacy_clients
        WHERE claimed_by_user_id IS NULL
          AND (
            UPPER(box_id) = UPPER($1)
            OR UPPER(full_name) LIKE UPPER($2)
            OR phone LIKE $3
          )
      ) t
      ORDER BY
        CASE WHEN UPPER(box_id) = UPPER($1) THEN 0 ELSE 1 END,
        is_legacy,
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
app.get('/api/admin/branches', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAllBranches);
app.post('/api/admin/branches', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createBranch);
app.put('/api/admin/branches/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateBranch);
app.delete('/api/admin/branches/:id', authenticateToken, requireRole(ROLES.SUPER_ADMIN), deleteBranch);

// ============================================================
// Informe directivo: Inventario por Sucursal (Admin / Super Admin / Director)
// Devuelve, por cada sucursal activa, conteos agregados de paquetes en bodega
// agrupados por servicio (PO Box, China Marítimo, China Aéreo, DHL) más
// peso total, número de clientes únicos y última recepción. NO se exponen
// paquetes individuales — es un panel de monitoreo de alto nivel.
// ============================================================
app.get('/api/admin/branches/inventory-report', authenticateToken, requireMinLevel(ROLES.ADMIN), async (_req: Request, res: Response) => {
  // Cada subconsulta va en su propio try/catch — si una falla (p.ej. tabla
  // nueva todavía no migrada) el informe sigue regresando el resto de datos
  // en vez de tronar todo con 500.
  const safe = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); }
    catch (e: any) { console.error(`[INVENTORY-REPORT:${label}]`, e?.message || e); return fallback; }
  };

  try {
    const branches = await pool.query(`
      SELECT id, name, code, city, allowed_services, is_active
      FROM branches
      WHERE is_active = TRUE
      ORDER BY name
    `);

    // Agregar conteos por servicio para todas las sucursales en una sola consulta.
    // Columnas reales: service_type (AIR_CHN_MX / SEA_CHN_MX / FCL_CHN_MX / POBOX_USA / DHL_*) y
    // warehouse_location (china_air, china_sea, mexico, etc.). Excluimos los estados
    // que indican que el paquete ya salió de la bodega.
    const countsRows = await safe('packages_by_service', async () => (await pool.query(`
      SELECT
        p.current_branch_id AS branch_id,
        CASE
          WHEN p.service_type = 'POBOX_USA' OR p.tracking_internal LIKE 'US-%' THEN 'pobox'
          WHEN p.service_type IN ('SEA_CHN_MX','FCL_CHN_MX') OR p.warehouse_location = 'china_sea' THEN 'maritimo'
          WHEN p.service_type = 'AIR_CHN_MX' OR p.warehouse_location = 'china_air' THEN 'aereo'
          WHEN p.tracking_internal LIKE 'DHL-%' OR p.service_type ILIKE 'DHL%' THEN 'dhl'
          ELSE 'otros'
        END AS service_key,
        COUNT(*)::int AS pkg_count,
        COALESCE(SUM(p.weight), 0)::float AS total_weight,
        COUNT(DISTINCT COALESCE(p.user_id::text, p.box_id))::int AS unique_clients,
        MAX(p.created_at) AS last_received_at
      FROM packages p
      WHERE p.current_branch_id IS NOT NULL
        AND p.status NOT IN ('delivered','dispatched_national','out_for_delivery')
        AND COALESCE(p.is_lost, FALSE) = FALSE
      GROUP BY p.current_branch_id, service_key
    `)).rows, [] as any[]);

    // Conteo de paquetes con pago pendiente por sucursal (saldo > 0)
    const pendientesCobro = await safe('pending_payments', async () => (await pool.query(`
      SELECT current_branch_id AS branch_id,
             COUNT(*)::int AS count,
             COALESCE(SUM(GREATEST(COALESCE(saldo_pendiente,0), 0)),0)::float AS monto
      FROM packages
      WHERE current_branch_id IS NOT NULL
        AND status NOT IN ('delivered')
        AND COALESCE(payment_status,'pending') IN ('pending','partial')
      GROUP BY current_branch_id
    `)).rows, [] as any[]);

    // Paquetes marcados como perdidos / en abandono por sucursal
    const perdidos = await safe('lost_packages', async () => (await pool.query(`
      SELECT current_branch_id AS branch_id, COUNT(*)::int AS count
      FROM packages
      WHERE current_branch_id IS NOT NULL
        AND (is_lost = TRUE OR status = 'lost' OR missing_on_arrival = TRUE)
      GROUP BY current_branch_id
    `)).rows, [] as any[]);

    // Empleados activos por sucursal (cualquier rol no-cliente con branch_id)
    const empleados = await safe('employees', async () => (await pool.query(`
      SELECT branch_id, role, COUNT(*)::int AS count
      FROM users
      WHERE branch_id IS NOT NULL
        AND COALESCE(is_active, TRUE) = TRUE
        AND role IS NOT NULL
        AND role <> 'client'
      GROUP BY branch_id, role
    `)).rows, [] as any[]);

    // Vehículos por sucursal
    const vehiculos = await safe('vehicles', async () => (await pool.query(`
      SELECT branch_id,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE COALESCE(status,'active') = 'active')::int AS activos
      FROM vehicles
      WHERE branch_id IS NOT NULL
      GROUP BY branch_id
    `)).rows, [] as any[]);

    // Activos / equipo por sucursal y categoría
    const activos = await safe('assets', async () => (await pool.query(`
      SELECT branch_id, category, COUNT(*)::int AS count
      FROM branch_assets
      WHERE branch_id IS NOT NULL
      GROUP BY branch_id, category
    `)).rows, [] as any[]);

    // Indicadores globales: contenedores en distintos estados
    const containersAgg = await safe('containers_global', async () => (await pool.query(`
      SELECT status, COUNT(*)::int AS count
      FROM containers
      GROUP BY status
    `)).rows, [] as any[]);

    const globalContainers = {
      en_camino: 0,        // in_transit / in_transit_clientfinal
      en_puerto: 0,        // arrived_port / customs_cleared
      consolidando: 0,     // consolidated / received_origin / received_partial
      entregados: 0,
    };
    containersAgg.forEach((r: any) => {
      const s = String(r.status || '').toLowerCase();
      if (s.startsWith('in_transit') || s === 'docs_received' || s === 'procedure_requested' || s === 'cbp_signature_received') globalContainers.en_camino += r.count;
      else if (s === 'arrived_port' || s === 'customs_cleared') globalContainers.en_puerto += r.count;
      else if (s === 'consolidated' || s.startsWith('received_')) globalContainers.consolidando += r.count;
      else if (s === 'delivered') globalContainers.entregados += r.count;
    });

    // Indexar todo por branch_id
    const byBranch: Record<string, any> = {};
    const ensure = (bid: string) => {
      if (!byBranch[bid]) byBranch[bid] = {
        services: {},
        total_packages: 0, total_weight: 0, last_received_at: null,
        pendientes_cobro: { count: 0, monto_mxn: 0 },
        perdidos: { count: 0 },
        rrhh: { total: 0, por_rol: {} as Record<string, number> },
        vehiculos: { total: 0, activos: 0 },
        activos: { total: 0, por_categoria: {} as Record<string, number> },
      };
      return byBranch[bid];
    };

    countsRows.forEach((r: any) => {
      const bid = String(r.branch_id);
      const b = ensure(bid);
      b.services[r.service_key] = {
        packages: r.pkg_count,
        weight_kg: Number(Number(r.total_weight).toFixed(2)),
        unique_clients: r.unique_clients,
      };
      b.total_packages += r.pkg_count;
      b.total_weight += Number(r.total_weight);
      if (!b.last_received_at || new Date(r.last_received_at) > new Date(b.last_received_at)) {
        b.last_received_at = r.last_received_at;
      }
    });
    pendientesCobro.forEach((r: any) => {
      const b = ensure(String(r.branch_id));
      b.pendientes_cobro = { count: r.count, monto_mxn: Number(Number(r.monto).toFixed(2)) };
    });
    perdidos.forEach((r: any) => {
      ensure(String(r.branch_id)).perdidos = { count: r.count };
    });
    empleados.forEach((r: any) => {
      const b = ensure(String(r.branch_id));
      b.rrhh.total += r.count;
      b.rrhh.por_rol[r.role] = r.count;
    });
    vehiculos.forEach((r: any) => {
      ensure(String(r.branch_id)).vehiculos = { total: r.total, activos: r.activos };
    });
    activos.forEach((r: any) => {
      const b = ensure(String(r.branch_id));
      b.activos.total += r.count;
      b.activos.por_categoria[r.category || 'otros'] = r.count;
    });

    // Catálogo de tips operativos por código de sucursal. Si la sucursal
    // no está catalogada, se usan tips genéricos.
    const TIPS_BY_CODE: Record<string, string[]> = {
      MTY: [
        'Hub principal Monterrey: concentra liberaciones DHL Express AA.',
        'Verifica diariamente los paquetes con instrucciones pendientes antes de las 14:00 para integrar la ruta MX.',
        'Sucursal con mayor volumen de China marítimo: mantén espacio reservado para consolidaciones grandes.',
      ],
      HID: [
        'Bodega Hidalgo TX (PO Box USA): el cliente recibe sus compras de Amazon/eBay aquí.',
        'Antes de despachar revisa el toggle "Requerir Instrucciones" en Ajustes — clientes sin dirección no deben cargarse.',
        'Coordina las salidas con la camioneta MTY para optimizar peso y volumen.',
      ],
    };
    const GENERIC_TIPS = [
      'Verifica que cada paquete tenga instrucciones asignadas antes de cargarlo a la unidad.',
      'Las guías con más de 7 días sin retiro generan costo de almacenaje — escala a cobranza.',
      'Mantén actualizada la información de WiFi y geocerca para la asistencia del personal.',
    ];

    const emptyBranch = () => ({
      services: {}, total_packages: 0, total_weight: 0, last_received_at: null,
      pendientes_cobro: { count: 0, monto_mxn: 0 },
      perdidos: { count: 0 },
      rrhh: { total: 0, por_rol: {} },
      vehiculos: { total: 0, activos: 0 },
      activos: { total: 0, por_categoria: {} },
    });

    const report = branches.rows.map((b: any) => {
      const data = byBranch[String(b.id)] || emptyBranch();
      const tips = TIPS_BY_CODE[String(b.code || '').toUpperCase()] || GENERIC_TIPS;
      return {
        id: b.id,
        name: b.name,
        code: b.code,
        city: b.city,
        allowed_services: b.allowed_services || [],
        total_packages: data.total_packages,
        total_weight_kg: Number((data.total_weight || 0).toFixed(2)),
        last_received_at: data.last_received_at,
        services: {
          pobox:    data.services.pobox    || { packages: 0, weight_kg: 0, unique_clients: 0 },
          maritimo: data.services.maritimo || { packages: 0, weight_kg: 0, unique_clients: 0 },
          aereo:    data.services.aereo    || { packages: 0, weight_kg: 0, unique_clients: 0 },
          dhl:      data.services.dhl      || { packages: 0, weight_kg: 0, unique_clients: 0 },
        },
        pendientes_cobro: data.pendientes_cobro,
        perdidos: data.perdidos,
        rrhh: data.rrhh,
        vehiculos: data.vehiculos,
        activos: data.activos,
        tips,
      };
    });

    res.json({
      generated_at: new Date().toISOString(),
      global: { containers: globalContainers },
      branches: report,
    });
  } catch (err: any) {
    console.error('[BRANCHES-INVENTORY-REPORT]', err.stack || err.message);
    res.status(500).json({ error: 'Error al generar informe de inventario por sucursal', detail: err.message });
  }
});
// Inventario de activos por sucursal (módulo de control patrimonial).
// El GET /:id va sin auth porque alimenta el QR pegado al equipo —
// un supervisor lo escanea con su celular y debe poder ver la ficha
// sin necesidad de iniciar sesión.
// GET es de sólo lectura — lo abrimos a COUNTER_STAFF para que
// cualquier personal con acceso al panel admin_branches (otorgado
// por la matriz de permisos) pueda consultar el inventario.
// Escrituras siguen restringidas a DIRECTOR.
// Gestión de activos: el personal de mostrador puede registrar y editar
// activos del CEDIS donde trabaja día a día. Borrado sigue restringido a
// DIRECTOR para evitar pérdidas accidentales del patrimonio.
app.get('/api/admin/branch-assets', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), listAssets);
app.post('/api/admin/branch-assets', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createAsset);
app.put('/api/admin/branch-assets/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateAsset);
app.delete('/api/admin/branch-assets/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteAsset);
app.post('/api/admin/branch-assets/upload', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), uploadAssetFile);
app.post('/api/admin/branch-assets/:id/maintenance', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), markMaintenanceDone);
app.get('/api/branch-assets/:id', getAssetById);
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
// Lookup del master corto (secondary_tracking / international_tracking) para
// detectar si la guía escaneada en el wizard DHL corresponde a otro servicio
// (p.ej. TDX / tdi_express). Devuelve el service_type detectado o 'unknown'.
app.get('/api/admin/shipments/lookup-master', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), async (req: Request, res: Response): Promise<any> => {
  try {
    const raw = String(req.query.code || '').trim();
    if (!raw) return res.status(400).json({ error: 'code requerido' });
    if (raw.length < 4) return res.json({ service_type: 'unknown', found: false, code: raw });

    // 1) Match en packages por international_tracking / tracking_internal / tracking_provider
    const pkg = await pool.query(
      `SELECT id, tracking_internal, international_tracking, tracking_provider,
              service_type::text AS service_type, air_source, is_master, master_id
         FROM packages
        WHERE international_tracking = $1
           OR tracking_internal = $1
           OR tracking_provider = $1
        ORDER BY is_master DESC NULLS LAST, id ASC
        LIMIT 1`,
      [raw]
    );
    if (pkg.rows.length > 0) {
      const row = pkg.rows[0];
      const svc = String(row.air_source || row.service_type || '').toLowerCase();
      return res.json({
        service_type: svc || 'unknown',
        source_table: 'packages',
        found: true,
        code: raw,
        tracking_internal: row.tracking_internal,
        international_tracking: row.international_tracking,
        is_master: row.is_master === true,
      });
    }

    // 2) Match en dhl_shipments por secondary_tracking / inbound_tracking
    const dhl = await pool.query(
      `SELECT id, inbound_tracking, secondary_tracking
         FROM dhl_shipments
        WHERE secondary_tracking = $1 OR inbound_tracking = $1
        LIMIT 1`,
      [raw]
    );
    if (dhl.rows.length > 0) {
      return res.json({
        service_type: 'dhl',
        source_table: 'dhl_shipments',
        found: true,
        code: raw,
        inbound_tracking: dhl.rows[0].inbound_tracking,
        secondary_tracking: dhl.rows[0].secondary_tracking,
      });
    }

    return res.json({ service_type: 'unknown', found: false, code: raw });
  } catch (e: any) {
    console.error('[shipments/lookup-master] error:', e?.message);
    return res.status(500).json({ error: 'Error consultando lookup', details: e?.message });
  }
});
app.post('/api/admin/dhl/quote', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), quoteDhlShipment);
app.post('/api/admin/dhl/dispatch', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), dispatchDhlShipment);
app.get('/api/admin/dhl/stats', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getDhlStats);
// Marcar etiqueta nacional impresa (dhl_shipments) — equivalente a packages/mark-label-printed
app.patch('/api/admin/dhl/shipments/:id/mark-label-printed', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), async (req: Request, res: Response): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const r = await pool.query(
      `UPDATE dhl_shipments SET national_label_url = COALESCE(NULLIF(national_label_url, ''), 'manual-printed'), updated_at = NOW() WHERE id = $1 RETURNING id, national_label_url`,
      [id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Guía DHL no encontrada' });
    res.json({ success: true, national_label_url: r.rows[0].national_label_url });
  } catch (e: any) {
    res.status(500).json({ error: 'Error al marcar etiqueta', details: e.message });
  }
});
// Cambio de tipo de producto (requiere PIN de supervisor dentro del handler)
app.patch('/api/admin/dhl/shipments/:id/product-type', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updateDhlShipmentProductType);
app.patch('/api/admin/dhl/shipments/:id/status', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updateDhlShipmentStatus);
// Eliminacion de guia (solo Super Admin)
// Eliminar guía DHL: super_admin/admin, o usuario de operaciones con permiso de
// edición del panel DHL Monterrey (ops_mx_cedis). La verificación fina va dentro.
app.delete('/api/admin/dhl/shipments/:id', authenticateToken, deleteDhlShipment);
app.get('/api/admin/dhl/settings/import-tax', authenticateToken, requireMinLevel(ROLES.ADMIN), getDhlImportTaxSetting);
app.get('/api/admin/dhl/import-tax/expenses', authenticateToken, requireMinLevel(ROLES.ADMIN), getDhlImportTaxExpenses);
app.put('/api/admin/dhl/settings/import-tax', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateDhlImportTaxSetting);
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
app.get('/api/china/trajectory-names', authenticateToken, listTrajectoryNames);
app.post('/api/china/recalc-statuses', authenticateToken, recalcChinaStatuses);
app.get('/api/china/status-history/:tracking', authenticateToken, getChinaStatusHistory);

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
app.get('/api/gex/clients', authenticateToken, searchClientsWarranty);

// Toggle auto-GEX preference
app.get('/api/gex/auto-config', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const result = await pool.query('SELECT gex_auto_enabled FROM users WHERE id = $1', [userId]);
    res.json({ gex_auto_enabled: result.rows[0]?.gex_auto_enabled || false });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener configuración GEX' });
  }
});

app.put('/api/gex/auto-config', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { enabled } = req.body;
    await pool.query('UPDATE users SET gex_auto_enabled = $1 WHERE id = $2', [!!enabled, userId]);
    console.log(`🛡️ Usuario ${userId} auto-GEX: ${!!enabled}`);
    res.json({ success: true, gex_auto_enabled: !!enabled });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar configuración GEX' });
  }
});

// ========== PANEL DEL ASESOR (self-service) ==========
app.get('/api/advisor/legacy/chartback', authenticateToken, getAdvisorChartbackClients);
app.get('/api/advisor/legacy/chartback/history', authenticateToken, getAdvisorChartbackHistory);
app.get('/api/advisor/legacy/chartback/:boxId/cargo', authenticateToken, getAdvisorChartbackClientCargo);
app.post('/api/advisor/legacy/chartback/:id/action', authenticateToken, chartbackAction);

// ========== ADMIN: GESTIÓN CHARTBACK ==========
app.get('/api/admin/legacy/chartback', authenticateToken, requireMinLevel(ROLES.ADMIN), getAdminChartbackClients);
app.patch('/api/admin/legacy/chartback/assign', authenticateToken, requireMinLevel(ROLES.ADMIN), assignChartbackAdvisor);
app.patch('/api/admin/legacy/chartback/:id/recover', authenticateToken, requireMinLevel(ROLES.ADMIN), adminMarkRecovered);
app.get('/api/admin/legacy/chartback/:boxId/cargo', authenticateToken, requireMinLevel(ROLES.ADMIN), getChartbackClientCargo);
app.get('/api/advisor/dashboard', authenticateToken, getAdvisorDashboard);
app.get('/api/advisor/packages', authenticateToken, getAdvisorPackages);

// KPIs en vivo para el widget del dashboard del asesor:
//   - precio_tdi_aereo_usd / precio_tdi_express_usd: USD/kg ruta Genérico (G) actual
//   - tc_envio_dinero (entangled / XPAY): TC actual del proveedor por defecto
//   - tc_operativo: tipo_cambio_final del servicio pobox_usa en exchange_rate_config
app.get('/api/advisor/rates', authenticateToken, async (req: Request, res: Response) => {
  try {
    const role = (req as any).user?.role || '';
    const advisorRoles = ['advisor', 'sub_advisor', 'asesor', 'asesor_lider'];
    if (!advisorRoles.includes(role)) {
      res.status(403).json({ success: false, error: 'Solo para asesores' });
      return;
    }

    // 1. Precio por kg TDI Aéreo (G + markup 8)
    let precioTdiAereo: number | null = null;
    try {
      const r = await pool.query(
        `SELECT cost_per_kg_usd FROM air_routes
         WHERE is_active = true AND code <> 'TDI-EXPRES'
         ORDER BY id ASC LIMIT 1`
      );
      const cost = parseFloat(r.rows[0]?.cost_per_kg_usd || '0');
      if (cost > 0) precioTdiAereo = cost + 8;
    } catch { /* opcional */ }

    // 2. Precio por kg TDI Express (G + markup 8 sobre ruta TDI-EXPRES)
    let precioTdiExpress: number | null = null;
    try {
      const r = await pool.query(
        `SELECT cost_per_kg_usd FROM air_routes
         WHERE is_active = true AND code = 'TDI-EXPRES' LIMIT 1`
      );
      const cost = parseFloat(r.rows[0]?.cost_per_kg_usd || '0');
      if (cost > 0) precioTdiExpress = cost + 8;
    } catch { /* opcional */ }

    // 3. TC Envío de dinero (Entangled / XPAY) — precio efectivo = base + override
    let tcEnvioDinero: number | null = null;
    try {
      const r = await pool.query(
        `SELECT (COALESCE(tipo_cambio_usd, 0) + COALESCE(override_tipo_cambio_usd, 0))::float AS tc
         FROM entangled_providers
         WHERE COALESCE(is_active, true) = true
         ORDER BY is_default DESC NULLS LAST, id ASC
         LIMIT 1`
      );
      const v = parseFloat(r.rows[0]?.tc || '0');
      if (v > 0) tcEnvioDinero = v;
    } catch { /* opcional */ }

    // 4. TC Operativo (PO Box USA)
    let tcOperativo: number | null = null;
    try {
      const r = await pool.query(
        `SELECT COALESCE(tipo_cambio_final, COALESCE(tipo_cambio_manual, ultimo_tc_api, 0) + COALESCE(sobreprecio, 0))::float AS tc
         FROM exchange_rate_config
         WHERE servicio = 'pobox_usa' AND estado = TRUE
         LIMIT 1`
      );
      const v = parseFloat(r.rows[0]?.tc || '0');
      if (v > 0) tcOperativo = v;
    } catch { /* opcional */ }

    res.json({
      success: true,
      rates: {
        precio_tdi_aereo_usd: precioTdiAereo,
        precio_tdi_express_usd: precioTdiExpress,
        tc_envio_dinero: tcEnvioDinero,
        tc_operativo: tcOperativo,
      },
      fetched_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[advisor/rates] error:', err?.message);
    res.status(500).json({ success: false, error: 'Error al cargar tarifas' });
  }
});

app.get('/api/advisor/clients', authenticateToken, getAdvisorClients);
app.get('/api/advisor/clients/:clientId/wallet', authenticateToken, getClientWallet);
app.get('/api/advisor/clients/:clientId/addresses', authenticateToken, getAdvisorClientAddresses);
app.post('/api/advisor/clients/:clientId/addresses', authenticateToken, createAdvisorClientAddress);
app.put('/api/advisor/clients/:clientId/addresses/:addressId/default-for-service', authenticateToken, setAdvisorClientDefaultForService);
app.delete('/api/advisor/clients/:clientId/addresses/:addressId', authenticateToken, deleteAdvisorClientAddress);
app.put('/api/advisor/shipments/:uid/instructions', authenticateToken, uploadDeliveryDocs, assignAdvisorShipmentInstructions);
app.put('/api/advisor/packages/:packageId/assign-client', authenticateToken, assignClientToPackage);

// ========== COTIZACIONES FORMALES POR ASESOR (PDF) ==========
import { listAdvisorFormalQuotes, createAdvisorFormalQuote, getAdvisorFormalQuotePdfUrl } from './advisorQuoteController';
app.get('/api/advisor/formal-quotes', authenticateToken, listAdvisorFormalQuotes);
app.post('/api/advisor/formal-quotes', authenticateToken, createAdvisorFormalQuote);
app.get('/api/advisor/formal-quotes/:id/pdf', authenticateToken, getAdvisorFormalQuotePdfUrl);
app.post('/api/advisor/quote-requests', authenticateToken, uploadAdvisorQuoteFiles, createAdvisorQuoteRequest);

import { listAdvisorPaymentOrders, createAdvisorPaymentOrder, updateAdvisorPaymentOrderStatus, deleteAdvisorPaymentOrder, getAdvisorPaymentOrderDetail, getAdvisorOrderInvoiceInfo, getAdvisorOrderInvoiceFile, requestAdvisorOrderInvoice, listClientFiscalProfiles, addClientFiscalProfile, deleteClientFiscalProfile } from './advisorPaymentOrderController';
app.get('/api/advisor/payment-orders', authenticateToken, listAdvisorPaymentOrders);
app.get('/api/advisor/payment-orders/:id/detail', authenticateToken, getAdvisorPaymentOrderDetail);
app.get('/api/advisor/payment-orders/:id/invoice-info', authenticateToken, getAdvisorOrderInvoiceInfo);
app.get('/api/advisor/payment-orders/:id/invoice-file', authenticateToken, getAdvisorOrderInvoiceFile);
app.post('/api/advisor/payment-orders/:id/request-invoice', authenticateToken, requestAdvisorOrderInvoice);
app.get('/api/advisor/clients/:clientId/fiscal-profiles', authenticateToken, listClientFiscalProfiles);
app.post('/api/advisor/clients/:clientId/fiscal-profiles', authenticateToken, addClientFiscalProfile);
app.delete('/api/advisor/clients/:clientId/fiscal-profiles/:profileId', authenticateToken, deleteClientFiscalProfile);
app.post('/api/advisor/payment-orders', authenticateToken, createAdvisorPaymentOrder);
app.put('/api/advisor/payment-orders/:id/status', authenticateToken, updateAdvisorPaymentOrderStatus);
app.delete('/api/advisor/payment-orders/:id', authenticateToken, deleteAdvisorPaymentOrder);
app.get('/api/advisor/payment-orders/:orderId/proofs', authenticateToken, getAdvisorPaymentProofs);
app.post('/api/advisor/payment-orders/:orderId/proof', authenticateToken, advisorProofUpload.single('proof'), uploadAdvisorPaymentProof);
app.delete('/api/advisor/payment-orders/:orderId/proof/:voucherId', authenticateToken, deleteAdvisorPaymentProof);
app.patch('/api/advisor/payment-orders/:orderId/proof/:voucherId', authenticateToken, updateAdvisorProofAmount);
app.post('/api/advisor/clients/:clientId/notes', authenticateToken, saveAdvisorNote);
app.get('/api/advisor/shipment/:uid', authenticateToken, getAdvisorShipmentDetail);
app.get('/api/advisor/shipments', authenticateToken, getAdvisorShipments);
app.get('/api/advisor/shipments/:id/children', authenticateToken, getRepackChildren);
app.get('/api/advisor/commissions', authenticateToken, getAdvisorCommissions);
app.get('/api/advisor/team', authenticateToken, getAdvisorTeam);
app.get('/api/advisor/client-tickets', authenticateToken, getAdvisorClientTickets);
app.get('/api/advisor/client-tickets/:ticketId', authenticateToken, getAdvisorTicketDetail);
app.get('/api/advisor/notifications', authenticateToken, getAdvisorNotifications);
app.get('/api/advisor/notifications/unread-count', authenticateToken, getAdvisorUnreadCount);

// ========== ADVISOR PAYMENT PROOFS (COMPROBANTES DE PAGO) ==========
// Declarar funciones ANTES de los endpoints

// GET /api/advisor/payment-orders/:orderId/proofs
async function getAdvisorPaymentProofs(req: AuthRequest, res: Response) {
  try {
    const orderId = String(req.params.orderId);
    const orderId_num = parseInt(orderId, 10);
    if (isNaN(orderId_num)) return res.status(400).json({ error: 'Invalid orderId' });

    // Verificar que existe la orden de pago
    const orderRes = await pool.query(
      'SELECT id FROM pobox_payments WHERE id = $1',
      [orderId_num]
    );
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Payment order not found' });

    // Traer todos los comprobantes asociados
    const proofs = await pool.query(
      `SELECT
        pv.id,
        pv.file_url,
        pv.file_key,
        pv.file_type,
        pv.detected_amount,
        pv.declared_amount,
        pv.status,
        pv.created_at,
        u.full_name as uploaded_by,
        CASE
          WHEN pv.user_id = $2 THEN 'advisor'
          ELSE 'client'
        END as uploader_type
      FROM payment_vouchers pv
      LEFT JOIN users u ON pv.user_id = u.id
      WHERE pv.payment_order_id = $1
      ORDER BY pv.created_at DESC`,
      [orderId_num, req.user!.userId]
    );

    // Generar URLs pre-firmadas (el bucket S3 es privado)
    const { getSignedUrlForKey } = require('./s3Service');
    const proofsWithUrls = await Promise.all(proofs.rows.map(async (p: any) => {
      let url = p.file_url;
      if (p.file_key) {
        try { url = await getSignedUrlForKey(p.file_key, 3600); } catch { /* usar file_url como fallback */ }
      }
      // Extraer nombre original del file_key: payment-proofs/proof-{id}-{ts}-{originalname}
      const rawName = (p.file_key || p.file_url || '').split('/').pop() || '';
      const filename = rawName.replace(/^proof-\d+-\d+-/, '') || rawName || `Comprobante`;
      return { ...p, url, filename };
    }));

    res.json({ proofs: proofsWithUrls });
  } catch (error) {
    console.error('Error fetching advisor payment proofs:', error);
    res.status(500).json({ error: 'Failed to fetch proofs' });
  }
}

// POST /api/advisor/payment-orders/:orderId/proof
async function uploadAdvisorPaymentProof(req: AuthRequest, res: Response) {
  try {
    const orderId = String(req.params.orderId);
    const { declared_amount, currency } = req.body;
    const orderId_num = parseInt(orderId, 10);
    
    if (isNaN(orderId_num)) return res.status(400).json({ error: 'Invalid orderId' });
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    if (!declared_amount) return res.status(400).json({ error: 'Missing declared_amount' });

    // Verificar que existe la orden de pago
    const orderRes = await pool.query(
      'SELECT id, user_id, amount, voucher_total, status FROM pobox_payments WHERE id = $1',
      [orderId_num]
    );
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Payment order not found' });
    const order = orderRes.rows[0];

    // Importar uploadToS3
    const { uploadToS3 } = require('./s3Service');

    // Subir archivo a S3
    const originalname = req.file.originalname || 'proof';
    const filename = `proof-${orderId_num}-${Date.now()}-${originalname}`;
    const fileExtension = (originalname.split('.').pop() || 'jpg').toLowerCase();
    const key = `payment-proofs/${filename}`;

    const fileUrl = await uploadToS3(req.file.buffer, key, req.file.mimetype || 'application/octet-stream');

    // Guardar en BD
    const result = await pool.query(
      `INSERT INTO payment_vouchers
        (payment_order_id, user_id, service_type, file_url, file_key, file_type, declared_amount, currency, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id, created_at`,
      [
        orderId_num,
        req.user!.userId,
        'POBOX_PAYMENT',
        fileUrl,
        key,
        fileExtension,
        declared_amount,
        currency || 'MXN',
        'pending_review'
      ]
    );

    // Actualizar pobox_payments: acumular monto y actualizar status para que aparezca en Dashboard Cobranza
    const newTotal = Number(order.voucher_total || 0) + Number(declared_amount);
    const orderAmount = Number(order.amount);
    const newStatus = newTotal >= orderAmount ? 'vouchers_submitted' : 'vouchers_partial';
    await pool.query(
      `UPDATE pobox_payments
       SET voucher_total = $1,
           voucher_count = COALESCE(voucher_count, 0) + 1,
           status = CASE WHEN status IN ('pending', 'pending_payment', 'vouchers_partial') THEN $3 ELSE status END
       WHERE id = $2`,
      [newTotal, orderId_num, newStatus]
    );

    res.json({
      success: true,
      voucherId: result.rows[0].id,
      message: 'Proof uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading advisor payment proof:', error);
    res.status(500).json({ error: 'Failed to upload proof' });
  }
}

// DELETE /api/advisor/payment-orders/:orderId/proof/:voucherId
async function deleteAdvisorPaymentProof(req: AuthRequest, res: Response) {
  try {
    const orderId_num = parseInt(String(req.params.orderId), 10);
    const voucherId_num = parseInt(String(req.params.voucherId), 10);
    if (isNaN(orderId_num) || isNaN(voucherId_num)) return res.status(400).json({ error: 'Invalid id' });

    // Fetch the voucher to verify it belongs to this order
    const voucherRes = await pool.query(
      `SELECT id, declared_amount, file_key FROM payment_vouchers WHERE id = $1 AND payment_order_id = $2`,
      [voucherId_num, orderId_num]
    );
    if (!voucherRes.rows.length) return res.status(404).json({ error: 'Voucher not found' });
    const voucher = voucherRes.rows[0];

    // Delete from DB
    await pool.query(`DELETE FROM payment_vouchers WHERE id = $1`, [voucherId_num]);

    // Decrement pobox_payments counters and revert status if no vouchers remain
    const remaining = await pool.query(
      `SELECT COUNT(*) as cnt FROM payment_vouchers WHERE payment_order_id = $1`,
      [orderId_num]
    );
    const hasRemaining = parseInt(remaining.rows[0].cnt) > 0;
    const newStatus = hasRemaining ? 'vouchers_partial' : 'pending_payment';
    await pool.query(
      `UPDATE pobox_payments
       SET voucher_count = GREATEST(0, COALESCE(voucher_count, 0) - 1),
           voucher_total = GREATEST(0, COALESCE(voucher_total, 0) - $1),
           status = CASE WHEN status IN ('vouchers_submitted', 'vouchers_partial') THEN $3 ELSE status END
       WHERE id = $2`,
      [Number(voucher.declared_amount) || 0, orderId_num, newStatus]
    );

    // Delete from S3 if possible (best-effort)
    if (voucher.file_key) {
      try {
        const { deleteFromS3 } = require('./s3Service');
        if (deleteFromS3) await deleteFromS3(voucher.file_key);
      } catch { /* ignore */ }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting advisor payment proof:', error);
    res.status(500).json({ error: 'Failed to delete proof' });
  }
}

// PATCH /api/advisor/payment-orders/:orderId/proof/:voucherId
async function updateAdvisorProofAmount(req: AuthRequest, res: Response) {
  try {
    const orderId_num = parseInt(String(req.params.orderId), 10);
    const voucherId_num = parseInt(String(req.params.voucherId), 10);
    const { declared_amount } = req.body;
    if (isNaN(orderId_num) || isNaN(voucherId_num)) return res.status(400).json({ error: 'Invalid id' });
    if (!declared_amount) return res.status(400).json({ error: 'Missing declared_amount' });

    const voucherRes = await pool.query(
      `SELECT id, declared_amount FROM payment_vouchers WHERE id = $1 AND payment_order_id = $2`,
      [voucherId_num, orderId_num]
    );
    if (!voucherRes.rows.length) return res.status(404).json({ error: 'Voucher not found' });
    const oldAmount = Number(voucherRes.rows[0].declared_amount) || 0;
    const newAmount = Number(declared_amount);

    await pool.query(`UPDATE payment_vouchers SET declared_amount = $1 WHERE id = $2`, [newAmount, voucherId_num]);

    // Re-calculate pobox_payments totals
    const orderRes = await pool.query(
      `SELECT amount, voucher_total FROM pobox_payments WHERE id = $1`,
      [orderId_num]
    );
    if (orderRes.rows.length) {
      const newTotal = Math.max(0, Number(orderRes.rows[0].voucher_total || 0) - oldAmount + newAmount);
      const orderAmount = Number(orderRes.rows[0].amount);
      const newStatus = newTotal >= orderAmount ? 'vouchers_submitted' : 'vouchers_partial';
      await pool.query(
        `UPDATE pobox_payments
         SET voucher_total = $1,
             status = CASE WHEN status IN ('vouchers_submitted', 'vouchers_partial') THEN $3 ELSE status END
         WHERE id = $2`,
        [newTotal, orderId_num, newStatus]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating advisor payment proof amount:', error);
    res.status(500).json({ error: 'Failed to update proof' });
  }
}

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
// Envío masivo de WhatsApp a leads (plantillas predefinidas). Send gateado a DIRECTOR+.
app.get('/api/admin/crm/bulk-whatsapp/defaults', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getBulkWhatsappDefaults);
app.post('/api/admin/crm/bulk-whatsapp', authenticateToken, requireMinLevel(ROLES.DIRECTOR), bulkWhatsapp);
// Administrar plantillas de envio masivo (CRUD)
app.get('/api/admin/crm/bulk-templates', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getBulkTemplates);
app.post('/api/admin/crm/bulk-templates', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createBulkTemplate);
app.put('/api/admin/crm/bulk-templates/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateBulkTemplate);
app.delete('/api/admin/crm/bulk-templates/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteBulkTemplate);
const bulkTemplateImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB (límite de WhatsApp)
app.post('/api/admin/crm/bulk-templates/upload-image', authenticateToken, requireMinLevel(ROLES.DIRECTOR), bulkTemplateImageUpload.single('file'), uploadBulkTemplateImage);
// Rastreo de clics en botones de URL de WhatsApp: registra y redirige (público, sin auth).
app.get('/r/:token', trackClickRedirect);

// 🎁 Control de Kit de Bienvenida
app.get('/api/admin/welcome-kit', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getWelcomeKits);
app.get('/api/admin/welcome-kit/search-client', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), searchKitClient);
app.post('/api/admin/welcome-kit', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createWelcomeKit);
app.put('/api/admin/welcome-kit/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateWelcomeKit);
app.delete('/api/admin/welcome-kit/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteWelcomeKit);
// 🛍️ Catálogo de regalos (inventario)
const kitPhotoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
app.get('/api/admin/welcome-kit/products', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getKitProducts);
app.post('/api/admin/welcome-kit/products', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createKitProduct);
app.put('/api/admin/welcome-kit/products/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateKitProduct);
app.delete('/api/admin/welcome-kit/products/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteKitProduct);
app.post('/api/admin/welcome-kit/products/upload-photo', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), kitPhotoUpload.single('file'), uploadKitProductPhoto);
// 📱 Cliente: ver su kit pendiente y elegir su regalo (crea la guía USK)
app.get('/api/welcome-kit/my-kit', authenticateToken, getMyKit);
app.post('/api/welcome-kit/select-gift', authenticateToken, selectKitGift);

// 🔄 Secuencias automáticas de WhatsApp (cadencia Día 1/3/7)
app.get('/api/admin/crm/sequences', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getSequences);
app.put('/api/admin/crm/sequences/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateSequence);
app.post('/api/admin/crm/sequences/:id/enroll', authenticateToken, requireMinLevel(ROLES.DIRECTOR), enrollInSequence);
app.post('/api/admin/crm/sequences/unenroll', authenticateToken, requireMinLevel(ROLES.DIRECTOR), unenrollFromSequence);

// 📩 Webhook entrante de WhatsApp (verificación + eventos). Público (Meta lo llama).
app.get('/api/webhooks/whatsapp', verifyWhatsappWebhook);
app.post('/api/webhooks/whatsapp', handleWhatsappWebhook);
app.get('/api/_diag/wa-subs', debugWabaSubs);
// Grupos de leads (segmentación manual; reglas automáticas después)
app.get('/api/admin/crm/groups', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getLeadGroups);
app.post('/api/admin/crm/groups', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createLeadGroup);
app.delete('/api/admin/crm/groups/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), deleteLeadGroup);
app.post('/api/admin/crm/groups/:id/members', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), addLeadsToGroup);
app.delete('/api/admin/crm/groups/:id/members', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), removeLeadsFromGroup);
// Black list de leads (no reciben masivos + desaparecen del funnel)
app.get('/api/admin/crm/blacklist', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getBlacklist);
app.post('/api/admin/crm/blacklist', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), addToBlacklist);
app.delete('/api/admin/crm/blacklist', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), removeFromBlacklist);
// Acciones por lead: agregar teléfono / asignar asesor
app.post('/api/admin/crm/leads/phone', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateLeadPhone);
app.post('/api/admin/crm/leads/assign-advisor', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), assignLeadAdvisor);

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
app.patch('/api/admin/crm/clients/:id/advisor', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), changeClientAdvisor);
app.post('/api/admin/crm/clients/:id/reset-password', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), resetClientPassword);
app.patch('/api/admin/crm/clients/:id/toggle-active', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), toggleClientActive);
app.patch('/api/admin/crm/clients/:id/toggle-broker', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), toggleClientBroker);

// Módulo 3: Prospectos (Leads mejorado)
app.get('/api/admin/crm/prospects', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getProspects);
app.post('/api/admin/crm/prospects', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createProspect);
app.post('/api/admin/crm/prospects/bulk', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), bulkCreateProspects);
app.put('/api/admin/crm/prospects/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateProspect);
app.post('/api/admin/crm/prospects/:id/convert', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), convertProspectToClient);
app.delete('/api/admin/crm/prospects/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), deleteProspect);

// Módulo 4: Reportes
app.get('/api/admin/crm/reports/sales', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getSalesReport);
app.get('/api/admin/crm/reports/sales/advisor/:advisorId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getSalesReportByAdvisor);
app.get('/api/admin/crm/reports/sales/advisor/:advisorId/items', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getSalesReportServiceItems);
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
app.get('/api/admin/support/ticket/:id/messages', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), getAdminTicketMessages);

// Cliente: Responder a su ticket
app.post('/api/support/ticket/:id/message', authenticateToken, uploadSupportImages, clientReplyTicket);

// Cliente: Solicitar cotización formal (fotos + packing list)
app.post('/api/support/quote-formal-request', authenticateToken, uploadFormalQuoteFiles, createFormalQuoteRequest);

// Admin: Ver todos los tickets (tablero Kanban)
app.get('/api/admin/support/tickets', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), getAdminTickets);

// Admin: Estadísticas de soporte
app.get('/api/admin/support/stats', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), getSupportStats);

// Admin: Responder como agente (con adjuntos opcionales)
app.post('/api/admin/support/ticket/:id/reply', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), uploadAdminReplyFiles, adminReplyTicket);

// Admin: Mejorar mensaje con IA
app.post('/api/support/ai-enhance', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), aiEnhanceMessage);

// Traducción bajo demanda (agente o cliente autenticado)
app.post('/api/support/ai-translate', authenticateToken, aiTranslateMessage);

// Admin: Resolver ticket
app.put('/api/admin/support/ticket/:id/resolve', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), resolveTicket);

// Admin: Reactivar ticket resuelto
app.put('/api/admin/support/ticket/:id/reactivate', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), reactivateTicket);

// Admin: Asignar ticket a agente
app.put('/api/admin/support/ticket/:id/assign', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), assignTicket);
app.patch('/api/admin/support/ticket/:id/archive', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), archiveTicket);

// Departamentos: listar (autenticado, cualquier rol)
app.get('/api/support/departments', authenticateToken, getDepartments);

// Signed URL para imágenes privadas de soporte en S3
app.get('/api/admin/support/image-sign', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), signSupportImage);

// Admin: agentes disponibles para asignar
app.get('/api/admin/support/agents', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), getSupportAgents);

// Admin: transferir ticket a departamento/agente
app.post('/api/admin/support/ticket/:id/transfer', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), transferTicket);

// 🆘 Público: Reclamación de número de cliente (sin auth)
app.post('/api/support/public/claim-box-id', uploadBoxIdClaimFiles, submitBoxIdClaim);

// Admin: Listar / resolver reclamaciones de box_id
app.get('/api/admin/support/box-id-claims', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), getBoxIdClaims);
app.put('/api/admin/support/box-id-claims/:id', authenticateToken, requireMinLevel(ROLES.ACCOUNTANT), resolveBoxIdClaim);

// ========== NOTIFICACIONES ==========

// App: Obtener mis notificaciones
app.get('/api/notifications', authenticateToken, getMyNotifications);

// App: Marcar notificación como leída
app.put('/api/notifications/:notificationId/read', authenticateToken, markAsRead);

// App: Marcar todas como leídas
app.put('/api/notifications/read-all', authenticateToken, markAllAsRead);

// App: Archivar notificación individual
app.put('/api/notifications/:notificationId/archive', authenticateToken, archiveNotification);

// App: Archivar todas
app.put('/api/notifications/archive-all', authenticateToken, archiveAllNotifications);

// App: Archivar varias por id
app.post('/api/notifications/archive-bulk', authenticateToken, archiveBulkNotifications);

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
app.get('/api/maritime/containers/:id/status-history', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getContainerStatusHistory);
app.delete('/api/maritime/containers/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteContainer);
app.get('/api/maritime/week-saved-addresses', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getWeekSavedAddresses);
app.post('/api/maritime/containers/:id/week-address', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), assignWeekContainerAddress);
app.patch('/api/maritime/containers/:id/reference', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateContainerReference);
app.patch('/api/maritime/containers/:id/sale-price', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateContainerSalePrice);

// 👁️ Lista de monitoristas disponibles para asignar a contenedores FCL
app.get('/api/maritime/monitors', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT id, full_name, email, phone
      FROM users
      WHERE LOWER(role) = 'monitoreo' AND COALESCE(is_active, true) = true
      ORDER BY full_name ASC
    `);
    res.json({ monitors: result.rows });
  } catch (error) {
    console.error('Error listando monitoristas:', error);
    res.status(500).json({ error: 'Error al obtener monitoristas' });
  }
});

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
app.patch('/api/anticipos/referencias/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateReferenciaMonto);
app.post('/api/anticipos/referencias/:id/desasignar', authenticateToken, requireMinLevel(ROLES.DIRECTOR), desasignarReferencia);
app.post('/api/anticipos/bolsas/:bolsaId/revalidar', authenticateToken, requireMinLevel(ROLES.DIRECTOR), revalidarReferenciasBolsa);

// Anticipos por contenedor
app.get('/api/anticipos/container/:containerId/anticipos', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAnticiposByContainer);
app.patch('/api/anticipos/referencias/:referenciaId/ajuste', authenticateToken, requireRole('super_admin'), setAjusteMontoAnticipo);

// Asignaciones de Anticipos
app.get('/api/anticipos/container/:containerId/asignaciones', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAsignacionesByContainer);
app.post('/api/anticipos/asignar', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), asignarAnticipo);
app.delete('/api/anticipos/asignaciones/:id/revertir', authenticateToken, requireMinLevel(ROLES.DIRECTOR), revertirAsignacion);

// Estadísticas de Anticipos
app.get('/api/anticipos/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAnticiposStats);

// ========== MÓDULO CONTROL DE TRANSPORTES ==========
const transporteUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.get('/api/transporte/proveedores', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getProveedoresTransporte);
app.post('/api/transporte/proveedores', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createProveedorTransporte);
app.put('/api/transporte/proveedores/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateProveedorTransporte);

app.get('/api/transporte/bolsas', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getBolsasTransporte);
app.post('/api/transporte/bolsas', authenticateToken, requireMinLevel(ROLES.DIRECTOR), transporteUpload.fields([{ name: 'comprobante', maxCount: 1 }, { name: 'factura', maxCount: 1 }]), createBolsaTransporte);
app.delete('/api/transporte/bolsas/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteBolsaTransporte);
app.get('/api/transporte/bolsas/:bolsaId/referencias', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getReferenciasByBolsaTransporte);

app.get('/api/transporte/referencias/validas', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getReferenciasValidasTransporte);
app.get('/api/transporte/container/:containerId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getTransporteByContainer);
app.get('/api/transporte/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getStatsTransporte);

// ========== MÓDULO CONTROL DE DEMORAS ==========
const demoraUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.get('/api/demora/proveedores', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getProveedoresDemora);
app.post('/api/demora/proveedores', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createProveedorDemora);
app.put('/api/demora/proveedores/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateProveedorDemora);

app.get('/api/demora/bolsas', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getBolsasDemora);
app.post('/api/demora/bolsas', authenticateToken, requireMinLevel(ROLES.DIRECTOR), demoraUpload.fields([{ name: 'comprobante', maxCount: 1 }, { name: 'factura', maxCount: 1 }]), createBolsaDemora);
app.delete('/api/demora/bolsas/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), deleteBolsaDemora);
app.get('/api/demora/bolsas/:bolsaId/referencias', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getReferenciasByBolsaDemora);

app.get('/api/demora/referencias/validas', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getReferenciasValidasDemora);
app.get('/api/demora/container/:containerId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getDemoraByContainer);
app.get('/api/demora/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getStatsDemora);

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
app.put('/api/maritime-api/orders/:ordersn/status', authenticateToken, requireRole(ROLES.SUPER_ADMIN), updateMaritimeOrderStatus);
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

// ========== API ELP — proveedor externo de trámite/CBP (USA) ==========
// Endpoints del proveedor (auth por API key en header X-ELP-Api-Key, sin login)
app.get('/api/elp/containers', requireElpApiKey, elpListContainers);
app.get('/api/elp/containers/:ref/documents', requireElpApiKey, elpGetDocuments);
// Descarga ZIP pública (auth por token en la URL, para el link del correo)
// Nota: sin punto en el path para evitar el parseo de extensión de Express 5.
app.get('/api/elp/containers/:ref/zip', elpDownloadZip);
app.post('/api/elp/containers/:ref/status', requireElpApiKey, elpReceiveStatus);
// Endpoints admin (login normal) para la página "API ELP"
app.get('/api/elp/admin/containers', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), elpAdminListContainers);
app.get('/api/elp/admin/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), elpAdminStats);
app.post('/api/elp/admin/containers/:id/notify', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), elpAdminResendNotify);
app.get('/api/elp/admin/settings', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), elpAdminGetSettings);
app.put('/api/elp/admin/settings', authenticateToken, requireMinLevel(ROLES.ADMIN), elpAdminUpdateSettings);

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

// ── POBOX PAYMENT REFERENCES ────────────────────────────────────────────────
app.get('/api/pobox/payment-references', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: Request, res: Response) => {
  const { supplier_id } = req.query;
  try {
    const q = supplier_id
      ? await pool.query(
          `SELECT * FROM pobox_payment_references WHERE supplier_id = $1 ORDER BY created_at DESC`,
          [Number(supplier_id)]
        )
      : await pool.query(`SELECT * FROM pobox_payment_references ORDER BY created_at DESC`);
    res.json({ references: q.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pobox/payment-references', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: Request, res: Response) => {
  const { supplier_id, supplier_name, consolidation_ids, total_usd, total_mxn, packages_count, packages_data, notas } = req.body;
  if (!supplier_id || !consolidation_ids?.length) {
    return res.status(400).json({ error: 'supplier_id y consolidation_ids son requeridos' });
  }
  const userId = (req as any).user?.id ?? null;
  try {
    const r = await pool.query(
      `INSERT INTO pobox_payment_references (supplier_id, supplier_name, consolidation_ids, total_usd, total_mxn, packages_count, packages_data, notas, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [supplier_id, supplier_name, consolidation_ids, total_usd, total_mxn, packages_count, JSON.stringify(packages_data ?? []), notas ?? null, userId]
    );
    res.json({ reference: r.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pobox/payment-references/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const r = await pool.query(`DELETE FROM pobox_payment_references WHERE id = $1 RETURNING id`, [Number(id)]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Referencia no encontrada' });
    res.json({ deleted: r.rows[0].id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PAGAR por Referencia ─────────────────────────────────────────────────────
// La referencia es el snapshot autoritativo: el monto y los paquetes a pagar
// se determinan por lo que se capturó al generarla (packages_data con
// package_id + countsToTotal). Esto evita discrepancias entre el total que
// el usuario vio al generar la referencia y el monto del egreso registrado.
app.post('/api/pobox/payment-references/:id/pay', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: Request, res: Response) => {
  const refId = Number(req.params.id);
  const userId = (req as any).user?.userId ?? (req as any).user?.id ?? null;
  const adminName = (req as any).user?.email ?? (req as any).user?.name ?? 'Sistema';
  const dbClient = await pool.connect();
  try {
    const ref = await dbClient.query(`SELECT * FROM pobox_payment_references WHERE id = $1`, [refId]);
    if (ref.rows.length === 0) {
      dbClient.release();
      return res.status(404).json({ error: 'Referencia no encontrada' });
    }
    const refRow = ref.rows[0];
    if (refRow.status === 'pagada') {
      dbClient.release();
      return res.status(409).json({ error: 'Esta referencia ya fue pagada' });
    }

    // Filas pagables del snapshot (countsToTotal === true)
    const allRows: any[] = Array.isArray(refRow.packages_data) ? refRow.packages_data : [];
    const payableRows = allRows.filter(r => r && r.countsToTotal !== false);
    const snapshotPackageIds: number[] = payableRows
      .map(r => Number(r.package_id))
      .filter(n => Number.isFinite(n) && n > 0);

    // Fallback: si la referencia es antigua y no tiene package_id en el snapshot,
    // delegamos al flujo legacy basado en consolidation_ids (puede dar discrepancias).
    if (snapshotPackageIds.length === 0) {
      dbClient.release();
      const fakeReq = {
        body: {
          consolidation_ids: refRow.consolidation_ids,
          referencia: `REF-${refId}`,
          notas: refRow.notas || null,
        },
        user: (req as any).user,
      } as any;
      let pagoResult: any = null;
      let pagoError: any = null;
      const fakeRes = {
        status: (code: number) => ({ json: (data: any) => { if (code >= 400) pagoError = data; else pagoResult = data; return fakeRes; } }),
        json: (data: any) => { pagoResult = data; return fakeRes; },
      } as any;
      await pagarMultiplesConsolidaciones(fakeReq, fakeRes);
      if (pagoError) return res.status(400).json(pagoError);
      await pool.query(
        `UPDATE pobox_payment_references SET status='pagada', paid_at=NOW(), paid_by=$1 WHERE id=$2`,
        [userId, refId]
      );
      return res.json({
        ok: true,
        reference_id: refId,
        legacy_mode: true,
        ...pagoResult,
      });
    }

    // Pago basado en snapshot: monto = total_mxn de la referencia (lo que el usuario vio).
    const totalMonto = Number(refRow.total_mxn) || 0;
    const paymentRef = `REF-${refId}`;
    const supplierName = refRow.supplier_name || '';
    const consolidationIds: number[] = Array.isArray(refRow.consolidation_ids) ? refRow.consolidation_ids : [];
    const idsLista = consolidationIds.map(id => `#${id}`).join(', ');
    const concepto = `Pago Proveedor: ${supplierName || 'N/A'} - ${consolidationIds.length} consolidación(es) (${idsLista}) - ${snapshotPackageIds.length} paquete(s) [REF-${refId}]`;

    await dbClient.query('BEGIN');

    // Saldo actual
    const saldoResult = await dbClient.query(`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) as saldo
      FROM caja_chica_transacciones
    `);
    const saldoActual = parseFloat(saldoResult.rows[0].saldo);
    const nuevoSaldo = saldoActual - totalMonto;

    const txInsert = await dbClient.query(`
      INSERT INTO caja_chica_transacciones
        (tipo, monto, concepto, categoria, admin_id, admin_name, saldo_despues_movimiento, notas, referencia)
      VALUES ('egreso', $1, $2, 'pago_proveedor', $3, $4, $5, $6, $7)
      RETURNING id
    `, [totalMonto, concepto, userId, adminName, nuevoSaldo, refRow.notas || null, paymentRef]);
    const transaccionId: number = txInsert.rows[0].id;

    // Marcar EXACTAMENTE los paquetes del snapshot como pagados.
    // No re-filtramos por status/missing/lost: si el usuario aceptó cobrarlos
    // al generar la referencia, se marcan tal cual.
    const updateRes = await dbClient.query(`
      UPDATE packages
         SET costing_paid = TRUE,
             costing_paid_at = NOW(),
             costing_payment_reference = $1,
             updated_at = NOW()
       WHERE id = ANY($2::int[])
         AND (costing_paid IS NULL OR costing_paid = FALSE)
      RETURNING id, consolidation_id, supplier_id
    `, [paymentRef, snapshotPackageIds]);

    // Historial pobox por proveedor
    const bySupplier = new Map<number, number[]>();
    for (const row of updateRes.rows) {
      if (!row.supplier_id) continue;
      const arr = bySupplier.get(row.supplier_id) || [];
      arr.push(row.id);
      bySupplier.set(row.supplier_id, arr);
    }
    for (const [supplierId, packageIds] of bySupplier.entries()) {
      const monto = payableRows
        .filter((r: any) => packageIds.includes(Number(r.package_id)))
        .reduce((s: number, r: any) => s + Number(r.mxn || 0), 0);
      await dbClient.query('SAVEPOINT sp_pobox_hist');
      try {
        await dbClient.query(`
          INSERT INTO pobox_payment_history
            (package_ids, total_cost, payment_reference, paid_by, paid_at, supplier_id)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
        `, [JSON.stringify(packageIds), monto, paymentRef, userId, supplierId]);
        await dbClient.query('RELEASE SAVEPOINT sp_pobox_hist');
      } catch (err: any) {
        await dbClient.query('ROLLBACK TO SAVEPOINT sp_pobox_hist');
        console.warn('pobox_payment_history insert falló, continuando', { supplierId, code: err?.code, message: err?.message });
      }
    }

    // Marcar referencia como pagada (dentro de la misma tx)
    await dbClient.query(
      `UPDATE pobox_payment_references SET status='pagada', paid_at=NOW(), paid_by=$1 WHERE id=$2`,
      [userId, refId]
    );

    await dbClient.query('COMMIT');

    return res.json({
      ok: true,
      reference_id: refId,
      transaccion_id: transaccionId,
      payment_reference: paymentRef,
      total_monto: totalMonto,
      snapshot_packages: snapshotPackageIds.length,
      packages_marked: updateRes.rows.length,
      already_paid_skipped: snapshotPackageIds.length - updateRes.rows.length,
    });
  } catch (err: any) {
    await dbClient.query('ROLLBACK').catch(() => {});
    console.error('[pobox/payment-references/pay]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

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
  restoreDraft,
  reopenDraft,
  updateDraftFields,
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

// Vizion API Controller (Tracking satelital de contenedores) - DEPRECATED
// Se reemplaza por sync con MJCustomer (pageByClearance). Se deja import
// comentado por si se requiere rollback temporal.
// import {
//     subscribeContainer as subscribeToVizion,
//     handleVizionWebhook,
//     getContainerTracking as getContainerTrackingHistory,
//     addManualTrackingEvent,
//     syncCarrierTracking
// } from './vizionController';

// MJCustomer FCL Sync (sustituye a Vizion)
import {
    triggerMJCustomerFclSync,
    getMJCustomerFclSyncStatus,
    listMJCustomerFclConflicts,
} from './mjcustomerFclSync';

// ========== WEBHOOKS PÚBLICOS (SIN AUTENTICACIÓN) ==========
// Mailgun envía correos aquí automáticamente
app.post('/api/webhooks/email/inbound', handleInboundEmail);

// Mailgun correos aéreos
app.post('/api/webhooks/email/air-inbound', handleInboundAirEmail);

// Vizion webhook - DEPRECATED (se cancela API Vizion)
// app.post('/api/webhooks/vizion', handleVizionWebhook);

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
app.get('/api/admin/finance/summary', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getFinancialSummary);

// Admin: Panel de Riesgo y Crédito B2B - Todos los clientes
app.get('/api/admin/finance/clients', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getClientsFinancialStatus);

// Admin: Actualizar línea de crédito de un cliente específico
app.put('/api/admin/finance/clients/:clientId/credit', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateClientCredit);

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

// Admin: Todos los referidos (para panel web)
app.get('/api/admin/referidos/todos', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getAllReferidos);

// Admin: Actualizar configuración de bonos de referidos
app.put('/api/admin/referidos/configuracion', authenticateToken, requireMinLevel(ROLES.ADMIN), updateReferralSettings);

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
app.get('/api/admin/finance/dashboard', authenticateToken, requireMinLevel(ROLES.DIRECTOR), async (req: Request, res: Response): Promise<any> => {
  try {
    const { date_from, date_to, empresa_id, service_type } = req.query;
    
    // Fechas por defecto: hoy y mes actual
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    // Interpretamos las fechas en zona horaria de México (UTC-6) para evitar
    // perder pagos hechos en la noche que ya cayeron en UTC del día siguiente.
    const startDate = date_from
      ? new Date(`${date_from}T00:00:00-06:00`)
      : startOfMonth;
    let endDate = date_to
      ? new Date(`${date_to}T23:59:59.999-06:00`)
      : today;
    if (!date_to) endDate.setHours(23, 59, 59, 999);
    
    // Filtro por tipo de servicio (opcional)
    // ⚠️ La BD mezcla aliases ('china_air' vs 'AIR_CHN_MX'). Construimos lista de equivalentes.
    const SERVICE_ALIASES: Record<string, string[]> = {
      china_air:  ['china_air', 'AIR_CHN_MX', 'aereo'],
      AIR_CHN_MX: ['china_air', 'AIR_CHN_MX', 'aereo'],
      china_sea:  ['china_sea', 'SEA_CHN_MX', 'maritime', 'fcl'],
      SEA_CHN_MX: ['china_sea', 'SEA_CHN_MX', 'maritime', 'fcl'],
      usa_pobox:  ['usa_pobox', 'POBOX_USA', 'usa', 'pobox', 'po_box'],
      POBOX_USA:  ['usa_pobox', 'POBOX_USA', 'usa', 'pobox', 'po_box'],
      mx_cedis:   ['mx_cedis', 'AA_DHL', 'dhl'],
      AA_DHL:     ['mx_cedis', 'AA_DHL', 'dhl'],
    };
    const rawFilter = service_type ? (service_type as string) : null;
    const serviceFilter = rawFilter ? (SERVICE_ALIASES[rawFilter] || [rawFilter]) : null;

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
        fe.bank_name,
        fe.belvo_connected,
        fe.belvo_institution,
        fe.syncfy_connected,
        fe.syncfy_institution,
        (SELECT MAX(sc.last_sync_at) FROM syncfy_credentials sc WHERE sc.emitter_id = fe.id AND sc.is_active = TRUE) AS syncfy_last_sync,
        COALESCE(scc.service_type, 'general') as servicio_asignado,
        scc.service_name
      FROM fiscal_emitters fe
      LEFT JOIN service_company_config scc ON scc.emitter_id = fe.id
      WHERE fe.is_active = TRUE AND fe.show_in_cobranza = TRUE
      ORDER BY fe.alias
    `);

    // ============================================
    // KPIs PRINCIPALES - CONSOLIDADOS Y POR EMPRESA
    // ============================================

    // 1. Efectivo del día — SOLO pagos procesados en nuestro sistema (no caja chica).
    // caja_chica_transacciones incluye depósitos/retornos/movimientos internos que NO
    // son cobranza procesada; usamos los webhooks procesados con método efectivo.
    const ingresosHoyRes = await pool.query(`
      SELECT
        COALESCE(SUM(monto_neto), 0) as efectivo_hoy
      FROM openpay_webhook_logs
      WHERE DATE(fecha_pago) = CURRENT_DATE
        AND estatus_procesamiento = 'procesado'
        AND COALESCE(payment_method, tipo_pago) = 'cash'
        ${serviceFilter ? "AND service_type = ANY($1)" : ""}
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
        ${serviceFilter ? "AND service_type = ANY($1)" : ""}
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
        ${serviceFilter ? "AND service_type = ANY($1)" : ""}
    `, serviceFilter ? [serviceFilter] : []);

    // 2. Ingresos del mes actual - SPEI por empresa (solo SPEI)
    const speiMesPorEmpresaRes = await pool.query(`
      SELECT 
        owl.empresa_id,
        fe.alias as empresa_nombre,
        fe.rfc,
        COALESCE(SUM(owl.monto_recibido), 0) as total_bruto,
        COALESCE(SUM(owl.monto_neto), 0) as total_neto,
        COUNT(*) as total_transacciones,
        COALESCE(SUM(CASE WHEN COALESCE(owl.payment_method, owl.tipo_pago, 'spei') IN ('spei', 'transferencia') THEN owl.monto_neto ELSE 0 END), 0) as spei_neto,
        COALESCE(SUM(CASE WHEN COALESCE(owl.payment_method, owl.tipo_pago, 'spei') = 'cash' THEN owl.monto_neto ELSE 0 END), 0) as efectivo_neto,
        COALESCE(SUM(CASE WHEN COALESCE(owl.payment_method, owl.tipo_pago, 'spei') = 'paypal' THEN owl.monto_neto ELSE 0 END), 0) as paypal_neto
      FROM openpay_webhook_logs owl
      LEFT JOIN fiscal_emitters fe ON owl.empresa_id = fe.id
      WHERE owl.fecha_pago >= $1 AND owl.fecha_pago <= $2
        AND owl.estatus_procesamiento = 'procesado'
        ${serviceFilter ? "AND owl.service_type = ANY($3)" : ""}
      GROUP BY owl.empresa_id, fe.alias, fe.rfc
      ORDER BY total_bruto DESC
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
        ${serviceFilter ? "AND service_type = ANY($3)" : ""}
    `, serviceFilter ? [startOfMonth, today, serviceFilter] : [startOfMonth, today]);

    // Efectivo del mes — SOLO pagos procesados en nuestro sistema (no caja chica).
    const ingresosMesRes = await pool.query(`
      SELECT
        COALESCE(SUM(monto_neto), 0) as efectivo_mes
      FROM openpay_webhook_logs
      WHERE fecha_pago >= $1 AND fecha_pago <= $2
        AND estatus_procesamiento = 'procesado'
        AND COALESCE(payment_method, tipo_pago) = 'cash'
        ${serviceFilter ? "AND service_type = ANY($3)" : ""}
    `, serviceFilter ? [startOfMonth, today, serviceFilter] : [startOfMonth, today]);

    // Crédito y Tarjeta — procesados (mes y hoy)
    const credCardMesRes = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN COALESCE(payment_method, tipo_pago) = 'credit' THEN monto_neto ELSE 0 END), 0) as credito_mes,
        COALESCE(SUM(CASE WHEN COALESCE(payment_method, tipo_pago) = 'card'   THEN monto_neto ELSE 0 END), 0) as tarjeta_mes
      FROM openpay_webhook_logs
      WHERE fecha_pago >= $1 AND fecha_pago <= $2
        AND estatus_procesamiento = 'procesado'
        ${serviceFilter ? "AND service_type = ANY($3)" : ""}
    `, serviceFilter ? [startOfMonth, today, serviceFilter] : [startOfMonth, today]);

    const credCardHoyRes = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN COALESCE(payment_method, tipo_pago) = 'credit' THEN monto_neto ELSE 0 END), 0) as credito_hoy,
        COALESCE(SUM(CASE WHEN COALESCE(payment_method, tipo_pago) = 'card'   THEN monto_neto ELSE 0 END), 0) as tarjeta_hoy
      FROM openpay_webhook_logs
      WHERE DATE(fecha_pago) = CURRENT_DATE
        AND estatus_procesamiento = 'procesado'
        ${serviceFilter ? "AND service_type = ANY($1)" : ""}
    `, serviceFilter ? [serviceFilter] : []);

    // 3. Cartera Vencida Total (filtrada por servicio si aplica)
    const carteraRes = await pool.query(`
      SELECT 
        COALESCE(SUM(COALESCE(saldo_pendiente, assigned_cost_mxn)), 0) as cartera_total,
        COUNT(*) as guias_pendientes
      FROM packages
      WHERE (payment_status IN ('pending', 'partial') OR payment_status IS NULL)
        AND assigned_cost_mxn > 0
        AND COALESCE(saldo_pendiente, assigned_cost_mxn) > 0
        ${serviceFilter ? "AND service_type = ANY($1)" : ""}
    `, serviceFilter ? [serviceFilter] : []);

    // 4. Saldo en caja chica (filtrado por servicio si aplica)
    const saldoCajaRes = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) as saldo_caja
      FROM caja_chica_transacciones
      ${serviceFilter ? "WHERE service_type = ANY($1)" : ""}
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
        ${serviceFilter ? "AND p.service_type = ANY($3)" : ""}
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
          u.box_id as cliente_box_id,
          t.monto as monto_bruto,
          t.monto as monto_neto,
          0 as comision,
          'efectivo' as metodo,
          t.concepto,
          'Caja CC' as origen,
          'completado' as estatus,
          t.service_type,
          NULL as referencia,
          0 as credit_applied,
          0 as wallet_applied
        FROM caja_chica_transacciones t
        LEFT JOIN users u ON t.cliente_id = u.id
        WHERE t.tipo = 'ingreso'
          AND t.created_at >= $1 AND t.created_at <= $2
          AND t.concepto NOT LIKE 'Pago autorizado edo. cuenta%'
          -- Evitar DUPLICADOS: si esta nota de caja referencia una orden (Ref: RO-/PP-)
          -- que ya está registrada como pago procesado en openpay_webhook_logs
          -- (ej. "Auto-autorizado sync bancario" vs "Orden asesor"), no la listamos
          -- otra vez — se muestra la de openpay.
          AND NOT EXISTS (
            SELECT 1 FROM openpay_webhook_logs owl_dup
            WHERE owl_dup.estatus_procesamiento = 'procesado'
              AND owl_dup.transaction_id IN (
                substring(t.concepto from 'Ref: ([A-Za-z0-9-]+)'),
                t.referencia
              )
          )
          ${serviceFilter ? "AND t.service_type = ANY($3)" : ""}
        ORDER BY t.created_at DESC
        LIMIT 50
      )
      UNION ALL
      (
        SELECT 
          owl.id,
          COALESCE(pp.paid_at, owl.processed_at, owl.fecha_pago, owl.created_at) as fecha_hora,
          u.full_name as cliente,
          u.box_id as cliente_box_id,
          owl.monto_recibido as monto_bruto,
          owl.monto_neto,
          owl.monto_recibido - owl.monto_neto as comision,
          -- 💳 Crédito ya liquidado (pagado después con dinero + comprobante):
          --    se muestra como "credito_pagado" en la fila que conserva la referencia,
          --    y la nota de caja de efectivo se deduplica arriba (por t.referencia).
          CASE
            WHEN COALESCE(pp.payment_method, owl.payment_method, owl.tipo_pago) = 'credit'
                 AND COALESCE(pp.credit_settled, false) = true
              THEN 'credito_pagado'
            ELSE COALESCE(pp.payment_method, owl.payment_method, owl.tipo_pago, 'spei')
          END as metodo,
          owl.concepto,
          COALESCE(fe.alias, 'Empresa') as origen,
          owl.estatus_procesamiento as estatus,
          owl.service_type,
          owl.transaction_id as referencia,
          COALESCE(pp.credit_applied, 0) as credit_applied,
          COALESCE(pp.wallet_applied, 0) as wallet_applied
        FROM openpay_webhook_logs owl
        LEFT JOIN users u ON owl.user_id = u.id
        LEFT JOIN fiscal_emitters fe ON owl.empresa_id = fe.id
        LEFT JOIN pobox_payments pp ON (
          pp.payment_reference = owl.transaction_id
          OR pp.id::text = (owl.payload_json->>'payment_id')
        )
        WHERE owl.estatus_procesamiento = 'procesado'
          AND (
            (owl.fecha_pago >= $1 AND owl.fecha_pago <= $2)
            OR
            (COALESCE(pp.paid_at, owl.processed_at, owl.fecha_pago, owl.created_at) >= $1
             AND COALESCE(pp.paid_at, owl.processed_at, owl.fecha_pago, owl.created_at) <= $2)
          )
          ${serviceFilter ? "AND owl.service_type = ANY($3)" : ""}
        ORDER BY COALESCE(pp.paid_at, owl.processed_at, owl.fecha_pago, owl.created_at) DESC
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
    const speiMesTotal = speiMesPorEmpresaRes.rows.reduce((sum: number, r: any) => sum + parseFloat(r.spei_neto || 0), 0);
    const speiNetoMesTotal = speiMesPorEmpresaRes.rows.reduce((sum: number, r: any) => sum + parseFloat(r.spei_neto || 0), 0);
    const paypalMes = parseFloat(paypalMesRes.rows[0]?.paypal_bruto || 0);
    const paypalNetoMes = parseFloat(paypalMesRes.rows[0]?.paypal_neto || 0);
    // Comisiones del mes = bruto recibido − neto liquidado, sobre TODOS los pagos
    // procesados (no solo SPEI). Antes restaba spei_neto de sí mismo (siempre 0).
    const brutoMesTotal = speiMesPorEmpresaRes.rows.reduce((sum: number, r: any) => sum + parseFloat(r.total_bruto || 0), 0);
    const netoMesTotal = speiMesPorEmpresaRes.rows.reduce((sum: number, r: any) => sum + parseFloat(r.total_neto || 0), 0);
    const comisionesMes = brutoMesTotal - netoMesTotal;
    const creditoMes = parseFloat(credCardMesRes.rows[0]?.credito_mes || 0);
    const tarjetaMes = parseFloat(credCardMesRes.rows[0]?.tarjeta_mes || 0);
    const creditoHoy = parseFloat(credCardHoyRes.rows[0]?.credito_hoy || 0);
    const tarjetaHoy = parseFloat(credCardHoyRes.rows[0]?.tarjeta_hoy || 0);
    const totalMes = efectivoMes + speiMesTotal + paypalMes + creditoMes + tarjetaMes;

    // Saldo final por empresa:
    // - Si tiene saldo almacenado (estado de cuenta manual): usa el último saldo real.
    // - Si solo tiene transacciones Syncfy (saldo NULL): calcula neto abonos - cargos.
    const saldosPorEmpresaRes = await pool.query(`
      SELECT
        empresa_id,
        CASE
          WHEN SUM(CASE WHEN saldo IS NOT NULL AND CAST(saldo AS numeric) != 0 THEN 1 ELSE 0 END) > 0
          THEN (
            SELECT CAST(b2.saldo AS numeric)
            FROM bank_statement_entries b2
            WHERE b2.empresa_id = b1.empresa_id
              AND b2.saldo IS NOT NULL
              AND CAST(b2.saldo AS numeric) != 0
            ORDER BY b2.fecha DESC, b2.id DESC
            LIMIT 1
          )
          ELSE SUM(COALESCE(CAST(abono AS numeric), 0)) - SUM(COALESCE(CAST(cargo AS numeric), 0))
        END AS saldo,
        MAX(fecha) AS fecha
      FROM bank_statement_entries b1
      GROUP BY empresa_id
    `);

    // Saldo en caja chica (CC) y saldo general (caja CC + saldos bancarios).
    const saldoCajaCC = parseFloat(saldoCajaRes.rows[0].saldo_caja) || 0;
    const saldoBancos = saldosPorEmpresaRes.rows.reduce((sum: number, r: any) => sum + (parseFloat(r.saldo) || 0), 0);
    const saldoGeneral = saldoCajaCC + saldoBancos;

    res.json({
      success: true,
      fecha_consulta: new Date(),
      periodo: { desde: startDate, hasta: endDate },
      filtro_servicio: serviceFilter,
      
      // Empresas con OpenPay configurado
      empresas: empresasRes.rows,

      // Saldo bancario más reciente por empresa
      saldos_bancarios: saldosPorEmpresaRes.rows.reduce((acc: any, r: any) => {
        acc[r.empresa_id] = { saldo: parseFloat(r.saldo) || 0, fecha: r.fecha };
        return acc;
      }, {}),
      
      // KPIs principales CONSOLIDADOS
      kpis: {
        ingresos_hoy: efectivoHoy + speiHoyTotal + paypalHoy,
        ingresos_hoy_neto: efectivoHoy + speiNetoHoyTotal + paypalNetoHoy,
        ingresos_mes: efectivoMes + speiMesTotal + paypalMes + creditoMes + tarjetaMes,
        ingresos_mes_neto: efectivoMes + speiNetoMesTotal + paypalNetoMes + creditoMes + tarjetaMes,
        spei_hoy: speiHoyTotal,
        spei_hoy_neto: speiNetoHoyTotal,
        spei_mes: speiMesTotal,
        spei_mes_neto: speiNetoMesTotal,
        paypal_hoy: paypalHoy,
        paypal_mes: paypalMes,
        credito_hoy: creditoHoy,
        credito_mes: creditoMes,
        tarjeta_hoy: tarjetaHoy,
        tarjeta_mes: tarjetaMes,
        efectivo_hoy: efectivoHoy,
        efectivo_mes: efectivoMes,
        cartera_vencida: parseFloat(carteraRes.rows[0].cartera_total) || 0,
        guias_pendientes: parseInt(carteraRes.rows[0].guias_pendientes) || 0,
        saldo_caja: saldoCajaCC,
        saldo_caja_cc: saldoCajaCC,
        saldo_general: saldoGeneral,
        saldo_bancos: saldoBancos,
        comisiones_mes: comisionesMes
      },
      
      // DESGLOSE POR EMPRESA (nuevo)
      ingresos_por_empresa: speiMesPorEmpresaRes.rows.map((r: any) => ({
        empresa_id: r.empresa_id,
        empresa_nombre: r.empresa_nombre || 'Sin asignar',
        rfc: r.rfc || 'N/A',
        total_bruto: parseFloat(r.total_bruto) || 0,
        total_neto: parseFloat(r.total_neto) || 0,
        spei_neto: parseFloat(r.spei_neto) || 0,
        efectivo_neto: parseFloat(r.efectivo_neto) || 0,
        paypal_neto: parseFloat(r.paypal_neto) || 0,
        comisiones: (parseFloat(r.total_bruto) || 0) - (parseFloat(r.total_neto) || 0),
        transacciones: parseInt(r.total_transacciones) || 0
      })),
      
      // Distribución para gráfica de pastel
      distribucion_metodos: {
        efectivo: efectivoMes,
        spei: speiMesTotal,
        paypal: paypalMes,
        credito: creditoMes,
        tarjeta: tarjetaMes
      },
      porcentajes: {
        efectivo: totalMes > 0 ? ((efectivoMes / totalMes) * 100).toFixed(1) : '0',
        spei: totalMes > 0 ? ((speiMesTotal / totalMes) * 100).toFixed(1) : '0',
        paypal: totalMes > 0 ? ((paypalMes / totalMes) * 100).toFixed(1) : '0',
        credito: totalMes > 0 ? ((creditoMes / totalMes) * 100).toFixed(1) : '0',
        tarjeta: totalMes > 0 ? ((tarjetaMes / totalMes) * 100).toFixed(1) : '0'
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
        cliente_box_id: t.cliente_box_id || null,
        monto_bruto: parseFloat(t.monto_bruto) || 0,
        monto_neto: parseFloat(t.monto_neto) || 0,
        comision: parseFloat(t.comision) || 0,
        metodo: t.metodo,
        concepto: t.concepto,
        origen: t.origen,
        estatus: t.estatus,
        service_type: t.service_type,
        referencia: t.referencia,
        credit_applied: parseFloat(t.credit_applied) || 0,
        wallet_applied: parseFloat(t.wallet_applied) || 0
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
            p.service_type::text AS service_type,
            p.created_at,
            p.payment_status,
            p.monto_pagado,
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

        // ¿La guía está incluida en alguna REFERENCIA de pago (RO-/PP-)? Si es
        // así, mostramos esa referencia (con su monto/fecha/estado real) en vez
        // del paquete suelto — así no sale "N/A" ni "Invalid Date".
        const refByGuia = await pool.query(`
          SELECT p.id, p.payment_reference as referencia, p.user_id, p.amount as monto,
                 p.package_ids, p.status, p.expires_at, p.created_at,
                 u.full_name as cliente_nombre, u.email as cliente_email, u.phone as cliente_telefono
            FROM pobox_payments p
            LEFT JOIN users u ON p.user_id = u.id
           WHERE p.package_ids @> to_jsonb($1::int)
             AND COALESCE(p.status,'') NOT IN ('cancelled','expired')
           ORDER BY (p.status = 'pending_payment') DESC, p.created_at DESC
           LIMIT 1
        `, [pkg.id]);
        if (refByGuia.rows.length > 0) {
          const rp = refByGuia.rows[0];
          let rpIds: any[] = [];
          try { rpIds = typeof rp.package_ids === 'string' ? JSON.parse(rp.package_ids) : (rp.package_ids || []); } catch { /* ignore */ }
          let rpGuias: any[] = [];
          if (rpIds.length > 0) {
            const g = await pool.query(`SELECT id, tracking_internal, description, assigned_cost_mxn FROM packages WHERE id = ANY($1)`, [rpIds]);
            rpGuias = g.rows;
          }
          return res.json({
            success: true,
            source: 'pobox_payments_by_guia',
            matched_guia: pkg.tracking_internal,
            payment: { id: rp.id, referencia: rp.referencia, monto: parseFloat(rp.monto) || 0, status: rp.status, expires_at: rp.expires_at, created_at: rp.created_at },
            cliente: { id: rp.user_id, nombre: rp.cliente_nombre, email: rp.cliente_email, telefono: rp.cliente_telefono },
            guias: rpGuias,
            puede_confirmar: rp.status === 'pending_payment'
          });
        }

        // Si el paquete YA está pagado (pago registrado directo sobre el
        // paquete: payment_status='paid' o saldo 0), NO debe ofrecerse a cobro.
        const saldo = parseFloat(pkg.saldo_pendiente);
        const yaPagado = String(pkg.payment_status || '').toLowerCase() === 'paid'
          || (Number.isFinite(saldo) && saldo <= 0 && parseFloat(pkg.monto_pagado) > 0);
        const montoPendiente = yaPagado
          ? 0
          : (Number.isFinite(saldo) && saldo > 0
              ? saldo
              : (parseFloat(pkg.assigned_cost_mxn) || parseFloat(pkg.national_shipping_cost) || 0));
        const isPickup = pkg.carrier && pkg.carrier.toLowerCase().includes('pick up');

        return res.json({
          success: true,
          source: 'package_direct',
          isPickup: isPickup,
          service_type: pkg.service_type || null,
          ya_pagado: yaPagado,
          monto_pagado: parseFloat(pkg.monto_pagado) || 0,
          payment: {
            id: null,
            referencia: pkg.tracking_internal,
            monto: montoPendiente,
            status: yaPagado ? 'paid' : (pkg.status === 'ready_pickup' ? 'pending_payment' : pkg.status),
            created_at: pkg.created_at || null
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
          puede_confirmar: !yaPagado && (pkg.status === 'ready_pickup' || montoPendiente > 0)
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
        orden_cancelada: ['cancelled', 'expired'].includes(String(payment.status || '').toLowerCase()),
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

    // Cruzar con la orden real: si pobox_payments está cancelada/expirada, NO se
    // puede confirmar aunque el webhook log siga 'pending_payment'. Exponemos el
    // estado real para que el modal muestre "orden cancelada".
    const ordenRealRes = await pool.query(
      `SELECT status FROM pobox_payments WHERE payment_reference = $1 ORDER BY created_at DESC LIMIT 1`,
      [payment.referencia]
    );
    const ordenRealStatus = ordenRealRes.rows[0]?.status || null;
    const ordenCancelada = ['cancelled', 'expired'].includes(String(ordenRealStatus || '').toLowerCase());

    res.json({
      success: true,
      source: 'openpay_webhook_logs',
      orden_cancelada: ordenCancelada,
      payment: {
        id: payment.id,
        referencia: payment.referencia,
        monto: parseFloat(payment.monto) || 0,
        concepto: payment.concepto,
        // Preferir el estado real de la orden si está cancelada/expirada.
        status: ordenCancelada ? ordenRealStatus : payment.status,
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
      puede_confirmar: !ordenCancelada && payment.status === 'pending_payment'
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

    // 🛡️ Guard: si la orden de pago está cancelada/expirada NO se puede confirmar,
    // aunque quede colgado un webhook log 'pending_payment'. (Caso real: RO-4628ACA3
    // cancelada pero con log pendiente → el dashboard permitía confirmar el cobro.)
    const ordenEstadoRes = await pool.query(
      `SELECT status FROM pobox_payments WHERE payment_reference = $1 ORDER BY created_at DESC LIMIT 1`,
      [refStr]
    );
    const estadoOrden = String(ordenEstadoRes.rows[0]?.status || '').toLowerCase();
    if (estadoOrden === 'cancelled' || estadoOrden === 'expired') {
      return res.status(409).json({
        error: 'orden_cancelada',
        message: `La orden de pago ${refStr} está ${estadoOrden === 'expired' ? 'expirada' : 'cancelada'} y no puede confirmarse.`
      });
    }

    // Buscar el pago pendiente en openpay_webhook_logs
    const pendingPayment = await pool.query(`
      SELECT * FROM openpay_webhook_logs
      WHERE transaction_id = $1 AND estatus_procesamiento = 'pending_payment'
    `, [refStr]);

    // ============================================
    // SI NO ESTÁ EN OPENPAY, BUSCAR EN POBOX_PAYMENTS (Órdenes de Pago con comprobantes)
    // ============================================
    if (pendingPayment.rows.length === 0) {
      const poboxPaymentResult = await pool.query(`
        SELECT pp.*, u.full_name as cliente_nombre, u.box_id as cliente_box_id
        FROM pobox_payments pp
        LEFT JOIN users u ON pp.user_id = u.id
        WHERE pp.payment_reference = $1 
          AND pp.status IN ('vouchers_submitted', 'vouchers_partial', 'pending', 'pending_payment')
      `, [refStr]);

      if (poboxPaymentResult.rows.length > 0) {
        const poboxPay = poboxPaymentResult.rows[0];
        const montoPago = parseFloat(poboxPay.amount) || 0;
        let packageIds: number[] = [];
        try {
          const parsed = typeof poboxPay.package_ids === 'string' ? JSON.parse(poboxPay.package_ids) : poboxPay.package_ids;
          packageIds = Array.isArray(parsed) ? parsed : [];
        } catch (e) { packageIds = []; }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // 1. Marcar pobox_payment como pagado
          await client.query(`
            UPDATE pobox_payments SET
              status = 'paid',
              paid_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [poboxPay.id]);

          // 1b. 💳 Orden a CRÉDITO: al confirmar el comprobante, marcar el crédito
          //     como liquidado (pasa a Historial) y RESTAURAR el crédito del cliente.
          //     El crédito de PO Box/servicios vive en user_service_credits (por
          //     servicio), NO en users.used_credit. Restauramos el crédito del
          //     servicio de la orden; si no hay fila de servicio, caemos al global.
          if (String(poboxPay.payment_method || '').toLowerCase() === 'credit') {
            await client.query(
              `UPDATE pobox_payments SET credit_settled = TRUE, credit_settled_at = CURRENT_TIMESTAMP WHERE id = $1`,
              [poboxPay.id]
            );
            let svcKeyCredit: string | null = null;
            if (packageIds.length > 0) {
              const svcRes = await client.query(
                `SELECT service_type FROM packages WHERE id = ANY($1) AND service_type IS NOT NULL LIMIT 1`,
                [packageIds]
              );
              svcKeyCredit = normalizeServiceForCredit(svcRes.rows[0]?.service_type);
            }
            let restoredRows = 0;
            if (svcKeyCredit) {
              const r = await client.query(
                `UPDATE user_service_credits
                    SET used_credit = GREATEST(0, COALESCE(used_credit, 0) - $1),
                        is_blocked = CASE WHEN GREATEST(0, COALESCE(used_credit, 0) - $1) <= 0 THEN FALSE ELSE is_blocked END,
                        updated_at = NOW()
                  WHERE user_id = $2 AND service = $3`,
                [montoPago, poboxPay.user_id, svcKeyCredit]
              );
              restoredRows = r.rowCount || 0;
            }
            if (restoredRows === 0) {
              // Fallback: crédito global (users.used_credit)
              await client.query(
                `UPDATE users
                    SET used_credit = GREATEST(0, COALESCE(used_credit, 0) - $1),
                        is_credit_blocked = CASE WHEN GREATEST(0, COALESCE(used_credit, 0) - $1) <= 0 THEN FALSE ELSE is_credit_blocked END
                  WHERE id = $2`,
                [montoPago, poboxPay.user_id]
              );
            }
            // 💸 Liberar las comisiones retenidas de estas guías: el crédito ya se
            //    pagó, así que la comisión pasa de "en crédito" a cobrable.
            if (packageIds.length > 0) {
              await client.query(
                `UPDATE advisor_commissions
                    SET awaiting_client_payment = FALSE, client_paid_at = NOW(), updated_at = NOW()
                  WHERE shipment_type = 'PKG' AND shipment_id = ANY($1)
                    AND COALESCE(awaiting_client_payment, FALSE) = TRUE`,
                [packageIds]
              );
            }
          }

          // 2. Marcar paquetes como pagados
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

          // 2b. Si la orden vino de un advisor_payment_order, actualizar DHL / marítimo también
          try {
            const apoRes = await client.query(
              `SELECT package_uids FROM advisor_payment_orders WHERE pobox_payment_id=$1 LIMIT 1`,
              [poboxPay.id]
            );
            if (apoRes.rows.length > 0) {
              const rawUids = apoRes.rows[0].package_uids;
              const uids: string[] = Array.isArray(rawUids)
                ? rawUids
                : (typeof rawUids === 'string' ? JSON.parse(rawUids) : []);
              const dhlIds: number[] = [];
              const marIds: number[] = [];
              for (const uid of uids) {
                const parts = String(uid).split('-');
                const numId = parseInt(parts[1] ?? '');
                if (isNaN(numId)) continue;
                if (parts[0] === 'DHL') dhlIds.push(numId);
                else if (parts[0] === 'MAR') marIds.push(numId);
              }
              if (dhlIds.length > 0) {
                await client.query(
                  `UPDATE dhl_shipments SET paid_at=CURRENT_TIMESTAMP, cost_payment_status='paid', monto_pagado=COALESCE(total_cost_mxn, saldo_pendiente, 0), saldo_pendiente=0 WHERE id=ANY($1) AND paid_at IS NULL`,
                  [dhlIds]
                );
              }
              if (marIds.length > 0) {
                await client.query(
                  `UPDATE maritime_orders SET payment_status='paid', client_paid_at=CURRENT_TIMESTAMP WHERE id=ANY($1)`,
                  [marIds]
                );
              }
            }
          } catch { /* non-critical */ }

          // 3. Aprobar todos los vouchers pendientes de esta orden
          await client.query(`
            UPDATE payment_vouchers SET
              status = 'approved',
              reviewed_by = $2,
              reviewed_at = CURRENT_TIMESTAMP
            WHERE payment_order_id = $1 AND status IN ('pending_review', 'pending_confirm')
          `, [poboxPay.id, adminId]);

          // 4. Registrar en billetera y movimientos financieros
          const branchId = 6; // Mostrador Hidalgo TX para PO Box USA
          const billeteraResult = await client.query(`
            SELECT id, saldo_actual FROM billeteras_sucursal 
            WHERE sucursal_id = $1 AND is_default = true AND is_active = true
            LIMIT 1
          `, [branchId]);

          if (billeteraResult.rows.length > 0) {
            const billetera = billeteraResult.rows[0];
            const saldoAnterior = parseFloat(billetera.saldo_actual) || 0;
            const nuevoSaldo = saldoAnterior + montoPago;

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
              branchId, billetera.id, montoPago, saldoAnterior, nuevoSaldo,
              `Pago PO Box confirmado con comprobante - ${packageIds.length} paquete(s)`,
              refStr, adminId, adminName
            ]);

            // Registrar en caja_chica_transacciones para que aparezca en transacciones
            await client.query(`
              INSERT INTO caja_chica_transacciones (
                tipo, monto, concepto, cliente_id, admin_id, admin_name, 
                saldo_despues_movimiento, categoria, notas, currency, referencia, service_type
              ) VALUES (
                'ingreso', $1, $2, $3, $4, $5, $6, 'cobro_guias', $7, 'MXN', $8, 'POBOX_USA'
              )
            `, [
              montoPago,
              `Pago PO Box comprobante - ${packageIds.length} paquete(s) - ${poboxPay.cliente_nombre || 'Cliente'}`,
              poboxPay.user_id, adminId, adminName, nuevoSaldo,
              `Confirmado por ${adminName} - Voucher total: $${poboxPay.voucher_total || montoPago}`,
              refStr
            ]);
          }

          // 5. Si existe en openpay_webhook_logs como confirmed, actualizarlo a procesado
          await client.query(`
            UPDATE openpay_webhook_logs SET
              estatus_procesamiento = 'procesado',
              processed_at = CURRENT_TIMESTAMP
            WHERE transaction_id = $1 AND estatus_procesamiento IN ('confirmed', 'pending_payment')
          `, [refStr]);

          await client.query('COMMIT');

          // Generar comisiones
          if (packageIds.length > 0) {
            generateCommissionsForPackages(packageIds).catch(err =>
              console.error('Error generando comisiones (confirm pobox voucher):', err)
            );
            activateGexForPaidPackages(packageIds).catch(err =>
              console.error('Error activando GEX (confirm pobox voucher):', err)
            );
          }

          // 🧾 Transferencia con factura solicitada → generar CFDI.
          generateInvoiceForPoboxPaymentByRef(refStr).catch(err =>
            console.error('Error generando factura transferencia (confirm pobox voucher):', err)
          );
          // Marcar master como pagado si todas sus hijas quedaron pagadas.
          if (packageIds.length > 0) markMastersPaidIfChildrenPaid(packageIds).catch(() => {});

          console.log(`✅ Pago PO Box confirmado: ${refStr} - $${montoPago} por ${adminName || adminId}`);

          return res.json({
            success: true,
            message: `Pago PO Box confirmado - ${packageIds.length} paquete(s) pagados`,
            referencia: refStr,
            monto: montoPago,
            metodo: 'comprobante',
            paquetes_actualizados: packageIds.length,
            confirmado_por: adminName || adminId,
            voucher_total: parseFloat(poboxPay.voucher_total) || 0
          });

        } catch (err: any) {
          await client.query('ROLLBACK');
          console.error('❌ Error en confirm-payment (pobox flow):', err.message);
          throw err;
        } finally {
          client.release();
        }
      }
    }

    // ============================================
    // SI NO ESTÁ EN OPENPAY NI POBOX, BUSCAR PAQUETE DIRECTO (Pick Up)
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
        activateGexForPaidPackages([pkg.id]).catch(err =>
          console.error('Error activando GEX (confirm-payment pick up):', err)
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

      // 3b. Si vino de advisor_payment_order, actualizar DHL / marítimo también
      try {
        const apoRes = await client.query(
          `SELECT package_uids FROM advisor_payment_orders WHERE payment_reference=$1 LIMIT 1`,
          [refStr]
        );
        if (apoRes.rows.length > 0) {
          const rawUids = apoRes.rows[0].package_uids;
          const uids: string[] = Array.isArray(rawUids)
            ? rawUids
            : (typeof rawUids === 'string' ? JSON.parse(rawUids) : []);
          const dhlIds: number[] = [];
          const marIds: number[] = [];
          for (const uid of uids) {
            const parts = String(uid).split('-');
            const numId = parseInt(parts[1] ?? '');
            if (isNaN(numId)) continue;
            if (parts[0] === 'DHL') dhlIds.push(numId);
            else if (parts[0] === 'MAR') marIds.push(numId);
          }
          if (dhlIds.length > 0) {
            await client.query(
              `UPDATE dhl_shipments SET paid_at=CURRENT_TIMESTAMP, cost_payment_status='paid', monto_pagado=COALESCE(total_cost_mxn, saldo_pendiente, 0), saldo_pendiente=0 WHERE id=ANY($1) AND paid_at IS NULL`,
              [dhlIds]
            );
          }
          if (marIds.length > 0) {
            await client.query(
              `UPDATE maritime_orders SET payment_status='paid', client_paid_at=CURRENT_TIMESTAMP WHERE id=ANY($1)`,
              [marIds]
            );
          }
          // Also mark advisor_payment_order as pagado
          await client.query(
            `UPDATE advisor_payment_orders SET status='pagado', updated_at=NOW() WHERE payment_reference=$1 AND status != 'pagado'`,
            [refStr]
          ).catch(() => {});
        }
      } catch { /* non-critical */ }

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
        activateGexForPaidPackages(packageIds).catch(err =>
          console.error('Error activando GEX (confirm-payment webhook flow):', err)
        );
      }

      // 🧾 Si es una orden por TRANSFERENCIA con factura solicitada, generar CFDI.
      generateInvoiceForPoboxPaymentByRef(refStr).catch(err =>
        console.error('Error generando factura transferencia (confirm-payment):', err)
      );
      // Marcar master como pagado si todas sus hijas quedaron pagadas.
      if (packageIds.length > 0) markMastersPaidIfChildrenPaid(packageIds).catch(() => {});

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
          activateGexForPaidPackages(bulkPkgIds).catch(err =>
            console.error('Error activando GEX (confirm-payment-bulk):', err)
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
    // Exclude entries whose linked pobox_payments record is cancelled
    // Excluir referencias cuya orden ya esté cancelada O ya pagada/completada.
    // Los pagos PayPal/online se completan automáticamente (pobox_payments.status
    // = completed/paid) pero su log puede quedar 'pending_payment'; no deben
    // seguir apareciendo como pendientes de confirmar en sucursal.
    let whereClause1 = `WHERE owl.estatus_procesamiento = 'pending_payment'
      AND NOT EXISTS (
        SELECT 1 FROM pobox_payments _pp
        WHERE _pp.payment_reference = owl.transaction_id
          AND _pp.status IN ('cancelled', 'completed', 'paid')
      )`;
    const params1: any[] = [];
    let paramIndex1 = 1;

    if (branch_id) {
      whereClause1 += ` AND owl.branch_id = $${paramIndex1++}`;
      params1.push(branch_id);
    }

    // Lista de alias del servicio seleccionado (compartida por ambas fuentes).
    let serviceList: string[] | null = null;
    if (service_type) {
      const SERVICE_ALIASES: Record<string, string[]> = {
        china_air:  ['china_air', 'AIR_CHN_MX', 'aereo'],
        AIR_CHN_MX: ['china_air', 'AIR_CHN_MX', 'aereo'],
        china_sea:  ['china_sea', 'SEA_CHN_MX', 'maritime', 'fcl'],
        SEA_CHN_MX: ['china_sea', 'SEA_CHN_MX', 'maritime', 'fcl'],
        usa_pobox:  ['usa_pobox', 'POBOX_USA', 'usa', 'pobox', 'po_box'],
        POBOX_USA:  ['usa_pobox', 'POBOX_USA', 'usa', 'pobox', 'po_box'],
        mx_cedis:   ['mx_cedis', 'AA_DHL', 'dhl'],
        AA_DHL:     ['mx_cedis', 'AA_DHL', 'dhl'],
      };
      serviceList = SERVICE_ALIASES[service_type as string] || [service_type as string];
      whereClause1 += ` AND owl.service_type = ANY($${paramIndex1++})`;
      params1.push(serviceList);
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
        u.box_id as cliente_numero,
        u.email as cliente_email,
        u.phone as telefono,
        fe.alias as empresa,
        fe.bank_name as banco,
        fe.bank_clabe as clabe,
        b.name as sucursal_nombre,
        COALESCE(pp.credit_applied, 0) as credit_applied,
        COALESCE(pp.wallet_applied, 0) as wallet_applied,
        pp.id as pobox_payment_id,
        COALESCE(vc.cnt, 0) as voucher_count,
        'webhook' as source
      FROM openpay_webhook_logs owl
      LEFT JOIN users u ON owl.user_id = u.id
      LEFT JOIN fiscal_emitters fe ON owl.empresa_id = fe.id
      LEFT JOIN branches b ON owl.branch_id = b.id
      LEFT JOIN pobox_payments pp ON pp.payment_reference = owl.transaction_id
      LEFT JOIN (
        SELECT payment_order_id, COUNT(*) as cnt
        FROM payment_vouchers
        GROUP BY payment_order_id
      ) vc ON vc.payment_order_id = pp.id
      ${whereClause1}
      ORDER BY owl.fecha_pago DESC
    `, params1);

    // 2. Obtener pagos con comprobantes enviados (listos para conciliar)
    // Servicio real desde openpay_webhook_logs (la tabla pobox_payments no lo
    // guarda). Aplica el mismo filtro de servicio que la fuente #1, para no
    // mostrar órdenes de otro servicio (p.ej. PO Box en el filtro Aéreo China).
    let whereClause2 = "WHERE pp.status = 'vouchers_submitted' AND pp.payment_method IN ('cash', 'credit')";
    const params2: any[] = [];
    if (serviceList) {
      params2.push(serviceList);
      whereClause2 += ` AND COALESCE(owl2.service_type, 'POBOX_USA') = ANY($${params2.length})`;
    }

    const poboxResult = await pool.query(`
      SELECT
        pp.id,
        pp.payment_reference as referencia,
        pp.user_id,
        pp.amount as monto,
        pp.package_ids,
        pp.created_at,
        pp.voucher_total,
        pp.voucher_count,
        COALESCE(owl2.service_type, 'POBOX_USA') as tipo_servicio,
        pp.payment_method,
        COALESCE(pp.credit_applied, 0) as credit_applied,
        COALESCE(pp.wallet_applied, 0) as wallet_applied,
        u.full_name as cliente,
        u.box_id as cliente_numero,
        u.email as cliente_email,
        u.phone as telefono,
        'pobox' as source
      FROM pobox_payments pp
      LEFT JOIN users u ON pp.user_id = u.id
      LEFT JOIN openpay_webhook_logs owl2 ON owl2.transaction_id = pp.payment_reference
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
      credit_applied: parseFloat(r.credit_applied) || 0,
      wallet_applied: parseFloat(r.wallet_applied) || 0,
      cliente: r.cliente || 'Cliente desconocido',
      cliente_numero: r.cliente_numero,
      cliente_email: r.cliente_email,
      telefono: r.telefono,
      empresa: r.empresa,
      banco: r.banco,
      clabe: r.clabe,
      branch_id: r.branch_id,
      sucursal_nombre: r.sucursal_nombre,
      guias: r.concepto,
      pobox_payment_id: r.pobox_payment_id || null,
      voucher_count: parseInt(r.voucher_count) || 0,
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
        credit_applied: parseFloat(r.credit_applied) || 0,
        wallet_applied: parseFloat(r.wallet_applied) || 0,
        cliente: r.cliente || 'Cliente desconocido',
        cliente_numero: r.cliente_numero,
        cliente_email: r.cliente_email,
        telefono: r.telefono,
        empresa: null,
        banco: null,
        clabe: null,
        branch_id: null,
        sucursal_nombre: null,
        guias: r.package_ids,
        source: 'pobox',
        voucher_total: parseFloat(r.voucher_total) || 0,
        voucher_count: parseInt(r.voucher_count) || 0
      };
    });

    // Unir y deduplicar por referencia (pobox tiene prioridad sobre webhook)
    const poboxRefs = new Set(poboxPayments.map((p: any) => p.referencia));
    const dedupedWebhook = webhookPayments.filter((p: any) => !poboxRefs.has(p.referencia));
    const allPayments = [...dedupedWebhook, ...poboxPayments]
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

// ============================================
// MOVIMIENTOS DEL ESTADO DE CUENTA QUE CORRESPONDEN A UN PAGO
// Busca en bank_statement_entries los abonos cercanos a la fecha del pago,
// marcando los que coinciden por número de cliente (box_id), monto o referencia.
// ============================================
app.get('/api/admin/finance/payment-bank-matches/:referencia', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), async (req: Request, res: Response): Promise<any> => {
  try {
    const { referencia } = req.params;

    const payRes = await pool.query(`
      SELECT pp.amount, pp.created_at, u.box_id
      FROM pobox_payments pp
      LEFT JOIN users u ON pp.user_id = u.id
      WHERE pp.payment_reference = $1
      LIMIT 1
    `, [referencia]);

    if (payRes.rows.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const pay = payRes.rows[0];
    const boxId: string | null = pay.box_id ? String(pay.box_id).trim() : null;
    const monto = parseFloat(pay.amount) || 0;
    // Token de la referencia (RO-7419F736 -> 7419F736) para cruzar contra el concepto bancario.
    const refToken = String(referencia).replace(/^(RO|PP)-/i, '').replace(/[^A-Za-z0-9]/g, '');

    // Ventana de fechas: el SPEI puede liquidar el mismo día o 1-2 días después.
    const fecha = new Date(pay.created_at);

    // Regex que evita que "S88" haga match con "S889": el box_id no debe ir seguido de otro dígito.
    const boxRegex = boxId ? `${boxId}([^0-9]|$)` : null;

    const result = await pool.query(`
      SELECT b.id, b.fecha, b.concepto, b.referencia, b.cargo, b.abono, b.saldo, b.banco,
             fe.alias AS empresa,
             (
               ($1::text IS NOT NULL AND (b.referencia ~* $1 OR b.concepto ~* $1))
               OR (b.abono IS NOT NULL AND ABS(CAST(b.abono AS numeric) - $2::numeric) <= 1)
               OR (LENGTH($3) >= 5 AND (b.referencia ILIKE '%'||$3||'%' OR b.concepto ILIKE '%'||$3||'%'))
             ) AS match,
             ($1::text IS NOT NULL AND (b.referencia ~* $1 OR b.concepto ~* $1)) AS match_cliente,
             (b.abono IS NOT NULL AND ABS(CAST(b.abono AS numeric) - $2::numeric) <= 1) AS match_monto
      FROM bank_statement_entries b
      LEFT JOIN fiscal_emitters fe ON fe.id = b.empresa_id
      WHERE b.abono IS NOT NULL
        AND b.fecha BETWEEN ($4::date - INTERVAL '2 days') AND ($4::date + INTERVAL '3 days')
      ORDER BY (
               ($1::text IS NOT NULL AND (b.referencia ~* $1 OR b.concepto ~* $1))
               OR (b.abono IS NOT NULL AND ABS(CAST(b.abono AS numeric) - $2::numeric) <= 1)
               OR (LENGTH($3) >= 5 AND (b.referencia ILIKE '%'||$3||'%' OR b.concepto ILIKE '%'||$3||'%'))
             ) DESC,
             b.fecha DESC, b.id DESC
      LIMIT 60
    `, [boxRegex, monto, refToken, fecha]);

    const entries = result.rows.map((r: any) => {
      const iso = r.fecha ? new Date(r.fecha).toISOString().substring(0, 10) : null;
      const [yyyy, mm, dd] = (iso || '--').split('-');
      return {
        id: r.id,
        fecha: iso ? `${dd}-${mm}-${yyyy}` : '',
        concepto: r.concepto,
        referencia: r.referencia,
        abono: r.abono != null ? parseFloat(r.abono) : null,
        cargo: r.cargo != null ? parseFloat(r.cargo) : null,
        saldo: r.saldo != null ? parseFloat(r.saldo) : null,
        banco: r.banco,
        empresa: r.empresa,
        match: !!r.match,
        match_cliente: !!r.match_cliente,
        match_monto: !!r.match_monto,
      };
    });

    res.json({
      success: true,
      box_id: boxId,
      monto,
      entries,
      matches: entries.filter((e: any) => e.match).length,
    });
  } catch (error: any) {
    console.error('Error getting payment bank matches:', error);
    res.status(500).json({ error: 'Error obteniendo movimientos del pago', details: error.message });
  }
});

// ============================================
// CARTERA PENDIENTE / GUÍAS PENDIENTES — detalle para los KPIs del dashboard
// Mismo universo que el KPI de cartera vencida del dashboard:
// guías con saldo pendiente > 0. Devuelve resumen por cliente y lista de guías.
// ============================================
app.get('/api/admin/finance/cartera-pendiente', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), async (req: Request, res: Response): Promise<any> => {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        p.tracking_internal AS tracking_interno,
        p.description AS descripcion,
        p.service_type,
        p.payment_status,
        p.received_at,
        COALESCE(p.assigned_cost_mxn, 0) AS costo,
        COALESCE(p.saldo_pendiente, p.assigned_cost_mxn, 0) AS saldo,
        p.user_id,
        COALESCE(u.box_id, p.box_id) AS box_id,
        u.full_name AS cliente
      FROM packages p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE (p.payment_status IN ('pending', 'partial') OR p.payment_status IS NULL)
        AND p.assigned_cost_mxn > 0
        AND COALESCE(p.saldo_pendiente, p.assigned_cost_mxn) > 0
      ORDER BY saldo DESC
    `);

    const guias = result.rows.map((g: any) => ({
      id: g.id,
      tracking_interno: g.tracking_interno,
      descripcion: g.descripcion || 'Sin descripción',
      service_type: g.service_type,
      payment_status: g.payment_status || 'pending',
      received_at: g.received_at,
      costo: parseFloat(g.costo) || 0,
      saldo: parseFloat(g.saldo) || 0,
      user_id: g.user_id,
      box_id: g.box_id,
      cliente: g.cliente || 'Cliente',
    }));

    // Resumen por cliente
    const byClient = new Map<string, any>();
    for (const g of guias) {
      const key = g.user_id != null ? `u${g.user_id}` : `b${g.box_id || g.id}`;
      if (!byClient.has(key)) {
        byClient.set(key, { user_id: g.user_id, box_id: g.box_id, cliente: g.cliente, total_saldo: 0, guias_count: 0 });
      }
      const c = byClient.get(key);
      c.total_saldo += g.saldo;
      c.guias_count += 1;
    }
    const por_cliente = Array.from(byClient.values()).sort((a, b) => b.total_saldo - a.total_saldo);

    res.json({
      success: true,
      total_cartera: guias.reduce((s, g) => s + g.saldo, 0),
      total_guias: guias.length,
      por_cliente,
      guias,
    });
  } catch (error: any) {
    console.error('Error getting cartera pendiente:', error);
    res.status(500).json({ error: 'Error obteniendo cartera pendiente', details: error.message });
  }
});

// ============================================
// ÚLTIMO MOVIMIENTO GUARDADO — para verificar continuidad antes de nuevo upload
app.get('/api/admin/finance/bank-entries/last', authenticateToken, requireMinLevel(ROLES.DIRECTOR), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { empresa_id } = req.query;
    if (!empresa_id) return res.status(400).json({ error: 'Falta empresa_id' });
    const result = await pool.query(`
      SELECT fecha, concepto, referencia, cargo, abono, saldo
      FROM bank_statement_entries b1
      WHERE empresa_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM bank_statement_entries b2
          WHERE b2.empresa_id = b1.empresa_id
            AND b2.fecha = b1.fecha
            AND b2.id != b1.id
            AND ROUND(
              CAST(b2.saldo AS numeric)
              - COALESCE(CAST(b2.abono AS numeric), 0)
              + COALESCE(CAST(b2.cargo AS numeric), 0),
            2) = ROUND(CAST(b1.saldo AS numeric), 2)
        )
      ORDER BY fecha DESC
      LIMIT 1
    `, [empresa_id]);
    const entry = result.rows[0] || null;
    if (entry?.fecha) {
      const isoDate = entry.fecha.substring(0, 10);
      const [yyyy, mm, dd] = isoDate.split('-');
      entry.fecha = `${dd}-${mm}-${yyyy}`;
    }
    res.json({ success: true, entry });
  } catch (error: any) {
    res.status(500).json({ error: 'Error obteniendo último movimiento', details: error.message });
  }
});

// ============================================
// OBTENER MOVIMIENTOS GUARDADOS DE ESTADO DE CUENTA
// ============================================
app.get('/api/admin/finance/bank-entries', authenticateToken, requireMinLevel(ROLES.DIRECTOR), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { empresa_id } = req.query;
    if (!empresa_id) return res.status(400).json({ error: 'Falta empresa_id' });

    const result = await pool.query(`
      SELECT id, fecha, concepto, referencia, cargo, abono, saldo, banco, uploaded_at, seq
      FROM bank_statement_entries
      WHERE empresa_id = $1
      ORDER BY fecha DESC, seq DESC, id DESC
    `, [empresa_id]);

    res.json({ success: true, entries: result.rows, count: result.rows.length });
  } catch (error: any) {
    console.error('Error fetching bank entries:', error);
    res.status(500).json({ error: 'Error obteniendo movimientos', details: error.message });
  }
});

// ============================================
// BORRAR TODOS LOS MOVIMIENTOS DE ESTADO DE CUENTA POR EMPRESA
// Solo super_admin puede ejecutar esta acción
// ============================================
app.delete('/api/admin/finance/bank-entries', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { empresa_id } = req.query;
    if (!empresa_id) return res.status(400).json({ error: 'Falta empresa_id' });

    const result = await pool.query(
      'DELETE FROM bank_statement_entries WHERE empresa_id = $1 RETURNING id',
      [empresa_id]
    );

    res.json({ success: true, deleted: result.rowCount });
  } catch (error: any) {
    console.error('Error deleting bank entries:', error);
    res.status(500).json({ error: 'Error borrando movimientos', details: error.message });
  }
});

// ============================================
// MATCH REFERENCIAS DE ESTADO DE CUENTA BANCARIO
// Busca referencias de pago en la BD
// ============================================
// ============================================
// GUARDAR MOVIMIENTOS DE ESTADO DE CUENTA BANCARIO
// Persiste las líneas parseadas, deduplica por hash, devuelve solo las nuevas
// ============================================
app.post('/api/admin/finance/save-bank-entries', authenticateToken, requireMinLevel(ROLES.DIRECTOR), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const adminId = (req.user as any)?.userId || (req.user as any)?.id;
    const { entries, empresa_id, service_type, banco } = req.body;
    // entries = [{ fecha, concepto, referencia, cargo, abono, saldo }]

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'No hay movimientos para guardar' });
    }
    if (!empresa_id) {
      return res.status(400).json({ error: 'Falta empresa_id' });
    }

    const crypto = require('crypto');
    const newEntries: any[] = [];
    const duplicateCount = { count: 0 };

    for (const [idx, entry] of entries.entries()) {
      const hashInput = `${entry.fecha}|${entry.concepto}|${entry.referencia || ''}|${entry.cargo || ''}|${entry.abono || ''}|${entry.saldo || ''}`;
      const entryHash = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 64);

      try {
        const result = await pool.query(`
          INSERT INTO bank_statement_entries (empresa_id, service_type, banco, fecha, concepto, referencia, cargo, abono, saldo, entry_hash, uploaded_by, source, seq)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'manual', $12)
          ON CONFLICT (empresa_id, entry_hash) DO UPDATE SET seq = EXCLUDED.seq
          RETURNING *
        `, [
          empresa_id,
          service_type || null,
          banco || 'bbva',
          entry.fecha ? parseDateDDMMYYYY(entry.fecha) : new Date(),
          entry.concepto || '',
          entry.referencia || '',
          entry.cargo || null,
          entry.abono || null,
          entry.saldo || null,
          entryHash,
          adminId,
          idx,
        ]);

        if (result.rows.length > 0) {
          newEntries.push({ ...entry, db_id: result.rows[0].id });
        } else {
          duplicateCount.count++;
        }
      } catch (insertErr: any) {
        // Unique constraint violation = duplicate, skip
        if (insertErr.code === '23505') {
          duplicateCount.count++;
        } else {
          console.error('Error inserting bank entry:', insertErr.message);
        }
      }
    }

    console.log(`🏦 Estado de cuenta guardado: ${newEntries.length} nuevas, ${duplicateCount.count} duplicadas (empresa ${empresa_id}, ${banco})`);

    res.json({
      success: true,
      new_entries: newEntries,
      new_count: newEntries.length,
      duplicate_count: duplicateCount.count,
      total_received: entries.length,
    });
  } catch (error: any) {
    console.error('Error saving bank entries:', error);
    res.status(500).json({ error: 'Error guardando movimientos', details: error.message });
  }
});

// Helper: parse DD-MM-YYYY to Date string for PostgreSQL (avoids timezone issues)
function parseDateDDMMYYYY(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm}-${dd}`;
  }
  return dateStr;
}

app.post('/api/admin/finance/match-references', authenticateToken, requireMinLevel(ROLES.DIRECTOR), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { references, empresa_id } = req.body;
    // references = [{ ref: 'EP-0108FC08', entries: [{ fecha, concepto, referencia, cargo, abono, saldo }] }]
    if (!references || !Array.isArray(references) || references.length === 0) {
      return res.json({ success: true, matches: [], wrongAccount: [] });
    }

    const refCodes = references.map((r: any) => r.ref);

    // Buscar en pobox_payments
    const poboxRes = await pool.query(`
      SELECT pp.id, pp.payment_reference, pp.amount, pp.status, pp.user_id, pp.created_at,
             pp.voucher_total, pp.voucher_count, pp.package_ids,
             u.full_name as cliente, u.box_id, u.email,
             scc.service_type, scc.emitter_id as empresa_id
      FROM pobox_payments pp
      LEFT JOIN users u ON pp.user_id = u.id
      LEFT JOIN service_company_config scc ON scc.service_type = 'POBOX_USA'
      WHERE pp.payment_reference = ANY($1)
    `, [refCodes]);

    // Buscar en openpay_webhook_logs
    const webhookRes = await pool.query(`
      SELECT owl.id, owl.transaction_id as payment_reference, owl.monto_recibido as amount,
             owl.estatus_procesamiento as status, owl.user_id, owl.fecha_pago as created_at,
             owl.service_type, owl.empresa_id,
             u.full_name as cliente, u.box_id, u.email
      FROM openpay_webhook_logs owl
      LEFT JOIN users u ON owl.user_id = u.id
      WHERE owl.transaction_id = ANY($1)
    `, [refCodes]);

    // Mapear por referencia
    const dbMatches: Record<string, any> = {};
    for (const row of [...poboxRes.rows, ...webhookRes.rows]) {
      const ref = row.payment_reference;
      if (!dbMatches[ref]) {
        dbMatches[ref] = {
          ref,
          cliente: row.cliente || 'Desconocido',
          box_id: row.box_id,
          email: row.email,
          amount: parseFloat(row.amount) || 0,
          status: row.status,
          service_type: row.service_type,
          user_id: row.user_id,
          empresa_id: row.empresa_id || null,
          created_at: row.created_at,
          voucher_total: parseFloat(row.voucher_total) || 0,
          voucher_count: parseInt(row.voucher_count) || 0,
        };
      }
    }

    // Determinar cuáles pertenecen a otra cuenta
    const matches: any[] = [];
    const wrongAccount: any[] = [];

    for (const refGroup of references) {
      const dbMatch = dbMatches[refGroup.ref];
      if (!dbMatch) continue;

      const totalAbonos = refGroup.entries
        .filter((e: any) => e.abono)
        .reduce((s: number, e: any) => s + e.abono, 0);

      const result = {
        ...dbMatch,
        bank_entries: refGroup.entries,
        total_bank_abonos: totalAbonos,
        payment_count: refGroup.entries.filter((e: any) => e.abono).length,
      };

      // Si la empresa_id del match no coincide con la empresa del estado de cuenta
      if (empresa_id && dbMatch.empresa_id && dbMatch.empresa_id !== empresa_id) {
        wrongAccount.push(result);
      } else {
        matches.push(result);
      }
    }

    // Referencias no encontradas en BD
    const unmatched = references
      .filter((r: any) => !dbMatches[r.ref])
      .map((r: any) => ({
        ref: r.ref,
        bank_entries: r.entries,
        total_bank_abonos: r.entries.filter((e: any) => e.abono).reduce((s: number, e: any) => s + e.abono, 0),
      }));

    res.json({
      success: true,
      matches,
      wrongAccount,
      unmatched,
      summary: {
        total_references: references.length,
        matched: matches.length,
        wrong_account: wrongAccount.length,
        unmatched: unmatched.length,
      }
    });

  } catch (error: any) {
    console.error('Error matching references:', error);
    res.status(500).json({ error: 'Error buscando referencias', details: error.message });
  }
});

// ============================================
// EXTRAER POR MONTO — conciliación de estado de cuenta bancario por MONTO EXACTO
// (no por referencia). Igual que /match-references pero busca órdenes pendientes
// cuyo monto coincide EXACTAMENTE con el abono bancario.
//
// ⚠️ El matching por monto es AMBIGUO por naturaleza: dos órdenes distintas pueden
// tener el mismo monto. Por eso clasificamos en:
//   - matches (verde):   exactamente 1 orden pendiente con ese monto + 1 abono
//                        bancario con ese monto + NINGUNA orden ya conciliada con
//                        el mismo monto. Solo estas se pueden autorizar en lote.
//   - ambiguous (rojo):  hay >1 orden pendiente con ese monto, o >1 abono con ese
//                        monto, o YA EXISTE una orden conciliada con el mismo monto
//                        (riesgo de duplicado). Requiere revisión manual.
//   - unmatched (gris):  ningún orden tiene ese monto.
// ============================================
app.post('/api/admin/finance/match-by-amount', authenticateToken, requireMinLevel(ROLES.DIRECTOR), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { entries, service_type } = req.body;
    // entries = [{ fecha, concepto, referencia, cargo, abono, saldo, seq }]
    const round2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;

    const abonoLines = (Array.isArray(entries) ? entries : [])
      .filter((e: any) => Number(e.abono) > 0)
      .map((e: any) => ({ ...e, abono: round2(e.abono) }));

    if (abonoLines.length === 0) {
      return res.json({
        success: true, matches: [], ambiguous: [], unmatched: [],
        summary: { total_amounts: 0, matched: 0, ambiguous: 0, unmatched: 0 },
      });
    }

    // Acotar candidatos por servicio de la empresa seleccionada (mismo mapeo que
    // /pending-payments) para no cruzar montos entre servicios distintos.
    const SERVICE_ALIASES: Record<string, string[]> = {
      china_air:  ['china_air', 'AIR_CHN_MX', 'aereo'],
      AIR_CHN_MX: ['china_air', 'AIR_CHN_MX', 'aereo'],
      china_sea:  ['china_sea', 'SEA_CHN_MX', 'maritime', 'fcl'],
      SEA_CHN_MX: ['china_sea', 'SEA_CHN_MX', 'maritime', 'fcl'],
      usa_pobox:  ['usa_pobox', 'POBOX_USA', 'usa', 'pobox', 'po_box'],
      POBOX_USA:  ['usa_pobox', 'POBOX_USA', 'usa', 'pobox', 'po_box'],
      mx_cedis:   ['mx_cedis', 'AA_DHL', 'dhl'],
      AA_DHL:     ['mx_cedis', 'AA_DHL', 'dhl'],
    };
    const serviceList: string[] | null = service_type
      ? (SERVICE_ALIASES[service_type as string] || [service_type as string])
      : null;

    // Estados conciliables (pendientes) y ya conciliados (riesgo de duplicado).
    const CONCILIABLE = ['pending', 'pending_payment', 'pending_review', 'vouchers_submitted', 'vouchers_partial'];
    const CONCILIADO = ['paid', 'completed'];

    const params: any[] = [[...CONCILIABLE, ...CONCILIADO]];
    let serviceFilter = '';
    if (serviceList) {
      params.push(serviceList);
      serviceFilter = `AND COALESCE(owl.service_type, 'POBOX_USA') = ANY($${params.length})`;
    }

    const ordersRes = await pool.query(`
      SELECT pp.id, pp.payment_reference AS ref, pp.amount, pp.status, pp.user_id, pp.created_at,
             pp.package_ids,
             u.full_name AS cliente, u.box_id, u.email,
             COALESCE(owl.service_type, 'POBOX_USA') AS service_type
      FROM pobox_payments pp
      LEFT JOIN users u ON pp.user_id = u.id
      LEFT JOIN openpay_webhook_logs owl ON owl.transaction_id = pp.payment_reference
      WHERE pp.amount IS NOT NULL
        AND pp.status = ANY($1)
        AND pp.created_at >= NOW() - INTERVAL '120 days'
        ${serviceFilter}
    `, params);

    const CONCILIADO_SET = new Set(CONCILIADO);
    const CONCILIABLE_SET = new Set(CONCILIABLE);

    // Indexar órdenes por monto redondeado a 2 decimales.
    const byAmount = new Map<number, any[]>();
    for (const o of ordersRes.rows) {
      const a = round2(o.amount);
      if (!byAmount.has(a)) byAmount.set(a, []);
      byAmount.get(a)!.push({
        id: o.id,
        ref: o.ref,
        cliente: o.cliente || 'Desconocido',
        box_id: o.box_id,
        email: o.email,
        amount: a,
        status: o.status,
        user_id: o.user_id,
        service_type: o.service_type,
        created_at: o.created_at,
        package_ids: o.package_ids,
        conciliado: CONCILIADO_SET.has(o.status),
      });
    }

    // Agrupar abonos bancarios por monto.
    const bankByAmount = new Map<number, any[]>();
    for (const e of abonoLines) {
      const a = round2(e.abono);
      if (!bankByAmount.has(a)) bankByAmount.set(a, []);
      bankByAmount.get(a)!.push(e);
    }

    const matches: any[] = [];
    const ambiguous: any[] = [];
    const unmatched: any[] = [];

    for (const [amount, bankEntries] of bankByAmount.entries()) {
      const candidates = byAmount.get(amount) || [];
      const pendientes = candidates.filter((c) => CONCILIABLE_SET.has(c.status));
      const conciliados = candidates.filter((c) => c.conciliado);
      const totalAbonos = round2(bankEntries.reduce((s: number, e: any) => s + e.abono, 0));

      if (candidates.length === 0) {
        unmatched.push({ amount, bank_entries: bankEntries, bank_count: bankEntries.length, total_bank_abonos: totalAbonos });
        continue;
      }

      // 🔴 Marca en rojo: monto duplicado / ambiguo / ya conciliado.
      const duplicateAmount = pendientes.length > 1 || bankEntries.length > 1 || conciliados.length > 0;

      const base = {
        amount,
        bank_entries: bankEntries,
        bank_count: bankEntries.length,
        total_bank_abonos: totalAbonos,
        candidates,
        candidate_count: candidates.length,
        pendiente_count: pendientes.length,
        conciliado_count: conciliados.length,
        duplicateAmount,
      };

      if (!duplicateAmount && pendientes.length === 1) {
        // ✅ Match seguro: una sola orden pendiente, un solo abono, sin conciliación previa.
        const c = pendientes[0];
        matches.push({ ...base, ...c, safe: true });
      } else {
        ambiguous.push({ ...base, safe: false });
      }
    }

    res.json({
      success: true,
      matches,
      ambiguous,
      unmatched,
      summary: {
        total_amounts: bankByAmount.size,
        matched: matches.length,
        ambiguous: ambiguous.length,
        unmatched: unmatched.length,
      },
    });
  } catch (error: any) {
    console.error('Error matching by amount:', error);
    res.status(500).json({ error: 'Error conciliando por monto', details: error.message });
  }
});

// ============================================
// AUTORIZAR PAGOS DESDE ESTADO DE CUENTA BANCARIO
// Marca órdenes como pagadas y acredita excedente como saldo a favor
// ============================================
app.post('/api/admin/finance/authorize-bank-payments', authenticateToken, requireMinLevel(ROLES.DIRECTOR), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const adminId = (req.user as any)?.userId || (req.user as any)?.id;
    const adminName = (req.user as any)?.full_name || req.user?.email || 'Admin';
    const { matches } = req.body;
    // matches = [{ ref, amount, total_bank_abonos, user_id, status, ... }]

    if (!matches || !Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({ error: 'No hay pagos para autorizar' });
    }

    const results: any[] = [];
    const errors: any[] = [];

    for (const m of matches) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Buscar la orden de pago
        const orderRes = await client.query(
          `SELECT pp.*, u.full_name as cliente_nombre FROM pobox_payments pp LEFT JOIN users u ON pp.user_id = u.id WHERE pp.payment_reference = $1`,
          [m.ref]
        );

        if (orderRes.rows.length === 0) {
          errors.push({ ref: m.ref, error: 'Orden no encontrada' });
          await client.query('ROLLBACK');
          client.release();
          continue;
        }

        const order = orderRes.rows[0];

        // Skip already paid
        if (order.status === 'paid') {
          results.push({ ref: m.ref, status: 'already_paid', message: 'Ya estaba pagado' });
          await client.query('ROLLBACK');
          client.release();
          continue;
        }

        const orderAmount = parseFloat(order.amount) || 0;
        const bankTotal = m.total_bank_abonos || 0;
        const surplus = Math.max(0, bankTotal - orderAmount);

        // 1. Mark order as paid with surplus info
        await client.query(`
          UPDATE pobox_payments SET
            status = 'paid',
            paid_at = CURRENT_TIMESTAMP,
            surplus_amount = $2,
            confirmation_notes = $3
          WHERE id = $1
        `, [order.id, surplus, `Autorizado desde estado de cuenta bancario por ${adminName}. Banco: $${bankTotal.toFixed(2)}, Orden: $${orderAmount.toFixed(2)}`]);

        // 2. Mark packages as paid
        let packageIds: number[] = [];
        try {
          const parsed = typeof order.package_ids === 'string' ? JSON.parse(order.package_ids) : order.package_ids;
          packageIds = Array.isArray(parsed) ? parsed : [];
        } catch (e) { packageIds = []; }

        if (packageIds.length > 0) {
          await client.query(`
            UPDATE packages SET client_paid = TRUE, client_paid_at = CURRENT_TIMESTAMP, saldo_pendiente = 0, payment_status = 'paid'
            WHERE id = ANY($1)
          `, [packageIds]);
        }

        // 3. Approve pending vouchers
        await client.query(`
          UPDATE payment_vouchers SET status = 'approved', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
          WHERE payment_order_id = $1 AND status IN ('pending_review', 'pending_confirm')
        `, [order.id, adminId]);

        // 4. Financial records
        const branchId = 6;
        const billeteraResult = await client.query(
          `SELECT id, saldo_actual FROM billeteras_sucursal WHERE sucursal_id = $1 AND is_default = true AND is_active = true LIMIT 1`,
          [branchId]
        );

        if (billeteraResult.rows.length > 0) {
          const billetera = billeteraResult.rows[0];
          const saldoAnterior = parseFloat(billetera.saldo_actual) || 0;
          const nuevoSaldo = saldoAnterior + orderAmount;

          await client.query(`UPDATE billeteras_sucursal SET saldo_actual = $1 WHERE id = $2`, [nuevoSaldo, billetera.id]);

          await client.query(`
            INSERT INTO movimientos_financieros (
              sucursal_id, billetera_id, tipo_movimiento, monto, monto_antes, monto_despues,
              nota_descriptiva, referencia, usuario_id, usuario_nombre, status, created_at
            ) VALUES ($1, $2, 'ingreso', $3, $4, $5, $6, $7, $8, $9, 'confirmado', CURRENT_TIMESTAMP)
          `, [branchId, billetera.id, orderAmount, saldoAnterior, nuevoSaldo,
              `Autorizado por estado de cuenta bancario - ${packageIds.length} paquete(s)`,
              m.ref, adminId, adminName]);

          await client.query(`
            INSERT INTO caja_chica_transacciones (
              tipo, monto, concepto, cliente_id, admin_id, admin_name,
              saldo_despues_movimiento, categoria, notas, currency, service_type
            ) VALUES ('ingreso', $1, $2, $3, $4, $5, $6, 'cobro_guias', $7, 'MXN', 'POBOX_USA')
          `, [orderAmount,
              `Pago autorizado edo. cuenta - ${packageIds.length} paquete(s) - ${order.cliente_nombre || 'Cliente'} - Ref: ${m.ref}`,
              order.user_id, adminId, adminName, nuevoSaldo,
              `Autorizado por ${adminName} desde estado de cuenta bancario`]);
        }

        // 5. Credit surplus to wallet if any
        if (surplus > 0) {
          const serviceType = 'POBOX_USA';
          const walletRes = await client.query(`
            INSERT INTO billetera_servicio (user_id, service_type, saldo, currency)
            VALUES ($1, $2, $3, 'MXN')
            ON CONFLICT (user_id, service_type) DO UPDATE SET saldo = billetera_servicio.saldo + $3, updated_at = NOW()
            RETURNING *
          `, [order.user_id, serviceType, surplus]);

          await client.query(`
            INSERT INTO billetera_servicio_transacciones
            (billetera_servicio_id, user_id, service_type, tipo, monto, currency, concepto, payment_order_id, created_by)
            VALUES ($1, $2, $3, 'excedente', $4, 'MXN', $5, $6, $7)
          `, [walletRes.rows[0].id, order.user_id, serviceType, surplus,
              `Excedente autorizado de orden ${m.ref} (banco: $${bankTotal.toFixed(2)}, orden: $${orderAmount.toFixed(2)})`,
              order.id, adminId]);

          await client.query(`UPDATE pobox_payments SET surplus_credited = TRUE WHERE id = $1`, [order.id]);
        }

        // 6. Update openpay_webhook_logs if exists
        await client.query(`
          UPDATE openpay_webhook_logs SET estatus_procesamiento = 'procesado', processed_at = CURRENT_TIMESTAMP
          WHERE transaction_id = $1 AND estatus_procesamiento IN ('confirmed', 'pending_payment')
        `, [m.ref]);

        await client.query('COMMIT');

        // Generate commissions
        if (packageIds.length > 0) {
          generateCommissionsForPackages(packageIds).catch(err =>
            console.error('Error generando comisiones (authorize bank):', err)
          );
          activateGexForPaidPackages(packageIds).catch(err =>
            console.error('Error activando GEX (authorize bank):', err)
          );
        }

        results.push({
          ref: m.ref,
          status: 'authorized',
          amount: orderAmount,
          bank_total: bankTotal,
          surplus,
          surplus_credited: surplus > 0,
          packages_count: packageIds.length,
        });

        console.log(`✅ Pago autorizado desde edo. cuenta: ${m.ref} - Orden: $${orderAmount} / Banco: $${bankTotal} / Excedente: $${surplus} por ${adminName}`);
        client.release();
      } catch (err: any) {
        await client.query('ROLLBACK');
        client.release();
        errors.push({ ref: m.ref, error: err.message });
        console.error(`❌ Error autorizando ${m.ref}:`, err);
      }
    }

    res.json({
      success: true,
      results,
      errors,
      summary: {
        authorized: results.filter(r => r.status === 'authorized').length,
        already_paid: results.filter(r => r.status === 'already_paid').length,
        errors: errors.length,
      }
    });
  } catch (error: any) {
    console.error('Error authorizing bank payments:', error);
    res.status(500).json({ error: 'Error autorizando pagos', details: error.message });
  }
});

// Exportar datos a CSV para contabilidad
app.get('/api/admin/finance/export', authenticateToken, requireMinLevel(ROLES.DIRECTOR), async (req: Request, res: Response): Promise<any> => {
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
          CASE
            WHEN owl.payment_method = 'transferencia' THEN 'Transferencia'
            WHEN owl.payment_method = 'cash' THEN 'Efectivo'
            WHEN owl.payment_method = 'paypal' OR owl.tipo_pago = 'paypal' THEN 'PayPal'
            ELSE 'Transferencia SPEI'
          END as metodo_pago,
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
app.post('/api/admin/maritime/drafts/:id/restore', authenticateToken, requireMinLevel(ROLES.ADMIN), restoreDraft);
app.post('/api/admin/maritime/drafts/:id/reopen', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), reopenDraft);
app.patch('/api/admin/maritime/drafts/:id/fields', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), updateDraftFields);
app.put('/api/admin/maritime/drafts/:id/match-client', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), matchClientToDraft);

// Whitelist de correos (Lectura: Gerente+, Escritura: Admin+)
app.get('/api/admin/email/whitelist', authenticateToken, requireMinLevel(ROLES.BRANCH_MANAGER), getWhitelist);
app.post('/api/admin/email/whitelist', authenticateToken, requireMinLevel(ROLES.ADMIN), addToWhitelist);
app.delete('/api/admin/email/whitelist/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), removeFromWhitelist);
app.get('/api/admin/email/stats', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getEmailStats);

// Verificación: drafts aprobados sin contenedor correspondiente (solo lectura)
app.get('/api/admin/maritime/drafts/verify', authenticateToken, requireMinLevel(ROLES.ADMIN), async (_req: AuthRequest, res: Response) => {
  try {
    // Drafts FCL/LCL aprobados: cruzar contra containers por container_number o bl_number
    const result = await pool.query(`
      SELECT
        d.id                                             AS draft_id,
        d.document_type,
        d.container_number                               AS draft_container,
        d.bl_number                                      AS draft_bl,
        (d.extracted_data->>'reference_code')            AS draft_reference,
        d.reviewed_at,
        c.id                                             AS container_id,
        c.container_number                               AS container_number,
        c.reference_code                                 AS container_reference,
        c.status                                         AS container_status
      FROM maritime_reception_drafts d
      LEFT JOIN containers c
        ON  (c.container_number = d.container_number AND d.container_number IS NOT NULL AND d.container_number != '')
        OR  (c.bl_number        = d.bl_number        AND d.bl_number        IS NOT NULL AND d.bl_number        != '')
      WHERE d.status = 'approved'
        AND d.document_type IN ('FCL','LCL')
      ORDER BY d.reviewed_at DESC
      LIMIT 500
    `);

    const matched   = result.rows.filter((r: any) => r.container_id   != null);
    const unmatched = result.rows.filter((r: any) => r.container_id   == null);

    // Anticipo: cuáles referencias tienen bolsa
    const refs = matched
      .map((r: any) => r.container_reference || r.draft_reference)
      .filter(Boolean);

    let anticipoMap: Record<string, boolean> = {};
    if (refs.length > 0) {
      const aRes = await pool.query(
        `SELECT DISTINCT referencia FROM anticipo_referencias WHERE referencia = ANY($1)`,
        [refs]
      );
      aRes.rows.forEach((r: any) => { anticipoMap[r.referencia] = true; });
    }

    res.json({
      total_approved_drafts : result.rows.length,
      matched_with_container: matched.length,
      unmatched_no_container: unmatched.length,
      unmatched: unmatched.map((r: any) => ({
        draft_id       : r.draft_id,
        document_type  : r.document_type,
        container      : r.draft_container,
        bl             : r.draft_bl,
        reference      : r.draft_reference,
        reviewed_at    : r.reviewed_at,
      })),
      matched_without_anticipo: matched
        .filter((r: any) => {
          const ref = r.container_reference || r.draft_reference;
          return ref && !anticipoMap[ref];
        })
        .map((r: any) => ({
          draft_id           : r.draft_id,
          container_id       : r.container_id,
          container_number   : r.container_number,
          reference          : r.container_reference || r.draft_reference,
          container_status   : r.container_status,
        })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Servir PDFs de drafts (endpoint que sirve el archivo directamente)
app.get('/api/admin/email/draft/:id/pdf/:type', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), serveDraftPdf);
// Servir Excel SUMMARY de drafts LCL
app.get('/api/admin/email/draft/:id/excel', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), serveDraftExcel);
// Re-extraer datos de un draft usando IA
app.post('/api/admin/email/draft/:id/reextract', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), reExtractDraftData);

// ========== VIZION TRACKING - DEPRECATED ==========
// Se cancela el API de Vizion. MJCustomer (pageByClearance) lo reemplaza.
// Las rutas se mantienen comentadas para rollback rapido si se requiere.
// app.post('/api/admin/vizion/subscribe', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), subscribeToVizion);
// app.get('/api/admin/containers/:id/tracking', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getContainerTrackingHistory);
// app.post('/api/admin/containers/:id/tracking/manual', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), addManualTrackingEvent);
// app.post('/api/admin/containers/:id/tracking/sync-carrier', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), syncCarrierTracking);

// ========== MJCUSTOMER FCL SYNC ==========
// Sincronizacion manual on-demand (super_admin)
app.post('/api/admin/fcl/sync-mjcustomer', authenticateToken, requireRole('super_admin'), triggerMJCustomerFclSync);
// Estado de ultima sincronizacion + numero de conflictos sin resolver
app.get('/api/admin/fcl/sync-mjcustomer/status', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getMJCustomerFclSyncStatus);
// Lista de conflictos pendientes de resolucion
app.get('/api/admin/fcl/sync-mjcustomer/conflicts', authenticateToken, requireRole('super_admin'), listMJCustomerFclConflicts);

// Upload manual de documentos marítimos (FCL/LCL) - Archivos van a S3, límite 100MB
const maritimeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
app.post('/api/admin/maritime/upload-manual', 
  authenticateToken, 
  requireMinLevel(ROLES.WAREHOUSE_OPS),
  maritimeUpload.fields([
    { name: 'bl', maxCount: 1 },
    { name: 'telex', maxCount: 1 },
    { name: 'isf', maxCount: 1 },
    { name: 'invoice', maxCount: 1 },
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
app.post('/api/admin/air-startup-tiers', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), saveAirStartupTiers);
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
app.patch('/api/awb-costs/:id/reference', authenticateToken, requireMinLevel(ROLES.ADMIN), updateAwbCostReference);

// ========== TDI EXPRESS — recepción en serie ruta TDI-EXPRES ==========
app.get('/api/tdi-express/product-types', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getTdiProductTypes);
app.get('/api/tdi-express/stats', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getTdiStats);
app.get('/api/tdi-express/shipments', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), listTdiShipments);
const tdiPhotoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 10 } });
app.post('/api/tdi-express/shipments/:id/photos', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), tdiPhotoUpload.array('photos', 10), uploadTdiPhotos);
app.get('/api/tdi-express/shipments/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getTdiShipmentDetail);
app.delete('/api/tdi-express/shipments/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), deleteTdiShipment);
app.patch('/api/tdi-express/shipments/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updateTdiShipment);
app.post('/api/tdi-express/serial/start', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), startTdiSerial);
app.post('/api/tdi-express/serial/:masterId/box', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), addTdiBox);
app.delete('/api/tdi-express/serial/:masterId/child/:childId', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), removeTdiBox);
app.patch('/api/tdi-express/serial/:masterId/child/:childId', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updateTdiBox);
app.get('/api/tdi-express/outbound/ready', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), listTdiOutboundReady);
app.post('/api/tdi-express/outbound/dispatch', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), dispatchTdiBoxes);
// Actualizar Guía AWB DHL — cajas TDX en tránsito + asignar AWB
app.get('/api/tdi-express/in-transit', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), listTdiInTransit);
app.patch('/api/tdi-express/:id/awb', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updateTdiAwb);
// Recepción en CEDIS MTY: cambia status de received_china → received_mty
app.post('/api/tdi-express/receive-cedis-mty', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), async (req: Request, res: Response) => {
  try {
    const { tracking } = req.body;
    if (!tracking) return res.status(400).json({ error: 'Tracking requerido' });
    const norm = String(tracking).trim().toUpperCase();
    // 🔧 Compacto alfanumérico: el escáner físico a veces sustituye el guión "-"
    // por apóstrofe/espacio (TDX'5894471122'001). Comparamos ignorando cualquier
    // separador para que "TDX'5894471122'001" == "TDX-5894471122-001".
    const compact = norm.replace(/[^A-Z0-9]/g, '');
    // Buscar master o hijo por tracking_internal / child_no / AWB (international_tracking),
    // preferimos el master cuando el match es por AWB compartido.
    const pkgRes = await pool.query(`
      SELECT p.id, p.master_id, p.tracking_internal, p.status::text AS status,
        p.service_type, COALESCE(p.is_master, false) AS is_master,
        (SELECT COUNT(*) FROM packages c WHERE c.master_id = p.id)::int AS children_count,
        u.full_name AS client_name, u.box_id AS client_box_id
      FROM packages p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.service_type IN ('tdi_express','tdi_aereo')
        AND (
          UPPER(COALESCE(p.tracking_internal, '')) = $1
          OR UPPER(COALESCE(p.child_no, '')) = $1
          OR UPPER(COALESCE(p.international_tracking, '')) = $1
          OR REGEXP_REPLACE(UPPER(COALESCE(p.tracking_internal, '')), '[^A-Z0-9]', '', 'g') = $2
          OR REGEXP_REPLACE(UPPER(COALESCE(p.child_no, '')), '[^A-Z0-9]', '', 'g') = $2
          OR REGEXP_REPLACE(UPPER(COALESCE(p.international_tracking, '')), '[^A-Z0-9]', '', 'g') = $2
        )
      ORDER BY
        CASE WHEN REGEXP_REPLACE(UPPER(COALESCE(p.tracking_internal, '')), '[^A-Z0-9]', '', 'g') = $2 THEN 0
             WHEN REGEXP_REPLACE(UPPER(COALESCE(p.child_no, '')), '[^A-Z0-9]', '', 'g') = $2 THEN 1
             ELSE 2 END ASC,
        COALESCE(p.is_master, false) DESC,
        p.id ASC
      LIMIT 1
    `, [norm, compact]);

    if (pkgRes.rows.length === 0) {
      // Fallback: guías DHL (dhl_shipments) — mismo flujo de 2 pasos. La
      // recepción en China las deja en received_china; aquí pasan a received_mty.
      const dhlRes = await pool.query(`
        SELECT ds.id, COALESCE(NULLIF(ds.secondary_tracking,''), ds.inbound_tracking) AS tracking_internal,
               ds.status, u.full_name AS client_name, u.box_id AS client_box_id
          FROM dhl_shipments ds
          LEFT JOIN users u ON u.id = ds.user_id
         WHERE UPPER(ds.inbound_tracking) = $1
            OR UPPER(COALESCE(ds.secondary_tracking,'')) = $1
            OR REGEXP_REPLACE(UPPER(COALESCE(ds.inbound_tracking,'')), '[^A-Z0-9]', '', 'g') = $2
            OR REGEXP_REPLACE(UPPER(COALESCE(ds.secondary_tracking,'')), '[^A-Z0-9]', '', 'g') = $2
         LIMIT 1
      `, [norm, compact]);
      if (dhlRes.rows.length > 0) {
        const d = dhlRes.rows[0];
        if (!['received_china', 'in_transit', 'customs'].includes(d.status)) {
          return res.status(400).json({ error: `Esta guía ya está en status "${d.status}" — no puede recibirse de nuevo`, already_received: d.status === 'received_mty' });
        }
        await pool.query(`UPDATE dhl_shipments SET status = 'received_mty', updated_at = NOW() WHERE id = $1`, [d.id]);
        return res.json({
          success: true, id: d.id, tracking: d.tracking_internal,
          client_name: d.client_name || '—', client_box_id: d.client_box_id || '—',
          is_master: false, children_count: 0, previous_status: d.status, new_status: 'received_mty',
        });
      }
      return res.status(404).json({ error: `Guía no encontrada: ${norm}` });
    }
    const pkg = pkgRes.rows[0];

    if (!['received_china', 'in_transit', 'customs'].includes(pkg.status)) {
      return res.status(400).json({
        error: `Esta guía ya está en status "${pkg.status}" — no puede recibirse de nuevo`,
        already_received: pkg.status === 'received_mty'
      });
    }

    // 🏢 Sucursal CEDIS Monterrey: al recibir se debe asignar current_branch_id
    // para que el paquete aparezca en la ruta del repartidor de sucursal MTY
    // (la query del repartidor filtra por sucursal, igual que PO Box / DHL).
    const mtyBranch = await pool.query(`SELECT id FROM branches WHERE UPPER(code) = 'MTY' LIMIT 1`);
    const mtyBranchId = mtyBranch.rows[0]?.id || null;

    // Actualizar master y todos sus hijos
    await pool.query(`
      UPDATE packages SET status = 'received_mty',
             current_branch_id = COALESCE($2::int, current_branch_id),
             updated_at = NOW()
      WHERE (id = $1 OR master_id = $1)
        AND service_type IN ('tdi_express','tdi_aereo')
    `, [pkg.id, mtyBranchId]);

    // 🔁 Rollup: si se escaneó una caja hija y ya NO queda ninguna hermana
    // pendiente de recibir, marcar también el master como received_mty para
    // que la tarjeta del cliente refleje el estado real del envío.
    if (pkg.master_id) {
      await pool.query(`
        UPDATE packages SET status = 'received_mty',
               current_branch_id = COALESCE($2::int, current_branch_id),
               updated_at = NOW()
        WHERE id = $1
          AND service_type IN ('tdi_express','tdi_aereo')
          AND NOT EXISTS (
            SELECT 1 FROM packages c
            WHERE c.master_id = $1 AND c.status::text NOT IN ('received_mty','delivered','dispatched_national','ready_pickup')
          )
      `, [pkg.master_id, mtyBranchId]);
    }

    return res.json({
      success: true,
      id: pkg.id,
      tracking: pkg.tracking_internal,
      client_name: pkg.client_name || '—',
      client_box_id: pkg.client_box_id || '—',
      is_master: pkg.is_master,
      children_count: pkg.children_count,
      previous_status: pkg.status,
      new_status: 'received_mty',
    });
  } catch (error) {
    console.error('[tdi] receive-cedis-mty error:', error);
    res.status(500).json({ error: 'Error al recibir guía' });
  }
});

// ========== RECEPCIÓN AÉREA POR AWB (Hub TDI Aéreo China) ==========
app.get('/api/admin/china-air/awbs/in-transit', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), listInTransitAwbs);
app.get('/api/admin/china-air/awbs/:id/packages', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getAwbPackages);
app.post('/api/admin/china-air/awbs/:id/scan', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), scanAwbPackage);
app.post('/api/admin/china-air/awbs/:id/finalize', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), finalizeAwbReception);
app.get('/api/admin/china-air/inventory', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getAirInventory);

// Cambio manual de estado de un paquete aéreo — SOLO super_admin. Corrige
// estados desde el inventario aéreo sin pasar por el flujo de recepción.
app.patch('/api/admin/china-air/packages/:id/status', authenticateToken, requireMinLevel(ROLES.SUPER_ADMIN), async (req: AuthRequest, res: Response) => {
    try {
        const id = parseInt(String(req.params.id), 10);
        const status = String(req.body?.status || '').trim();
        if (!id) return res.status(400).json({ error: 'ID inválido' });
        const ALLOWED = ['received_china', 'in_transit', 'in_customs_gz', 'customs_clearance', 'received_mty', 'in_warehouse', 'out_for_delivery', 'delivered', 'shipped'];
        if (!ALLOWED.includes(status)) return res.status(400).json({ error: 'Estado no permitido' });
        const r = await pool.query(
            `UPDATE packages SET status = $1::package_status, updated_at = NOW()
              WHERE id = $2
                AND (service_type::text = 'AIR_CHN_MX'
                     OR LOWER(COALESCE(service_type::text, '')) = 'tdi_express'
                     OR air_source = 'tdi_express')
             RETURNING id, status::text AS status`,
            [status, id]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Paquete aéreo/TDX no encontrado' });
        return res.json({ success: true, status: r.rows[0].status });
    } catch (e: any) {
        console.error('[china-air status]', e.message);
        return res.status(500).json({ error: 'No se pudo actualizar el estado', details: e.message });
    }
});

// ========== RECEPCIÓN MARÍTIMA POR CONTENEDOR (Hub TDI Marítimo China) ==========
app.get('/api/admin/china-sea/containers/in-transit', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), listInTransitContainers);
app.get('/api/admin/china-sea/containers/:id/orders', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getContainerOrders);
app.post('/api/admin/china-sea/containers/:id/scan', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), scanContainerOrder);
app.post('/api/admin/china-sea/containers/:id/finalize', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), finalizeContainerReception);
app.post('/api/admin/china-sea/containers/:id/report-partial-boxes', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), reportPartialBoxes);
app.get('/api/admin/china-sea/inventory', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getSeaInventory);

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
app.post('/api/hr/reopen-checkout', authenticateToken, reopenCheckout);
app.get('/api/hr/my-attendance', authenticateToken, getMyAttendanceToday);
app.post('/api/hr/track-gps', authenticateToken, trackGPSLocation);

// Admin HR — lectura accesible también a Contador para nómina/reportes.
app.get('/api/admin/hr/employees', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), getEmployeesWithAttendance);
app.get('/api/admin/hr/employees/:id', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), getEmployeeDetail);
app.post('/api/admin/hr/employees', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), createEmployee);
app.put('/api/admin/hr/employees/:id', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), updateEmployee);
app.delete('/api/admin/hr/employees/:id', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), deleteEmployee);
app.post('/api/admin/hr/employees/:id/reactivate', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), async (req, res) => {
  const mod = await import('./hrController');
  return mod.reactivateEmployee(req, res);
});
app.get('/api/admin/hr/attendance', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), getAttendanceHistory);
app.get('/api/admin/hr/attendance/stats', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), getAttendanceStats);
app.get('/api/admin/hr/drivers/live', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.CUSTOMER_SERVICE, ROLES.COUNTER_STAFF, ROLES.ACCOUNTANT, ROLES.MONITOREO, ROLES.OPERACIONES), getDriversLiveLocation);

// Ubicaciones de trabajo (geocercas)
app.get('/api/admin/hr/locations', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), getWorkLocations);
app.post('/api/admin/hr/locations', authenticateToken, requireMinLevel(ROLES.ADMIN), createWorkLocation);

// ========== HR EXPANSION: Expediente Digital, Nómina, Préstamos, Pagaré ==========
import {
  getEmployeeFullProfile,
  uploadEmployeeDocument,
  deleteEmployeeDocument,
  upsertPayroll,
  createLoan,
  addLoanPayment,
  cancelLoan,
  getPagareInterno,
  getHRDashboardSummary,
  listVacationRequests,
  createVacationRequest,
  cancelVacationRequest,
  listQuintaBookings,
  createQuintaBooking,
  cancelQuintaBooking,
  updateQuintaPayment,
  getQuintaCalendar,
  generateAdvisorContract,
  updateAdminDriverLicense,
  updateMyLicense,
} from './hrExpansionController';

const hrDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

app.get('/api/admin/hr/dashboard-summary', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), getHRDashboardSummary);
app.get('/api/admin/hr/employees/:id/full-profile', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), getEmployeeFullProfile);
app.post('/api/admin/hr/employees/:id/documents', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), hrDocUpload.single('file'), uploadEmployeeDocument);
app.delete('/api/admin/hr/documents/:docId', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), deleteEmployeeDocument);
app.put('/api/admin/hr/employees/:id/payroll', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), upsertPayroll);
app.post('/api/admin/hr/employees/:id/loans', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), createLoan);
app.post('/api/admin/hr/loans/:loanId/payments', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), addLoanPayment);
app.post('/api/admin/hr/loans/:loanId/cancel', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), cancelLoan);
app.get('/api/admin/hr/loans/:loanId/pagare', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), getPagareInterno);

// Vacaciones
app.get('/api/admin/hr/employees/:id/vacations', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), listVacationRequests);
app.post('/api/admin/hr/employees/:id/vacations', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), createVacationRequest);
app.delete('/api/admin/hr/vacations/:requestId', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), cancelVacationRequest);

// Quinta (prestación 1 vez al año)
app.get('/api/admin/hr/quinta/calendar', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), getQuintaCalendar);
app.get('/api/admin/hr/employees/:id/quinta', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), listQuintaBookings);
app.post('/api/admin/hr/employees/:id/quinta', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), createQuintaBooking);
app.patch('/api/admin/hr/quinta/:bookingId/payment', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), updateQuintaPayment);
app.delete('/api/admin/hr/quinta/:bookingId', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), cancelQuintaBooking);

// Generar contrato firmado para asesores (usa firma digital del aviso de privacidad)
app.post('/api/admin/hr/employees/:id/generate-advisor-contract', authenticateToken, requireMinLevel(ROLES.ADMIN), generateAdvisorContract);

// Licencia de conducir — actualización por admin y por el propio repartidor
const hrLicenseUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.put('/api/admin/hr/employees/:id/license', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.ACCOUNTANT), hrLicenseUpload.fields([{ name: 'front_photo', maxCount: 1 }, { name: 'back_photo', maxCount: 1 }]), updateAdminDriverLicense);
app.put('/api/hr/my-license', authenticateToken, hrLicenseUpload.fields([{ name: 'front_photo', maxCount: 1 }, { name: 'back_photo', maxCount: 1 }]), updateMyLicense);

// ========== MÓDULO DE GESTIÓN DE FLOTILLA ==========
// Vehículos - Admin
app.get('/api/admin/fleet/vehicles', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getVehicles);
app.get('/api/admin/fleet/vehicles/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getVehicleDetail);
app.post('/api/admin/fleet/vehicles', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createVehicle);
app.put('/api/admin/fleet/vehicles/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateVehicle);
app.delete('/api/admin/fleet/vehicles/:id', authenticateToken, requireRole('super_admin'), deleteVehicleHandler);
app.post('/api/admin/fleet/vehicles/:id/assign-driver', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), assignDriver);

// Documentos de vehículos
app.get('/api/admin/fleet/vehicles/:vehicleId/documents', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getVehicleDocuments);
app.post('/api/admin/fleet/vehicles/:vehicleId/documents', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createDocument);
app.put('/api/admin/fleet/documents/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), updateDocument);
app.delete('/api/admin/fleet/documents/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), deleteDocument);

// Mantenimiento
app.get('/api/admin/fleet/vehicles/:vehicleId/maintenance', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getMaintenanceHistory);
app.post('/api/admin/fleet/vehicles/:vehicleId/maintenance', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), createMaintenance);

// Inspecciones diarias
app.get('/api/admin/fleet/inspections', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getInspections);
app.put('/api/admin/fleet/inspections/:id/review', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), reviewInspection);

// Alertas
app.get('/api/admin/fleet/alerts', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getFleetAlerts);
app.put('/api/admin/fleet/alerts/:id/resolve', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), resolveAlert);

// Dashboard y reportes
app.get('/api/admin/fleet/dashboard', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getFleetDashboard);
app.get('/api/admin/fleet/drivers', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAvailableDrivers);

// Proxy de archivos S3 (evita CORS al armar el .zip de descarga en el navegador).
// Restringido por rol dentro del handler (admin / super_admin / director).
app.get('/api/admin/fleet/file-proxy', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), proxyVehicleFile);

// Rutas para choferes (mobile app)
app.get('/api/fleet/available-vehicles', authenticateToken, getAvailableVehicles);
app.post('/api/fleet/inspection', authenticateToken, submitDailyInspection);
app.get('/api/fleet/inspection/today', authenticateToken, checkTodayInspection);

// 📊 Stats para rol Monitoreo: contenedores marítimos en estado "liberado"
// (customs_cleared) listos para coordinar movimiento.
app.get('/api/monitoreo/stats', authenticateToken, async (req: any, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (!['monitoreo', 'admin', 'super_admin', 'director'].includes(role)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    const userId = Number(req.user?.id || req.user?.userId);
    // � Si el usuario es solo "monitoreo", filtra contenedores asignados a él (monitor_user_id).
    // Admin / super_admin / director ven todos.
    const onlyAssigned = role === 'monitoreo';
    const whereOwner = onlyAssigned ? `WHERE monitor_user_id = $1` : '';
    const ownerParams = onlyAssigned ? [userId] : [];
    // 🚛 Monitoreo: "Contenedores en Ruta" = solo los que ya van rumbo al cliente final
    // (in_transit_clientfinal). Los liberados de aduana aún no están en ruta.
    // “Cargados” = el monitorista ya inició monitoreo (subió las 2 fotos).
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'in_transit_clientfinal' AND monitoring_started_at IS NULL)::int AS liberados,
         COUNT(*) FILTER (WHERE status = 'customs_cleared')::int AS customs_cleared,
         COUNT(*) FILTER (WHERE status = 'in_transit_clientfinal')::int AS in_transit_clientfinal,
         COUNT(*) FILTER (WHERE monitoring_started_at IS NOT NULL AND status <> 'delivered')::int AS cargados,
         COUNT(*) FILTER (WHERE status = 'delivered')::int AS entregados
       FROM containers ${whereOwner}`,
      ownerParams
    );

    // Asignación activa del usuario monitoreo (si tiene una unidad recibida)
    let currentAssignment: any = null;
    if (userId) {
      const assign = await pool.query(`
        SELECT va.id AS assignment_id, va.mileage_at_assignment, va.assigned_at,
               v.id AS vehicle_id, v.economic_number, v.license_plates,
               v.brand, v.model, v.year, v.vehicle_type, v.current_mileage
        FROM vehicle_assignments va
        JOIN vehicles v ON v.id = va.vehicle_id
        WHERE va.driver_id = $1 AND va.released_at IS NULL
        ORDER BY va.assigned_at DESC
        LIMIT 1
      `, [userId]);
      if (assign.rows.length > 0) currentAssignment = assign.rows[0];
    }

    res.json({
      liberados: result.rows[0]?.liberados || 0,
      customs_cleared: result.rows[0]?.customs_cleared || 0,
      in_transit_clientfinal: result.rows[0]?.in_transit_clientfinal || 0,
      cargados: result.rows[0]?.cargados || 0,
      entregados: result.rows[0]?.entregados || 0,
      currentAssignment,
    });
  } catch (error) {
    console.error('Error obteniendo stats monitoreo:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// 📋 Listado de contenedores en ruta para rol Monitoreo
app.get('/api/monitoreo/containers', authenticateToken, async (req: any, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (!['monitoreo', 'admin', 'super_admin', 'director'].includes(role)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    const status = String(req.query.status || 'in_transit_clientfinal');
    const allowed = ['customs_cleared', 'in_transit_clientfinal', 'all'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Status no permitido' });
    }
    const userId = Number(req.user?.id || req.user?.userId);
    const onlyAssigned = role === 'monitoreo';
    const statusClause = status === 'all'
      ? `c.status IN ('customs_cleared','in_transit_clientfinal')`
      : `c.status = $1`;
    const params: any[] = status === 'all' ? [] : [status];
    let ownerClause = '';
    if (onlyAssigned) {
      params.push(userId);
      ownerClause = ` AND c.monitor_user_id = $${params.length}`;
    }
    const result = await pool.query(`
      SELECT
        c.id, c.container_number, c.bl_number, c.reference_code,
        c.week_number, c.vessel_name, c.voyage_number, c.status,
        c.eta, c.total_weight_kg, c.total_cbm, c.total_packages,
        c.driver_name, c.driver_plates, c.driver_phone, c.driver_company,
        c.route_dispatched_at, c.created_at,
        c.monitoring_started_at, c.monitoring_photo_1_url, c.monitoring_photo_2_url,
        c.delivery_confirmed_at, c.delivery_photo_1_url, c.delivery_photo_2_url, c.delivery_photo_3_url,
        u.id AS client_user_id,
        u.full_name AS client_name,
        u.box_id AS client_box_id,
        u.phone AS client_phone
      FROM containers c
      LEFT JOIN users u ON u.id = c.client_user_id
      WHERE ${statusClause}${ownerClause}
      ORDER BY
        CASE WHEN c.status = 'in_transit_clientfinal' THEN 0 ELSE 1 END,
        c.route_dispatched_at DESC NULLS LAST,
        c.created_at DESC
    `, params);
    // 🖼️ Firmar URLs S3 (bucket privado) para que img/href funcionen en cliente
    try {
      const { signS3UrlIfNeeded } = await import('./s3Service');
      const containers = await Promise.all(
        result.rows.map(async (c: any) => ({
          ...c,
          monitoring_photo_1_url: await signS3UrlIfNeeded(c.monitoring_photo_1_url),
          monitoring_photo_2_url: await signS3UrlIfNeeded(c.monitoring_photo_2_url),
          delivery_photo_1_url: await signS3UrlIfNeeded(c.delivery_photo_1_url),
          delivery_photo_2_url: await signS3UrlIfNeeded(c.delivery_photo_2_url),
          delivery_photo_3_url: await signS3UrlIfNeeded(c.delivery_photo_3_url),
        }))
      );
      return res.json({ containers });
    } catch (signErr) {
      console.warn('[monitoreo/containers] sign error:', (signErr as Error).message);
    }
    res.json({ containers: result.rows });
  } catch (error) {
    console.error('Error listando contenedores monitoreo:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// 🔍 Detalle de contenedor para rol Monitoreo (incluye dirección de destino e historial)
app.get('/api/monitoreo/containers/:id', authenticateToken, async (req: any, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (!['monitoreo', 'admin', 'super_admin', 'director'].includes(role)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

    const containerRes = await pool.query(`
      SELECT
        c.*,
        u.full_name AS client_name,
        u.box_id AS client_box_id,
        u.phone AS client_phone,
        u.email AS client_email
      FROM containers c
      LEFT JOIN users u ON u.id = c.client_user_id
      WHERE c.id = $1
      LIMIT 1
    `, [id]);
    if (containerRes.rows.length === 0) {
      return res.status(404).json({ error: 'Contenedor no encontrado' });
    }
    const container = containerRes.rows[0];

    // Historial de status
    let history: any[] = [];
    try {
      const h = await pool.query(`
        SELECT id, status, notes, driver_name, driver_plates, driver_phone, driver_company,
               changed_by_name, created_at
        FROM container_status_history
        WHERE container_id = $1
        ORDER BY created_at DESC
      `, [id]);
      history = h.rows;
    } catch (e) {
      console.warn('No se pudo cargar historial:', (e as Error).message);
    }

    // Dirección de destino: solo si hay instrucciones formalmente asignadas
    let destinationAddress: any = null;
    if (container.client_user_id) {
      try {
        // 1. delivery_address_id directo en el contenedor (FCL)
        const contAddrRes = await pool.query(`
          SELECT a.* FROM addresses a
          WHERE a.id = (SELECT delivery_address_id FROM containers WHERE id = $1)
        `, [container.id]);
        if (contAddrRes.rows.length > 0) {
          destinationAddress = { ...contAddrRes.rows[0], instruction_confirmed: true };
        } else {
          // 2. Fallback: maritime_orders con delivery_address_id (LCL)
          const instrRes = await pool.query(`
            SELECT da.* FROM maritime_orders mo
            JOIN addresses da ON da.id = mo.delivery_address_id
            WHERE mo.container_id = $1 AND mo.delivery_address_id IS NOT NULL
            LIMIT 1
          `, [container.id]);
          destinationAddress = instrRes.rows[0] ? { ...instrRes.rows[0], instruction_confirmed: true } : null;
        }
      } catch (e) {
        console.warn('No se pudo cargar dirección:', (e as Error).message);
      }
    }

    res.json({ container, history, destinationAddress });
  } catch (error) {
    console.error('Error obteniendo detalle monitoreo:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// 📸 Iniciar monitoreo: el monitorista sube 2 fotos (operador + unidad).
// Esto marca el contenedor como "Cargado" en su tablero.
const monitoringUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
app.post(
  '/api/monitoreo/containers/:id/start-monitoring',
  authenticateToken,
  monitoringUpload.fields([{ name: 'photo1', maxCount: 1 }, { name: 'photo2', maxCount: 1 }]),
  async (req: any, res) => {
    try {
      const role = String(req.user?.role || '').toLowerCase();
      if (!['monitoreo', 'admin', 'super_admin', 'director'].includes(role)) {
        return res.status(403).json({ error: 'Acceso denegado' });
      }
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

      const userId = Number(req.user?.id || req.user?.userId);
      const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
      const f1 = files.photo1?.[0];
      const f2 = files.photo2?.[0];
      if (!f1 || !f2) {
        return res.status(400).json({ error: 'Se requieren ambas fotos (photo1 y photo2)' });
      }

      // Validar permisos sobre el contenedor (monitoreo solo puede sobre los suyos)
      const owner = await pool.query(
        'SELECT id, monitor_user_id, status, monitoring_started_at FROM containers WHERE id = $1',
        [id]
      );
      if (owner.rows.length === 0) return res.status(404).json({ error: 'Contenedor no encontrado' });
      const cRow = owner.rows[0];
      if (role === 'monitoreo' && Number(cRow.monitor_user_id) !== userId) {
        return res.status(403).json({ error: 'No estás asignado a este contenedor' });
      }
      if (cRow.monitoring_started_at) {
        return res.status(409).json({ error: 'El monitoreo ya fue iniciado para este contenedor' });
      }

      const { uploadToS3, isS3Configured } = await import('./s3Service');
      const ts = Date.now();
      let url1: string;
      let url2: string;
      if (isS3Configured()) {
        const ext1 = (f1.mimetype.split('/')[1] || 'jpg').toLowerCase();
        const ext2 = (f2.mimetype.split('/')[1] || 'jpg').toLowerCase();
        url1 = await uploadToS3(f1.buffer, `monitoring/${id}/${ts}_1.${ext1}`, f1.mimetype);
        url2 = await uploadToS3(f2.buffer, `monitoring/${id}/${ts}_2.${ext2}`, f2.mimetype);
      } else {
        url1 = `data:${f1.mimetype};base64,${f1.buffer.toString('base64')}`;
        url2 = `data:${f2.mimetype};base64,${f2.buffer.toString('base64')}`;
      }

      const notes = (req.body?.notes || '').toString().trim() || null;
      const updated = await pool.query(
        `UPDATE containers
           SET monitoring_started_at = NOW(),
               monitoring_started_by = $1,
               monitoring_photo_1_url = $2,
               monitoring_photo_2_url = $3,
               monitoring_notes = COALESCE($4, monitoring_notes)
         WHERE id = $5
         RETURNING id, monitoring_started_at, monitoring_photo_1_url, monitoring_photo_2_url`,
        [userId, url1, url2, notes, id]
      );

      // Registrar en historial (si la tabla existe)
      try {
        await pool.query(
          `INSERT INTO container_status_history (container_id, new_status, changed_by, notes, changed_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [id, cRow.status, userId, '📸 Monitoreo iniciado por monitorista']
        );
      } catch (e) {
        // tabla puede tener un esquema distinto; no es crítico
      }

      return res.json({ ok: true, container: updated.rows[0] });
    } catch (error: any) {
      console.error('Error iniciando monitoreo:', error);
      res.status(500).json({ error: 'Error interno', details: error?.message });
    }
  }
);

// ✅ Confirmar entrega del contenedor: monitorista sube 3 fotos y el contenedor pasa a 'delivered'.
const deliveryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
app.post(
  '/api/monitoreo/containers/:id/confirm-delivery',
  authenticateToken,
  deliveryUpload.fields([
    { name: 'photo1', maxCount: 1 },
    { name: 'photo2', maxCount: 1 },
    { name: 'photo3', maxCount: 1 },
  ]),
  async (req: any, res) => {
    try {
      const role = String(req.user?.role || '').toLowerCase();
      if (!['monitoreo', 'admin', 'super_admin', 'director'].includes(role)) {
        return res.status(403).json({ error: 'Acceso denegado' });
      }
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

      const userId = Number(req.user?.id || req.user?.userId);
      const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
      const f1 = files.photo1?.[0];
      const f2 = files.photo2?.[0];
      const f3 = files.photo3?.[0];
      if (!f1 || !f2 || !f3) {
        return res.status(400).json({ error: 'Se requieren 3 fotos (photo1, photo2, photo3)' });
      }

      const owner = await pool.query(
        'SELECT id, monitor_user_id, status, monitoring_started_at, delivery_confirmed_at FROM containers WHERE id = $1',
        [id]
      );
      if (owner.rows.length === 0) return res.status(404).json({ error: 'Contenedor no encontrado' });
      const cRow = owner.rows[0];
      if (role === 'monitoreo' && Number(cRow.monitor_user_id) !== userId) {
        return res.status(403).json({ error: 'No estás asignado a este contenedor' });
      }
      if (!cRow.monitoring_started_at) {
        return res.status(409).json({ error: 'Primero debes iniciar el monitoreo de este contenedor' });
      }
      if (cRow.delivery_confirmed_at) {
        return res.status(409).json({ error: 'La entrega ya fue confirmada para este contenedor' });
      }

      const { uploadToS3, isS3Configured } = await import('./s3Service');
      const ts = Date.now();
      const upload = async (f: Express.Multer.File, idx: number) => {
        if (isS3Configured()) {
          const ext = (f.mimetype.split('/')[1] || 'jpg').toLowerCase();
          return uploadToS3(f.buffer, `delivery/${id}/${ts}_${idx}.${ext}`, f.mimetype);
        }
        return `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;
      };
      const [url1, url2, url3] = await Promise.all([upload(f1, 1), upload(f2, 2), upload(f3, 3)]);

      const notes = (req.body?.notes || '').toString().trim() || null;
      const updated = await pool.query(
        `UPDATE containers
           SET status = 'delivered',
               delivery_confirmed_at = NOW(),
               delivery_confirmed_by = $1,
               delivery_photo_1_url = $2,
               delivery_photo_2_url = $3,
               delivery_photo_3_url = $4,
               delivery_notes = COALESCE($5, delivery_notes)
         WHERE id = $6
         RETURNING id, status, delivery_confirmed_at`,
        [userId, url1, url2, url3, notes, id]
      );

      try {
        await pool.query(
          `INSERT INTO container_status_history (container_id, new_status, previous_status, changed_by, notes, changed_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [id, 'delivered', cRow.status, userId, '✅ Entrega confirmada por monitorista (3 fotos)']
        );
      } catch (e) {
        // historial puede tener distinto esquema, no es crítico
      }

      return res.json({ ok: true, container: updated.rows[0] });
    } catch (error: any) {
      console.error('Error confirmando entrega:', error);
      res.status(500).json({ error: 'Error interno', details: error?.message });
    }
  }
);

// ========== MÓDULO DE CHAT INTERNO ==========
import {
  listConversations as chatListConversations,
  createConversation as chatCreateConversation,
  listMessages as chatListMessages,
  sendMessage as chatSendMessage,
  markAsRead as chatMarkAsRead,
  searchStaff as chatSearchStaff,
  listParticipants as chatListParticipants,
  auditAllConversations as chatAuditAllConversations,
  registerPushToken as chatRegisterPushToken,
  unregisterPushToken as chatUnregisterPushToken,
  syncAutoGroups as chatSyncAutoGroups,
} from './chatController';

const chatUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

app.get('/api/chat/conversations', authenticateToken, chatListConversations);
app.post('/api/chat/conversations', authenticateToken, chatCreateConversation);
app.get('/api/chat/conversations/:id/messages', authenticateToken, chatListMessages);
app.post('/api/chat/conversations/:id/messages', authenticateToken, chatUpload.array('files', 10), chatSendMessage);
app.post('/api/chat/conversations/:id/read', authenticateToken, chatMarkAsRead);
app.get('/api/chat/staff/search', authenticateToken, chatSearchStaff);
app.get('/api/chat/conversations/:id/participants', authenticateToken, chatListParticipants);
app.get('/api/chat/audit/conversations', authenticateToken, chatAuditAllConversations);
app.post('/api/chat/push-tokens', authenticateToken, chatRegisterPushToken);
app.delete('/api/chat/push-tokens', authenticateToken, chatUnregisterPushToken);
app.post('/api/chat/auto-groups/sync', authenticateToken, chatSyncAutoGroups);

// ========== MÓDULO DE REPARTIDOR - CARGA Y ENTREGA ==========
app.get('/api/driver/route-today', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), getDriverRouteToday);

// Scan-to-Load: Carga de paquetes a la unidad
app.post('/api/driver/scan-load', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), scanPackageToLoad);

// Marcar etiqueta como impresa manualmente (paquetería externa sin API)
app.patch('/api/driver/packages/:id/mark-label-printed', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), async (req: AuthRequest, res: Response) => {
  try {
    const pkgId = parseInt(req.params.id as string);
    if (!pkgId) return res.status(400).json({ error: 'ID inválido' });
    await pool.query(
      `UPDATE packages SET national_label_url = COALESCE(national_label_url, 'manual-printed'), updated_at = NOW() WHERE id = $1`,
      [pkgId]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Retorno a bodega: Paquetes no entregados
app.get('/api/driver/packages-to-return', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), getPackagesToReturn);
app.post('/api/driver/scan-return', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), scanPackageReturn);

// Confirmación de entrega
app.post('/api/driver/confirm-delivery', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), confirmDelivery);
app.post('/api/driver/confirm-delivery-bulk', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), confirmDeliveryBulk);
app.post('/api/driver/paqueteria-handoff/scan', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), paqueteriaHandoffScan);
app.get('/api/driver/deliveries-today', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), getDeliveriesToday);

// Verificar paquete antes de entregar
app.get('/api/driver/verify-package/:barcode', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), verifyPackageForDelivery);
app.get('/api/driver/check-carrier-guide/:guide', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), checkCarrierGuideAvailable);

// ============================================
// RASTREADOR PÚBLICO (GUEST) — sin auth
// Solo expone los 6 hitos públicos + últimos 3 movimientos sin datos sensibles
// ============================================

app.get('/api/public/track/:tracking', async (req: Request, res: Response) => {
  const raw = (String(req.params.tracking || '')).trim().toUpperCase();
  if (!raw) return res.status(400).json({ error: 'Número de guía requerido' });

  // Mapa de status interno → hito público (0-5)
  const MILESTONE_MAP: Record<string, number> = {
    // Milestone 0 — Ordenado
    registered: 0, ordered: 0, created: 0, pending: 0, generado: 0,
    // Milestone 1 — En Tránsito (en China o en ruta)
    shipped: 1, in_transit: 1, received_china: 1, received_origin: 1, en_transito: 1,
    loading: 1, at_port: 1, in_warehouse: 1, processing: 1,
    in_transit_china: 1, at_warehouse_china: 1, in_warehouse_china: 1,
    // Milestone 2 — Tramite Aduanal
    in_customs: 2, customs: 2, cruce_aduanal: 2, at_customs: 2,
    in_transit_mx: 2, pending_inspection: 2,
    // Milestone 3 — En Bodega MTY
    received: 3, received_mty: 3, bodega: 3,
    received_cedis: 3, inspected: 3, pending_payment: 3, pending_inspection_mty: 3,
    // Milestone 4 — Listo para Entrega
    out_for_delivery: 4, loaded: 4, listo_entrega: 4, ready_pickup: 4,
    // Milestone 5 — Entregado
    delivered: 5, completed: 5, entregado: 5,
  };
  const MILESTONES = [
    { key: 'ordered',   label_es: 'Ordenado',               label_en: 'Ordered',              label_zh: '已下单',     icon: 'check-circle' },
    { key: 'transit',   label_es: 'En Tránsito',             label_en: 'In Transit',            label_zh: '运输中',     icon: 'local-shipping' },
    { key: 'customs',   label_es: 'Tramite Aduanal',           label_en: 'Customs',               label_zh: '清关中',     icon: 'security' },
    { key: 'warehouse', label_es: 'En Bodega MTY',           label_en: 'At Warehouse',          label_zh: '仓库中',     icon: 'warehouse' },
    { key: 'ready',     label_es: 'Listo para Entrega',      label_en: 'Ready for Delivery',    label_zh: '待派送',     icon: 'inventory' },
    { key: 'delivered', label_es: 'Entregado',               label_en: 'Delivered',             label_zh: '已签收',     icon: 'done-all' },
  ];

  const SERVICE_NAMES: Record<string, { es: string; en: string; zh: string }> = {
    POBOX_USA:   { es: 'Terrestre USA a México', en: 'Ground USA to Mexico',   zh: '美国陆运' },
    china_air:   { es: 'Aéreo China',            en: 'China Air Freight',      zh: '中国空运' },
    tdi_aereo:   { es: 'Aéreo China',            en: 'China Air Freight',      zh: '中国空运' },
    tdi_express: { es: 'Aéreo Express',          en: 'Express Air Freight',    zh: '急速空运' },
    china_sea:   { es: 'Marítimo China',         en: 'China Sea Freight',      zh: '中国海运' },
    maritime:    { es: 'Marítimo China',         en: 'China Sea Freight',      zh: '中国海运' },
    dhl:         { es: 'Trámite Aduanal MTY',   en: 'Customs Clearance MTY',  zh: '清关服务' },
    pqtx:        { es: 'Paquetería Nacional',    en: 'National Shipping',      zh: '国内物流' },
  };

  try {
    // Versión compacta del término: sólo letras+dígitos, mayúsculas.
    // Permite que "AIR-2630456Qydeh" o "air2630456qydeh-001" hagan match
    // contra valores almacenados con o sin guión / case mixto.
    const compact = raw.replace(/[^A-Z0-9]/g, '');

    // 1. Buscar en packages
    //    Columnas reales: tracking_internal, tracking_provider, child_no, status, service_type
    const pkgRes = await pool.query(`
      SELECT
        p.id,
        p.tracking_internal AS tracking,
        COALESCE(p.tracking_provider, p.child_no) AS external_tracking,
        p.status::text AS status,
        p.service_type,
        COALESCE(p.is_master, false) AS is_master,
        p.master_id,
        p.total_boxes,
        p.created_at,
        p.updated_at
      FROM packages p
      WHERE UPPER(p.tracking_internal) = $1
         OR UPPER(COALESCE(p.tracking_provider,'')) = $1
         OR UPPER(COALESCE(p.child_no,'')) = $1
         OR UPPER(COALESCE(p.national_tracking,'')) = $1
         OR REGEXP_REPLACE(UPPER(COALESCE(p.tracking_internal,'')), '[^A-Z0-9]', '', 'g') = $2
         OR REGEXP_REPLACE(UPPER(COALESCE(p.tracking_provider,'')), '[^A-Z0-9]', '', 'g') = $2
         OR REGEXP_REPLACE(UPPER(COALESCE(p.child_no,'')), '[^A-Z0-9]', '', 'g') = $2
         OR REGEXP_REPLACE(UPPER(COALESCE(p.national_tracking,'')), '[^A-Z0-9]', '', 'g') = $2
      ORDER BY
        CASE WHEN UPPER(COALESCE(p.tracking_internal,'')) = $1 THEN 0
             WHEN UPPER(COALESCE(p.tracking_provider,'')) = $1 THEN 1
             WHEN UPPER(COALESCE(p.child_no,'')) = $1 THEN 2
             ELSE 3 END ASC,
        p.id DESC
      LIMIT 1
    `, [raw, compact]);

    // 2. Buscar en dhl_shipments
    let dhlRow: any = null;
    try {
      const dhlRes = await pool.query(`
        SELECT
          NULL::int AS id,
          'dhl' AS service_type,
          COALESCE(ds.secondary_tracking, ds.inbound_tracking) AS tracking,
          ds.status::text AS status,
          ds.created_at,
          ds.updated_at
        FROM dhl_shipments ds
        WHERE UPPER(COALESCE(ds.secondary_tracking,'')) = $1
           OR UPPER(COALESCE(ds.inbound_tracking,'')) = $1
           OR REGEXP_REPLACE(UPPER(COALESCE(ds.secondary_tracking,'')), '[^A-Z0-9]', '', 'g') = $2
           OR REGEXP_REPLACE(UPPER(COALESCE(ds.inbound_tracking,'')), '[^A-Z0-9]', '', 'g') = $2
        LIMIT 1
      `, [raw, compact]);
      dhlRow = dhlRes.rows[0] || null;
    } catch { /* dhl_shipments opcional */ }

    // 3. Buscar en pqtx_shipments (guías nacionales)
    let pqtxRow: any = null;
    try {
      const pqtxRes = await pool.query(`
        SELECT
          ps.id,
          'pqtx' AS service_type,
          ps.tracking_number AS tracking,
          ps.status::text AS status,
          ps.created_at,
          ps.updated_at
        FROM pqtx_shipments ps
        WHERE UPPER(ps.tracking_number) = $1
           OR REGEXP_REPLACE(UPPER(COALESCE(ps.tracking_number,'')), '[^A-Z0-9]', '', 'g') = $2
        LIMIT 1
      `, [raw, compact]);
      pqtxRow = pqtxRes.rows[0] || null;
    } catch { /* pqtx_shipments opcional */ }

    // 4. Buscar en china_receipts (TDI Aéreo — ordersn LOG...)
    let chinaRow: any = null;
    try {
      const chinaRes = await pool.query(`
        SELECT
          cr.id,
          'china_air' AS service_type,
          cr.ordersn AS tracking,
          cr.status::text AS status,
          cr.created_at,
          cr.updated_at
        FROM china_receipts cr
        WHERE UPPER(cr.ordersn) = $1
           OR UPPER(COALESCE(cr.awb_number,'')) = $1
           OR REGEXP_REPLACE(UPPER(COALESCE(cr.ordersn,'')), '[^A-Z0-9]', '', 'g') = $2
           OR REGEXP_REPLACE(UPPER(COALESCE(cr.awb_number,'')), '[^A-Z0-9]', '', 'g') = $2
        LIMIT 1
      `, [raw, compact]);
      chinaRow = chinaRes.rows[0] || null;
    } catch { /* china_receipts opcional */ }

    // 5. Buscar en maritime_orders (Marítimo — ordersn LOG...)
    let maritimeRow: any = null;
    try {
      const maritimeRes = await pool.query(`
        SELECT
          mo.id,
          'china_sea' AS service_type,
          mo.ordersn AS tracking,
          mo.status::text AS status,
          mo.created_at,
          mo.updated_at
        FROM maritime_orders mo
        WHERE UPPER(mo.ordersn) = $1
           OR UPPER(COALESCE(mo.bl_number,'')) = $1
           OR UPPER(COALESCE(mo.ship_number,'')) = $1
           OR REGEXP_REPLACE(UPPER(COALESCE(mo.ordersn,'')), '[^A-Z0-9]', '', 'g') = $2
           OR REGEXP_REPLACE(UPPER(COALESCE(mo.bl_number,'')), '[^A-Z0-9]', '', 'g') = $2
           OR REGEXP_REPLACE(UPPER(COALESCE(mo.ship_number,'')), '[^A-Z0-9]', '', 'g') = $2
        LIMIT 1
      `, [raw, compact]);
      maritimeRow = maritimeRes.rows[0] || null;
    } catch { /* maritime_orders opcional */ }

    // 6. Buscar en containers (por número de contenedor, BL o referencia)
    let containerRow: any = null;
    try {
      const contRes = await pool.query(`
        SELECT
          c.id,
          'china_sea' AS service_type,
          COALESCE(c.container_number, c.bl_number, c.reference_code) AS tracking,
          c.container_number,
          c.bl_number,
          c.reference_code,
          c.status::text AS status,
          c.cn_status_en,
          c.cn_status_ch,
          c.vessel,
          c.port_name,
          c.eta,
          c.actual_arrival,
          c.created_at,
          c.updated_at
        FROM containers c
        WHERE UPPER(COALESCE(c.container_number,'')) = $1
           OR UPPER(COALESCE(c.bl_number,'')) = $1
           OR UPPER(COALESCE(c.reference_code,'')) = $1
           OR REGEXP_REPLACE(UPPER(COALESCE(c.container_number,'')), '[^A-Z0-9]', '', 'g') = $2
           OR REGEXP_REPLACE(UPPER(COALESCE(c.bl_number,'')), '[^A-Z0-9]', '', 'g') = $2
           OR REGEXP_REPLACE(UPPER(COALESCE(c.reference_code,'')), '[^A-Z0-9]', '', 'g') = $2
        LIMIT 1
      `, [raw, compact]);
      if (contRes.rows[0]) {
        containerRow = contRes.rows[0];
        containerRow._isContainer = true;
      }
    } catch { /* containers opcional */ }

    // 7. MASTER VIRTUAL — si nada hizo match exacto pero el término ingresado
    //    es un FNO/prefijo de hijas multi-caja (ej. "AIR2630456Qydeh" cuando
    //    en BD sólo existen hijas "AIR2630456Qydeh-001", "...-002").
    //    Sintetizamos el master agregando las hijas.
    let virtualMasterRow: any = null;
    let virtualChildrenForMaster: any[] = [];
    if (!pkgRes.rows[0] && !dhlRow && !pqtxRow && !chinaRow && !maritimeRow && !containerRow) {
      try {
        const childrenRes = await pool.query(`
          SELECT
            p.id, p.tracking_internal, p.tracking_provider, p.child_no,
            p.box_number, p.master_id, p.service_type,
            p.status::text AS status, p.weight,
            p.pkg_length, p.pkg_width, p.pkg_height,
            p.created_at, p.updated_at
          FROM packages p
          WHERE UPPER(COALESCE(p.child_no,'')) LIKE $1 || '-%'
             OR UPPER(COALESCE(p.tracking_internal,'')) LIKE $1 || '-%'
             OR REGEXP_REPLACE(UPPER(COALESCE(p.child_no,'')), '[^A-Z0-9]', '', 'g') LIKE $2 || '%'
          ORDER BY p.box_number ASC NULLS LAST, p.id ASC
          LIMIT 100
        `, [raw, compact]);
        if (childrenRes.rows.length > 0) {
          virtualChildrenForMaster = childrenRes.rows;
          // Hito agregado: el MENOR (más atrasado) de las hijas — refleja que
          // el master está "en el peor estado de cualquiera de sus hijas".
          // Luego pintamos las hijas con su propio hito.
          let minMilestone = 99;
          let aggregatedService = childrenRes.rows[0].service_type || 'china_air';
          let lastUpdated = childrenRes.rows[0].updated_at || childrenRes.rows[0].created_at;
          for (const ch of childrenRes.rows) {
            const sk = (ch.status || '').toLowerCase().replace(/[ -]/g, '_');
            const m = MILESTONE_MAP[sk] ?? 0;
            if (m < minMilestone) minMilestone = m;
            if (ch.updated_at && ch.updated_at > lastUpdated) lastUpdated = ch.updated_at;
          }
          if (minMilestone === 99) minMilestone = 0;
          // Reverse-map del hito → status
          const statusByMilestone: Record<number, string> = {
            0: 'ordered', 1: 'in_transit', 2: 'in_customs',
            3: 'received', 4: 'ready_pickup', 5: 'delivered',
          };
          virtualMasterRow = {
            id: null, // virtual
            tracking: raw,
            external_tracking: null,
            status: statusByMilestone[minMilestone] || 'ordered',
            service_type: aggregatedService,
            is_master: true,
            master_id: null,
            total_boxes: childrenRes.rows.length,
            created_at: lastUpdated,
            updated_at: lastUpdated,
            _isVirtualMaster: true,
          };
        }
      } catch (err) {
        console.warn('[public/track] virtual master lookup failed:', err);
      }
    }

    const row = pkgRes.rows[0] || dhlRow || pqtxRow || chinaRow || maritimeRow || containerRow || virtualMasterRow;
    if (!row) return res.status(404).json({ error: 'Guía no encontrada. Verifica el número e intenta de nuevo.' });

    // Para contenedores: usar cn_status_en para inferir hito si el status interno no mapea
    let statusKey = (row.status || '').toLowerCase().replace(/[ -]/g, '_');
    if (row._isContainer && (MILESTONE_MAP[statusKey] === undefined)) {
      const cnEn = (row.cn_status_en || '').toLowerCase();
      if (cnEn.includes('deliver') || cnEn.includes('arrived') || cnEn.includes('unload')) statusKey = 'delivered';
      else if (cnEn.includes('pickup') || cnEn.includes('ready')) statusKey = 'ready_pickup';
      else if (cnEn.includes('warehouse') || cnEn.includes('bodega') || cnEn.includes('cedis')) statusKey = 'received_mty';
      else if (cnEn.includes('customs') || cnEn.includes('aduana')) statusKey = 'in_customs';
      else if (cnEn.includes('port') || cnEn.includes('sailing') || cnEn.includes('transit') || cnEn.includes('ship')) statusKey = 'in_transit';
      else if (cnEn.includes('load')) statusKey = 'loading';
    }
    const currentMilestone = MILESTONE_MAP[statusKey] ?? 0;
    const svcKey = (row.service_type || '');
    const serviceName = SERVICE_NAMES[svcKey] || { es: 'EntregaX', en: 'EntregaX', zh: 'EntregaX' };

    // 3. Últimos movimientos — solo ciudades, sin datos sensibles
    let movements: { date: string; location: string; description_es: string; description_en: string; description_zh: string }[] = [];
    if (row.id) {
      try {
        const movRes = await pool.query(`
          SELECT
            pm.created_at AS date,
            COALESCE(b.city, 'Monterrey') AS location,
            pm.description AS raw_desc
          FROM package_movements pm
          LEFT JOIN branches b ON b.id = pm.branch_id
          WHERE pm.package_id = $1
          ORDER BY pm.created_at DESC
          LIMIT 3
        `, [row.id]);
        movements = movRes.rows.map((m: any) => ({
          date: m.date,
          location: m.location || 'Monterrey',
          description_es: 'Actualización de estado',
          description_en: 'Status update',
          description_zh: '状态更新',
        }));
      } catch { /* tabla opcional */ }
    }

    if (movements.length === 0) {
      const ms = MILESTONES[currentMilestone ?? 0] ?? MILESTONES[0];
      movements = [{
        date: row.updated_at || row.created_at,
        location: 'Monterrey',
        description_es: ms?.label_es ?? '',
        description_en: ms?.label_en ?? '',
        description_zh: ms?.label_zh ?? '',
      }];
    }

    // 4. Si es master de AIR (multi-caja), traer info pública de las hijas.
    //    Sólo datos no sensibles: tracking_internal, status, hito, peso, dimensiones.
    let childRows: any[] = [];
    let childCount = 0;
    if (row.is_master) {
      try {
        let rawChildren: any[] = [];
        if (row.id) {
          // Master real: query por master_id
          const childRes = await pool.query(`
            SELECT
              c.id,
              c.tracking_internal,
              c.child_no,
              c.box_number,
              c.status::text AS status,
              c.weight,
              c.pkg_length,
              c.pkg_width,
              c.pkg_height
            FROM packages c
            WHERE c.master_id = $1
            ORDER BY c.box_number ASC NULLS LAST, c.id ASC
          `, [row.id]);
          rawChildren = childRes.rows;
        } else if (row._isVirtualMaster) {
          // Master virtual: ya tenemos las hijas en virtualChildrenForMaster
          rawChildren = virtualChildrenForMaster;
        }
        childRows = rawChildren.map((c: any) => {
          const cStatusKey = (c.status || '').toLowerCase().replace(/[ -]/g, '_');
          const cMilestone = MILESTONE_MAP[cStatusKey] ?? 0;
          return {
            tracking: c.tracking_internal || c.child_no || `${row.tracking}-${String(c.box_number || '').padStart(3, '0')}`,
            box_number: c.box_number,
            current_milestone: cMilestone,
            status_label: {
              es: MILESTONES[cMilestone]?.label_es,
              en: MILESTONES[cMilestone]?.label_en,
              zh: MILESTONES[cMilestone]?.label_zh,
            },
            weight: c.weight ? Number(c.weight) : null,
            dimensions: (c.pkg_length && c.pkg_width && c.pkg_height)
              ? `${c.pkg_length}×${c.pkg_width}×${c.pkg_height} cm`
              : null,
          };
        });
        childCount = childRows.length || row.total_boxes || 0;
      } catch (err) {
        console.warn('[public/track] error fetching children:', err);
      }
    }

    return res.json({
      tracking: row.tracking || raw,
      service: serviceName,
      current_milestone: currentMilestone,
      milestones: MILESTONES,
      movements,
      found: true,
      received_at: row.created_at || null,
      // Master/hijas (sólo packages)
      ...(row.is_master ? {
        is_master: true,
        total_boxes: childCount,
        children: childRows,
      } : {}),
      // Datos extra para contenedores (no sensibles)
      ...(row._isContainer && {
        container: {
          container_number: row.container_number || null,
          bl_number: row.bl_number || null,
          reference: row.reference_code || null,
          vessel: row.vessel || null,
          port: row.port_name || null,
          eta: row.eta || null,
          cn_status_en: row.cn_status_en || null,
          cn_status_ch: row.cn_status_ch || null,
        },
      }),
    });
  } catch (err) {
    console.error('[public/track] error:', err);
    return res.status(500).json({ error: 'Error al consultar. Intenta de nuevo.' });
  }
});

// ============================================
// COTIZADOR PÚBLICO UNIVERSAL
// Endpoint para obtener todas las tarifas y calcular cotizaciones
// ============================================

// GET /api/public/rates - Obtener tarifas de referencia de todos los servicios
app.get('/api/public/rates', async (_req: Request, res: Response) => {
  try {
    // 1. Tipos de cambio dinámicos por servicio (exchange_rate_config = tc_api + sobreprecio).
    //    Si no hay config para un servicio, cae al más reciente de exchange_rates.
    const fxByServiceRes = await pool.query(`
      SELECT servicio, COALESCE(tipo_cambio_final, COALESCE(tipo_cambio_manual, ultimo_tc_api, 0) + COALESCE(sobreprecio, 0))::float AS tc
      FROM exchange_rate_config
      WHERE estado = TRUE
    `);
    const fxByService: Record<string, number> = {};
    for (const r of fxByServiceRes.rows) {
      fxByService[r.servicio] = parseFloat(r.tc);
    }
    const fxFallbackRes = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
    const fxFallback = parseFloat(fxFallbackRes.rows[0]?.rate || '20.00');
    const fxFor = (svc: string) => fxByService[svc] ?? fxFallback;
    // TC de referencia general (promedio) para mostrar al pie del cotizador.
    const fxRate = Object.values(fxByService).length > 0
      ? Object.values(fxByService).reduce((a, b) => a + b, 0) / Object.values(fxByService).length
      : fxFallback;

    // 2. Tarifas Marítimo China (precio base por CBM)
    const maritimoRes = await pool.query(`
      SELECT pt.min_cbm, pt.max_cbm, pt.price, pt.is_flat_fee
      FROM pricing_tiers pt
      JOIN pricing_categories pc ON pt.category_id = pc.id
      WHERE pc.name = 'Generico' AND pt.is_active = true
      ORDER BY pt.min_cbm ASC LIMIT 1
    `);
    const maritimoBase = parseFloat(maritimoRes.rows[0]?.price || '39');

    // 3. Tarifas Aéreo China (Génerico = cost_per_kg_usd + $8 sobre la ruta activa)
    //    Fuente única de verdad: air_routes.cost_per_kg_usd + markup fijo (L=+9, G=+8, F=+7).
    //    Evita desfase con air_tariffs cuando el admin ajusta sólo el Costo Ruta.
    const aereoRes = await pool.query(`
      SELECT cost_per_kg_usd, updated_at
      FROM air_routes
      WHERE is_active = true AND code <> 'TDI-EXPRES'
      ORDER BY id ASC LIMIT 1
    `);
    const aereoCost = parseFloat(aereoRes.rows[0]?.cost_per_kg_usd || '0');
    const aereoBase = aereoCost > 0 ? aereoCost + 8 : 8;
    const aereoUpdatedAt = aereoRes.rows[0]?.updated_at || null;

    // 3b. Tarifas TDI Express (ruta dedicada code='TDI-EXPRES')
    const expressRes = await pool.query(`
      SELECT cost_per_kg_usd, updated_at
      FROM air_routes
      WHERE is_active = true AND code = 'TDI-EXPRES'
      LIMIT 1
    `);
    const expressCost = parseFloat(expressRes.rows[0]?.cost_per_kg_usd || '0');
    const expressBase = expressCost > 0 ? expressCost + 8 : 0;
    const expressUpdatedAt = expressRes.rows[0]?.updated_at || null;

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
          precio_base_mxn: maritimoBase * fxFor('maritimo'),
          tipo_cambio: fxFor('maritimo'),
          icono: '🚢',
          notas: 'Incluye entrega en Monterrey. Mínimo cobrable: 0.010 m³',
        },
        {
          id: 'aereo',
          nombre: 'Aéreo China (TDI Aéreo)',
          descripcion: 'Envío por avión desde China. Para envíos urgentes y pequeños.',
          tiempo_estimado: '10-15 días',
          unidad: 'kg',
          precio_base_usd: aereoBase,
          precio_base_mxn: aereoBase * fxFor('tdi'),
          tipo_cambio: fxFor('tdi'),
          icono: '✈️',
          notas: 'Precio por kilogramo. Se usa el mayor entre peso real y volumétrico.',
          precio_actualizado: aereoUpdatedAt,
        },
        ...(expressBase > 0 ? [{
          id: 'tdi_express',
          nombre: 'Aéreo China (TDI Express)',
          descripcion: 'Servicio aéreo expreso China → México con tiempos de entrega más rápidos.',
          tiempo_estimado: '7-10 días',
          unidad: 'kg',
          precio_base_usd: expressBase,
          precio_base_mxn: expressBase * fxFor('tdi'),
          tipo_cambio: fxFor('tdi'),
          icono: '🚀',
          notas: 'Servicio expreso. Precio por kilogramo (mayor entre peso real y volumétrico).',
          precio_actualizado: expressUpdatedAt,
        }] : []),
        {
          id: 'pobox',
          nombre: 'PO Box USA',
          descripcion: 'Casillero en USA para compras en Amazon, eBay, tiendas online.',
          tiempo_estimado: '5-10 días',
          unidad: 'paquete',
          precio_base_usd: 39,
          precio_base_mxn: 39 * fxFor('pobox_usa'),
          tipo_cambio: fxFor('pobox_usa'),
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
          precio_base_mxn: dhlStandard * fxFor('dhl_monterrey'),
          tipo_cambio: fxFor('dhl_monterrey'),
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

// GET /api/public/maritime-tiers - Tabla de precios marítimo (Generico + StartUp)
app.get('/api/public/maritime-tiers', async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(`
      SELECT pc.name AS category, pt.min_cbm, pt.max_cbm, pt.price, pt.is_flat_fee, pt.notes
      FROM pricing_tiers pt
      JOIN pricing_categories pc ON pt.category_id = pc.id
      WHERE (pc.name IN ('Generico', 'StartUp') OR pc.name ILIKE 'FCL 40%') AND pt.is_active = TRUE
      ORDER BY pc.name DESC, pt.min_cbm ASC
    `);
    return res.json({ tiers: r.rows });
  } catch (err: any) {
    console.error('public maritime-tiers error', err);
    return res.status(500).json({ error: 'Error al obtener tarifas' });
  }
});

// POST /api/public/quote - Cotizador universal
app.post('/api/public/quote', async (req: Request, res: Response) => {
  try {
    const { servicio, largo, ancho, alto, peso, cantidad = 1, categoria, cbm: cbmInput, subservicio } = req.body;

    if (!servicio) {
      return res.status(400).json({ error: 'El tipo de servicio es requerido' });
    }

    // Tipo de cambio: por servicio desde exchange_rate_config (dinámico).
    //  maritimo → 'maritimo' · aereo → 'tdi' · pobox → 'pobox_usa' · dhl → 'dhl_monterrey'
    const fxKeyMap: Record<string, string> = {
      maritimo: 'maritimo',
      aereo: 'tdi',
      pobox: 'pobox_usa',
      dhl: 'dhl_monterrey',
    };
    const fxKey = fxKeyMap[servicio];
    let fxRate = 20.00;
    if (fxKey) {
      const fxCfg = await pool.query(
        `SELECT COALESCE(tipo_cambio_final, COALESCE(tipo_cambio_manual, ultimo_tc_api, 0) + COALESCE(sobreprecio, 0))::float AS tc
         FROM exchange_rate_config WHERE servicio = $1 AND estado = TRUE LIMIT 1`,
        [fxKey]
      );
      if (fxCfg.rows[0]?.tc) fxRate = parseFloat(fxCfg.rows[0].tc);
    }
    if (!fxRate || fxRate <= 0) {
      const fxRes = await pool.query('SELECT rate FROM exchange_rates ORDER BY created_at DESC LIMIT 1');
      fxRate = parseFloat(fxRes.rows[0]?.rate || '20.00');
    }

    let resultado: any = {
      servicio,
      tipo_cambio: fxRate,
      moneda: 'USD',
    };

    switch (servicio) {
      case 'maritimo': {
        // Subservicio: 'fcl_40' = contenedor completo 40 pies (sólo cantidad)
        if (subservicio === 'fcl_40') {
          const qty = Math.max(parseInt(cantidad as any) || 1, 1);
          const fclRes = await pool.query(`
            SELECT pt.price, pt.is_flat_fee, pc.name AS category
            FROM pricing_tiers pt
            JOIN pricing_categories pc ON pt.category_id = pc.id
            WHERE pc.name ILIKE 'FCL 40%' AND pt.is_active = true
            ORDER BY pt.min_cbm ASC LIMIT 1
          `);
          let unitUsd = 0;
          if (fclRes.rows.length > 0) {
            unitUsd = parseFloat(fclRes.rows[0].price);
          } else {
            return res.status(400).json({ error: 'No hay tarifa configurada para FCL 40 Pies' });
          }
          const precioUsd = unitUsd * qty;
          resultado = {
            ...resultado,
            subservicio: 'fcl_40',
            cantidad: qty,
            cbm_cobrable: (66 * qty).toFixed(2),
            categoria: 'FCL 40 Pies',
            tipo_calculo: 'contenedor',
            precio_unitario_usd: unitUsd.toFixed(2),
            precio_usd: precioUsd.toFixed(2),
            precio_mxn: (precioUsd * fxRate).toFixed(2),
            tiempo_estimado: '45-60 días',
          };
          break;
        }

        const cbmDirect = cbmInput !== undefined && cbmInput !== null && cbmInput !== '' ? parseFloat(cbmInput) : NaN;
        const hasDims = largo && ancho && alto;
        const pesoKg = parseFloat(peso) || 0;
        if (!hasDims && !(cbmDirect > 0) && !(pesoKg > 0)) {
          return res.status(400).json({ error: 'Dimensiones (largo, ancho, alto en cm), CBM o peso (kg) son requeridos' });
        }
        
        // Calcular CBM:
        //  - Si hay dimensiones + cantidad: cbm_calc = (L*A*A/1e6) * cantidad
        //  - Si hay CBM directo: cbm_directo (ya es total)
        //  - Si hay peso: cbm_peso = pesoKg / 500 (500 kg = 1 CBM)
        //  - Si están varios, se toma el MAYOR (protección al cobro real).
        const cbmCalc = (parseFloat(largo) > 0 && parseFloat(ancho) > 0 && parseFloat(alto) > 0)
          ? ((parseFloat(largo) * parseFloat(ancho) * parseFloat(alto)) / 1000000) * cantidad
          : 0;
        const cbmByWeight = pesoKg > 0 ? (pesoKg / 500) : 0;
        let cbm = Math.max(cbmDirect > 0 ? cbmDirect : 0, cbmCalc, cbmByWeight);
        const cbmOriginal = cbm;
        
        // Mínimo cobrable
        if (cbm < 0.01) cbm = 0.01;

        // Auto-detección de categoría: ≤0.75 CBM → StartUp, sino Generico.
        // Redondeo 0.76-0.99 → 1 sólo aplica para Generico.
        let cat = 'Generico';
        if (cbm <= 0.75) {
          cat = 'StartUp';
        } else {
          const decimal = cbm - Math.floor(cbm);
          if (decimal >= 0.76) cbm = Math.ceil(cbm);
        }

        // Obtener tarifa
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
          cbm_por_peso: cbmByWeight.toFixed(4),
          cbm_cobrable: cbm.toFixed(4),
          peso_real_kg: pesoKg > 0 ? pesoKg.toFixed(2) : null,
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

        // Obtener tarifa (markup vivo sobre air_routes.cost_per_kg_usd para L/G/F).
        // S (sensible) sigue siendo manual desde air_tariffs.
        // Subservicio: 'tdi_express' usa ruta code='TDI-EXPRES'; default = primera ruta activa NO express.
        const tariffType = categoria || 'G';
        const isExpress = subservicio === 'tdi_express';
        const markupByType: Record<string, number> = { L: 9, G: 8, F: 7 };
        let precioPorKg = 0;
        if (tariffType in markupByType) {
          const routeRes = await pool.query(
            isExpress
              ? `SELECT cost_per_kg_usd FROM air_routes WHERE is_active = true AND code = 'TDI-EXPRES' LIMIT 1`
              : `SELECT cost_per_kg_usd FROM air_routes WHERE is_active = true AND code <> 'TDI-EXPRES' ORDER BY id ASC LIMIT 1`
          );
          const cost = parseFloat(routeRes.rows[0]?.cost_per_kg_usd || '0');
          precioPorKg = cost > 0 ? cost + (markupByType[tariffType] ?? 8) : 8;
        } else {
          const tariffRes = await pool.query(
            isExpress
              ? `SELECT at.price_per_kg FROM air_tariffs at JOIN air_routes ar ON at.route_id = ar.id WHERE ar.is_active = true AND ar.code = 'TDI-EXPRES' AND at.tariff_type = $1 AND at.is_active = true LIMIT 1`
              : `SELECT at.price_per_kg FROM air_tariffs at JOIN air_routes ar ON at.route_id = ar.id WHERE ar.is_active = true AND ar.code <> 'TDI-EXPRES' AND at.tariff_type = $1 AND at.is_active = true ORDER BY ar.id ASC LIMIT 1`,
            [tariffType]
          );
          precioPorKg = parseFloat(tariffRes.rows[0]?.price_per_kg || '8');
        }
        const precioUsd = pesoCobrable * precioPorKg;

        resultado = {
          ...resultado,
          subservicio: isExpress ? 'tdi_express' : 'tdi_aereo',
          peso_real: pesoReal.toFixed(2),
          peso_volumetrico: pesoVol.toFixed(2),
          peso_cobrable: pesoCobrable.toFixed(2),
          cantidad,
          categoria: tariffType === 'L' ? 'Logotipo' : tariffType === 'S' ? 'Sensible' : tariffType === 'F' ? 'Flat' : 'Genérico',
          precio_por_kg: precioPorKg,
          precio_usd: precioUsd.toFixed(2),
          precio_mxn: (precioUsd * fxRate).toFixed(2),
          tiempo_estimado: isExpress ? '7-10 días' : '10-15 días',
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
// BRAND ASSETS (Logos corporativos centralizados)
// ============================================
import {
  listBrandAssets,
  getActiveBrandAssets,
  uploadBrandAsset,
  activateBrandAsset,
  deleteBrandAsset,
  resolveAssetUrl,
} from './brandAssetsController';

const brandAssetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido. Solo PNG, JPG, WEBP, SVG, GIF'));
  },
});

// Público — obtiene los logos activos para que cualquier frontend los consuma
app.get('/api/brand-assets/active', getActiveBrandAssets);
// Admin
app.get('/api/admin/brand-assets', authenticateToken, requireRole('super_admin'), listBrandAssets);
app.post('/api/admin/brand-assets/upload', authenticateToken, requireRole('super_admin'), brandAssetUpload.single('file'), uploadBrandAsset);
app.post('/api/admin/brand-assets/:id/activate', authenticateToken, requireRole('super_admin'), activateBrandAsset);
app.delete('/api/admin/brand-assets/:id', authenticateToken, requireRole('super_admin'), deleteBrandAsset);

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

// GET /api/uploads/signed-url?url=... — genera una pre-signed URL temporal para ver archivos privados de S3
app.get('/api/uploads/signed-url', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const rawUrl = String(req.query.url || '');
    if (!rawUrl) return (res as any).status(400).json({ error: 'Falta parámetro url' });
    const { signS3UrlIfNeeded } = await import('./s3Service');
    const signed = await signS3UrlIfNeeded(rawUrl, 3600);
    if (!signed) return (res as any).status(400).json({ error: 'URL inválida' });
    return (res as any).json({ signedUrl: signed });
  } catch (err: any) {
    console.error('[signed-url]', err.message);
    return (res as any).status(500).json({ error: 'No se pudo generar la URL firmada' });
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
app.post('/api/caja-chica/pagar-consolidaciones-multiple', authenticateToken, pagarMultiplesConsolidaciones);
app.delete('/api/caja-chica/transacciones/:id', authenticateToken, requireRole(ROLES.SUPER_ADMIN), deleteTransaccion);
app.patch('/api/caja-chica/transacciones/:id', authenticateToken, requireRole(ROLES.SUPER_ADMIN), updateTransaccion);

// ============================================
// DATOS FISCALES Y FACTURACIÓN CFDI 4.0
// Para emisión de facturas electrónicas con Facturama
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
app.patch('/api/cs/cartera/reasignar', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), reassignPackageClient);

// Resumen Financiero de Guía
app.get('/api/cs/guia/:servicio/:tracking/resumen', authenticateToken, getResumenFinancieroGuia);

// Abandono y Firma Digital
app.post('/api/cs/abandono/generar', authenticateToken, generarDocumentoAbandono);
app.get('/api/cs/abandono/listos-proceso', authenticateToken, getAbandonosListosProceso);

// Solicitudes de Descuento
app.post('/api/cs/descuentos/solicitar', authenticateToken, createDiscountRequest);
app.get('/api/cs/descuentos/pendientes', authenticateToken, getDiscountRequests);
app.get('/api/cs/descuentos/stats', authenticateToken, getDiscountStats);
app.post('/api/cs/descuentos/:id/resolver', authenticateToken, resolveDiscountRequest);

// Saldo a favor (con comprobante foto/PDF; requiere PIN de director para aprobar)
const saldoFavorUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
app.post('/api/cs/saldo-a-favor/solicitar', authenticateToken, saldoFavorUpload.single('proof'), handleMulterError, createSaldoFavorRequest);
app.get('/api/cs/saldo-a-favor/pendientes', authenticateToken, getSaldoFavorRequests);
app.get('/api/cs/saldo-a-favor/stats', authenticateToken, getSaldoFavorStats);
app.post('/api/cs/saldo-a-favor/:id/resolver', authenticateToken, resolveSaldoFavorRequest);

app.get('/api/firma-abandono/:token', getDocumentoAbandono); // Público
app.post('/api/firma-abandono/:token', firmarDocumentoAbandono); // Público

// Guías sin instrucciones por tipo de servicio (para Asignar Cliente en Centro de Soporte)
app.get('/api/cs/no-instructions', authenticateToken, requireMinLevel(ROLES.CUSTOMER_SERVICE), async (_req: AuthRequest, res: Response) => {
  try {
    const safeQuery = async (sql: string) => {
      try { return (await pool.query(sql)).rows; } catch { return []; }
    };

    const [pobox, tdi, aereo, maritimo, dhl, fcl] = await Promise.all([
      // PO Box USA — agrupa por master (strip sufijo -NNNN), muestra conteo de cajas
      safeQuery(`
        SELECT
          REGEXP_REPLACE(p.tracking_internal, '-\\d{1,4}$', '') AS tracking,
          COALESCE(u.box_id, p.box_id) AS box_id,
          COALESCE(u.full_name, p.box_id) AS client_name,
          COALESCE(MAX(adv.full_name), MAX(lc.asesor)) AS asesor,
          MIN(p.status) AS status,
          MIN(p.created_at) AS created_at,
          COUNT(*) AS total_boxes,
          BOOL_OR(p.user_id IS NULL AND p.box_id IS NOT NULL) AS is_legacy
        FROM packages p
        LEFT JOIN users u ON u.id = p.user_id
        LEFT JOIN users adv ON adv.id = u.advisor_id
        LEFT JOIN legacy_clients lc ON UPPER(TRIM(lc.box_id)) = UPPER(TRIM(COALESCE(u.box_id, p.box_id)))
        WHERE (p.service_type = 'POBOX_USA' OR (p.service_type IS NULL AND p.tracking_internal LIKE 'US-%'))
          AND p.status = 'received'
          AND p.delivery_address_id IS NULL
          AND p.assigned_address_id IS NULL
          AND (p.user_id IS NOT NULL OR p.box_id IS NOT NULL)
        GROUP BY REGEXP_REPLACE(p.tracking_internal, '-\\d{1,4}$', ''),
                 COALESCE(u.box_id, p.box_id),
                 COALESCE(u.full_name, p.box_id)
        ORDER BY MIN(p.created_at) DESC LIMIT 200
      `),
      // TDI Express — agrupa por master
      safeQuery(`
        SELECT
          REGEXP_REPLACE(p.tracking_internal, '-\\d{1,4}$', '') AS tracking,
          COALESCE(u.box_id, p.box_id) AS box_id,
          COALESCE(u.full_name, p.box_id) AS client_name,
          COALESCE(MAX(adv.full_name), MAX(lc.asesor)) AS asesor,
          MIN(p.status) AS status,
          MIN(p.created_at) AS created_at,
          COUNT(*) AS total_boxes,
          BOOL_OR(p.user_id IS NULL AND p.box_id IS NOT NULL) AS is_legacy
        FROM packages p
        LEFT JOIN users u ON u.id = p.user_id
        LEFT JOIN users adv ON adv.id = u.advisor_id
        LEFT JOIN legacy_clients lc ON UPPER(TRIM(lc.box_id)) = UPPER(TRIM(COALESCE(u.box_id, p.box_id)))
        WHERE p.service_type IN ('TDI_EXPRESS', 'TDI_AIR', 'tdi_express')
          AND p.status IN ('received', 'in_transit', 'received_mty')
          AND p.delivery_address_id IS NULL
          AND p.assigned_address_id IS NULL
          AND (p.user_id IS NOT NULL OR p.box_id IS NOT NULL)
        GROUP BY REGEXP_REPLACE(p.tracking_internal, '-\\d{1,4}$', ''),
                 COALESCE(u.box_id, p.box_id),
                 COALESCE(u.full_name, p.box_id)
        ORDER BY MIN(p.created_at) DESC LIMIT 200
      `),
      // Aéreo Chino — shipping_mark es el box_id del cliente para clientes legacy
      safeQuery(`
        SELECT cr.fno AS tracking,
          COALESCE(u.box_id, cr.shipping_mark) AS box_id,
          COALESCE(u.full_name, cr.shipping_mark) AS client_name,
          COALESCE(adv.full_name, lc.asesor) AS asesor,
          cr.status, cr.created_at,
          (cr.user_id IS NULL AND cr.shipping_mark IS NOT NULL) AS is_legacy
        FROM china_receipts cr
        LEFT JOIN users u ON u.id = cr.user_id
        LEFT JOIN users adv ON adv.id = u.advisor_id
        LEFT JOIN legacy_clients lc ON UPPER(TRIM(lc.box_id)) = UPPER(TRIM(COALESCE(u.box_id, cr.shipping_mark)))
        WHERE cr.status NOT IN ('delivered', 'cancelled')
          AND (cr.national_tracking IS NULL OR cr.national_tracking = '')
        ORDER BY cr.created_at DESC LIMIT 200
      `),
      // Marítimo China (LCL) — shipping_mark como fallback de box_id
      safeQuery(`
        SELECT mo.ordersn AS tracking,
          COALESCE(u.box_id, mo.shipping_mark) AS box_id,
          COALESCE(u.full_name, mo.shipping_mark) AS client_name,
          COALESCE(adv.full_name, lc.asesor) AS asesor,
          mo.status, mo.created_at,
          (mo.user_id IS NULL AND mo.shipping_mark IS NOT NULL) AS is_legacy
        FROM maritime_orders mo
        LEFT JOIN users u ON u.id = mo.user_id
        LEFT JOIN users adv ON adv.id = u.advisor_id
        LEFT JOIN legacy_clients lc ON UPPER(TRIM(lc.box_id)) = UPPER(TRIM(COALESCE(u.box_id, mo.shipping_mark)))
        WHERE mo.status NOT IN ('delivered', 'cancelled')
          AND mo.delivery_address_id IS NULL
          AND (mo.national_tracking IS NULL OR mo.national_tracking = '')
        ORDER BY mo.created_at DESC LIMIT 200
      `),
      // DHL Monterrey
      safeQuery(`
        SELECT COALESCE(ds.secondary_tracking, ds.inbound_tracking) AS tracking,
          u.box_id, u.full_name AS client_name,
          COALESCE(adv.full_name, lc.asesor) AS asesor,
          ds.status, ds.created_at
        FROM dhl_shipments ds
        LEFT JOIN users u ON u.id = ds.user_id
        LEFT JOIN users adv ON adv.id = u.advisor_id
        LEFT JOIN legacy_clients lc ON UPPER(TRIM(lc.box_id)) = UPPER(TRIM(u.box_id))
        WHERE ds.status NOT IN ('delivered', 'cancelled')
          AND ds.delivery_address_id IS NULL
        ORDER BY ds.created_at DESC LIMIT 200
      `),
      // FCL Contenedores
      safeQuery(`
        SELECT COALESCE(c.container_number, c.bl_number, c.reference_code::text) AS tracking,
          COALESCE(lc.box_id, u.box_id) AS box_id,
          COALESCE(lc.full_name, u.full_name) AS client_name,
          COALESCE(adv.full_name, lc.asesor) AS asesor,
          c.status, c.created_at
        FROM containers c
        LEFT JOIN legacy_clients lc ON lc.id = c.legacy_client_id
        LEFT JOIN users u ON u.id = c.client_user_id
        LEFT JOIN users adv ON adv.id = u.advisor_id
        WHERE c.status NOT IN ('delivered', 'cancelled')
          AND c.delivery_address_id IS NULL
        ORDER BY c.created_at DESC LIMIT 200
      `),
    ]);

    res.json({
      services: [
        { serviceType: 'POBOX_USA', label: 'PO Box USA', guides: pobox },
        { serviceType: 'TDI_EXPRESS', label: 'TDI Express', guides: tdi },
        { serviceType: 'AIR_CHN_MX', label: 'Aéreo Chino', guides: aereo },
        { serviceType: 'SEA_CHN_MX', label: 'Marítimo China', guides: maritimo },
        { serviceType: 'AA_DHL', label: 'DHL Monterrey', guides: dhl },
        { serviceType: 'FCL_CHN_MX', label: 'FCL Contenedores', guides: fcl },
      ],
    });
  } catch (err: any) {
    console.error('[CS-NO-INSTRUCTIONS]', err.message);
    res.status(500).json({ error: 'Error al obtener guías sin instrucciones' });
  }
});

// ============================================
// DOCUMENTOS LEGALES - Super Admin
// Gestión de contratos y avisos de privacidad
// ============================================
app.get('/api/legal-documents', authenticateToken, requireRole('super_admin', 'abogado'), getAllLegalDocuments);
// Lectura por tipo: solo `privacy_policy` (Empresa) y `service_contract`
// (Clientes) son PÚBLICOS — los necesitamos antes de tener token (el
// cliente lee la política en el sitio público y el contrato durante el
// step 4 del onboarding ANTES de tener cuenta). Los demás
// (advisor_privacy_notice, privacy_notice, gex_warranty_policy) son
// internos y se consultan ya con sesión iniciada.
const PUBLIC_LEGAL_TYPES = new Set(['privacy_policy', 'service_contract']);
app.get('/api/legal-documents/:type', (req, res, next) => {
  const type = String(req.params.type || '').toLowerCase();
  if (PUBLIC_LEGAL_TYPES.has(type)) return next();
  return authenticateToken(req as any, res, next);
}, getLegalDocumentByType);
app.post('/api/legal-documents', authenticateToken, requireRole('super_admin', 'abogado'), createLegalDocument);
app.put('/api/legal-documents/:id', authenticateToken, requireRole('super_admin', 'abogado'), updateLegalDocument);
app.get('/api/legal-documents/:id/history', authenticateToken, requireRole('super_admin', 'abogado'), getLegalDocumentHistory);
app.post('/api/legal-documents/:id/versions/:versionId/restore', authenticateToken, requireRole('super_admin', 'abogado'), restoreLegalDocumentVersion);

// Endpoints públicos para apps
app.get('/api/public/legal/service-contract', getPublicServiceContract);
app.get('/api/public/legal/privacy-notice', getPublicPrivacyNotice);
app.get('/api/public/legal/advisor-privacy-notice', getPublicAdvisorPrivacyNotice);

// URL pública web (entregax.app) para políticas de privacidad
app.get('/legal/privacy-policy', renderPublicPrivacyPoliciesPage);
app.get('/privacy-policy', renderPublicPrivacyPoliciesPage);

// URL pública para eliminación de cuenta (Google Play / App Store compliance)
app.get('/legal/account-deletion', renderAccountDeletionPage);
app.get('/eliminar-cuenta', renderAccountDeletionPage);
app.get('/account-deletion', renderAccountDeletionPage);

// NOTA: el manejador 404 (catchall) y el error handler global se MOVIERON
// al final del archivo (justo antes de httpServer.listen) para que las
// rutas registradas después de este punto — como las del SISTEMA DE PAGOS
// (xpay-toggle, entregax-payments-toggle, payment-status, etc.) — sean
// alcanzables. Antes el catchall vivía aquí y devolvía 404 a cualquier
// ruta declarada más abajo.

// Iniciar CRON Jobs para automatización
import { initCronJobs } from './cronJobs';

// Auto-migración: asegura columnas requeridas por features recientes (idempotente)
async function ensureRequiredColumns() {
  try {
    await pool.query(`
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS national_carrier TEXT;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS national_tracking TEXT;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS national_label_url TEXT;
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS national_shipping_cost NUMERIC(12,2);
      ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS national_carrier TEXT;
      ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS national_tracking TEXT;
      ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS national_label_url TEXT;
      ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS national_shipping_cost NUMERIC(12,2);
      ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(12,2);
      ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS assigned_cost_mxn NUMERIC(12,2);
      ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS saldo_pendiente NUMERIC(12,2);
      ALTER TABLE china_receipts ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(12,2);
      -- Credenciales del PORTAL Facturama (app.facturama.mx) para scraper de Cuentas por Pagar
      ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS facturama_portal_email TEXT;
      ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS facturama_portal_password TEXT;
      -- Facturapi.io (descarga de CFDIs recibidos / Cuentas por Pagar)
      ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS facturapi_api_key TEXT;
      ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS facturapi_environment TEXT DEFAULT 'live';
      ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS facturapi_enabled BOOLEAN DEFAULT FALSE;
      ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS facturapi_last_sync TIMESTAMP;
      ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS facturapi_last_sync_count INTEGER DEFAULT 0;
      -- Fuente de cada movimiento bancario (manual | syncfy | belvo)
      ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual';
      CREATE INDEX IF NOT EXISTS idx_bse_source ON bank_statement_entries(empresa_id, source);
      -- Orden intra-día: preserva la posición del movimiento dentro del paste (0=más antiguo del batch)
      ALTER TABLE bank_statement_entries ADD COLUMN IF NOT EXISTS seq INTEGER DEFAULT 0;
      -- Visibilidad en módulos: admin puede elegir dónde aparece cada empresa
      ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS show_in_cobranza BOOLEAN DEFAULT FALSE;
      ALTER TABLE fiscal_emitters ADD COLUMN IF NOT EXISTS show_in_contabilidad BOOLEAN DEFAULT TRUE;
      -- Marcar como visible en Cobranza las empresas que ya tenían openpay o servicio asignado
      UPDATE fiscal_emitters SET show_in_cobranza = TRUE
        WHERE show_in_cobranza = FALSE
          AND (openpay_configured = TRUE OR id IN (
            SELECT DISTINCT emitter_id FROM service_company_config WHERE emitter_id IS NOT NULL
          ));
      ALTER TABLE accounting_received_invoices ADD COLUMN IF NOT EXISTS facturapi_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_acc_recinv_facturapi ON accounting_received_invoices(facturapi_id);
      -- 📦 Vínculo estructural packages ↔ pqtx_shipments (fuente de verdad del costo de paquetería)
      -- Permite prorratear correctamente cuando varios paquetes viajan en la misma guía PQTX
      -- (sea master multipieza o consolidación de varios envíos en una guía).
      ALTER TABLE packages ADD COLUMN IF NOT EXISTS pqtx_shipment_id INTEGER;
      CREATE INDEX IF NOT EXISTS idx_packages_pqtx_shipment_id ON packages(pqtx_shipment_id);
      -- 🚛 Vehículo y chofer que cargaron el paquete (registrado al escanear en LoadingVan)
      -- Sin FK REFERENCES para evitar error si vehicles no tiene unique constraint en prod
      ALTER TABLE packages ADD COLUMN IF NOT EXISTS loaded_vehicle_id INTEGER;
      CREATE INDEX IF NOT EXISTS idx_packages_loaded_vehicle_id ON packages(loaded_vehicle_id);
      -- 🚛 Chofer asignado al paquete para entrega a domicilio
      ALTER TABLE packages ADD COLUMN IF NOT EXISTS assigned_driver_id INTEGER;
      -- 📋 Marítimo: confirmación de instrucciones sin inyectar dirección
      ALTER TABLE maritime_orders ADD COLUMN IF NOT EXISTS instructions_confirmed BOOLEAN DEFAULT FALSE;
      -- 📋 Instrucciones de entrega (dirección asignada por el cliente)
      ALTER TABLE packages ADD COLUMN IF NOT EXISTS needs_instructions BOOLEAN DEFAULT TRUE;
      ALTER TABLE packages ADD COLUMN IF NOT EXISTS instructions_assigned_at TIMESTAMP;
      ALTER TABLE packages ADD COLUMN IF NOT EXISTS instructions_assigned_by_id INTEGER;
      ALTER TABLE packages ADD COLUMN IF NOT EXISTS delivery_address_id INTEGER;
      ALTER TABLE packages ADD COLUMN IF NOT EXISTS assigned_address_id INTEGER;

      -- 🚛 Info de la ruta hacia destino (operador, placas, teléfono, empresa) para contenedores FCL
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS driver_name TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS driver_plates TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS driver_phone TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS driver_company TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS route_dispatched_at TIMESTAMP;
      -- 👁️ Monitorista asignado al contenedor (rol monitoreo)
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS monitor_user_id INTEGER REFERENCES users(id);
      CREATE INDEX IF NOT EXISTS idx_containers_monitor_user_id ON containers(monitor_user_id);

      -- 📜 Historial de cambios de status del contenedor (auditoría completa)
      CREATE TABLE IF NOT EXISTS container_status_history (
        id SERIAL PRIMARY KEY,
        container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
        previous_status TEXT,
        new_status TEXT NOT NULL,
        driver_name TEXT,
        driver_plates TEXT,
        driver_phone TEXT,
        notes TEXT,
        changed_by_user_id INTEGER,
        changed_by_name TEXT,
        changed_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE container_status_history ADD COLUMN IF NOT EXISTS driver_company TEXT;
      CREATE INDEX IF NOT EXISTS idx_container_status_history_container ON container_status_history(container_id);
      CREATE INDEX IF NOT EXISTS idx_container_status_history_changed_at ON container_status_history(changed_at DESC);
      -- 📍 Instrucciones de entrega para contenedores FCL (dirección, paquetería, notas)
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS delivery_address_id INTEGER REFERENCES addresses(id);
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS national_carrier TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS delivery_notes TEXT;
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS national_shipping_cost NUMERIC(12,2) DEFAULT 0;

      -- 🌉 API ELP — proveedor externo de trámite/CBP en USA
      -- Flag por ruta: si la ruta se comunica con el proveedor ELP.
      ALTER TABLE maritime_routes ADD COLUMN IF NOT EXISTS elp_enabled BOOLEAN DEFAULT false;
      -- Marca de cuándo se notificó al proveedor ELP (para no reenviar el correo).
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS elp_notified_at TIMESTAMPTZ;
      -- Auditoría de interacciones con el proveedor ELP (GET documentos, pulsos de status).
      CREATE TABLE IF NOT EXISTS elp_event_logs (
        id SERIAL PRIMARY KEY,
        container_id INTEGER REFERENCES containers(id) ON DELETE SET NULL,
        container_number TEXT,
        direction TEXT NOT NULL,            -- 'inbound_status' | 'outbound_docs' | 'email_sent'
        event TEXT,                         -- p.ej. status recibido, 'documents_fetched'
        payload JSONB,
        status_code INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_elp_event_logs_container ON elp_event_logs(container_id);
      CREATE INDEX IF NOT EXISTS idx_elp_event_logs_created_at ON elp_event_logs(created_at DESC);
      -- Config editable de ELP: destinatarios del correo de aviso (coma-separado).
      CREATE TABLE IF NOT EXISTS elp_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        notify_emails TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      INSERT INTO elp_settings (id, notify_emails) VALUES (1, NULL) ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✅ [STARTUP] Columnas de paquetería nacional verificadas');

    // ====================================================================
    // 📦 ROUTE BLOCKS — Bloques de gastos de ruta vinculados a contenedores
    // ====================================================================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS petty_cash_route_blocks (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'open',
        notes TEXT,
        total_allocated_mxn NUMERIC(12,2),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finalized_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS petty_cash_route_block_containers (
        id SERIAL PRIMARY KEY,
        block_id INT NOT NULL REFERENCES petty_cash_route_blocks(id) ON DELETE CASCADE,
        container_id INT NOT NULL REFERENCES containers(id),
        UNIQUE(block_id, container_id)
      );
      ALTER TABLE petty_cash_movements ADD COLUMN IF NOT EXISTS route_block_id INT REFERENCES petty_cash_route_blocks(id);
    `);
    console.log('✅ [STARTUP] Route blocks de caja chica verificados');

    // ====================================================================
    // 🚛 MÓDULO CONTROL DE TRANSPORTES
    // ====================================================================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proveedores_transporte (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        referencia TEXT,
        contacto_nombre TEXT,
        contacto_email TEXT,
        contacto_telefono TEXT,
        banco TEXT,
        cuenta_bancaria TEXT,
        clabe TEXT,
        notas TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bolsas_transporte (
        id SERIAL PRIMARY KEY,
        proveedor_id INT NOT NULL REFERENCES proveedores_transporte(id),
        monto_original NUMERIC(12,2) NOT NULL,
        fecha_pago DATE NOT NULL,
        comprobante_url TEXT,
        factura_url TEXT,
        referencia_pago TEXT,
        numero_operacion TEXT,
        banco_origen TEXT,
        tipo_pago TEXT NOT NULL DEFAULT 'transferencia',
        estado TEXT NOT NULL DEFAULT 'activo',
        notas TEXT,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS transporte_referencias (
        id SERIAL PRIMARY KEY,
        bolsa_id INT NOT NULL REFERENCES bolsas_transporte(id) ON DELETE CASCADE,
        referencia TEXT NOT NULL,
        monto NUMERIC(12,2) NOT NULL,
        estado TEXT NOT NULL DEFAULT 'aplicado',
        container_id INT REFERENCES containers(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE container_costs ADD COLUMN IF NOT EXISTS transport_invoice_pdf TEXT;
    `);
    console.log('✅ [STARTUP] Módulo Transportes verificado');

    // ====================================================================
    // ⚓ MÓDULO CONTROL DE DEMORAS
    // ====================================================================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proveedores_demora (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        referencia TEXT,
        contacto_nombre TEXT,
        contacto_email TEXT,
        contacto_telefono TEXT,
        banco TEXT,
        cuenta_bancaria TEXT,
        clabe TEXT,
        notas TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bolsas_demora (
        id SERIAL PRIMARY KEY,
        proveedor_id INT NOT NULL REFERENCES proveedores_demora(id),
        monto_original NUMERIC(12,2) NOT NULL,
        fecha_pago DATE NOT NULL,
        comprobante_url TEXT,
        factura_url TEXT,
        referencia_pago TEXT,
        numero_operacion TEXT,
        banco_origen TEXT,
        tipo_pago TEXT NOT NULL DEFAULT 'transferencia',
        estado TEXT NOT NULL DEFAULT 'activo',
        notas TEXT,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS demora_referencias (
        id SERIAL PRIMARY KEY,
        bolsa_id INT NOT NULL REFERENCES bolsas_demora(id) ON DELETE CASCADE,
        referencia TEXT NOT NULL,
        monto NUMERIC(12,2) NOT NULL,
        estado TEXT NOT NULL DEFAULT 'aplicado',
        container_id INT REFERENCES containers(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE container_costs ADD COLUMN IF NOT EXISTS demurrage_invoice_pdf TEXT;
    `);
    console.log('✅ [STARTUP] Módulo Demoras verificado');

    // ====================================================================
    // 🤖 AUTO-INSTRUCCIONES DE ENTREGA
    // Trigger que aplica la dirección default del cliente al instante en que
    // un paquete entra al sistema con user_id + service_type. Las direcciones
    // tienen `default_for_service` con valores como 'aereo', 'maritimo',
    // 'po_box', 'mty' (separados por coma), y carrier_config con las
    // paqueterías por servicio. El trigger sólo escribe assigned_address_id
    // si está NULL — nunca pisa una asignación manual.
    // ====================================================================
    await pool.query(`
      CREATE OR REPLACE FUNCTION xpay_apply_default_address_pkg() RETURNS trigger AS $$
      DECLARE
        v_cat TEXT;
        v_addr_id INT;
      BEGIN
        IF NEW.assigned_address_id IS NOT NULL OR NEW.user_id IS NULL THEN
          RETURN NEW;
        END IF;
        v_cat := CASE
          WHEN NEW.service_type IN ('AIR_CHN_MX','china_air','aereo','air') THEN 'aereo'
          WHEN NEW.service_type IN ('SEA_CHN_MX','china_sea','maritime','maritimo','fcl') THEN 'maritimo'
          WHEN NEW.service_type IN ('POBOX_USA','usa_pobox','po_box','pobox','usa') THEN 'po_box'
          WHEN NEW.service_type IN ('AA_DHL','dhl','mty') THEN 'mty'
          ELSE NULL
        END;
        IF v_cat IS NULL THEN RETURN NEW; END IF;
        SELECT id INTO v_addr_id
          FROM addresses
          WHERE user_id = NEW.user_id
            AND default_for_service IS NOT NULL
            AND (
              default_for_service ILIKE '%' || v_cat || '%'
              OR default_for_service ILIKE '%all%'
            )
          ORDER BY is_default DESC, created_at DESC
          LIMIT 1;
        IF v_addr_id IS NOT NULL THEN
          NEW.assigned_address_id := v_addr_id;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS xpay_pkg_default_addr_trg ON packages;
      CREATE TRIGGER xpay_pkg_default_addr_trg
        BEFORE INSERT OR UPDATE OF user_id, service_type ON packages
        FOR EACH ROW EXECUTE FUNCTION xpay_apply_default_address_pkg();

      CREATE OR REPLACE FUNCTION xpay_apply_default_address_mar() RETURNS trigger AS $$
      DECLARE
        v_addr_id INT;
        v_user_id INT;
      BEGIN
        IF NEW.delivery_address_id IS NOT NULL THEN RETURN NEW; END IF;
        v_user_id := NEW.user_id;
        IF v_user_id IS NULL AND NEW.shipping_mark IS NOT NULL THEN
          SELECT id INTO v_user_id FROM users WHERE UPPER(box_id) = UPPER(NEW.shipping_mark) LIMIT 1;
        END IF;
        IF v_user_id IS NULL THEN RETURN NEW; END IF;
        SELECT id INTO v_addr_id
          FROM addresses
          WHERE user_id = v_user_id
            AND default_for_service IS NOT NULL
            AND (default_for_service ILIKE '%maritimo%' OR default_for_service ILIKE '%all%')
          ORDER BY is_default DESC, created_at DESC
          LIMIT 1;
        IF v_addr_id IS NOT NULL THEN
          NEW.delivery_address_id := v_addr_id;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS xpay_mar_default_addr_trg ON maritime_orders;
      CREATE TRIGGER xpay_mar_default_addr_trg
        BEFORE INSERT OR UPDATE OF user_id, shipping_mark ON maritime_orders
        FOR EACH ROW EXECUTE FUNCTION xpay_apply_default_address_mar();
    `);
    console.log('✅ [STARTUP] Triggers de auto-instrucciones (packages + maritime_orders) creados');

    // Trigger: cuando una hija se marca delivered → master también delivered
    await pool.query(`
      CREATE OR REPLACE FUNCTION propagate_delivered_to_master() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'delivered' AND NEW.master_id IS NOT NULL THEN
          UPDATE packages SET status = 'delivered', updated_at = NOW()
          WHERE id = NEW.master_id AND status != 'delivered';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_child_delivered_to_master ON packages;
      CREATE TRIGGER trg_child_delivered_to_master
        AFTER INSERT OR UPDATE OF status ON packages
        FOR EACH ROW EXECUTE FUNCTION propagate_delivered_to_master();
    `);
    console.log('✅ [STARTUP] Trigger propagate_delivered_to_master creado');

    // Backfill: aplica las auto-instrucciones a los paquetes/órdenes que
    // ya estaban en el sistema sin dirección asignada y cuyo dueño tiene
    // default_for_service configurado. Idempotente — sólo afecta las que
    // tienen assigned_address_id NULL.
    try {
      const bp = await pool.query(`
        UPDATE packages p
          SET assigned_address_id = sub.addr_id
        FROM (
          SELECT p.id AS pkg_id, a.id AS addr_id
          FROM packages p
          JOIN addresses a ON a.user_id = p.user_id
          WHERE p.assigned_address_id IS NULL
            AND p.user_id IS NOT NULL
            AND a.default_for_service IS NOT NULL
            AND (
              (p.service_type IN ('AIR_CHN_MX','china_air','aereo','air')
                 AND a.default_for_service ILIKE '%aereo%')
              OR (p.service_type IN ('SEA_CHN_MX','china_sea','maritime','maritimo','fcl')
                 AND a.default_for_service ILIKE '%maritimo%')
              OR (p.service_type IN ('POBOX_USA','usa_pobox','po_box','pobox','usa')
                 AND a.default_for_service ILIKE '%po_box%')
              OR (p.service_type IN ('AA_DHL','dhl','mty')
                 AND a.default_for_service ILIKE '%mty%')
              OR a.default_for_service ILIKE '%all%'
            )
          ORDER BY p.id, a.is_default DESC, a.created_at DESC
        ) sub
        WHERE p.id = sub.pkg_id;
      `);
      const bm = await pool.query(`
        UPDATE maritime_orders mo
          SET delivery_address_id = sub.addr_id
        FROM (
          SELECT mo.id AS mo_id, a.id AS addr_id
          FROM maritime_orders mo
          JOIN users u ON (u.id = mo.user_id OR UPPER(u.box_id) = UPPER(mo.shipping_mark))
          JOIN addresses a ON a.user_id = u.id
          WHERE mo.delivery_address_id IS NULL
            AND a.default_for_service IS NOT NULL
            AND (a.default_for_service ILIKE '%maritimo%' OR a.default_for_service ILIKE '%all%')
          ORDER BY mo.id, a.is_default DESC, a.created_at DESC
        ) sub
        WHERE mo.id = sub.mo_id;
      `);
      console.log(`✅ [STARTUP] Backfill auto-instrucciones: ${bp.rowCount || 0} paquetes, ${bm.rowCount || 0} órdenes marítimas`);
    } catch (e) {
      console.warn('⚠️ [STARTUP] Backfill auto-instrucciones falló (puede correrse manualmente):', (e as Error).message);
    }

    // Backfill: maritime_orders.goods_num desde summary_boxes cuando el SUMMARY
    // que el operador subió en bodega tiene un número de cajas mayor que lo que
    // reportó el API de China. Sólo afecta filas donde goods_num quedó en 1
    // (default vacío) o donde summary_boxes > goods_num. Idempotente.
    try {
      const moBackfill = await pool.query(`
        UPDATE maritime_orders mo
          SET goods_num = sub.boxes,
              weight = COALESCE(NULLIF(sub.weight, 0), mo.weight),
              volume = COALESCE(NULLIF(sub.volume, 0), mo.volume),
              updated_at = NOW()
        FROM (
          SELECT id,
                 GREATEST(COALESCE(summary_boxes, 0), COALESCE(goods_num, 0))::int AS boxes,
                 GREATEST(COALESCE(summary_weight, 0), COALESCE(weight, 0))::numeric AS weight,
                 GREATEST(COALESCE(summary_volume, 0), COALESCE(volume, 0))::numeric AS volume
          FROM maritime_orders
          WHERE COALESCE(summary_boxes, 0) > COALESCE(goods_num, 0)
        ) sub
        WHERE mo.id = sub.id
          AND sub.boxes > 0
          AND mo.goods_num IS DISTINCT FROM sub.boxes;
      `);
      if (moBackfill.rowCount && moBackfill.rowCount > 0) {
        console.log(`📦 [STARTUP] maritime_orders.goods_num backfill desde SUMMARY: ${moBackfill.rowCount}`);
      }
    } catch (e: any) {
      console.warn('[STARTUP] No se pudo backfillear goods_num desde summary_boxes:', e.message);
    }

    // Backfill: vincular packages.pqtx_shipment_id usando national_tracking → pqtx_shipments.tracking_number
    try {
      const linked = await pool.query(`
        UPDATE packages p
        SET pqtx_shipment_id = ps.id
        FROM pqtx_shipments ps
        WHERE p.pqtx_shipment_id IS NULL
          AND p.national_tracking IS NOT NULL
          AND p.national_tracking = ps.tracking_number
      `);
      if (linked.rowCount && linked.rowCount > 0) {
        console.log(`🔗 [STARTUP] packages vinculados a pqtx_shipments: ${linked.rowCount}`);
      }
    } catch (e: any) {
      console.warn('[STARTUP] No se pudo backfillear pqtx_shipment_id:', e.message);
    }

    // Limpieza idempotente: borrar CLABEs simuladas legacy (formato 646180XXXXXXXXXXX)
    // que se generaban con generateVirtualClabe() antes de desactivar la simulación.
    const cleanup = await pool.query(
      `UPDATE users SET virtual_clabe = NULL
       WHERE virtual_clabe IS NOT NULL
         AND virtual_clabe ~ '^646180[0-9]{11}$'`
    );
    if (cleanup.rowCount && cleanup.rowCount > 0) {
      console.log(`🧹 [STARTUP] CLABEs virtuales simuladas removidas: ${cleanup.rowCount}`);
    }
    // Sembrar paneles de Servicio a Cliente
    await pool.query(`
      INSERT INTO admin_panels (panel_key, panel_name, category, icon, description, is_active, sort_order) VALUES
        ('cs_cartera',       'Ajustes y Abandonos', 'customer_service', 'AccountBalanceWallet', 'Cargos, descuentos, cobranza y abandono de mercancía', TRUE, 4),
        ('cs_delayed',       'Guías con Retraso',   'customer_service', 'LocalShipping',        'Paquetes cuya consolidación llegó a MTY sin ellos',    TRUE, 5),
        ('cs_assign_client', 'Asignar Cliente',     'customer_service', 'AssignmentInd',        'Guías en bodega PO Box sin cliente asignado',          TRUE, 6)
      ON CONFLICT (panel_key) DO UPDATE SET
        panel_name  = EXCLUDED.panel_name,
        description = EXCLUDED.description,
        icon        = EXCLUDED.icon,
        sort_order  = EXCLUDED.sort_order
    `);
    // Sembrar panel de Contabilidad en admin_panels si no existe
    await pool.query(`
      INSERT INTO admin_panels (panel_key, panel_name, category, icon, description, is_active, sort_order)
      VALUES ('accounting_hub', 'Contabilidad', 'Contabilidad', 'receipt_long', 'Portal contable multi-empresa: facturas, productos, categorías', TRUE, 10)
      ON CONFLICT (panel_key) DO NOTHING
    `);
    // Sembrar panel de Caja Chica Sucursales
    await pool.query(`
      INSERT INTO admin_panels (panel_key, panel_name, category, icon, description, is_active, sort_order)
      VALUES ('admin_petty_cash', 'Caja Chica Sucursales', 'admin', 'LocalAtm', 'Fondeo, anticipos, viáticos y comprobaciones por sucursal', TRUE, 22)
      ON CONFLICT (panel_key) DO UPDATE SET
        panel_name = EXCLUDED.panel_name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon,
        category = EXCLUDED.category
    `);
    // Alinear el nombre del panel de operaciones mx_cedis con la herramienta del
    // hub: esa ubicación es "DHL Monterrey" (Liberación AA DHL), no "Bodega CEDIS".
    await pool.query(`
      UPDATE admin_panels
      SET panel_name = 'DHL Monterrey',
          description = 'Liberación AA DHL y operaciones CEDIS Monterrey'
      WHERE panel_key = 'ops_mx_cedis'
    `);
    // Sembrar panel de Consolidaciones PO Box
    await pool.query(`
      INSERT INTO admin_panels (panel_key, panel_name, category, icon, description, is_active, sort_order)
      VALUES ('pobox_consolidaciones', 'Consolidaciones PO Box', 'admin', 'Inventory', 'Gestión de pagos a proveedores PO Box: órdenes de pago y pagos referenciados', TRUE, 23)
      ON CONFLICT (panel_key) DO UPDATE SET
        panel_name = EXCLUDED.panel_name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon,
        category = EXCLUDED.category
    `);
    // Sembrar módulos del panel admin_usa_pobox en admin_panel_modules (idempotente)
    await pool.query(`
      INSERT INTO admin_panel_modules (panel_key, module_key, module_name, description, icon, sort_order, is_active)
      VALUES
        ('admin_usa_pobox', 'pobox_rates',           'Tarifas PO Box',    'Configuración de tarifas por volumen (CBM) y tipo de cambio',          'PriceChange',   1, TRUE),
        ('admin_usa_pobox', 'suppliers',             'Proveedores',       'Gestión de proveedores y consolidaciones USA',                          'LocalShipping', 2, TRUE),
        ('admin_usa_pobox', 'pobox_consolidaciones', 'Consolidaciones',   'Pagos a proveedores PO Box: órdenes de pago y referencias',             'Inventory',     3, TRUE),
        ('admin_usa_pobox', 'invoicing',             'Facturación',       'Emisión y gestión de facturas PO Box USA',                              'Receipt',       4, TRUE),
        ('admin_usa_pobox', 'instructions',          'Instrucciones',     'Configuración de instrucciones de entrega por cliente',                 'Description',   5, TRUE),
        ('admin_usa_pobox', 'carrier_options',       'Opciones de Envío', 'Paqueterías nacionales disponibles para clientes PO Box',               'LocalShipping', 6, TRUE)
      ON CONFLICT (panel_key, module_key) DO NOTHING
    `).catch(() => {});

    // Tabla de permisos de contadores por empresa fiscal
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accountant_emitter_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        fiscal_emitter_id INTEGER NOT NULL REFERENCES fiscal_emitters(id) ON DELETE CASCADE,
        can_view BOOLEAN NOT NULL DEFAULT TRUE,
        can_emit_invoice BOOLEAN NOT NULL DEFAULT TRUE,
        can_cancel_invoice BOOLEAN NOT NULL DEFAULT FALSE,
        granted_by INTEGER REFERENCES users(id),
        granted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (user_id, fiscal_emitter_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_aep_user ON accountant_emitter_permissions(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_aep_emitter ON accountant_emitter_permissions(fiscal_emitter_id)`);

    // Versionado de documentos legales: cada vez que un super_admin/abogado
    // edita un documento, archivamos la versión que estaba activa con todo
    // su contenido. Permite ver el histórico y restaurar versiones previas
    // — crítico para documentos con valor legal donde no podemos perder
    // ningún cambio.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS legal_document_versions (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL,
        document_type VARCHAR(64) NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        version INTEGER NOT NULL,
        saved_by INTEGER REFERENCES users(id),
        saved_at TIMESTAMP NOT NULL DEFAULT NOW(),
        replaced_by_user_id INTEGER REFERENCES users(id),
        replaced_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ldv_doc_version ON legal_document_versions(document_id, version DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ldv_doc_saved_at ON legal_document_versions(document_id, saved_at DESC)`);
    // Índices para acelerar queries de ruta del repartidor.
    // Antes usábamos `to_jsonb(packages)->>'col'` para tolerar columnas
    // ausentes, pero PostgreSQL rechaza esa expresión en índices porque
    // `to_jsonb(row)` no es IMMUTABLE (depende del row type). En su lugar
    // verificamos qué columnas existen y creamos índices simples (más
    // baratos y sin warning al arranque).
    try {
      const colRes = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name='packages'`
      );
      const cols = new Set<string>(colRes.rows.map((r: any) => r.column_name));

      // CONCURRENTLY no puede correr dentro de una transacción; los pool.query()
      // de pg corren sin tx implícita salvo BEGIN, así que está OK.
      if (cols.has('delivery_status')) {
        await pool.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_packages_delivery_status
            ON packages (delivery_status)`);
      } else if (cols.has('status')) {
        await pool.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_packages_status
            ON packages (status)`);
      }
      if (cols.has('assigned_driver_id')) {
        await pool.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_packages_assigned_driver
            ON packages (assigned_driver_id) WHERE assigned_driver_id IS NOT NULL`);
      }
      if (cols.has('master_id')) {
        await pool.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_packages_master_id
            ON packages (master_id) WHERE master_id IS NOT NULL`);
      }
      await pool.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_packages_updated_at
          ON packages (updated_at DESC)`);
      console.log('✅ [STARTUP] Índices packages verificados');
    } catch (e: any) {
      // 23505 = unique_violation, 42P07 = relation already exists, ya están creados.
      // 0A000 si CONCURRENTLY está en tx (no debería pasar aquí).
      console.warn('⚠️ [STARTUP] Índices packages (puede estar ya corriendo o sin permisos):', e.message?.slice(0, 120));
    }
    // Columnas de usuario que pueden no existir en instancias antiguas
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gex_auto_enabled BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS warehouse_location VARCHAR(100)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_id INTEGER`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMP`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_employee_onboarded BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE`);
    // Preferencias de notificaciones
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_whatsapp BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_push BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_air BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_maritime BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_dhl BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_pobox BOOLEAN DEFAULT TRUE`);
    // Columna code en branches (puede no existir en instancias antiguas)
    await pool.query(`ALTER TABLE branches ADD COLUMN IF NOT EXISTS code VARCHAR(50)`);
    // Facturación CFDI
    await pool.query(`ALTER TABLE pobox_payments ADD COLUMN IF NOT EXISTS factura_archivada BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS fiscal_email VARCHAR(255)`);
    await pool.query(`ALTER TABLE facturas_emitidas ALTER COLUMN currency TYPE VARCHAR(10)`);
    await pool.query(`ALTER TABLE facturas_emitidas ALTER COLUMN payment_form TYPE VARCHAR(10)`);
    await pool.query(`ALTER TABLE facturas_emitidas ALTER COLUMN serie TYPE VARCHAR(50)`);
    await pool.query(`ALTER TABLE facturas_emitidas ADD COLUMN IF NOT EXISTS payment_method VARCHAR(10)`);
    await pool.query(`ALTER TABLE syncfy_credentials ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP`);
    await pool.query(`ALTER TABLE syncfy_credentials ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
    // Auto-sync diferido: cuando el usuario re-autentica un banco (BBVA QR / 2FA),
    // Syncfy tarda unos minutos en correr el primer fetch_jobs y dejar disponibles
    // los movimientos. Marcamos next_auto_sync_at = NOW() + 10min y un cron lo
    // procesa cuando ya pasó la hora. Al ejecutarse el sync se limpia (NULL).
    await pool.query(`ALTER TABLE syncfy_credentials ADD COLUMN IF NOT EXISTS next_auto_sync_at TIMESTAMP`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_syncfy_credentials_next_auto_sync
        ON syncfy_credentials (next_auto_sync_at) WHERE next_auto_sync_at IS NOT NULL`);
  } catch (err: any) {
    console.error('⚠️ [STARTUP] Error asegurando columnas:', err.message);
  }
}

// One-shot: resetear verificación de la cuenta de pruebas
// jesuscampos@entregax.com.mx para que rehaga el onboarding (incluye
// re-aceptar T&C). Idempotente — guarda marcador en system_configurations
// para no volver a correr en futuros boots. En su propia función
// (separada de ensureRequiredColumns) para que no dependa de que el
// resto de la auto-migración haya tenido éxito.
async function runOneShotResetJesusCampos() {
  try {
    const marker = await pool.query(
      `SELECT 1 FROM system_configurations WHERE config_key = 'reset_jesuscampos_2026_05_09' AND is_active = TRUE`
    );
    if (marker.rows.length > 0) return;
    const r = await pool.query(
      `UPDATE users SET
         verification_status = 'not_started',
         is_verified = false,
         ine_front_url = NULL,
         ine_back_url = NULL,
         selfie_url = NULL,
         signature_url = NULL,
         verification_submitted_at = NULL,
         ai_verification_reason = NULL,
         rejection_reason = NULL
       WHERE LOWER(email) = LOWER('jesuscampos@entregax.com.mx')
       RETURNING id`
    );
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('reset_jesuscampos_2026_05_09', $1::jsonb, 'One-shot reset onboarding cuenta pruebas', TRUE)
       ON CONFLICT (config_key) DO UPDATE SET config_value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify({ ran_at: new Date().toISOString(), affected: r.rowCount || 0 })]
    );
    console.log(`🔄 [STARTUP] Reset onboarding jesuscampos: ${r.rowCount} fila(s) actualizadas`);
  } catch (e: any) {
    console.warn('[STARTUP] reset jesuscampos falló:', e.message);
  }
}

// ============================================================
// SISTEMA DE PAGOS — Control global (Super Admin)
// ============================================================

// GET /api/system/payment-status — público (sin auth), devuelve estado de cada sistema de pago
// Si el request trae JWT de un usuario tester (TESTER_EMAILS), se devuelven todos
// los toggles forzados a ENABLED y maintenance_mode = false para que el usuario sea
// inmune a apagones globales del Sistema de Pagos.
app.get('/api/system/payment-status', async (req: Request, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT config_key, config_value
       FROM system_configurations
       WHERE config_key IN ('payments_enabled', 'xpay_enabled', 'entregax_payments_enabled', 'gex_enabled', 'advisor_instructions_enabled', 'advisor_payment_order_enabled', 'advisor_xpay_enabled', 'require_payment_to_load', 'require_label_to_load', 'require_instructions_to_load_pobox', 'external_sync_enabled', 'cajito_enabled', 'maintenance_mode', 'entregax_payment_query_enabled', 'facturas_enabled')
         AND is_active = TRUE`
    );
    const byKey: Record<string, any> = {};
    r.rows.forEach((row: any) => { byKey[row.config_key] = row.config_value; });

    // xpay_enabled: controla botón X-Pay (x-pay.direct)
    const xpayEnabled = byKey['xpay_enabled'] !== undefined
      ? byKey['xpay_enabled']?.enabled !== false
      : (byKey['payments_enabled']?.enabled !== false); // fallback al toggle global

    // entregax_payments_enabled: controla botón Pagar de EntregaX (master switch)
    const entregaxPaymentsEnabled = byKey['entregax_payments_enabled'] !== undefined
      ? byKey['entregax_payments_enabled']?.enabled !== false
      : (byKey['payments_enabled']?.enabled !== false); // fallback al toggle global

    // entregax_payments_by_service: control granular por servicio (pobox, maritimo, aereo, tdi_express, dhl)
    // Si no existe la clave, todos los servicios heredan del master switch.
    const rawByService = byKey['entregax_payments_enabled']?.by_service;
    const entregaxPaymentsByService = {
      pobox:       rawByService?.pobox        !== false,
      maritimo:    rawByService?.maritimo     !== false,
      aereo:       rawByService?.aereo        !== false,
      tdi_express: rawByService?.tdi_express  !== false,
      dhl:         rawByService?.dhl          !== false,
    };

    // gex_enabled: controla la contratación de Garantía Extendida (GEX).
    // Por defecto TRUE — solo se desactiva si el super_admin lo apaga.
    const gexEnabled = byKey['gex_enabled'] !== undefined
      ? byKey['gex_enabled']?.enabled !== false
      : true;

    // facturas_enabled: controla la facturación AUTOMÁTICA (timbrado inmediato)
    // master + por servicio. OFF → las solicitudes van a "Pendientes por Timbrar".
    // Default TRUE (auto). Aplica a TODOS los usuarios, incluso testers (S1).
    const facturasEnabled = byKey['facturas_enabled'] !== undefined
      ? byKey['facturas_enabled']?.enabled !== false
      : true;
    const rawFacturasByService = byKey['facturas_enabled']?.by_service;
    const facturasByService = {
      pobox:       rawFacturasByService?.pobox        !== false,
      maritimo:    rawFacturasByService?.maritimo     !== false,
      aereo:       rawFacturasByService?.aereo        !== false,
      tdi_express: rawFacturasByService?.tdi_express  !== false,
      dhl:         rawFacturasByService?.dhl          !== false,
    };

    // advisor_instructions_enabled: controla botón lapiz y edición de instrucciones/direcciones en panel asesor
    const advisorInstructionsEnabled = byKey['advisor_instructions_enabled'] !== undefined
      ? byKey['advisor_instructions_enabled']?.enabled !== false
      : true;

    // advisor_payment_order_enabled: controla la función Orden de Pago (tab web + botón móvil)
    const advisorPaymentOrderEnabled = byKey['advisor_payment_order_enabled'] !== undefined
      ? byKey['advisor_payment_order_enabled']?.enabled !== false
      : true;

    // advisor_xpay_enabled: controla la función Xpay para asesores (default FALSE
    // — es una feature nueva que se habilita explícitamente)
    const advisorXpayEnabled = byKey['advisor_xpay_enabled']?.enabled === true;

    // require_payment_to_load: si está desactivado, el chofer puede cargar sin que el cliente haya pagado
    const requirePaymentToLoad = byKey['require_payment_to_load'] !== undefined
      ? byKey['require_payment_to_load']?.enabled !== false
      : true;

    // require_label_to_load: si está desactivado, el chofer puede cargar sin etiqueta impresa
    const requireLabelToLoad = byKey['require_label_to_load'] !== undefined
      ? byKey['require_label_to_load']?.enabled !== false
      : true;

    // require_instructions_to_load_pobox: si está activado, las guías US (PO Box) sin instrucciones
    // asignadas por el cliente no aparecen en Control de Salidas. Default FALSE para no romper flujos previos.
    const requireInstructionsToLoadPobox = byKey['require_instructions_to_load_pobox'] !== undefined
      ? byKey['require_instructions_to_load_pobox']?.enabled === true
      : false;

    // payments_enabled: legacy (ambos activos si ambos activos)
    const paymentsEnabled = xpayEnabled && entregaxPaymentsEnabled;

    // external_sync_enabled: controla el acceso al endpoint GET /api/external/customers
    const externalSyncEnabled = byKey['external_sync_enabled'] !== undefined
      ? byKey['external_sync_enabled']?.enabled !== false
      : true; // fallback activo si nunca se ha configurado

    // entregax_payment_query_enabled: habilita consulta de pagos vía sistemaentregax.com
    const entregaxPaymentQueryEnabled = byKey['entregax_payment_query_enabled'] !== undefined
      ? byKey['entregax_payment_query_enabled']?.enabled === true
      : false;

    // cajito_enabled: habilita el asistente de IA "Cajito" (Claude). OFF por defecto.
    const cajitoEnabled = byKey['cajito_enabled'] !== undefined
      ? byKey['cajito_enabled']?.enabled === true
      : false;

    // maintenance_mode: bloquea acceso a usuarios no administradores. OFF por defecto.
    const maintenanceMode = byKey['maintenance_mode'] !== undefined
      ? byKey['maintenance_mode']?.enabled === true
      : false;

    // cajito_avatar_url + entregax_full_black_url: imágenes activas de brand_assets
    let cajitoAvatarUrl: string | null = null;
    let entregaxFullBlackUrl: string | null = null;
    let entregaxXOnlyUrl: string | null = null;
    try {
      const av = await pool.query(
        `SELECT slot, url, storage_key FROM brand_assets
         WHERE slot IN ('cajito_avatar', 'entregax_full_black', 'entregax_x_only') AND is_active = TRUE
         ORDER BY slot ASC, created_at DESC`
      );
      for (const row of av.rows) {
        const signed = await resolveAssetUrl(row);
        if (row.slot === 'cajito_avatar') cajitoAvatarUrl = signed;
        if (row.slot === 'entregax_full_black') entregaxFullBlackUrl = signed;
        if (row.slot === 'entregax_x_only') entregaxXOnlyUrl = signed;
      }
    } catch { /* tabla aún no creada */ }

    // ── TESTER OVERRIDE ─────────────────────────────────────────────────────
    // Si el request viene de un usuario tester, devolvemos el "modo libre":
    // todos los flujos de pago/instrucciones activos y sin mantenimiento.
    // Las UIs (mobile + web) leen este endpoint para decidir si mostrar/ocultar
    // botones de pago, GEX, orden de pago, instrucciones, etc.
    const tester = await isTesterRequest(req);
    if (tester) {
      res.json({
        payments_enabled: true,
        xpay_enabled: true,
        entregax_payments_enabled: true,
        entregax_payments_by_service: { pobox: true, maritimo: true, aereo: true, tdi_express: true, dhl: true },
        gex_enabled: true,
        // Facturas EntregaX SÍ aplica a testers (valores reales, no modo libre)
        facturas_enabled: facturasEnabled,
        facturas_by_service: facturasByService,
        advisor_instructions_enabled: true,
        advisor_payment_order_enabled: true,
        advisor_xpay_enabled: advisorXpayEnabled,
        require_payment_to_load: requirePaymentToLoad,
        require_label_to_load: requireLabelToLoad,
        require_instructions_to_load_pobox: requireInstructionsToLoadPobox,
        external_sync_enabled: externalSyncEnabled,
        entregax_payment_query_enabled: entregaxPaymentQueryEnabled,
        cajito_enabled: cajitoEnabled,
        cajito_avatar_url: cajitoAvatarUrl,
        entregax_full_black_url: entregaxFullBlackUrl,
        entregax_x_only_url: entregaxXOnlyUrl,
        maintenance_mode: false,
        tester_mode: true,
      });
      return;
    }

    res.json({
      payments_enabled: paymentsEnabled,
      xpay_enabled: xpayEnabled,
      entregax_payments_enabled: entregaxPaymentsEnabled,
      entregax_payments_by_service: entregaxPaymentsByService,
      gex_enabled: gexEnabled,
      facturas_enabled: facturasEnabled,
      facturas_by_service: facturasByService,
      advisor_instructions_enabled: advisorInstructionsEnabled,
      advisor_payment_order_enabled: advisorPaymentOrderEnabled,
      advisor_xpay_enabled: advisorXpayEnabled,
      require_payment_to_load: requirePaymentToLoad,
      require_label_to_load: requireLabelToLoad,
      require_instructions_to_load_pobox: requireInstructionsToLoadPobox,
      external_sync_enabled: externalSyncEnabled,
      entregax_payment_query_enabled: entregaxPaymentQueryEnabled,
      cajito_enabled: cajitoEnabled,
      cajito_avatar_url: cajitoAvatarUrl,
      entregax_full_black_url: entregaxFullBlackUrl,
      entregax_x_only_url: entregaxXOnlyUrl,
      maintenance_mode: maintenanceMode,
    });
  } catch (_e) {
    res.json({ payments_enabled: true, xpay_enabled: true, entregax_payments_enabled: true, entregax_payments_by_service: { pobox: true, maritimo: true, aereo: true, dhl: true }, gex_enabled: true, facturas_enabled: true, facturas_by_service: { pobox: true, maritimo: true, aereo: true, dhl: true }, advisor_instructions_enabled: true, advisor_payment_order_enabled: true, advisor_xpay_enabled: false, require_payment_to_load: true, require_label_to_load: true, require_instructions_to_load_pobox: false, external_sync_enabled: true, cajito_enabled: false, cajito_avatar_url: null, entregax_full_black_url: null, maintenance_mode: false });
  }
});

// POST /api/admin/system/payment-toggle — solo Super Admin (toggle global legacy)
app.post('/api/admin/system/payment-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled !== false;
    const userId = req.user?.userId || null;
    // Actualizar los tres: global, xpay y entregax
    for (const key of ['payments_enabled', 'xpay_enabled', 'entregax_payments_enabled']) {
      await pool.query(
        `INSERT INTO system_configurations (config_key, config_value, description, is_active)
         VALUES ($1, $2::jsonb, 'Control global del sistema de pagos', TRUE)
         ON CONFLICT (config_key) DO UPDATE
           SET config_value = $2::jsonb, updated_at = NOW(), updated_by = $3`,
        [key, JSON.stringify({ enabled: !!enabled }), userId]
      );
    }
    console.log(`💳 [PAYMENT-SYSTEM] Global ${enabled ? '✅ Habilitado' : '🔴 Deshabilitado'} por user #${userId}`);
    res.json({ success: true, payments_enabled: !!enabled, xpay_enabled: !!enabled, entregax_payments_enabled: !!enabled });
  } catch (err: any) {
    console.error('[PAYMENT-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar estado del sistema de pagos' });
  }
});

// POST /api/admin/system/xpay-toggle — controla solo X-Pay (x-pay.direct)
app.post('/api/admin/system/xpay-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled !== false;
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('xpay_enabled', $1::jsonb, 'Control del sistema X-Pay (x-pay.direct)', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ enabled: !!enabled }), userId]
    );
    console.log(`🔑 [XPAY] ${enabled ? '✅ Habilitado' : '🔴 Deshabilitado'} por user #${userId}`);
    res.json({ success: true, xpay_enabled: !!enabled });
  } catch (err: any) {
    console.error('[XPAY-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar estado de X-Pay' });
  }
});

// POST /api/admin/system/entregax-payments-toggle — controla pagos EntregaX (master + por servicio)
// Body: { enabled?: boolean, by_service?: { pobox?: boolean, maritimo?: boolean, aereo?: boolean, dhl?: boolean } }
// Si se omite algún campo, se conserva su valor anterior.
app.post('/api/admin/system/entregax-payments-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || null;
    // Leer config actual para preservar campos no incluidos en el body
    const cur = await pool.query(
      `SELECT config_value FROM system_configurations WHERE config_key = 'entregax_payments_enabled' LIMIT 1`
    );
    const current = cur.rows[0]?.config_value || {};
    const currentByService = current.by_service || { pobox: true, maritimo: true, aereo: true, tdi_express: true, dhl: true };

    const nextEnabled = req.body?.enabled !== undefined ? !!req.body.enabled : (current.enabled !== false);
    const incomingByService = req.body?.by_service || {};
    const nextByService = {
      pobox:       incomingByService.pobox       !== undefined ? !!incomingByService.pobox       : currentByService.pobox       !== false,
      maritimo:    incomingByService.maritimo    !== undefined ? !!incomingByService.maritimo    : currentByService.maritimo    !== false,
      aereo:       incomingByService.aereo       !== undefined ? !!incomingByService.aereo       : currentByService.aereo       !== false,
      tdi_express: incomingByService.tdi_express !== undefined ? !!incomingByService.tdi_express : currentByService.tdi_express !== false,
      dhl:         incomingByService.dhl         !== undefined ? !!incomingByService.dhl         : currentByService.dhl         !== false,
    };
    const nextValue = { enabled: nextEnabled, by_service: nextByService };

    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('entregax_payments_enabled', $1::jsonb, 'Control de pagos EntregaX (botón Pagar en app/web) — master + por servicio', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify(nextValue), userId]
    );
    console.log(`💳 [ENTREGAX-PAYMENTS] master=${nextEnabled} by_service=${JSON.stringify(nextByService)} por user #${userId}`);
    res.json({ success: true, entregax_payments_enabled: nextEnabled, entregax_payments_by_service: nextByService });
  } catch (err: any) {
    console.error('[ENTREGAX-PAYMENTS-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar estado de pagos EntregaX' });
  }
});

// POST /api/admin/system/facturas-toggle — controla facturación automática (master + por servicio)
// Body: { enabled?: boolean, by_service?: { pobox?, maritimo?, aereo?, dhl? } }
// OFF → las solicitudes de factura van a "Pendientes por Timbrar".
app.post('/api/admin/system/facturas-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId || null;
    const cur = await pool.query(
      `SELECT config_value FROM system_configurations WHERE config_key = 'facturas_enabled' LIMIT 1`
    );
    const current = cur.rows[0]?.config_value || {};
    const currentByService = current.by_service || { pobox: true, maritimo: true, aereo: true, tdi_express: true, dhl: true };

    const nextEnabled = req.body?.enabled !== undefined ? !!req.body.enabled : (current.enabled !== false);
    const incomingByService = req.body?.by_service || {};
    const nextByService = {
      pobox:       incomingByService.pobox       !== undefined ? !!incomingByService.pobox       : currentByService.pobox       !== false,
      maritimo:    incomingByService.maritimo    !== undefined ? !!incomingByService.maritimo    : currentByService.maritimo    !== false,
      aereo:       incomingByService.aereo       !== undefined ? !!incomingByService.aereo       : currentByService.aereo       !== false,
      tdi_express: incomingByService.tdi_express !== undefined ? !!incomingByService.tdi_express : currentByService.tdi_express !== false,
      dhl:         incomingByService.dhl         !== undefined ? !!incomingByService.dhl         : currentByService.dhl         !== false,
    };
    const nextValue = { enabled: nextEnabled, by_service: nextByService };

    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('facturas_enabled', $1::jsonb, 'Facturación automática EntregaX (timbrado inmediato) — master + por servicio. OFF = pendiente por timbrar', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify(nextValue), userId]
    );
    console.log(`🧾 [FACTURAS] master=${nextEnabled} by_service=${JSON.stringify(nextByService)} por user #${userId}`);
    res.json({ success: true, facturas_enabled: nextEnabled, facturas_by_service: nextByService });
  } catch (err: any) {
    console.error('[FACTURAS-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar facturación EntregaX' });
  }
});

// POST /api/admin/system/gex-toggle — controla la contratación de Garantía Extendida (GEX)
app.post('/api/admin/system/gex-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled !== false;
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('gex_enabled', $1::jsonb, 'Control de contratación de Garantía Extendida (GEX)', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ enabled: !!enabled }), userId]
    );
    console.log(`🛡️ [GEX] ${enabled ? '✅ Habilitado' : '🔴 Deshabilitado'} por user #${userId}`);
    res.json({ success: true, gex_enabled: !!enabled });
  } catch (err: any) {
    console.error('[GEX-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar estado de GEX' });
  }
});

// POST /api/admin/system/advisor-payment-order-toggle — controla la función Orden de Pago (tab web + botón móvil)
app.post('/api/admin/system/advisor-payment-order-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled !== false;
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('advisor_payment_order_enabled', $1::jsonb, 'Control de la función Orden de Pago (tab web y botón móvil)', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ enabled: !!enabled }), userId]
    );
    console.log(`💳 [PAYMENT-ORDER] ${enabled ? '✅ Habilitado' : '🔴 Deshabilitado'} por user #${userId}`);
    res.json({ success: true, advisor_payment_order_enabled: !!enabled });
  } catch (err: any) {
    console.error('[ADVISOR-PAYMENT-ORDER-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar estado de Orden de Pago' });
  }
});

// POST /api/admin/system/advisor-xpay-toggle — controla la función Xpay para asesores
app.post('/api/admin/system/advisor-xpay-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled === true;
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('advisor_xpay_enabled', $1::jsonb, 'Control de la función Xpay para asesores (crear operaciones a sus clientes)', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ enabled: !!enabled }), userId]
    );
    console.log(`🅧 [XPAY-ASESOR] ${enabled ? '✅ Habilitado' : '🔴 Deshabilitado'} por user #${userId}`);
    res.json({ success: true, advisor_xpay_enabled: !!enabled });
  } catch (err: any) {
    console.error('[ADVISOR-XPAY-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar estado de Xpay Asesor' });
  }
});

// POST /api/admin/system/advisor-instructions-toggle — controla botón de instrucciones/direcciones en panel asesor
app.post('/api/admin/system/advisor-instructions-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled !== false;
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('advisor_instructions_enabled', $1::jsonb, 'Control de asignación de instrucciones y edición de direcciones en panel asesor', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ enabled: !!enabled }), userId]
    );
    console.log(`📋 [ADVISOR-INSTRUCTIONS] ${enabled ? '✅ Habilitado' : '🔴 Deshabilitado'} por user #${userId}`);
    res.json({ success: true, advisor_instructions_enabled: !!enabled });
  } catch (err: any) {
    console.error('[ADVISOR-INSTRUCTIONS-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar estado de instrucciones de asesores' });
  }
});

// POST /api/admin/system/require-payment-to-load-toggle — exigir pago para cargar unidad
app.post('/api/admin/system/require-payment-to-load-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled !== false;
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('require_payment_to_load', $1::jsonb, 'Exigir pago del cliente para que el chofer pueda cargar la guía a la unidad', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ enabled: !!enabled }), userId]
    );
    console.log(`💵 [REQUIRE-PAYMENT-TO-LOAD] ${enabled ? '✅ Requerido' : '🔴 Desactivado'} por user #${userId}`);
    res.json({ success: true, require_payment_to_load: !!enabled });
  } catch (err: any) {
    console.error('[REQUIRE-PAYMENT-TO-LOAD-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar requisito de pago para carga' });
  }
});

// POST /api/admin/system/require-label-to-load-toggle — exigir etiqueta impresa para cargar unidad
app.post('/api/admin/system/require-label-to-load-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled !== false;
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('require_label_to_load', $1::jsonb, 'Exigir etiqueta impresa para que el chofer pueda cargar la guía a la unidad', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ enabled: !!enabled }), userId]
    );
    console.log(`🏷️ [REQUIRE-LABEL-TO-LOAD] ${enabled ? '✅ Requerida' : '🔴 Desactivada'} por user #${userId}`);
    res.json({ success: true, require_label_to_load: !!enabled });
  } catch (err: any) {
    console.error('[REQUIRE-LABEL-TO-LOAD-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar requisito de etiqueta para carga' });
  }
});

// POST /api/admin/system/require-instructions-to-load-pobox-toggle — exigir instrucciones asignadas (solo PO Box US)
app.post('/api/admin/system/require-instructions-to-load-pobox-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled === true;
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('require_instructions_to_load_pobox', $1::jsonb, 'Exigir que el cliente haya asignado instrucciones/dirección para que las guías PO Box aparezcan en Control de Salidas', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ enabled }), userId]
    );
    console.log(`📋 [REQUIRE-INSTRUCTIONS-POBOX] ${enabled ? '✅ Requerido' : '🔴 Desactivado'} por user #${userId}`);
    res.json({ success: true, require_instructions_to_load_pobox: enabled });
  } catch (err: any) {
    console.error('[REQUIRE-INSTRUCTIONS-POBOX-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar requisito de instrucciones para PO Box' });
  }
});

// POST /api/admin/system/entregax-payment-query-toggle — habilita/deshabilita consulta pagos sistemaentregax.com
app.post('/api/admin/system/entregax-payment-query-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled === true;
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('entregax_payment_query_enabled', $1::jsonb, 'Habilita consulta de pagos vía sistemaentregax.com desde el panel Nacional México', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ enabled }), userId]
    );
    res.json({ success: true, entregax_payment_query_enabled: enabled });
  } catch (err: any) {
    console.error('[PAYMENT-QUERY-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

// GET /api/national/payment-query/:guide — proxy a sistemaentregax.com (requiere toggle activo)
app.get('/api/national/payment-query/:guide', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const cfg = await pool.query(
      `SELECT config_value FROM system_configurations WHERE config_key = 'entregax_payment_query_enabled' AND is_active = TRUE`
    );
    const enabled = cfg.rows[0]?.config_value?.enabled === true;
    if (!enabled) return (res as any).status(503).json({ error: 'Consulta de pagos desactivada por administrador' });

    const rawGuide = String(req.params.guide);
    const guide = encodeURIComponent(rawGuide);
    const BASE = 'https://sistemaentregax.com/api/quotes';
    const H = { 'Accept': 'application/json' };

    // Detectar tipo de servicio por prefijo de guía
    const inferTipo = (g: string): string => {
      const u = g.toUpperCase();
      if (u.startsWith('US-') || u.startsWith('USS')) return 'usa';
      if (u.startsWith('AIR')) return 'tdi';
      if (u.startsWith('TDX') || u.startsWith('TDI-EXPRES') || u.startsWith('TDIX')) return 'tdi-express';
      if (u.startsWith('DHL')) return 'dhl';
      if (u.startsWith('LOG') || u.startsWith('FCL') || u.startsWith('SEA')) return 'maritimo';
      if (u.startsWith('FDX') || u.startsWith('FEDEX')) return 'fedex';
      return 'usa';
    };
    const tipo = inferTipo(rawGuide);

    const [paymentsRes, historyRes, waybillRes] = await Promise.allSettled([
      fetch(`${BASE}/get-payments/${guide}`, { headers: H }),
      fetch(`${BASE}/history-guide/${guide}`, { headers: H }),
      fetch(`${BASE}/get-waybill/${tipo}/${guide}`, { headers: H }),
    ]);

    const payments = paymentsRes.status === 'fulfilled' && paymentsRes.value.ok
      ? await paymentsRes.value.json().catch(() => null)
      : null;
    const history = historyRes.status === 'fulfilled' && historyRes.value.ok
      ? await historyRes.value.json().catch(() => null)
      : null;
    let waybill = waybillRes.status === 'fulfilled' && waybillRes.value.ok
      ? await waybillRes.value.json().catch(() => null)
      : null;

    const ctzFromPayments: string | undefined = (payments as any)?.data?.ctz;
    const paymentsGuias: any[] = (payments as any)?.data?.guias || [];

    // Para PO Box (carrier tracking): buscar en guias[] la entrada donde guia_usa === rawGuide
    // para extraer el guia_unica específico de ese paquete.
    const matchedGuia = paymentsGuias.find(
      (g: any) => g.guia_usa && g.guia_usa.toUpperCase() === rawGuide.toUpperCase()
    );
    const guiaUnica: string | undefined = matchedGuia?.guia_unica;

    // Si el waybill falló, reintentar con guia_unica (paso 2 para PO Box) o con ctz
    if (!waybill) {
      const retryKey = guiaUnica || (ctzFromPayments !== rawGuide ? ctzFromPayments : undefined);
      if (retryKey) {
        try {
          const retryRes = await fetch(`${BASE}/get-waybill/${inferTipo(retryKey)}/${encodeURIComponent(retryKey)}`, { headers: H });
          if (retryRes.ok) waybill = await retryRes.json().catch(() => null);
        } catch { /* ignore */ }
      }
    }

    // Si todo falló y el guide parece ser un carrier tracking (UPS 1Z..., FedEx, etc.),
    // buscar guía interna en nuestra DB y reintentar con esa.
    let altGuideRaw: string | null = null;
    const isKnownEntregaxPrefix = /^(US[S\-]|AIR|TDX|TDIX|TDI[\-]|DHL|LOG|FCL|SEA|FDX|FEDEX)/i.test(rawGuide);
    if (!payments && !history && !waybill && !isKnownEntregaxPrefix) {
      const dbLookup = await pool.query(
        `SELECT COALESCE(NULLIF(p.child_no,''), p.tracking_internal) AS guia
         FROM packages p
         WHERE UPPER(p.tracking_provider) = UPPER($1) OR UPPER(p.international_tracking) = UPPER($1)
         LIMIT 1`,
        [rawGuide]
      ).catch(() => ({ rows: [] as any[] }));
      if (dbLookup.rows.length > 0 && dbLookup.rows[0].guia) {
        altGuideRaw = dbLookup.rows[0].guia as string;
        const altEnc = encodeURIComponent(altGuideRaw);
        const altTipo = inferTipo(altGuideRaw);
        const [altPay, altHist, altWb] = await Promise.allSettled([
          fetch(`${BASE}/get-payments/${altEnc}`, { headers: H }),
          fetch(`${BASE}/history-guide/${altEnc}`, { headers: H }),
          fetch(`${BASE}/get-waybill/${altTipo}/${altEnc}`, { headers: H }),
        ]);
        const altPayments = altPay.status === 'fulfilled' && altPay.value.ok ? await altPay.value.json().catch(() => null) : null;
        const altHistory = altHist.status === 'fulfilled' && altHist.value.ok ? await altHist.value.json().catch(() => null) : null;
        let altWaybill = altWb.status === 'fulfilled' && altWb.value.ok ? await altWb.value.json().catch(() => null) : null;
        const altCtz: string | undefined = (altPayments as any)?.data?.ctz;
        if (!altWaybill && altCtz && altCtz !== altGuideRaw) {
          try {
            const r2 = await fetch(`${BASE}/get-waybill/${inferTipo(altCtz)}/${encodeURIComponent(altCtz)}`, { headers: H });
            if (r2.ok) altWaybill = await r2.json().catch(() => null);
          } catch { /* ignore */ }
        }
        if (altPayments || altHistory || altWaybill) {
          return (res as any).json({
            status: 'success',
            data: {
              ctz: altCtz || altGuideRaw,
              guias: (altPayments as any)?.data?.guias || [],
              pagos: (altPayments as any)?.data?.pagos || [],
              historial: (altHistory as any)?.data || [],
              waybill: (altWaybill as any)?.status === 'success' ? (altWaybill as any).message : null,
            },
          });
        }
      }
    }

    // Fallback inverso: guía EntregaX (US-...) sin datos → buscar carrier tracking
    // en nuestra DB y consultar get-waybill con ese número (UPS 1Z..., FedEx, etc.)
    if (!payments && !history && !waybill && isKnownEntregaxPrefix) {
      const carrierLookup = await pool.query(
        `SELECT COALESCE(NULLIF(p.tracking_provider,''), p.international_tracking) AS carrier_tracking
         FROM packages p
         WHERE UPPER(p.tracking_internal) = UPPER($1)
            OR UPPER(p.child_no) = UPPER($1)
            OR UPPER(p.child_no) LIKE UPPER(REGEXP_REPLACE($1, '-[0-9]+$', '')) || '-%'
         ORDER BY (p.tracking_provider IS NOT NULL AND p.tracking_provider <> '') DESC
         LIMIT 1`,
        [rawGuide]
      ).catch(() => ({ rows: [] as any[] }));
      const carrierTracking: string | undefined = carrierLookup.rows[0]?.carrier_tracking;
      if (carrierTracking) {
        try {
          const cwRes = await fetch(`${BASE}/get-waybill/usa/${encodeURIComponent(carrierTracking)}`, { headers: H });
          if (cwRes.ok) {
            const cw = await cwRes.json().catch(() => null);
            if ((cw as any)?.status === 'success' && (cw as any)?.message) {
              return (res as any).json({
                status: 'success',
                data: {
                  ctz: rawGuide,
                  guia_unica: (cw as any).message.guia_unica || rawGuide,
                  guias: [],
                  pagos: [],
                  historial: [],
                  waybill: (cw as any).message,
                },
              });
            }
          }
        } catch { /* ignore */ }
      }
    }

    if (!payments && !history && !waybill) {
      const fallback = paymentsRes.status === 'fulfilled'
        ? await paymentsRes.value.json().catch(() => ({ error: 'Sin datos' }))
        : { error: 'No se pudo contactar a sistemaentregax.com' };
      return (res as any).status(404).json(fallback);
    }

    let waybillMsg = (waybill as any)?.status === 'success' ? (waybill as any).message : null;

    // Si el waybill existe pero no tiene dirección, reintentar con ctz del propio waybill
    const waybillCtz: string | undefined = waybillMsg?.ctz || waybillMsg?.cotizacion;
    if (waybillMsg && !waybillMsg.direccion_entrega?.calle && waybillCtz && waybillCtz !== rawGuide) {
      try {
        const ctzRes = await fetch(`${BASE}/get-waybill/${inferTipo(waybillCtz)}/${encodeURIComponent(waybillCtz)}`, { headers: H });
        if (ctzRes.ok) {
          const ctzWb = await ctzRes.json().catch(() => null);
          const ctzMsg = (ctzWb as any)?.status === 'success' ? (ctzWb as any).message : null;
          if (ctzMsg?.direccion_entrega?.calle) waybillMsg = ctzMsg;
        }
      } catch { /* ignore */ }
    }

    // Marítimo: el API de sistemaentregax devuelve flags numéricos (estado, cedis, pagado,
    // instrucciones, guiasalida, salida_fecha) en vez de un texto. Derivamos un estado_texto
    // legible para que el panel lo muestre.
    if (tipo === 'maritimo' && waybillMsg && typeof waybillMsg === 'object') {
      const s = (v: any) => (v == null ? '' : String(v).trim());
      const cedis = s(waybillMsg.cedis);
      const guiaSalidaWb = s(waybillMsg.guiasalida || waybillMsg.guia_salida);
      const salidaFecha = s(waybillMsg.salida_fecha);
      const pagado = s(waybillMsg.pagado);
      const instr = s(waybillMsg.instrucciones);
      const arrived = s(waybillMsg.arrived);
      const today = new Date().toISOString().slice(0, 10);
      const arrivedReached = arrived && arrived !== '0000-00-00' && arrived <= today;
      let estado_texto: string | undefined;
      if (guiaSalidaWb && guiaSalidaWb !== '0' && guiaSalidaWb !== '1') {
        estado_texto = 'Enviado';
      } else if (salidaFecha && salidaFecha !== '0000-00-00 00:00:00') {
        estado_texto = 'En reparto';
      } else if (cedis === '3') {
        estado_texto = 'Recibido en CEDIS CDMX';
      } else if (cedis === '2') {
        estado_texto = 'Recibido en CEDIS MTY';
      } else if (cedis === '1') {
        estado_texto = 'Recibido en CEDIS';
      } else if (pagado === '1' && instr === '1') {
        estado_texto = 'Pago e instrucciones recibidos';
      } else if (arrivedReached) {
        estado_texto = 'En aduanas / liberación';
      } else if (arrived && arrived !== '0000-00-00') {
        estado_texto = 'En tránsito marítimo';
      } else {
        estado_texto = 'Pendiente';
      }
      (waybillMsg as any).estado_texto = estado_texto;
    }

    console.log(`[PAYMENT-QUERY] guide=${rawGuide} waybill_keys=${waybillMsg ? Object.keys(waybillMsg).join(',') : 'null'} instrucciones=${JSON.stringify(waybillMsg?.instrucciones)} direccion_entrega=${JSON.stringify(waybillMsg?.direccion_entrega)}`);
    return (res as any).json({
      status: 'success',
      data: {
        ctz: ctzFromPayments || guide,
        guia_unica: guiaUnica || waybillMsg?.guia_unica || undefined,
        guias: paymentsGuias,
        pagos: (payments as any)?.data?.pagos || [],
        historial: (history as any)?.data || [],
        waybill: waybillMsg,
        // Datos crudos del waybill para debug (todos los campos disponibles)
        rawWaybill: waybillMsg ? { ...waybillMsg } : null,
      },
    });
  } catch (err: any) {
    console.error('[PAYMENT-QUERY]', err.message);
    return (res as any).status(502).json({ error: 'No se pudo contactar a sistemaentregax.com' });
  }
});

// POST /api/packages/save-guia-us — persiste la guía única PO Box USA en child_no
app.post('/api/packages/save-guia-us', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const { tracking_internal, guia_unica } = req.body as { tracking_internal: string; guia_unica: string };
    if (!tracking_internal || !guia_unica) return (res as any).status(400).json({ error: 'tracking_internal y guia_unica requeridos' });
    await pool.query(
      `UPDATE packages SET child_no = $1, updated_at = NOW() WHERE tracking_internal = $2 AND service_type = 'POBOX_USA' AND (child_no IS NULL OR child_no = '')`,
      [guia_unica, tracking_internal]
    );
    return res.json({ ok: true });
  } catch (err: any) {
    return (res as any).status(500).json({ error: err.message });
  }
});

// POST /api/packages/sync-from-entregax — sincroniza pago, instrucciones y dirección desde EntregaX
app.post('/api/packages/sync-from-entregax', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), async (req: AuthRequest, res: Response) => {
  try {
    const { guia, service, hasPago, hasInstrucciones, paqueteria, guia_salida, direccion_entrega, newStatus } = req.body as {
      guia: string; service: string;
      hasPago: boolean; hasInstrucciones: boolean;
      paqueteria?: string; guia_salida?: string; newStatus?: string;
      direccion_entrega?: {
        quienrecibe?: string; calle?: string; numeroext?: string;
        colonia?: string; cp?: string; estado?: string; pais?: string;
      };
    };
    const VALID_STATUSES = ['received', 'received_china', 'received_mty', 'received_cdmx', 'received_gdl', 'received_qro', 'in_transit', 'customs', 'customs_mx', 'customs_cleared', 'at_port', 'consolidated', 'shipped', 'out_for_delivery', 'returned_to_warehouse', 'delivered'];
    const safeNewStatus = newStatus && VALID_STATUSES.includes(newStatus) ? newStatus : undefined;
    if (!guia || !service) return (res as any).status(400).json({ error: 'guia y service son requeridos' });
    console.log(`[sync-entregax] guia=${guia} hasPago=${hasPago} hasInstr=${hasInstrucciones} guia_salida=${guia_salida} paqueteria=${paqueteria} direccion_entrega=${JSON.stringify(direccion_entrega)}`);

    const syncedFields: string[] = [];

    // Helper: crea o reutiliza dirección desde EntregaX; oculta para el usuario (internal_only)
    const upsertAddress = async (userId: number | null): Promise<number | null> => {
      if (!userId || !direccion_entrega) return null;
      const { quienrecibe, calle, numeroext, colonia, cp, estado } = direccion_entrega;
      if (!calle && !cp) return null; // dirección vacía, no creamos nada
      // Reutilizar si ya existe una dirección interna con mismos datos para este usuario
      const existing = await pool.query(
        `SELECT id FROM addresses
         WHERE user_id = $1 AND internal_only = TRUE
           AND LOWER(COALESCE(street,'')) = LOWER(COALESCE($2,''))
           AND LOWER(COALESCE(zip_code,'')) = LOWER(COALESCE($3,''))
         LIMIT 1`,
        [userId, calle || '', cp || '']
      );
      if (existing.rows[0]) return existing.rows[0].id;
      const r = await pool.query(
        `INSERT INTO addresses (user_id, alias, recipient_name, street, exterior_number,
                                neighborhood, zip_code, state, is_default, internal_only)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, TRUE)
         RETURNING id`,
        [userId, `EntregaX Sync · ${guia}`, quienrecibe || null, calle || null,
         numeroext || null, colonia || null, cp || null, estado || null]
      );
      return r.rows[0]?.id ?? null;
    };

    if (service === 'maritimo') {
      const updates: string[] = [];
      const params: any[] = [];
      if (hasPago) { updates.push(`payment_status = 'paid'`); syncedFields.push('pago'); }
      if (guia_salida) {
        // EntregaX tiene guía de salida → actualizar carrier + tracking (sin inyectar dirección)
        params.push(paqueteria || null); updates.push(`national_carrier = $${params.length}`);
        params.push(guia_salida);       updates.push(`national_tracking = $${params.length}`);
        syncedFields.push('guia_salida');
      }
      if (hasInstrucciones) {
        // Marcar instrucciones confirmadas + etiqueta impresa (sin inyectar dirección)
        updates.push(`instructions_confirmed = TRUE`);
        updates.push(`national_label_url = COALESCE(national_label_url, 'manual-printed')`);
        syncedFields.push('instrucciones');
      }
      if (safeNewStatus) { params.push(safeNewStatus); updates.push(`status = $${params.length}`); syncedFields.push('status'); }
      if (updates.length > 0) {
        params.push(guia);
        await pool.query(
          `UPDATE maritime_orders SET ${updates.join(', ')}, updated_at = NOW() WHERE ordersn = $${params.length}`,
          params
        );
      }
      // Espejo en packages: existe un master LOG (tracking_internal = ordersn) y
      // sus cajas hijas que el rastreo/Cajito lee para el status. Si solo
      // actualizamos maritime_orders, el rastreo se queda con el status viejo.
      if (safeNewStatus) {
        const PKG_ENUM = new Set(['received','in_transit','customs','ready_pickup','delivered','received_china','processing','reempacado','received_mty','lost','dispatched_national','out_for_delivery','returned_to_warehouse','received_cdmx','received_gdl','received_qro','sent','shipped']);
        const pkgStatus = PKG_ENUM.has(safeNewStatus)
          ? safeNewStatus
          : (safeNewStatus === 'customs_mx' || safeNewStatus === 'customs_cleared') ? 'customs' : null;
        if (pkgStatus) {
          await pool.query(
            `UPDATE packages SET status = $1::package_status, updated_at = NOW()
              WHERE UPPER(tracking_internal) = UPPER($2)
                 OR master_id IN (SELECT id FROM packages WHERE UPPER(tracking_internal) = UPPER($2))`,
            [pkgStatus, guia]
          );
        }
      }
    } else if (service === 'dhl') {
      // DHL Monterrey vive en dhl_shipments (no en packages).
      const updates: string[] = [];
      const params: any[] = [];
      if (hasPago) { updates.push(`cost_payment_status = 'paid'`); updates.push(`paid_at = COALESCE(paid_at, NOW())`); syncedFields.push('pago'); }
      if (guia_salida) {
        params.push(paqueteria || null); updates.push(`national_carrier = $${params.length}`);
        params.push(guia_salida);        updates.push(`national_tracking = $${params.length}`);
        syncedFields.push('guia_salida');
      }
      if (hasInstrucciones) {
        updates.push(`national_label_url = COALESCE(national_label_url, 'manual-printed')`);
        syncedFields.push('instrucciones');
      }
      if (safeNewStatus) { params.push(safeNewStatus); updates.push(`status = $${params.length}`); syncedFields.push('status'); }
      if (updates.length > 0) {
        params.push(guia);
        await pool.query(
          `UPDATE dhl_shipments SET ${updates.join(', ')}, updated_at = NOW()
            WHERE inbound_tracking = $${params.length} OR secondary_tracking = $${params.length}`,
          params
        );
      }
    } else {
      const updates: string[] = [];
      const params: any[] = [];
      if (hasPago) {
        updates.push(`costing_paid = TRUE`);
        updates.push(`client_paid = TRUE`);
        updates.push(`payment_status = 'paid'`);
        syncedFields.push('pago');
      }
      if (guia_salida) {
        // EntregaX tiene guía de salida → actualizar carrier + tracking
        params.push(paqueteria || null); updates.push(`national_carrier = $${params.length}`);
        params.push(guia_salida);       updates.push(`national_tracking = $${params.length}`);
        syncedFields.push('guia_salida');
      } else if (paqueteria) {
        // Sin guía de salida pero hay paquetería → actualizar carrier
        params.push(paqueteria); updates.push(`national_carrier = $${params.length}`);
      }
      if (hasInstrucciones) {
        // Nuestro sistema no tiene instrucciones → asignar lo que EntregaX tiene
        // Solo se llega aquí cuando el frontend mandó hasInstrucciones=true
        // (es decir, ex.hasInstrucciones && !row.has_instructions)
        const pkgRes = await pool.query(
          `SELECT p.user_id FROM packages p
           WHERE p.tracking_internal = $1 OR p.child_no = $1 OR p.child_no LIKE $1 || '-%' LIMIT 1`, [guia]
        );
        const userId = pkgRes.rows[0]?.user_id ?? null;

        // Crear dirección desde datos de EntregaX (si EntregaX no los devuelve, addrId = null)
        const addrId: number | null = await upsertAddress(userId);

        if (addrId) {
          // assigned_address_id = flujo normal de asignación para PO Box
          params.push(addrId); updates.push(`assigned_address_id = $${params.length}`);
          updates.push(`needs_instructions = FALSE`);
          syncedFields.push('instrucciones');
        }
      }
      if (safeNewStatus) { params.push(safeNewStatus); updates.push(`status = $${params.length}`); syncedFields.push('status'); }
      // Si el status nuevo es received_mty/received_cdmx/received_gdl/received_qro,
      // tambien fijar current_branch_id al CEDIS correspondiente. Sin esto los
      // paneles de repartidor (que filtran por current_branch_id) no veran la guia.
      if (safeNewStatus && /^received_(mty|cdmx|gdl|qro)$/.test(safeNewStatus)) {
        const branchCodeByStatus: Record<string, string> = {
          received_mty: 'MTY', received_cdmx: 'CDMX', received_gdl: 'GDL', received_qro: 'QRO',
        };
        const code = branchCodeByStatus[safeNewStatus];
        try {
          const br = await pool.query(
            `SELECT id FROM branches WHERE UPPER(code) = $1 AND is_active = TRUE LIMIT 1`,
            [code]
          );
          const brId = br.rows[0]?.id;
          if (brId) {
            params.push(brId);
            updates.push(`current_branch_id = COALESCE(current_branch_id, $${params.length})`);
          }
        } catch (e) { /* sin codigo de branch, ignoramos */ }
      }
      if (updates.length > 0) {
        params.push(guia);
        // Para TDI Aéreo el guía del master es la base guía (sin sufijo -NNN); buscar también por LIKE
        const pkgWhere = service === 'tdi_aereo'
          ? `tracking_internal = $${params.length} OR child_no = $${params.length} OR child_no LIKE $${params.length} || '-%'`
          : `tracking_internal = $${params.length} OR child_no = $${params.length}`;
        await pool.query(
          `UPDATE packages SET ${updates.join(', ')}, updated_at = NOW() WHERE ${pkgWhere}`,
          params
        );
      }
    }

    console.log(`[sync-entregax] guia=${guia} service=${service} synced=${syncedFields.join(',')}`);
    return (res as any).json({ success: true, synced: syncedFields });
  } catch (err: any) {
    console.error('[sync-entregax]', err.message);
    return (res as any).status(500).json({ error: err.message });
  }
});

// POST /api/admin/system/external-sync-toggle — habilita/deshabilita sincronización EX
app.post('/api/admin/system/external-sync-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled !== false;
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('external_sync_enabled', $1::jsonb, 'Habilita o deshabilita el acceso al endpoint de sincronización de clientes con Sistema EX', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ enabled: !!enabled }), userId]
    );
    console.log(`🔌 [EXTERNAL-SYNC] ${enabled ? '✅ Habilitado' : '🔴 Deshabilitado'} por user #${userId}`);
    res.json({ success: true, external_sync_enabled: !!enabled });
  } catch (err: any) {
    console.error('[EXTERNAL-SYNC-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar estado de sincronización externa' });
  }
});

// GET /api/admin/system/external-sync-key — devuelve la API key actual (solo Super Admin)
app.get('/api/admin/system/external-sync-key', authenticateToken, requireRole('super_admin'), async (_req: AuthRequest, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT config_value FROM system_configurations WHERE config_key = 'external_sync_api_key' AND is_active = TRUE`
    );
    const key: string | null = r.rows[0]?.config_value?.key || null;
    res.json({ success: true, key });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al obtener API key' });
  }
});

// POST /api/admin/system/external-sync-key/regenerate — genera y guarda una nueva API key (solo Super Admin)
app.post('/api/admin/system/external-sync-key/regenerate', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const crypto = await import('crypto');
    const newKey = crypto.randomBytes(32).toString('hex');
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('external_sync_api_key', $1::jsonb, 'API Key para autenticar solicitudes del Sistema EX al endpoint de clientes', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ key: newKey }), userId]
    );
    console.log(`🔑 [EXTERNAL-SYNC-KEY] Regenerada por user #${userId}`);
    res.json({ success: true, key: newKey });
  } catch (err: any) {
    console.error('[EXTERNAL-SYNC-KEY-REGEN]', err.message);
    res.status(500).json({ error: 'Error al regenerar API key' });
  }
});

// ============================================================
// CAJITO — Asistente IA (Claude 3.5 Sonnet) — Toggle global y capacidades
// ============================================================

// Catálogo central de capacidades de Cajito (single source of truth)
// Cada capability declara: riesgo, categoría y descripción legible.
// El frontend usa este endpoint para pintar la pestaña de permisos.
const CAJITO_CAPABILITIES: {
  key: string;
  label: string;
  description: string;
  category: 'access' | 'read' | 'write' | 'sensitive' | 'bulk';
  risk: 'low' | 'medium' | 'high' | 'critical';
}[] = [
  // Acceso base
  { key: 'cajito.access',               label: 'Acceder al chat de Cajito',          description: 'Permite abrir el chat con Cajito. Sin esta capacidad el usuario no ve el botón.', category: 'access',    risk: 'low' },
  // Lectura (bajo riesgo)
  { key: 'cajito.read.packages',        label: 'Consultar paquetes / guías',         description: 'Buscar paquetes por tracking, ver estado actual y ruta.', category: 'read',      risk: 'low' },
  { key: 'cajito.read.tracking',        label: 'Ver estatus de rastreo en vivo',      description: 'Consultar posición GPS y eventos de seguimiento.', category: 'read',      risk: 'low' },
  { key: 'cajito.read.clients',         label: 'Buscar información de clientes',     description: 'Consultar datos de contacto, dirección y saldo del cliente.', category: 'read',      risk: 'medium' },
  { key: 'cajito.read.drivers',         label: 'Ver información de choferes',        description: 'Asignaciones del día, vehículo y ruta del chofer.', category: 'read',      risk: 'low' },
  { key: 'cajito.read.routes',          label: 'Ver rutas y entregas del día',       description: 'Listado y avance de rutas activas.', category: 'read',      risk: 'low' },
  { key: 'cajito.read.warehouses',      label: 'Ver inventarios y almacenes',        description: 'Conteos y ubicaciones en CEDIS / PO Box.', category: 'read',      risk: 'low' },
  { key: 'cajito.read.support_tickets', label: 'Ver tickets de soporte',             description: 'Consultar el historial de tickets de servicio a cliente.', category: 'read',      risk: 'medium' },
  // Financiero (medio/alto)
  { key: 'cajito.read.invoices',        label: 'Consultar facturas',                 description: 'Ver folios, montos y emisores. Datos fiscales sensibles.', category: 'read',      risk: 'high' },
  { key: 'cajito.read.payments',        label: 'Ver historial de pagos',             description: 'Consultar pagos recibidos y métodos.', category: 'read',      risk: 'medium' },
  { key: 'cajito.read.financial_kpis',  label: 'Ver KPIs financieros',               description: 'Ingresos, márgenes, ranking de clientes. Información estratégica.', category: 'read',      risk: 'high' },
  { key: 'cajito.read.suppliers',       label: 'Ver proveedores y costos',           description: 'Costos de transportistas y proveedores.', category: 'read',      risk: 'high' },
  { key: 'cajito.read.employee_kpis',   label: 'Ver KPIs de empleados',              description: 'Productividad y métricas individuales. Datos de RRHH.', category: 'read',      risk: 'high' },
  { key: 'cajito.read.audit_logs',      label: 'Ver logs de auditoría',              description: 'Historial de acciones de usuarios. Solo para investigación.', category: 'read',      risk: 'high' },
  // Datos sensibles (PII / banca)
  { key: 'cajito.sensitive.pii',        label: 'Acceder a PII completo (CURP/RFC/INE)', description: 'Permite que Cajito muestre identificaciones oficiales completas.', category: 'sensitive', risk: 'critical' },
  { key: 'cajito.sensitive.bank',       label: 'Ver cuentas bancarias',              description: 'Datos de cuentas para depósitos / transferencias.', category: 'sensitive', risk: 'critical' },
  { key: 'cajito.sensitive.password_reset', label: 'Iniciar reset de contraseña',    description: 'Disparar el flujo de reset de contraseña para un usuario.', category: 'sensitive', risk: 'critical' },
  { key: 'cajito.sensitive.export',     label: 'Exportar datos / reportes masivos',  description: 'Generar CSV / Excel con datos del sistema.', category: 'sensitive', risk: 'critical' },
  // Escritura (peligrosa)
  { key: 'cajito.write.assign_advisor', label: 'Asignar asesor a cliente',           description: 'Cambiar el asesor responsable de un cliente.', category: 'write',     risk: 'medium' },
  { key: 'cajito.write.update_package', label: 'Modificar estatus de paquete',        description: 'Cambiar manualmente el estado de un envío.', category: 'write',     risk: 'high' },
  { key: 'cajito.write.update_address', label: 'Editar direcciones de cliente',      description: 'Actualizar dirección de entrega del cliente.', category: 'write',     risk: 'medium' },
  { key: 'cajito.write.create_ticket',  label: 'Crear tickets de soporte',           description: 'Abrir un ticket de servicio a cliente en nombre del usuario.', category: 'write',     risk: 'low' },
  { key: 'cajito.write.respond_ticket', label: 'Responder tickets',                  description: 'Publicar respuestas en tickets de soporte.', category: 'write',     risk: 'medium' },
  { key: 'cajito.write.notify_user',    label: 'Enviar notificación push individual',description: 'Push a un solo cliente o usuario.', category: 'write',     risk: 'medium' },
  { key: 'cajito.write.notify_mass',    label: 'Enviar notificaciones masivas',      description: 'Push o WhatsApp a múltiples clientes. Alto impacto reputacional.', category: 'write',     risk: 'critical' },
  { key: 'cajito.write.send_email',     label: 'Enviar correo desde cuenta corporativa', description: 'Mandar emails firmados por la empresa.', category: 'write',     risk: 'high' },
  { key: 'cajito.write.discount',       label: 'Aplicar descuentos en facturas',     description: 'Modificar precios o aplicar descuentos comerciales.', category: 'write',     risk: 'critical' },
  // NOTA: Cajito NO puede aprobar pagos (anticipos, viáticos ni caja chica). Cualquier autorización de salida de dinero queda fuera del alcance del asistente.
  { key: 'cajito.write.toggle_flags',   label: 'Activar/desactivar feature flags',   description: 'Tocar los toggles del Sistema de Pagos / módulos. SOLO super admin.', category: 'write',     risk: 'critical' },
  // Operaciones bulk
  { key: 'cajito.bulk.update_packages', label: 'Actualizar paquetes en lote',        description: 'Modificar múltiples envíos en una sola operación.', category: 'bulk',      risk: 'critical' },
  { key: 'cajito.bulk.price_changes',   label: 'Cambios masivos de tarifas',         description: 'Aplicar nuevos precios/comisiones a varios servicios.', category: 'bulk',      risk: 'critical' },
  { key: 'cajito.bulk.delete',          label: 'Operaciones de borrado',             description: 'Cualquier eliminación de registros (paquetes, clientes, tickets).', category: 'bulk',      risk: 'critical' },
];

// POST /api/admin/system/cajito-toggle — habilita/deshabilita el asistente Cajito (Super Admin)
app.post('/api/admin/system/cajito-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled === true;
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('cajito_enabled', $1::jsonb, 'Habilita el asistente IA Cajito (Claude 3.5 Sonnet)', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ enabled }), userId]
    );
    console.log(`🤖 [CAJITO] ${enabled ? '✅ Habilitado' : '🔴 Deshabilitado'} por user #${userId}`);
    res.json({ success: true, cajito_enabled: enabled });
  } catch (err: any) {
    console.error('[CAJITO-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar estado de Cajito' });
  }
});

// POST /api/admin/system/maintenance-toggle — activa/desactiva modo mantenimiento (Super Admin)
app.post('/api/admin/system/maintenance-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled === true;
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('maintenance_mode', $1::jsonb, 'Modo mantenimiento — bloquea acceso a todos los usuarios no administradores', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ enabled }), userId]
    );
    _maintenanceCache = { enabled, ts: Date.now() };
    console.log(`🔧 [MAINTENANCE] ${enabled ? '🔴 Activado' : '✅ Desactivado'} por user #${userId}`);
    res.json({ success: true, maintenance_mode: enabled });
  } catch (err: any) {
    console.error('[MAINTENANCE-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar modo de mantenimiento' });
  }
});

// GET /api/admin/cajito/capabilities — catálogo completo de capacidades (solo super_admin/admin)
app.get('/api/admin/cajito/capabilities', authenticateToken, requireRole('super_admin', 'admin'), async (_req: AuthRequest, res: Response) => {
  res.json({ capabilities: CAJITO_CAPABILITIES });
});

// Asegura que exista la tabla de capacidades por usuario. Se ejecuta perezosamente.
let _cajitoTableReady = false;
async function ensureCajitoTable() {
  if (_cajitoTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cajito_user_capabilities (
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      capability   TEXT    NOT NULL,
      granted      BOOLEAN NOT NULL DEFAULT FALSE,
      granted_by   INTEGER REFERENCES users(id),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, capability)
    );
    CREATE INDEX IF NOT EXISTS idx_cajito_user_caps_user ON cajito_user_capabilities(user_id);
  `);
  // Limpieza: Cajito ya no puede aprobar pagos. Revocar cualquier grant histórico.
  await pool.query(
    `DELETE FROM cajito_user_capabilities WHERE capability IN ('cajito.write.approve_advance', 'cajito.write.approve_petty')`
  );
  _cajitoTableReady = true;
}

// GET /api/admin/cajito/user/:userId — capacidades efectivas de un usuario
app.get('/api/admin/cajito/user/:userId', authenticateToken, requireRole('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    await ensureCajitoTable();
    const userId = parseInt(req.params.userId as string, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'userId inválido' });

    const userRow = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    const targetRole: string = userRow.rows[0]?.role || '';

    // super_admin tiene todas las capacidades en runtime; reflejar eso en la UI
    if (targetRole === 'super_admin') {
      const granted: Record<string, boolean> = {};
      CAJITO_CAPABILITIES.forEach((c) => { granted[c.key] = true; });
      return res.json({ userId, granted, capabilities: CAJITO_CAPABILITIES, isSuperAdmin: true });
    }

    const r = await pool.query(
      `SELECT capability, granted FROM cajito_user_capabilities WHERE user_id = $1`,
      [userId]
    );
    const granted: Record<string, boolean> = {};
    r.rows.forEach((row: any) => { granted[row.capability] = !!row.granted; });
    res.json({ userId, granted, capabilities: CAJITO_CAPABILITIES });
  } catch (err: any) {
    console.error('[CAJITO-GET-USER]', err.message);
    res.status(500).json({ error: 'Error al obtener capacidades de Cajito' });
  }
});

// PUT /api/admin/cajito/user/:userId — guarda las capacidades concedidas a un usuario
app.put('/api/admin/cajito/user/:userId', authenticateToken, requireRole('super_admin', 'admin'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await ensureCajitoTable();
    const userId = parseInt(req.params.userId as string, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'userId inválido' });
    const grantedBy = req.user?.userId || null;
    const input: Record<string, boolean> = req.body?.granted || {};

    // Validar contra el catálogo (descartar claves desconocidas para evitar inyecciones)
    const validKeys = new Set(CAJITO_CAPABILITIES.map((c) => c.key));
    const rows = Object.entries(input)
      .filter(([k]) => validKeys.has(k))
      .map(([k, v]) => [k, !!v] as [string, boolean]);

    await client.query('BEGIN');
    await client.query('DELETE FROM cajito_user_capabilities WHERE user_id = $1', [userId]);
    for (const [capability, granted] of rows) {
      if (!granted) continue; // solo persistimos las concedidas
      await client.query(
        `INSERT INTO cajito_user_capabilities (user_id, capability, granted, granted_by)
         VALUES ($1, $2, TRUE, $3)`,
        [userId, capability, grantedBy]
      );
    }
    await client.query('COMMIT');
    console.log(`🤖 [CAJITO-CAPS] user #${userId} → ${rows.filter(([, v]) => v).length} capacidades por user #${grantedBy}`);
    res.json({ success: true, userId, count: rows.filter(([, v]) => v).length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[CAJITO-PUT-USER]', err.message);
    res.status(500).json({ error: 'Error al guardar capacidades de Cajito' });
  } finally {
    client.release();
  }
});

// ============================================================
// CAJITO — Chat IA (OpenAI) · solo lectura + auditoría completa
// ============================================================
app.post('/api/cajito/chat', authenticateToken, cajitoChat);
app.get('/api/cajito/conversations', authenticateToken, cajitoGetMyConversations);
app.get('/api/cajito/conversations/:id', authenticateToken, cajitoGetConversation);
app.get('/api/cajito/health', authenticateToken, cajitoGetHealth);
app.get('/api/cajito/my-access', authenticateToken, cajitoGetMyAccess);
app.get('/api/cajito/client-lookup', authenticateToken, cajitoClientLookup);
app.get('/api/cajito/ticket-lookup', authenticateToken, cajitoTicketLookup);
app.get('/api/admin/cajito/audit', authenticateToken, requireRole('super_admin'), cajitoGetAudit);

// ============================================================
// MIDDLEWARES FINALES — deben ir DESPUÉS de TODAS las rutas
// (si se registran antes, el catchall 404 atrapa cualquier ruta
// declarada más abajo y nunca llega al handler real).
// ============================================================

// ============================================================
// PREFERENCIAS DE NOTIFICACIONES
// ============================================================

// GET /api/notifications/preferences
app.get('/api/notifications/preferences', authenticateToken, async (req: any, res) => {
  try {
    const r = await pool.query(
      `SELECT notif_whatsapp, notif_push, notif_air, notif_maritime, notif_dhl, notif_pobox
       FROM users WHERE id = $1`,
      [req.user.userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const row = r.rows[0];
    res.json({
      whatsapp: row.notif_whatsapp ?? true,
      push: row.notif_push ?? true,
      air: row.notif_air ?? true,
      maritime: row.notif_maritime ?? true,
      dhl: row.notif_dhl ?? true,
      pobox: row.notif_pobox ?? true,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/notifications/preferences
app.put('/api/notifications/preferences', authenticateToken, async (req: any, res) => {
  try {
    const { whatsapp, push, air, maritime, dhl, pobox } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (whatsapp !== undefined) { fields.push(`notif_whatsapp = $${idx++}`); values.push(!!whatsapp); }
    if (push !== undefined) { fields.push(`notif_push = $${idx++}`); values.push(!!push); }
    if (air !== undefined) { fields.push(`notif_air = $${idx++}`); values.push(!!air); }
    if (maritime !== undefined) { fields.push(`notif_maritime = $${idx++}`); values.push(!!maritime); }
    if (dhl !== undefined) { fields.push(`notif_dhl = $${idx++}`); values.push(!!dhl); }
    if (pobox !== undefined) { fields.push(`notif_pobox = $${idx++}`); values.push(!!pobox); }
    if (!fields.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
    values.push(req.user.userId);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Manejador de rutas no encontradas (404) - Devolver JSON en lugar de HTML
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Endpoint no encontrado',
    message: 'La ruta solicitada no existe en esta API'
  });
});

// Manejador de errores global - Siempre devolver JSON
app.use((err: Error, req: Request, res: Response, next: any) => {
  // CORS: responder 403 sin stack trace (no es un "error interno")
  if (err && err.message === 'Not allowed by CORS') {
    console.warn(`[CORS] Rechazado: origin=${req.headers.origin} path=${req.path}`);
    return res.status(403).json({ error: 'Origen no permitido' });
  }
  // Reportar a Sentry (no-op si no hay DSN). Hace scrubbing automático.
  try {
    errorReporter(err, req, res, next);
  } catch {
    // Si Sentry falla, seguimos al handler legacy
    console.error('Error no manejado:', err);
    console.error('Error stack:', (err as any)?.stack);
    console.error('Error path:', req.path, 'method:', req.method);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Error interno del servidor',
        message: err.message || 'Algo salió mal',
        code: (err as any).code,
        type: (err as any).type,
      });
    }
  }
});

// Iniciar servidor (escuchar en todas las interfaces para acceso desde móvil)
const httpServer = http.createServer(app);

// Adjuntar Socket.IO para chat en tiempo real (lazy import — no rompe si falta)
import('./chatSocket').then((mod) => {
  if (typeof (mod as any).attachChatSocket === 'function') {
    (mod as any).attachChatSocket(httpServer).catch((err: any) =>
      console.warn('[startup] no se pudo iniciar chat socket:', err.message)
    );
  }
}).catch((err) => console.warn('[startup] chatSocket no disponible:', err.message));

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 EntregaX API corriendo en http://localhost:${PORT}`);
  console.log(`📱 Acceso móvil: http://192.168.1.107:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Login: POST http://localhost:${PORT}/api/auth/login`);
  console.log(`📝 Registro: POST http://localhost:${PORT}/api/auth/register`);

  // Asegurar columnas (idempotente) antes de cron jobs
  ensureRequiredColumns();

  // Asegurar tablas de departamentos de soporte
  ensureDepartmentsSchema();

  // Columnas opcionales de addresses (idempotente)
  Promise.all([
    pool.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS reception_hours TEXT`),
    pool.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS default_for_service TEXT`),
    pool.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS carrier_config JSONB`),
    pool.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS internal_only BOOLEAN DEFAULT FALSE`),
  ]).catch(() => {});

  // Columna fuente en exchange_rate_config (idempotente)
  pool.query(`ALTER TABLE exchange_rate_config ADD COLUMN IF NOT EXISTS fuente TEXT`).catch(() => {});

  // Columna para Chartback I: fecha de ingreso al primer nivel
  pool.query(`ALTER TABLE legacy_clients ADD COLUMN IF NOT EXISTS chartback_i_since TIMESTAMPTZ`).catch(() => {});

  // Columnas de instrucciones de entrega en packages (idempotente)
  Promise.all([
    pool.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_collect BOOLEAN DEFAULT FALSE`),
    pool.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS collect_carrier TEXT`),
    pool.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS wants_factura_paqueteria BOOLEAN DEFAULT FALSE`),
  ]).catch(() => {});


  // Tabla para referencias de pago a proveedores PO Box
  pool.query(`
    CREATE TABLE IF NOT EXISTS pobox_payment_references (
      id SERIAL PRIMARY KEY,
      supplier_id INTEGER,
      supplier_name TEXT,
      consolidation_ids INTEGER[],
      total_usd NUMERIC(12,2),
      total_mxn NUMERIC(12,2),
      packages_count INTEGER,
      packages_data JSONB,
      notas TEXT,
      status TEXT DEFAULT 'pendiente',
      paid_at TIMESTAMPTZ,
      paid_by INTEGER,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  // Migrar tabla existente: columnas de pago
  pool.query(`ALTER TABLE pobox_payment_references ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pendiente'`).catch(() => {});
  pool.query(`ALTER TABLE pobox_payment_references ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`).catch(() => {});
  pool.query(`ALTER TABLE pobox_payment_references ADD COLUMN IF NOT EXISTS paid_by INTEGER`).catch(() => {});

  // Seguridad de cuenta: timestamps de cambios + tabla 2FA
  pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_email_changed_at TIMESTAMPTZ`).catch(() => {});
  pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_phone_changed_at TIMESTAMPTZ`).catch(() => {});
  pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE`).catch(() => {});
  pool.query(`
    CREATE TABLE IF NOT EXISTS two_factor_codes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  pool.query(`CREATE INDEX IF NOT EXISTS idx_2fa_user ON two_factor_codes(user_id)`).catch(() => {});

  // Tabla package_documents para documentos subidos por asesores
  pool.query(`
    CREATE TABLE IF NOT EXISTS package_documents (
      id SERIAL PRIMARY KEY,
      package_id INTEGER,
      uploaded_by INTEGER,
      doc_type TEXT,
      file_url TEXT NOT NULL,
      original_filename TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  // One-shot: resetear cuenta de pruebas jesuscampos@entregax.com.mx
  // (idempotente — guarda marcador en system_configurations).
  runOneShotResetJesusCampos();

  // Asignar paquetes out_for_delivery sin driver al repartidor repartidor@entregax.com
  pool.query(`
    UPDATE packages p
    SET assigned_driver_id = (SELECT id FROM users WHERE email = 'repartidor@entregax.com' LIMIT 1)
    WHERE COALESCE(to_jsonb(p)->>'delivery_status', to_jsonb(p)->>'status') = 'out_for_delivery'
      AND to_jsonb(p)->>'assigned_driver_id' IS NULL
      AND p.updated_at >= NOW() - INTERVAL '7 days'
  `).then(r => {
    if (r.rowCount && r.rowCount > 0)
      console.log(`[startup] Asignados ${r.rowCount} paquetes out_for_delivery sin driver a repartidor@entregax.com`);
  }).catch(() => {});

  // Iniciar tareas programadas
  initCronJobs();
});
