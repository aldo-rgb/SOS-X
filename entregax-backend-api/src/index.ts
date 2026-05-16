// EntregaX Backend API v2.1.0
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
import { googleAuth, appleAuth, socialAuthStatus } from './socialAuthController';
import {
  sendPhoneVerificationCode,
  verifyPhoneCode,
  phoneVerificationStatus,
} from './phoneVerificationController';
import { whatsappStatus } from './whatsappService';
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
  updatePackageClient,
  getPackageMovementsByTracking,
  getPackageMovementsById,
  deletePackage,
  batchAttachImage,
  startBulkMaster,
  addBulkBoxToMaster,
  updateBulkMaster,
  removeBulkBoxFromMaster,
  getUnassignedPackages,
  searchClients
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
  getVerificationDetails,
  approveVerification,
  rejectVerification,
  reanalyzeVerification,
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
  getSupervisorAuthorizations
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
  checkCarrierGuideAvailable
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
  validateTracking,
  submitBoxIdClaim,
  uploadBoxIdClaimFiles,
  getBoxIdClaims,
  resolveBoxIdClaim
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
  getTdiShipmentDetail,
  deleteTdiShipment,
  updateTdiShipment,
  startTdiSerial,
  addTdiBox,
  removeTdiBox,
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
  uploadMiddleware,
  syncExternalLegacyClients
} from './legacyController';
import {
  listWallets as pcListWallets,
  getWalletDetail as pcGetWalletDetail,
  fundBranch as pcFundBranch,
  advanceDriver as pcAdvanceDriver,
  acceptAdvance as pcAcceptAdvance,
  listMyAdvances as pcListMyAdvances,
  registerExpense as pcRegisterExpense,
  getMyWallet as pcGetMyWallet,
  listPendingExpenses as pcListPendingExpenses,
  approveExpense as pcApproveExpense,
  rejectExpense as pcRejectExpense,
  closeRouteSettlement as pcCloseRouteSettlement,
  listSettlements as pcListSettlements,
  listAssignableDrivers as pcListDrivers,
  listBranchesWithBalance as pcListBranches,
  getPettyCashStats as pcGetStats,
  getCategories as pcGetCategories
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
  // Cron helpers
  actualizarCarteraVencida,
  sincronizarCartera,
  // Abandono
  getAbandonosListosProceso
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
  handlePoboxOpenpayCallback,
  getPoboxPendingPayments,
  getPoboxPaymentHistory,
  cancelPoboxPaymentOrder,
  payPoboxOrderInternal,
  applyCreditToPoboxOrder,
  revertCreditFromPoboxOrder,
  applyWalletToPoboxOrder,
  revertWalletFromPoboxOrder
} from './poboxPaymentController';
import {
  getMyEmitters,
  getEmitterSummary,
  listEmitterInvoices,
  downloadEmittedInvoiceFile,
  listPendingStamp,
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
      RETURNING gex_folio
    `, [folios]);
    
    if (updated.rowCount && updated.rowCount > 0) {
      console.log(`🛡️ GEX auto-activadas: ${updated.rows.map((r: any) => r.gex_folio).join(', ')}`);
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
  allowedHeaders: ['Content-Type', 'Authorization'],
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

// --- RUTAS DE CLIENTES LEGACY (Migración) ---
// Públicas (para registro)
app.post('/api/legacy/claim', authRateLimit, claimLegacyAccount);
app.get('/api/legacy/verify/:boxId', verifyLegacyBox);
app.post('/api/legacy/verify-name', verifyLegacyName);
// Protegidas (para admin)
app.post('/api/legacy/import', authenticateToken, requireRole(ROLES.SUPER_ADMIN), uploadMiddleware, importLegacyClients);
app.post('/api/legacy/sync-external', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER, ROLES.DIRECTOR), syncExternalLegacyClients);
app.get('/api/legacy/clients', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.WAREHOUSE_OPS), getLegacyClients);
app.get('/api/legacy/stats', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER), getLegacyStats);
app.delete('/api/legacy/clients/:id', authenticateToken, requireRole(ROLES.SUPER_ADMIN), deleteLegacyClient);

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
app.post('/api/admin/petty-cash/route-settle', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcCloseRouteSettlement);
app.get('/api/admin/petty-cash/settlements', authenticateToken, requireRole(...PCASH_ADMIN_ROLES), pcListSettlements);

// --- Endpoints MOBILE / CHOFER ---
app.get('/api/petty-cash/categories', authenticateToken, pcGetCategories);
app.get('/api/petty-cash/my-wallet', authenticateToken, pcGetMyWallet);
app.get('/api/petty-cash/my-advances', authenticateToken, pcListMyAdvances);
app.post('/api/petty-cash/advances/:id/accept', authenticateToken, pcAcceptAdvance);
app.post('/api/petty-cash/expenses', authenticateToken, pcExpenseUpload, handlePettyCashExpenseUpload, pcRegisterExpense);


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
        service_type as servicio,
        CASE 
          WHEN service_type = 'POBOX_USA' THEN 'air'
          WHEN service_type = 'AIR_CHN_MX' THEN 'china_air'
          WHEN service_type = 'SEA_CHN_MX' THEN 'maritime'
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
        gex_total_cost
      FROM packages
      WHERE (user_id = $1 OR box_id = $2)
        AND status::text NOT IN ('cancelled', 'returned')
        AND (
          status::text NOT IN ('delivered', 'sent')
          OR updated_at >= NOW() - INTERVAL '7 days'
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
          'USD' as monto_currency,
          CASE WHEN ds.delivery_address_id IS NOT NULL THEN true ELSE false END as has_delivery_instructions,
          false as needs_instructions,
          ds.national_carrier,
          ds.national_cost_mxn as national_shipping_cost,
          ds.national_tracking,
          ds.import_cost_usd as declared_value,
          (SELECT w.total_cost_mxn FROM warranties w WHERE w.gex_folio = ds.gex_folio LIMIT 1) as gex_total_cost
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
          id, master_id, tracking_internal, tracking_provider, child_no,
          description, weight, pkg_length, pkg_width, pkg_height,
          single_cbm, declared_value,
          box_number, status::text as status,
          pobox_venta_usd, pobox_cost_usd, pobox_service_cost,
          pobox_tarifa_nivel, registered_exchange_rate,
          national_shipping_cost, gex_total_cost,
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
        CASE
          WHEN service_type = 'POBOX_USA' AND COALESCE(received_by, '') <> '' THEN 'ENTREGADO'
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
        AND status IN ('delivered', 'sent')
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
          national_shipping_cost, gex_total_cost,
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

// Historial de movimientos por tracking (cualquier usuario autenticado con permiso)
app.get('/api/packages/track/:tracking/movements', authenticateToken, getPackageMovementsByTracking);

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

// 📋 Paquetes PO Box sin cliente asignado (con días en bodega) - DEBE IR ANTES DE /:id
app.get('/api/packages/unassigned', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getUnassignedPackages);
// 🔎 Búsqueda libre de clientes (users + legacy_clients) - DEBE IR ANTES DE /:id
app.get('/api/packages/search-clients', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), searchClients);

// Obtener detalle de paquete por ID (usuario dueño o staff+)
app.get('/api/packages/:id', authenticateToken, getPackageById);

// Obtener movimientos de guía por ID (usuario dueño o staff+)
app.get('/api/packages/:id/movements', authenticateToken, getPackageMovementsById);

// Obtener etiquetas para imprimir (Bodega o superior)
app.get('/api/packages/:id/labels', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getPackageLabels);

// Actualizar estatus de paquete (Bodega o superior)
app.patch('/api/packages/:id/status', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updatePackageStatus);

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
         p.has_delivery_instructions,
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
         u.full_name AS client_name,
         u.email AS client_email,
         a.alias AS address_alias,
         a.address_line AS address_line,
         a.city AS address_city,
         a.state AS address_state,
         a.zip AS address_zip
       FROM packages p
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN addresses a ON a.id = p.assigned_address_id
       WHERE UPPER(p.tracking_internal) = UPPER($1)
          OR UPPER(p.tracking_provider) = UPPER($1)
          OR REPLACE(UPPER(p.tracking_internal), '-', '') = $2
          OR REPLACE(UPPER(p.tracking_provider), '-', '') = $2
       LIMIT 5`,
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
    const { packageId, reason } = req.body || {};
    const id = parseInt(String(packageId), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'packageId inválido' });

    const cur = await pool.query(
      `SELECT id, tracking_internal, has_delivery_instructions, assigned_address_id,
              delivery_address_id, destination_address, national_label_url,
              national_tracking, status
       FROM packages WHERE id = $1`,
      [id]
    );
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Paquete no encontrado' });
    const pkg = cur.rows[0];

    // Bloqueo de seguridad: si ya tiene etiqueta nacional impresa, el
    // paquete está comprometido con la paquetería. Revertir aquí dejaría
    // la etiqueta inconsistente y el chofer entregando a una dirección
    // que ya no existe en el sistema.
    if (pkg.national_label_url || pkg.national_tracking) {
      return res.status(409).json({
        error: 'No se puede revertir: la guía ya tiene etiqueta impresa. Cancela primero la etiqueta de paquetería.',
        hasLabel: true,
      });
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
         has_delivery_instructions = FALSE,
         destination_address = 'Pendiente de asignar',
         destination_city = NULL,
         destination_zip = NULL,
         destination_phone = NULL,
         destination_contact = NULL,
         needs_instructions = TRUE,
         updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

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
    return res.json({ success: true, packageId: id, tracking: pkg.tracking_internal });
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

//  Lookup de cliente por casillero (busca en users y legacy_clients)
app.get('/api/packages/lookup-client/:boxId', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), async (req, res) => {
  try {
    const boxId = String(req.params.boxId || '').trim().toUpperCase();
    if (!boxId) return res.status(400).json({ found: false, error: 'boxId requerido' });

    const u = await pool.query(
      'SELECT id, full_name, box_id, email FROM users WHERE UPPER(box_id) = $1 LIMIT 1',
      [boxId]
    );
    if (u.rows.length > 0) {
      const r = u.rows[0];
      return res.json({
        found: true, source: 'users',
        id: r.id, fullName: r.full_name, boxId: r.box_id, email: r.email || null,
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
app.post('/api/payments/create', authenticateToken, paymentLimiter, validateBody(createPaymentOrderSchema), createPaymentOrder);
app.post('/api/payments/capture', authenticateToken, paymentLimiter, validateBody(capturePaymentOrderSchema), capturePaymentOrder);
app.get('/api/payments/status/:consolidationId', authenticateToken, getPaymentStatus);

// --- RUTAS DE PAGOS NUEVAS - GATEWAY INTEGRATIONS ---
app.post('/api/payments/openpay/card', authenticateToken, processOpenPayCard);
app.post('/api/payments/paypal/create', authenticateToken, createPayPalPayment);
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
app.delete('/api/pobox/payment/order/:id', authenticateToken, cancelPoboxPaymentOrder); // Cancelar orden de pago
app.post('/api/pobox/payment/order/:id/pay-internal', authenticateToken, paymentLimiter, validateBody(payPoboxInternalSchema), payPoboxOrderInternal); // Pago con saldo/crédito
app.post('/api/pobox/payment/order/:id/apply-credit', authenticateToken, paymentLimiter, validateBody(applyCreditPoboxSchema), applyCreditToPoboxOrder); // Aplicar crédito parcial
app.post('/api/pobox/payment/order/:id/revert-credit', authenticateToken, paymentLimiter, revertCreditFromPoboxOrder); // Revertir crédito parcial
app.post('/api/pobox/payment/order/:id/apply-wallet', authenticateToken, paymentLimiter, validateBody(applyWalletPoboxSchema), applyWalletToPoboxOrder); // Aplicar saldo a favor parcial
app.post('/api/pobox/payment/order/:id/revert-wallet', authenticateToken, paymentLimiter, revertWalletFromPoboxOrder); // Revertir saldo a favor

// ========== PORTAL CONTABLE (Multi-Empresa) ==========
app.get('/api/accounting/my-emitters', authenticateToken, getMyEmitters);
app.get('/api/accounting/:emitterId/summary', authenticateToken, getEmitterSummary);
app.get('/api/accounting/:emitterId/invoices', authenticateToken, listEmitterInvoices);
app.get('/api/accounting/:emitterId/invoices/:invoiceId/file', authenticateToken, downloadEmittedInvoiceFile);
app.get('/api/accounting/:emitterId/pending-stamp', authenticateToken, listPendingStamp);
app.post('/api/fiscal/invoice/manual', authenticateToken, emitManualCFDI);
app.get('/api/accounting/:emitterId/fiscal-clients', authenticateToken, searchFiscalClients);
app.post('/api/accounting/:emitterId/invoices/manual', authenticateToken, createManualInvoice);
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
app.post('/api/payment/voucher/upload', authenticateToken, voucherUpload.single('voucher'), uploadVoucher);
app.post('/api/payment/voucher/confirm', authenticateToken, confirmVoucherAmount);
app.post('/api/payment/voucher/complete', authenticateToken, completeVoucherPayment);
app.get('/api/payment/voucher/:orderId', authenticateToken, getOrderVouchers);
app.delete('/api/payment/voucher/:voucherId', authenticateToken, deleteVoucher);
app.get('/api/payment/wallet/service', authenticateToken, getServiceWalletBalances);
// Admin voucher conciliation
app.get('/api/admin/vouchers/pending', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAdminPendingVouchers);
app.get('/api/admin/vouchers/order/:orderId', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAdminOrderVouchers);
app.get('/api/admin/vouchers/stats', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getVoucherStats);
app.post('/api/admin/voucher/approve/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), approveVoucher);
app.post('/api/admin/voucher/reject/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), rejectVoucher);

// --- RUTAS DE VERIFICACIÓN KYC ---
app.post('/api/verify/documents', authenticateToken, verifyLimiter, uploadVerificationDocuments);
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
app.get('/api/admin/verifications/:userId/details', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getVerificationDetails);
app.post('/api/admin/verifications/:userId/approve', authenticateToken, requireMinLevel(ROLES.DIRECTOR), approveVerification);
app.post('/api/admin/verifications/:userId/reject', authenticateToken, requireMinLevel(ROLES.DIRECTOR), rejectVerification);
app.post('/api/admin/verifications/:userId/reanalyze', authenticateToken, requireMinLevel(ROLES.DIRECTOR), reanalyzeVerification);

// --- RUTAS DE FACTURACIÓN FISCAL ---
// Admin: Gestión de empresas emisoras
app.get('/api/admin/fiscal/emitters', authenticateToken, requireMinLevel(ROLES.DIRECTOR), getFiscalEmitters);
app.post('/api/admin/fiscal/emitters', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createFiscalEmitter);
app.put('/api/admin/fiscal/emitters', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateFiscalEmitter);
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
  createEntangledRequestV2
);
app.get('/api/entangled/payment-requests/me', authenticateToken, getMyEntangledRequests);
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
app.get('/api/entangled/suppliers', authenticateToken, listMyEntangledSuppliers);
app.post('/api/entangled/suppliers', authenticateToken, createMyEntangledSupplier);
app.put('/api/entangled/suppliers/:id', authenticateToken, updateMyEntangledSupplier);
app.delete('/api/entangled/suppliers/:id', authenticateToken, deleteMyEntangledSupplier);
// Perfil fiscal reutilizable, pricing y cotización
app.get('/api/entangled/fiscal-profile', authenticateToken, getMyEntangledFiscalProfile);
app.get('/api/entangled/clave-sat-history', authenticateToken, listEntangledClaveSatHistory);
app.put('/api/entangled/fiscal-profile', authenticateToken, upsertMyEntangledFiscalProfile);
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
app.post('/api/entangled/payment-requests/:id/upload-proof-file', authenticateToken, entangledProofUpload.single('comprobante'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const id = Number(req.params.id);
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const { pool: dbPool } = await import('./db');
    const owner = await dbPool.query(
      'SELECT user_id, entangled_transaccion_id FROM entangled_payment_requests WHERE id = $1', [id]
    );
    if (!owner.rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (owner.rows[0].user_id !== userId) return res.status(403).json({ error: 'Sin acceso' });

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

    // 3) Comprobante adicional/reemplazo para una solicitud ya enviada
    const r = await dbPool.query(
      `SELECT id, referencia_pago, op_comprobante_cliente_url, comprobante_subido_at
         FROM entangled_payment_requests WHERE id = $1`,
      [id]
    );
    return res.json({ ok: true, ...r.rows[0] });
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
app.get('/api/admin/branches', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getAllBranches);
app.post('/api/admin/branches', authenticateToken, requireMinLevel(ROLES.DIRECTOR), createBranch);
app.put('/api/admin/branches/:id', authenticateToken, requireMinLevel(ROLES.DIRECTOR), updateBranch);
app.delete('/api/admin/branches/:id', authenticateToken, requireRole(ROLES.SUPER_ADMIN), deleteBranch);
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

// 🆘 Público: Reclamación de número de cliente (sin auth)
app.post('/api/support/public/claim-box-id', uploadBoxIdClaimFiles, submitBoxIdClaim);

// Admin: Listar / resolver reclamaciones de box_id
app.get('/api/admin/support/box-id-claims', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), getBoxIdClaims);
app.put('/api/admin/support/box-id-claims/:id', authenticateToken, requireMinLevel(ROLES.COUNTER_STAFF), resolveBoxIdClaim);

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
        COALESCE(scc.service_type, 'general') as servicio_asignado,
        scc.service_name
      FROM fiscal_emitters fe
      LEFT JOIN service_company_config scc ON scc.emitter_id = fe.id
      WHERE fe.is_active = TRUE AND (fe.openpay_configured = TRUE OR scc.id IS NOT NULL)
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
        COALESCE(SUM(CASE WHEN COALESCE(owl.payment_method, owl.tipo_pago, 'spei') = 'spei' THEN owl.monto_neto ELSE 0 END), 0) as spei_neto,
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

    // Efectivo del mes
    const ingresosMesRes = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) as efectivo_mes
      FROM caja_chica_transacciones
      WHERE created_at >= $1 AND created_at <= $2
        ${serviceFilter ? "AND service_type = ANY($3)" : ""}
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
          owl.monto_recibido as monto_bruto,
          owl.monto_neto,
          owl.monto_recibido - owl.monto_neto as comision,
          COALESCE(pp.payment_method, owl.payment_method, owl.tipo_pago, 'spei') as metodo,
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
    const comisionesMes = (speiMesTotal - speiNetoMesTotal) + (paypalMes - paypalNetoMes);
    const totalMes = efectivoMes + speiMesTotal + paypalMes;

    // Saldo más reciente por empresa desde bank_statement_entries
    const saldosPorEmpresaRes = await pool.query(`
      SELECT DISTINCT ON (empresa_id) empresa_id, saldo, fecha
      FROM bank_statement_entries
      ORDER BY empresa_id, fecha DESC, id DESC
    `);

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
    let whereClause1 = "WHERE owl.estatus_procesamiento = 'pending_payment'";
    const params1: any[] = [];
    let paramIndex1 = 1;

    if (branch_id) {
      whereClause1 += ` AND owl.branch_id = $${paramIndex1++}`;
      params1.push(branch_id);
    }

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
      const list = SERVICE_ALIASES[service_type as string] || [service_type as string];
      whereClause1 += ` AND owl.service_type = ANY($${paramIndex1++})`;
      params1.push(list);
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
        COALESCE(pp.credit_applied, 0) as credit_applied,
        COALESCE(pp.wallet_applied, 0) as wallet_applied,
        'webhook' as source
      FROM openpay_webhook_logs owl
      LEFT JOIN users u ON owl.user_id = u.id
      LEFT JOIN fiscal_emitters fe ON owl.empresa_id = fe.id
      LEFT JOIN branches b ON owl.branch_id = b.id
      LEFT JOIN pobox_payments pp ON pp.payment_reference = owl.transaction_id
      ${whereClause1}
      ORDER BY owl.fecha_pago DESC
    `, params1);

    // 2. Obtener pagos con comprobantes enviados (listos para conciliar)
    let whereClause2 = "WHERE pp.status = 'vouchers_submitted' AND pp.payment_method = 'cash'";
    const params2: any[] = [];

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
        'POBOX_USA' as tipo_servicio,
        pp.payment_method,
        COALESCE(pp.credit_applied, 0) as credit_applied,
        COALESCE(pp.wallet_applied, 0) as wallet_applied,
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
      credit_applied: parseFloat(r.credit_applied) || 0,
      wallet_applied: parseFloat(r.wallet_applied) || 0,
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
        credit_applied: parseFloat(r.credit_applied) || 0,
        wallet_applied: parseFloat(r.wallet_applied) || 0,
        cliente: r.cliente || 'Cliente desconocido',
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
// OBTENER MOVIMIENTOS GUARDADOS DE ESTADO DE CUENTA
// ============================================
app.get('/api/admin/finance/bank-entries', authenticateToken, requireMinLevel(ROLES.DIRECTOR), async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { empresa_id } = req.query;
    if (!empresa_id) return res.status(400).json({ error: 'Falta empresa_id' });

    const result = await pool.query(`
      SELECT id, fecha, concepto, referencia, cargo, abono, saldo, banco, uploaded_at
      FROM bank_statement_entries
      WHERE empresa_id = $1
      ORDER BY fecha DESC, id ASC
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

    for (const entry of entries) {
      // Generar hash para deduplicar
      const hashInput = `${entry.fecha}|${entry.concepto}|${entry.referencia || ''}|${entry.cargo || ''}|${entry.abono || ''}|${entry.saldo || ''}`;
      const entryHash = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 64);

      try {
        const result = await pool.query(`
          INSERT INTO bank_statement_entries (empresa_id, service_type, banco, fecha, concepto, referencia, cargo, abono, saldo, entry_hash, uploaded_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (empresa_id, entry_hash) DO NOTHING
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

// ========== TDI EXPRESS — recepción en serie ruta TDI-EXPRES ==========
app.get('/api/tdi-express/product-types', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getTdiProductTypes);
app.get('/api/tdi-express/stats', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getTdiStats);
app.get('/api/tdi-express/shipments', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), listTdiShipments);
app.get('/api/tdi-express/shipments/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getTdiShipmentDetail);
app.delete('/api/tdi-express/shipments/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), deleteTdiShipment);
app.patch('/api/tdi-express/shipments/:id', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), updateTdiShipment);
app.post('/api/tdi-express/serial/start', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), startTdiSerial);
app.post('/api/tdi-express/serial/:masterId/box', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), addTdiBox);
app.delete('/api/tdi-express/serial/:masterId/child/:childId', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), removeTdiBox);

// ========== RECEPCIÓN AÉREA POR AWB (Hub TDI Aéreo China) ==========
app.get('/api/admin/china-air/awbs/in-transit', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), listInTransitAwbs);
app.get('/api/admin/china-air/awbs/:id/packages', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getAwbPackages);
app.post('/api/admin/china-air/awbs/:id/scan', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), scanAwbPackage);
app.post('/api/admin/china-air/awbs/:id/finalize', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), finalizeAwbReception);
app.get('/api/admin/china-air/inventory', authenticateToken, requireMinLevel(ROLES.WAREHOUSE_OPS), getAirInventory);

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
app.get('/api/hr/my-attendance', authenticateToken, getMyAttendanceToday);
app.post('/api/hr/track-gps', authenticateToken, trackGPSLocation);

// Admin HR — lectura accesible también a Contador para nómina/reportes.
app.get('/api/admin/hr/employees', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), getEmployeesWithAttendance);
app.get('/api/admin/hr/employees/:id', authenticateToken, requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DIRECTOR, ROLES.BRANCH_MANAGER, ROLES.ACCOUNTANT), getEmployeeDetail);
app.post('/api/admin/hr/employees', authenticateToken, requireMinLevel(ROLES.ADMIN), createEmployee);
app.put('/api/admin/hr/employees/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), updateEmployee);
app.delete('/api/admin/hr/employees/:id', authenticateToken, requireMinLevel(ROLES.ADMIN), deleteEmployee);
app.post('/api/admin/hr/employees/:id/reactivate', authenticateToken, requireMinLevel(ROLES.ADMIN), async (req, res) => {
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

    // Dirección de destino preferida del cliente
    let destinationAddress: any = null;
    if (container.client_user_id) {
      try {
        const a = await pool.query(`
          SELECT * FROM addresses
          WHERE user_id = $1
          ORDER BY
            (default_for_service ILIKE '%maritimo%' OR default_for_service ILIKE '%fcl%') DESC,
            is_default DESC,
            created_at DESC
          LIMIT 1
        `, [container.client_user_id]);
        destinationAddress = a.rows[0] || null;
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

// Retorno a bodega: Paquetes no entregados
app.get('/api/driver/packages-to-return', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), getPackagesToReturn);
app.post('/api/driver/scan-return', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), scanPackageReturn);

// Confirmación de entrega
app.post('/api/driver/confirm-delivery', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), confirmDelivery);
app.post('/api/driver/confirm-delivery-bulk', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), confirmDeliveryBulk);
app.get('/api/driver/deliveries-today', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), getDeliveriesToday);

// Verificar paquete antes de entregar
app.get('/api/driver/verify-package/:barcode', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), verifyPackageForDelivery);
app.get('/api/driver/check-carrier-guide/:guide', authenticateToken, requireMinLevel(ROLES.REPARTIDOR), checkCarrierGuideAvailable);

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
// BRAND ASSETS (Logos corporativos centralizados)
// ============================================
import {
  listBrandAssets,
  getActiveBrandAssets,
  uploadBrandAsset,
  activateBrandAsset,
  deleteBrandAsset,
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
app.get('/api/firma-abandono/:token', getDocumentoAbandono); // Público
app.post('/api/firma-abandono/:token', firmarDocumentoAbandono); // Público

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
      ALTER TABLE accounting_received_invoices ADD COLUMN IF NOT EXISTS facturapi_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_acc_recinv_facturapi ON accounting_received_invoices(facturapi_id);
      -- 📦 Vínculo estructural packages ↔ pqtx_shipments (fuente de verdad del costo de paquetería)
      -- Permite prorratear correctamente cuando varios paquetes viajan en la misma guía PQTX
      -- (sea master multipieza o consolidación de varios envíos en una guía).
      ALTER TABLE packages ADD COLUMN IF NOT EXISTS pqtx_shipment_id INTEGER;
      CREATE INDEX IF NOT EXISTS idx_packages_pqtx_shipment_id ON packages(pqtx_shipment_id);

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
    `);
    console.log('✅ [STARTUP] Columnas de paquetería nacional verificadas');

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
app.get('/api/system/payment-status', async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT config_key, config_value
       FROM system_configurations
       WHERE config_key IN ('payments_enabled', 'xpay_enabled', 'entregax_payments_enabled', 'gex_enabled')
         AND is_active = TRUE`
    );
    const byKey: Record<string, any> = {};
    r.rows.forEach((row: any) => { byKey[row.config_key] = row.config_value; });

    // xpay_enabled: controla botón X-Pay (x-pay.direct)
    const xpayEnabled = byKey['xpay_enabled'] !== undefined
      ? byKey['xpay_enabled']?.enabled !== false
      : (byKey['payments_enabled']?.enabled !== false); // fallback al toggle global

    // entregax_payments_enabled: controla botón Pagar de EntregaX
    const entregaxPaymentsEnabled = byKey['entregax_payments_enabled'] !== undefined
      ? byKey['entregax_payments_enabled']?.enabled !== false
      : (byKey['payments_enabled']?.enabled !== false); // fallback al toggle global

    // gex_enabled: controla la contratación de Garantía Extendida (GEX).
    // Por defecto TRUE — solo se desactiva si el super_admin lo apaga.
    const gexEnabled = byKey['gex_enabled'] !== undefined
      ? byKey['gex_enabled']?.enabled !== false
      : true;

    // payments_enabled: legacy (ambos activos si ambos activos)
    const paymentsEnabled = xpayEnabled && entregaxPaymentsEnabled;

    res.json({
      payments_enabled: paymentsEnabled,
      xpay_enabled: xpayEnabled,
      entregax_payments_enabled: entregaxPaymentsEnabled,
      gex_enabled: gexEnabled,
    });
  } catch (_e) {
    res.json({ payments_enabled: true, xpay_enabled: true, entregax_payments_enabled: true, gex_enabled: true });
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

// POST /api/admin/system/entregax-payments-toggle — controla solo pagos EntregaX
app.post('/api/admin/system/entregax-payments-toggle', authenticateToken, requireRole('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled !== false;
    const userId = req.user?.userId || null;
    await pool.query(
      `INSERT INTO system_configurations (config_key, config_value, description, is_active)
       VALUES ('entregax_payments_enabled', $1::jsonb, 'Control de pagos EntregaX (botón Pagar en app/web)', TRUE)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = $1::jsonb, updated_at = NOW(), updated_by = $2`,
      [JSON.stringify({ enabled: !!enabled }), userId]
    );
    console.log(`💳 [ENTREGAX-PAYMENTS] ${enabled ? '✅ Habilitado' : '🔴 Deshabilitado'} por user #${userId}`);
    res.json({ success: true, entregax_payments_enabled: !!enabled });
  } catch (err: any) {
    console.error('[ENTREGAX-PAYMENTS-TOGGLE]', err.message);
    res.status(500).json({ error: 'Error al actualizar estado de pagos EntregaX' });
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

// ============================================================
// MIDDLEWARES FINALES — deben ir DESPUÉS de TODAS las rutas
// (si se registran antes, el catchall 404 atrapa cualquier ruta
// declarada más abajo y nunca llega al handler real).
// ============================================================

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

  // One-shot: resetear cuenta de pruebas jesuscampos@entregax.com.mx
  // (idempotente — guarda marcador en system_configurations).
  runOneShotResetJesusCampos();

  // Iniciar tareas programadas
  initCronJobs();
});
