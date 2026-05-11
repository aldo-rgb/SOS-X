import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Alert,
    ActivityIndicator,
    ScrollView,
    Dimensions,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { CameraView, useCameraPermissions } from 'expo-camera';
import SignatureScreen from 'react-native-signature-canvas';
import { api, API_URL } from '../services/api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

type RootStackParamList = {
    Verification: { user: any; token: string };
    Home: { user: any; token: string };
};

type Props = {
    navigation: NativeStackScreenProps<RootStackParamList, 'Verification'>['navigation'];
    route: RouteProp<RootStackParamList, 'Verification'>;
};

const { width, height } = Dimensions.get('window');

const buildSteps = (isAdvisor: boolean) => ([
    { id: 1, title: 'INE Frente', icon: 'card-outline', instruction: 'Toma una foto del frente de tu ID' },
    { id: 2, title: 'INE Reverso', icon: 'card-outline', instruction: 'Toma una foto del reverso de tu ID' },
    {
        id: 3,
        title: 'Constancia Fiscal',
        icon: 'receipt-outline',
        instruction: isAdvisor
            ? 'Sube tu Constancia de Situación Fiscal (obligatoria para el cobro de comisiones)'
            : 'Sube tu Constancia de Situación Fiscal (opcional, recomendada si vas a solicitar facturas)',
    },
    { id: 4, title: 'Selfie', icon: 'camera-outline', instruction: 'Toma una selfie clara de tu rostro' },
    { id: 5, title: 'Términos y Condiciones', icon: 'document-text-outline', instruction: 'Lea y acepte los términos de nuestro contrato de prestación de servicios' },
    { id: 6, title: 'Firma Digital', icon: 'create-outline', instruction: 'Dibuja tu firma en el recuadro' },
]);

// Términos y Condiciones
const TERMS_AND_CONDITIONS = `LOGISTI-K SYSTEMS DEVELOPMENT S.A. DE C.V. (en adelante como "LSD") y EL CLIENTE, acuerdan que la aceptación y ejecución del presente contrato (el "Contrato") en la que se incluye el presente clausulado constituye el consentimiento de EL CLIENTE para sujetarse a los siguientes términos y condiciones:

TÉRMINOS Y CONDICIONES:

OBJETO. El objeto de la relación comercial, así como su alcance, se limitan única y exclusivamente a lo detallado en (las) Cotización(es) que se anexen al presente Contrato de tiempo en tiempo, las cuales solo se emitirán por LSD a atendiendo las solicitudes de servicio de EL CLIENTE y no requerían firmas de las Partes dado que se entenderán por aceptadas automáticamente por ambas partes una vez que hayan transcurrido 48 horas después de su generación y no se reciban comentarios u objeciones por alguna de las Partes.

CONTRAPRESTACIÓN. La cantidad señalada como contraprestación en la Cotización aplicable será pagada en los términos y condiciones ahí descritos.

OBLIGACIONES DEL CLIENTE. Además de las obligaciones y compromisos que se especifiquen en cada una de las Cotizaciones que se emitan por LSD de tiempo en tiempo, EL CLIENTE se compromete en todo momento a proporcionar la información correcta de sus productos como lo es, de manera enunciativa más no limitativa: fotografías, manuales, listas de empaque, comprobantes de pago de adquisición de mercancías y/o cualquier otra que sé necesaria para que LSD pueda brindar el servicio contratado en la Cotización respectiva. Adicionalmente, EL CLIENTE acepta que en caso de que existan gastos generados por sus mercancías en el punto de origen, esos serán adicionados a la cotización.

CONFIDENCIALIDAD DE LA INFORMACIÓN. Las partes acuerdan el considerar como información confidencial cualquier información oral o escrita proporcionada por una a la otra con motivo de esta operación y/o del acuerdo de voluntades que paralelamente a este instrumento se llegue a firmar y que las partes identifiquen como "Confidencial". Se incluye toda la información escrita, oral, gráfica, visual o tangible por cualquiera de los sentidos del ser humano, o contenida en medios escritos, electrónicos o electromagnéticos, la que incluye de manera enunciativa más no limitativa, información técnica, financiera y comercial relativa a nombres de clientes o acreditados, información sensible o no en términos de la Ley Federal de Protección de Datos Personales en Posesión de Particulares (En lo sucesivo "LFPDP"). En virtud de lo anterior, las partes se obligan a adoptar las acciones y precauciones necesarias para preservar la confidencialidad de la información confidencial. Las partes acuerdan que ellas usarán la información confidencial solamente para la ejecución de la presente operación y se obligan a no revelar la información confidencial, ya sea total o parcialmente, y no usar la misma para propósitos distintos a los detallados anteriormente.

VIGENCIA. La relación de este Contrato es por tiempo indefinido y aplicará en todas y cada una de las Cotizaciones que se emitan por LSD y hayan sido aceptadas por EL CLIENTE de conformidad con la cláusula de objeto del presente Contrato.

POLÍTICA DE DEVOLUCIÓN. La garantía de devolución a favor de EL CLIENTE aplicará siempre y cuando sea informado a través de un correo institucional de LSD que su mercancía sí califica para dicho evento. El reembolso será de USD $7.00 (siete dólares estadounidenses) por kilo si el traslado es aéreo y/o terrestre. Si el traslado es marítimo se reembolsarán USD $800.00 (ochocientos dólares estadounidenses) por metro cúbico. Dichos reembolsos mencionados en el presente artículo, solo aplicarán en el evento de que EL CLIENTE no cuente con una garantía extendida directamente contratada con LSD previo al traslado de sus mercancías. En lo sucesivo; si EL CLIENTE realizó un pago con antelación de mercancía que aplicó para reembolso, se devolverá dicho pago más el reembolso correspondiente. Lo anterior, en el entendido que EL CLIENTE tendrá un plazo máximo de 90 (noventa) días naturales para hacer válido el reembolso aquí estipulado, los cuales empezaran a contar desde el día que haya recibido el correo electrónico de LSD.

CÁLCULOS DE COTIZACIÓN. El tipo de cambio de cotización se basará en el servicio aéreo, en el día que su mercancía toma vuelo en su punto de origen; y en servicio marítimo en el día de cierre y embarque de contenedor. Los precios están sujetos a cambios, ya que el flete fluctúa constantemente a base de demanda, temporada.

GASTOS DE ALMACENAMIENTO DE MERCANCÍAS A CARGO DE EL CLIENTE. Una vez que haya transcurrido el plazo de 15 (quince) días naturales después de la(s) mercancía(s) de EL CLIENTE hayan arribado a las instalaciones de LSD; y EL CLIENTE no haya liquidado cualquier adeudo (parcial o total) que tenga con LSD, en este acto acepta que en automático se le estarán realizando los cobros correspondientes de almacenaje y resguardo de sus mercancías según los aranceles y tarifas que LSD tenga vigente al momento de cobro de dichos conceptos; siendo esta tarifa la de MXN $1.00 (un peso MXN) por cada kilo que pese la(s) mercancía(s). Lo anterior en el entendido de que EL CLIENTE consciente y faculta a LSD para que pueda retener las mercancías hasta que EL CLIENTE no haya realizado el pago de estos conceptos.

RENUNCIA DE DERECHOS DE PROPIEDAD DE EL CLIENTE. Una vez que haya transcurrido el plazo de 60 (sesenta) días naturales después de la(s) mercancía(s) de EL CLIENTE se hayan cotizado por parte de LSD; y EL CLIENTE no ha liquidado cualquier adeudo (parcial o total) que tenga con LSD, en este acto acepta que, si EL CLIENTE no solicitó formalmente por escrito ante LSD una prórroga de otro plazo de 30 (treinta) días naturales, en automático estuviere renunciando a sus derechos de propiedad sobre dichas mercancías que fueron despachadas por LSD. Por consiguiente, después de la renuncia de derechos de parte de EL CLIENTE, este último cede a favor de LSD todos los derechos de propiedad de dichas mercancías, inclusive autorizándolo de forma irrevocable a que LSD pueda refacturar dichas mercancías ya como propiedad de LSD.

LÍMITE DE RESPONSABILIDAD Y GARANTÍA. LSD garantiza que la calidad de los servicios al amparo de las Cotizaciones cumplen con los estándares de mercado en México y con los requerimientos específicos realizados por EL CLIENTE, obligándose a resarcir los daños y perjuicios que puedan ser causados a EL CLIENTE por incumplimiento a cualquiera de sus obligaciones al amparo del presente Contrato y/o su respectiva Cotización. Lo anterior, en el entendido que el límite máximo de responsabilidad la cual estará expuesto LSD no podrá exceder del 50% (cincuenta por ciento) del valor total de la contraprestación (antes de impuestos) pactada en la Cotización respectiva que haya generado el incumplimiento y por consiguiente los daños y perjuicios a EL CLIENTE. No obstante lo anterior, es del entendido de las Partes que LSD no se hará responsable de ningún daño y perjuicio que haya sufrido EL CLIENTE a consecuencia de: i) retrasos en vuelos; ii) despacho en aduana; iii) revisiones que generen retrasos en entrega por paquetería nacional; iv) faltantes en mercancía; v) daños de embalaje; y/o vi) declaración errónea de mercancía por parte de EL CLIENTE y/o personal contratado o que le brinde un servicio a este último.

FIRMA DIGITAL. Las Partes manifiestan su consentimiento para el uso de la firma electrónica a través del proveedor de servicios de tecnología de firma electrónica y servicios de administración de transacciones digitales que LSD determine para facilitar el intercambio electrónico del Contrato y/o sus anexos correspondientes y comunicaciones que deban ser firmadas, dando el mismo valor a los documentos así firmados a como si estos hubieran sido firmados de forma autógrafa. No obstante, lo anterior, es del mutuo acuerdo de las Partes que LSD en cualquier momento podrá solicitar a EL CLIENTE que el documento sea rubricado en físico. La utilización de la firma electrónica tendrá como efecto el sometimiento expreso a las disposiciones del presente y, por lo tanto, surtirá efectos plenos para las Partes, frente a ellos mismos y frente a terceros. Las partes renuncian expresamente a argumentar desconocimiento de la firma electrónica que haya sido estampada en el presente Contrato.

FECHA DE FIRMA Y JURISDICCIÓN. Las partes acuerdan celebrar el presente Contrato el día de en el entendido que su consentimiento fue otorgado libre de todo vicio de voluntad, error, dolo, mala fe y/o violencia. Para la interpretación y cumplimiento de los presentes términos y condiciones, así como para todo aquello que no esté contemplado en los mismos, las partes acuerdan someterse a la jurisdicción y leyes aplicables en la ciudad de Monterrey, Nuevo León, renunciando expresamente a cualquier otro fuero que por razón de sus domicilios presentes o futuros pudiera corresponderles.`;

export default function VerificationScreen({ navigation, route }: Props) {
    const { token, user } = route.params;
    const userRole = String(user?.role || '').toLowerCase();
    const isAdvisor = ['advisor', 'asesor', 'asesor_lider', 'sub_advisor'].includes(userRole);
    const STEPS = React.useMemo(() => buildSteps(isAdvisor), [isAdvisor]);
    const STEP_INE_FRONT = 1;
    const STEP_INE_BACK = 2;
    const STEP_CSF = 3;
    const STEP_SELFIE = 4;
    const STEP_TERMS = 5;
    const STEP_SIGNATURE = 6;
    const PHOTO_STEPS = [STEP_INE_FRONT, STEP_INE_BACK, STEP_SELFIE];
    // Slots: claves estables para las fotos (independientes del número de paso)
    type PhotoSlot = 'ineFront' | 'ineBack' | 'selfie';
    const SLOT_INE_FRONT: PhotoSlot = 'ineFront';
    const SLOT_INE_BACK: PhotoSlot = 'ineBack';
    const SLOT_SELFIE: PhotoSlot = 'selfie';
    const slotForStep = (step: number): PhotoSlot | null => {
        if (step === STEP_INE_FRONT) return SLOT_INE_FRONT;
        if (step === STEP_INE_BACK) return SLOT_INE_BACK;
        if (step === STEP_SELFIE) return SLOT_SELFIE;
        return null;
    };
    const [currentStep, setCurrentStep] = useState(1);
    const [images, setImages] = useState<{ [key: string]: string }>({});
    // Indicador visual: colapsa INE Frente + Reverso en 1 punto (5 puntos en total)
    const VISUAL_TOTAL = 5;
    const visualStep = currentStep <= STEP_INE_BACK ? 1 : currentStep - 1;
    const [constanciaFiscal, setConstanciaFiscal] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
    const [signature, setSignature] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
    // Contrato de servicios: lo trae del backend (Documentos Legales →
    // Contrato de Servicios Clientes) para que sea editable sin redeploy.
    // Si la red falla, usamos el texto hardcoded como fallback.
    const [serviceContract, setServiceContract] = useState<{ title: string; content: string; version: string | null } | null>(null);
    const [contractLoading, setContractLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${API_URL}/api/legal-documents/service_contract`);
                if (!res.ok) throw new Error('not ok');
                const data = await res.json();
                if (!cancelled && data?.success && data.document?.content) {
                    setServiceContract({
                        title: data.document.title || 'Contrato de Prestación de Servicios',
                        content: data.document.content,
                        version: data.document.version || null,
                    });
                }
            } catch {
                // Silencioso: si no hay conexión usamos el texto local de
                // TERMS_AND_CONDITIONS como respaldo.
            } finally {
                if (!cancelled) setContractLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);
    const [showCamera, setShowCamera] = useState(false);
    const [cameraSlot, setCameraSlot] = useState<PhotoSlot>('ineFront');
    const signatureRef = useRef<any>(null);
    const cameraRef = useRef<any>(null);
    const [permission, requestPermission] = useCameraPermissions();

    // Manejadores de firma
    const handleSignatureOK = (sig: string) => {
        setSignature(sig);
    };

    const handleSignatureEmpty = () => {
        Alert.alert('Error', 'Por favor dibuja tu firma');
    };

    const handleSignatureClear = () => {
        signatureRef.current?.clearSignature();
        setSignature(null);
    };

    // Detectar scroll al final de términos
    const handleTermsScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 50;
        if (isCloseToBottom) {
            setHasScrolledToEnd(true);
        }
    };

    // Abrir cámara con guía
    const openCameraWithGuide = async (slot: PhotoSlot) => {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                Alert.alert('Permisos requeridos', 'Necesitamos acceso a la cámara');
                return;
            }
        }
        setCameraSlot(slot);
        setShowCamera(true);
    };

    // Tomar foto
    const takePicture = async () => {
        if (cameraRef.current) {
            try {
                const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
                setImages(prev => ({ ...prev, [cameraSlot]: photo.uri }));
                setShowCamera(false);
            } catch (error) {
                console.error('Error tomando foto:', error);
                Alert.alert('Error', 'No se pudo tomar la foto');
            }
        }
    };

    const pickImage = async (slot: PhotoSlot, useCamera: boolean = true) => {
        if (useCamera) {
            openCameraWithGuide(slot);
            return;
        }
        
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permisos requeridos', 'Necesitamos acceso a tus fotos.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsEditing: false,
                quality: 0.7,
            });

            if (!result.canceled && result.assets && result.assets[0]) {
                const uri = result.assets[0].uri;
                setImages(prev => ({ ...prev, [slot]: uri }));
            }
        } catch (error) {
            console.error('Error picking image:', error);
            Alert.alert('Error', 'No se pudo obtener la imagen');
        }
    };

    const handleNext = () => {
        if (currentStep < STEPS.length) {
            // Validar pasos de fotos
            if (PHOTO_STEPS.includes(currentStep)) {
                const slot = slotForStep(currentStep);
                if (slot && !images[slot]) {
                    Alert.alert('Falta documento', 'Por favor, toma la foto antes de continuar.');
                    return;
                }
            }
            // Validar Constancia Fiscal solo si es asesor (obligatoria)
            if (currentStep === STEP_CSF && isAdvisor && !constanciaFiscal) {
                Alert.alert(
                    'Constancia Fiscal requerida',
                    'Como asesor comercial necesitas adjuntar tu Constancia de Situación Fiscal para poder cobrar comisiones.'
                );
                return;
            }
            // Validar términos
            if (currentStep === STEP_TERMS && !termsAccepted) {
                Alert.alert('Términos requeridos', 'Debes aceptar los términos y condiciones para continuar.');
                return;
            }
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(prev => prev - 1);
        }
    };

    const handleSubmit = async () => {
        // Validar que tenemos todos los documentos
        if (!images[SLOT_INE_FRONT] || !images[SLOT_INE_BACK] || !images[SLOT_SELFIE]) {
            Alert.alert('Faltan documentos', 'Por favor completa todos los pasos de verificación.');
            return;
        }
        if (isAdvisor && !constanciaFiscal) {
            Alert.alert('Constancia Fiscal requerida', 'Como asesor necesitas adjuntar tu Constancia de Situación Fiscal.');
            return;
        }

        if (!signature) {
            Alert.alert('Falta firma', 'Por favor dibuja tu firma y presiona Confirmar.');
            return;
        }

        setVerifying(true);

        try {
            // Convertir imágenes a base64
            const ineFrontBase64 = await FileSystem.readAsStringAsync(images[SLOT_INE_FRONT], {
                encoding: 'base64',
            });
            const ineBackBase64 = await FileSystem.readAsStringAsync(images[SLOT_INE_BACK], {
                encoding: 'base64',
            });
            const selfieBase64 = await FileSystem.readAsStringAsync(images[SLOT_SELFIE], {
                encoding: 'base64',
            });

            // Constancia Fiscal (PDF o imagen) — opcional para clientes, obligatoria para asesores
            let constanciaFiscalBase64: string | undefined;
            if (constanciaFiscal) {
                const csfRaw = await FileSystem.readAsStringAsync(constanciaFiscal.uri, { encoding: 'base64' });
                const mime = constanciaFiscal.mimeType || (constanciaFiscal.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
                constanciaFiscalBase64 = `data:${mime};base64,${csfRaw}`;
            }

            // Enviar a verificación con IA (con token de autenticación)
            const response = await fetch(`${API_URL}/api/verify/documents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    ineFrontBase64: `data:image/jpeg;base64,${ineFrontBase64}`,
                    ineBackBase64: `data:image/jpeg;base64,${ineBackBase64}`,
                    selfieBase64: `data:image/jpeg;base64,${selfieBase64}`,
                    signatureBase64: signature || 'signature_data',
                    constanciaFiscalBase64,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw { response: { data } };
            }

            if (data.success) {
                if (data.pendingReview) {
                    // Documentos enviados pero requieren revisión manual
                    Alert.alert(
                        '📋 Documentos Recibidos',
                        'Tus documentos han sido enviados correctamente.\n\nUn administrador revisará tu verificación en las próximas 24-48 horas.\n\nTe notificaremos cuando tu cuenta esté verificada.',
                        [
                            {
                                text: 'Entendido',
                                onPress: () => navigation.replace('Home', { user, token }),
                            },
                        ]
                    );
                } else {
                    // Verificación automática exitosa
                    Alert.alert(
                        '✅ ¡Verificación exitosa!',
                        `Tu identidad ha sido verificada.\nConfianza: ${data.confidence || 'alta'}`,
                        [
                            {
                                text: 'Continuar',
                                onPress: () => navigation.replace('Home', { user, token }),
                            },
                        ]
                    );
                }
            }
        } catch (error: any) {
            console.error('Error en verificación:', error);
            
            // Extraer mensaje de error detallado
            let errorMessage = 'No se pudo completar la verificación';
            let errorDetails = '';
            
            if (error.response?.data) {
                const data = error.response.data;
                errorMessage = data.message || data.error || errorMessage;
                if (data.reason) {
                    errorDetails = `\n\nMotivo: ${data.reason}`;
                }
                if (data.confidence) {
                    errorDetails += `\nConfianza del análisis: ${data.confidence}`;
                }
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            Alert.alert(
                '❌ Verificación fallida',
                errorMessage + errorDetails
            );
        } finally {
            setVerifying(false);
        }
    };

    const renderStepIndicator = () => (
        <View style={styles.stepIndicator}>
            {Array.from({ length: VISUAL_TOTAL }, (_, i) => i + 1).map((dot, index) => (
                <React.Fragment key={dot}>
                    <View
                        style={[
                            styles.stepCircle,
                            visualStep === dot && styles.stepCircleActive,
                            visualStep > dot && styles.stepCircleCompleted,
                        ]}
                    >
                        {visualStep > dot ? (
                            <Ionicons name="checkmark" size={16} color="#FFF" />
                        ) : (
                            <Text
                                style={[
                                    styles.stepNumber,
                                    visualStep >= dot && styles.stepNumberActive,
                                ]}
                            >
                                {dot}
                            </Text>
                        )}
                    </View>
                    {index < VISUAL_TOTAL - 1 && (
                        <View
                            style={[
                                styles.stepLine,
                                visualStep > dot && styles.stepLineCompleted,
                            ]}
                        />
                    )}
                </React.Fragment>
            ))}
        </View>
    );

    // Estilo para el canvas de firma
    const signatureStyle = `.m-signature-pad--footer { display: none; } .m-signature-pad { box-shadow: none; border: none; } body,html { width: 100%; height: 100%; }`;

    const renderSignaturePad = () => (
        <View style={styles.signatureContainer}>
            <View style={styles.signaturePadWrapper}>
                <SignatureScreen
                    ref={signatureRef}
                    onOK={handleSignatureOK}
                    onEmpty={handleSignatureEmpty}
                    descriptionText=""
                    clearText="Limpiar"
                    confirmText="Confirmar"
                    webStyle={signatureStyle}
                    backgroundColor="#FFFFFF"
                    penColor="#0A2540"
                    minWidth={2}
                    maxWidth={4}
                    dotSize={3}
                />
            </View>
            <View style={styles.signatureButtons}>
                <TouchableOpacity
                    style={[styles.signButton, { backgroundColor: '#FF5722' }]}
                    onPress={handleSignatureClear}
                >
                    <Ionicons name="refresh" size={20} color="#FFF" />
                    <Text style={styles.signButtonText}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.signButton, { backgroundColor: '#22C55E' }]}
                    onPress={() => signatureRef.current?.readSignature()}
                >
                    <Ionicons name="checkmark" size={20} color="#FFF" />
                    <Text style={styles.signButtonText}>Confirmar</Text>
                </TouchableOpacity>
            </View>
            {signature && (
                <View style={styles.signatureConfirmed}>
                    <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                    <Text style={styles.signatureConfirmedText}>Firma capturada</Text>
                </View>
            )}
        </View>
    );

    const renderTermsAndConditions = () => (
        <View style={styles.termsContainer}>
            <ScrollView
                style={styles.termsScroll}
                nestedScrollEnabled={true}
                onScroll={handleTermsScroll}
                scrollEventThrottle={16}
            >
                {contractLoading ? (
                    <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color="#F05A28" />
                        <Text style={{ marginTop: 8, color: '#666' }}>Cargando contrato…</Text>
                    </View>
                ) : (
                    <>
                        {serviceContract?.title ? (
                            <Text style={[styles.termsText, { fontWeight: '700', marginBottom: 8, fontSize: 15 }]}>
                                {serviceContract.title}
                                {serviceContract.version ? `  (${serviceContract.version})` : ''}
                            </Text>
                        ) : null}
                        <Text style={styles.termsText}>
                            {serviceContract?.content || TERMS_AND_CONDITIONS}
                        </Text>
                    </>
                )}
                <View style={styles.scrollEndMarker}>
                    <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
                    <Text style={styles.scrollEndText}>Fin del documento</Text>
                </View>
            </ScrollView>
            {!hasScrolledToEnd && (
                <View style={styles.scrollHint}>
                    <Ionicons name="arrow-down" size={16} color="#F59E0B" />
                    <Text style={styles.scrollHintText}>Desplázate para leer todo</Text>
                </View>
            )}
            <TouchableOpacity
                style={[styles.termsCheckbox, !hasScrolledToEnd && styles.termsCheckboxDisabled]}
                onPress={() => hasScrolledToEnd && setTermsAccepted(!termsAccepted)}
                disabled={!hasScrolledToEnd}
            >
                <View style={[
                    styles.checkbox, 
                    termsAccepted && styles.checkboxChecked,
                    !hasScrolledToEnd && styles.checkboxDisabled
                ]}>
                    {termsAccepted && <Ionicons name="checkmark" size={18} color="#FFF" />}
                </View>
                <Text style={[styles.termsAcceptText, !hasScrolledToEnd && styles.termsAcceptTextDisabled]}>
                    {hasScrolledToEnd 
                        ? 'He leído y acepto los términos y condiciones'
                        : 'Debes leer todo el documento primero'}
                </Text>
            </TouchableOpacity>
        </View>
    );

    // Modal de cámara con guía
    const renderCameraModal = () => (
        <Modal visible={showCamera} animationType="slide">
            <View style={styles.cameraContainer}>
                <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing={cameraSlot === SLOT_SELFIE ? 'front' : 'back'}
                >
                    {/* Overlay con guía */}
                    <View style={styles.cameraOverlay}>
                        <View style={styles.cameraHeader}>
                            <TouchableOpacity onPress={() => setShowCamera(false)}>
                                <Ionicons name="close" size={32} color="#FFF" />
                            </TouchableOpacity>
                            <Text style={styles.cameraTitle}>
                                {cameraSlot === SLOT_INE_FRONT ? 'Frente de ID' :
                                 cameraSlot === SLOT_INE_BACK ? 'Reverso de ID' : 'Selfie'}
                            </Text>
                            <View style={{ width: 32 }} />
                        </View>

                        {/* Guía de encuadre */}
                        <View style={styles.guideContainer}>
                            {cameraSlot === SLOT_SELFIE ? (
                                // Guía circular para selfie
                                <View style={styles.selfieGuide}>
                                    <Text style={styles.guideText}>Centra tu rostro</Text>
                                </View>
                            ) : (
                                // Guía rectangular para ID
                                <View style={styles.idGuide}>
                                    <View style={styles.cornerTL} />
                                    <View style={styles.cornerTR} />
                                    <View style={styles.cornerBL} />
                                    <View style={styles.cornerBR} />
                                    <Text style={styles.guideText}>
                                        Centra tu {cameraSlot === SLOT_INE_FRONT ? 'ID (frente)' : 'ID (reverso)'}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Botón de captura */}
                        <View style={styles.cameraFooter}>
                            <TouchableOpacity style={styles.captureBtn} onPress={takePicture}>
                                <View style={styles.captureBtnInner} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </CameraView>
            </View>
        </Modal>
    );

    const pickConstanciaFiscal = async () => {
        try {
            const r = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*'],
                copyToCacheDirectory: true,
                multiple: false,
            });
            if (r.canceled || !r.assets || !r.assets[0]) return;
            const a = r.assets[0];
            setConstanciaFiscal({
                uri: a.uri,
                name: a.name || 'constancia.pdf',
                mimeType: a.mimeType || (a.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
            });
        } catch (e) {
            console.error('Error picking CSF:', e);
            Alert.alert('Error', 'No se pudo seleccionar el archivo');
        }
    };

    const renderCurrentStep = () => {
        const step = STEPS[currentStep - 1];

        // Paso 3: Constancia de Situación Fiscal
        if (currentStep === STEP_CSF) {
            return (
                <View style={styles.stepContent}>
                    <View style={styles.iconContainer}>
                        <Ionicons name={step.icon as any} size={60} color="#0A2540" />
                    </View>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepInstruction}>{step.instruction}</Text>

                    <View style={{
                        backgroundColor: isAdvisor ? '#FEE2E2' : '#FEF3C7',
                        borderLeftWidth: 4,
                        borderLeftColor: isAdvisor ? '#DC2626' : '#F59E0B',
                        padding: 12,
                        borderRadius: 8,
                        marginVertical: 12,
                        marginHorizontal: 4,
                    }}>
                        <Text style={{ fontWeight: '700', color: isAdvisor ? '#991B1B' : '#92400E', marginBottom: 4 }}>
                            {isAdvisor ? '⚠️ Documento obligatorio' : '💡 Recomendado'}
                        </Text>
                        <Text style={{ color: isAdvisor ? '#7F1D1D' : '#78350F', fontSize: 13, lineHeight: 18 }}>
                            {isAdvisor
                                ? 'Como asesor comercial, tu Constancia de Situación Fiscal es indispensable para que podamos pagarte tus comisiones y emitir los CFDI correspondientes.'
                                : 'Si vas a solicitar facturas (CFDI) por nuestros servicios, te recomendamos subir tu Constancia de Situación Fiscal ahora. Así evitas pedirla cada vez. Si no necesitas facturas, puedes omitir este paso.'}
                        </Text>
                    </View>

                    {constanciaFiscal ? (
                        <View style={{
                            borderWidth: 1,
                            borderColor: '#22C55E',
                            backgroundColor: '#F0FDF4',
                            borderRadius: 10,
                            padding: 14,
                            marginTop: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                        }}>
                            <Ionicons
                                name={constanciaFiscal.mimeType?.includes('pdf') ? 'document-text' : 'image'}
                                size={36}
                                color="#16A34A"
                            />
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontWeight: '700', color: '#14532D' }} numberOfLines={1}>
                                    {constanciaFiscal.name}
                                </Text>
                                <Text style={{ color: '#15803D', fontSize: 12 }}>Listo para enviar</Text>
                            </View>
                            <TouchableOpacity onPress={() => setConstanciaFiscal(null)}>
                                <Ionicons name="trash-outline" size={22} color="#DC2626" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={[styles.captureButton, { width: '100%', marginTop: 8 }]}
                            onPress={pickConstanciaFiscal}
                        >
                            <Ionicons name="cloud-upload-outline" size={40} color="#FFF" />
                            <Text style={styles.captureText}>Subir Constancia (PDF o imagen)</Text>
                        </TouchableOpacity>
                    )}
                </View>
            );
        }

        // Paso Términos
        if (currentStep === STEP_TERMS) {
            return (
                <View style={styles.stepContent}>
                    <View style={styles.iconContainer}>
                        <Ionicons name={step.icon as any} size={60} color="#0A2540" />
                    </View>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepInstruction}>{step.instruction}</Text>
                    {renderTermsAndConditions()}
                </View>
            );
        }

        // Paso Firma digital
        if (currentStep === STEP_SIGNATURE) {
            return (
                <View style={styles.stepContent}>
                    <View style={styles.iconContainer}>
                        <Ionicons name={step.icon as any} size={60} color="#0A2540" />
                    </View>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepInstruction}>{step.instruction}</Text>
                    {renderSignaturePad()}
                </View>
            );
        }

        // Pasos de foto individuales (INE Frente, INE Reverso, Selfie)
        const slot = slotForStep(currentStep);
        if (slot) {
            return (
                <View style={styles.stepContent}>
                    <View style={styles.iconContainer}>
                        <Ionicons name={step.icon as any} size={60} color="#0A2540" />
                    </View>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepInstruction}>{step.instruction}</Text>

                    {images[slot] ? (
                        <View style={styles.imagePreview}>
                            <Image
                                source={{ uri: images[slot] }}
                                style={styles.previewImage}
                            />
                            <TouchableOpacity
                                style={styles.retakeButton}
                                onPress={() => pickImage(slot, true)}
                            >
                                <Ionicons name="camera" size={20} color="#FFF" />
                                <Text style={styles.retakeText}>Retomar</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.captureButtons}>
                            <TouchableOpacity
                                style={styles.captureButton}
                                onPress={() => pickImage(slot, true)}
                            >
                                <Ionicons name="camera" size={40} color="#FFF" />
                                <Text style={styles.captureText}>Tomar foto</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.captureButton, styles.galleryButton]}
                                onPress={() => pickImage(slot, false)}
                            >
                                <Ionicons name="images" size={40} color="#0A2540" />
                                <Text style={[styles.captureText, { color: '#0A2540' }]}>
                                    Galería
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            );
        }

        return null;
    };

    if (verifying) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0A2540" />
                <Text style={styles.loadingText}>Verificando identidad...</Text>
                <Text style={styles.loadingSubtext}>
                    Comparando rostro con documento de identidad
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {renderCameraModal()}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Verificación de Identidad</Text>
                <Text style={styles.headerSubtitle}>
                    Paso {visualStep} de {VISUAL_TOTAL}
                </Text>
            </View>

            {renderStepIndicator()}

            {currentStep === STEP_SIGNATURE ? (
                <View style={styles.scrollContent}>
                    {renderCurrentStep()}
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {renderCurrentStep()}
                </ScrollView>
            )}

            <View style={styles.footer}>
                {currentStep > 1 && (
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                        <Ionicons name="arrow-back" size={24} color="#0A2540" />
                        <Text style={styles.backText}>Atrás</Text>
                    </TouchableOpacity>
                )}

                {currentStep < STEPS.length ? (
                    <TouchableOpacity
                        style={[
                            styles.nextButton,
                            (PHOTO_STEPS.includes(currentStep) && (() => { const s = slotForStep(currentStep); return s ? !images[s] : false; })()) && styles.nextButtonDisabled,
                            (currentStep === STEP_CSF && isAdvisor && !constanciaFiscal) && styles.nextButtonDisabled,
                            (currentStep === STEP_TERMS && !termsAccepted) && styles.nextButtonDisabled,
                        ]}
                        onPress={handleNext}
                    >
                        <Text style={styles.nextText}>
                            {currentStep === STEP_CSF && !isAdvisor && !constanciaFiscal ? 'Omitir' : 'Siguiente'}
                        </Text>
                        <Ionicons name="arrow-forward" size={24} color="#FFF" />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={[
                            styles.submitButton,
                            !signature && styles.nextButtonDisabled,
                        ]}
                        onPress={handleSubmit}
                        disabled={!signature}
                    >
                        <Ionicons name="shield-checkmark" size={24} color="#FFF" />
                        <Text style={styles.submitText}>Verificar Identidad</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        backgroundColor: '#0A2540',
        paddingTop: 60,
        paddingBottom: 20,
        paddingHorizontal: 20,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#FFF',
    },
    headerSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 4,
    },
    stepIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    stepCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepCircleActive: {
        backgroundColor: '#0A2540',
    },
    stepCircleCompleted: {
        backgroundColor: '#22C55E',
    },
    stepNumber: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748B',
    },
    stepNumberActive: {
        color: '#FFF',
    },
    stepLine: {
        width: 40,
        height: 2,
        backgroundColor: '#E2E8F0',
        marginHorizontal: 4,
    },
    stepLineCompleted: {
        backgroundColor: '#22C55E',
    },
    scrollContent: {
        flexGrow: 1,
        padding: 20,
    },
    stepContent: {
        alignItems: 'center',
    },
    iconContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(10, 37, 64, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    stepTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#0A2540',
        marginBottom: 8,
    },
    stepInstruction: {
        fontSize: 16,
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 30,
        paddingHorizontal: 20,
    },
    captureButtons: {
        flexDirection: 'row',
        gap: 16,
    },
    captureButton: {
        width: 120,
        height: 120,
        borderRadius: 12,
        backgroundColor: '#0A2540',
        alignItems: 'center',
        justifyContent: 'center',
    },
    galleryButton: {
        backgroundColor: '#FFF',
        borderWidth: 2,
        borderColor: '#0A2540',
    },
    captureText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFF',
        marginTop: 8,
    },
    imagePreview: {
        width: width - 40,
        aspectRatio: 16 / 10,
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    retakeButton: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    retakeText: {
        color: '#FFF',
        fontWeight: '600',
    },
    signatureContainer: {
        width: '100%',
    },
    signaturePadWrapper: {
        width: '100%',
        height: 200,
        backgroundColor: '#FFF',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#0A2540',
        overflow: 'hidden',
    },
    signaturePad: {
        width: '100%',
        height: 200,
        backgroundColor: '#FFF',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#0A2540',
        borderStyle: 'dashed',
        overflow: 'hidden',
    },
    signaturePlaceholder: {
        fontSize: 16,
        color: '#94A3B8',
    },
    signaturePlaceholderContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 0,
    },
    signaturePreview: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    signatureText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#22C55E',
    },
    signatureButtons: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 16,
        marginTop: 16,
    },
    signButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 25,
        gap: 8,
    },
    signButtonText: {
        color: '#FFF',
        fontWeight: '600',
        fontSize: 16,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 20,
        backgroundColor: '#FFF',
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        gap: 8,
    },
    backText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0A2540',
    },
    nextButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0A2540',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
        marginLeft: 'auto',
    },
    nextButtonDisabled: {
        opacity: 0.5,
    },
    nextText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFF',
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#22C55E',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
        marginLeft: 'auto',
    },
    submitText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFF',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
    },
    loadingText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#0A2540',
        marginTop: 20,
    },
    loadingSubtext: {
        fontSize: 14,
        color: '#64748B',
        marginTop: 8,
    },
    // Estilos para Términos y Condiciones
    termsContainer: {
        width: '100%',
        flex: 1,
    },
    termsScroll: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 16,
        maxHeight: height * 0.4,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    termsText: {
        fontSize: 13,
        lineHeight: 20,
        color: '#374151',
        textAlign: 'justify',
    },
    termsCheckbox: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
        paddingVertical: 12,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#0A2540',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    checkboxChecked: {
        backgroundColor: '#0A2540',
    },
    checkboxDisabled: {
        borderColor: '#94A3B8',
    },
    termsAcceptText: {
        fontSize: 14,
        color: '#0A2540',
        fontWeight: '500',
        flex: 1,
    },
    termsAcceptTextDisabled: {
        color: '#94A3B8',
    },
    termsCheckboxDisabled: {
        opacity: 0.6,
    },
    scrollEndMarker: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
        marginTop: 16,
    },
    scrollEndText: {
        fontSize: 14,
        color: '#22C55E',
        fontWeight: '600',
        marginLeft: 8,
    },
    scrollHint: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FEF3C7',
        paddingVertical: 8,
        borderRadius: 8,
        marginTop: 8,
    },
    scrollHintText: {
        fontSize: 12,
        color: '#F59E0B',
        fontWeight: '500',
        marginLeft: 6,
    },
    // Estilos de firma mejorados
    signatureCanvas: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    signatureLine: {
        position: 'absolute',
        height: 3,
        backgroundColor: '#0A2540',
        borderRadius: 1.5,
    },
    signatureConfirmed: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 12,
        backgroundColor: '#DCFCE7',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 8,
    },
    signatureConfirmedText: {
        fontSize: 14,
        color: '#22C55E',
        fontWeight: '600',
        marginLeft: 8,
    },
    // Estilos de la cámara
    cameraContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    camera: {
        flex: 1,
    },
    cameraOverlay: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    cameraHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingBottom: 20,
    },
    cameraTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#FFF',
    },
    guideContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    idGuide: {
        width: width * 0.85,
        height: width * 0.55,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.6)',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    selfieGuide: {
        width: width * 0.65,
        height: width * 0.65,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.6)',
        borderRadius: width * 0.325,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    guideText: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
        fontWeight: '500',
        textAlign: 'center',
    },
    cornerTL: {
        position: 'absolute',
        top: -2,
        left: -2,
        width: 30,
        height: 30,
        borderTopWidth: 4,
        borderLeftWidth: 4,
        borderColor: '#22C55E',
        borderTopLeftRadius: 12,
    },
    cornerTR: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 30,
        height: 30,
        borderTopWidth: 4,
        borderRightWidth: 4,
        borderColor: '#22C55E',
        borderTopRightRadius: 12,
    },
    cornerBL: {
        position: 'absolute',
        bottom: -2,
        left: -2,
        width: 30,
        height: 30,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
        borderColor: '#22C55E',
        borderBottomLeftRadius: 12,
    },
    cornerBR: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 30,
        height: 30,
        borderBottomWidth: 4,
        borderRightWidth: 4,
        borderColor: '#22C55E',
        borderBottomRightRadius: 12,
    },
    cameraFooter: {
        alignItems: 'center',
        paddingBottom: 50,
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingTop: 20,
    },
    captureBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
        borderColor: '#FFF',
    },
    captureBtnInner: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#FFF',
    },
});
