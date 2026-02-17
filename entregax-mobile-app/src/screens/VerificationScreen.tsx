import React, { useState, useRef } from 'react';
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

const STEPS = [
    { id: 1, title: 'ID Oficial', icon: 'card-outline', instruction: 'Toma una foto del frente de tu ID' },
    { id: 2, title: 'INE Reverso', icon: 'card-outline', instruction: 'Toma una foto del reverso de tu ID' },
    { id: 3, title: 'Selfie', icon: 'camera-outline', instruction: 'Toma una selfie clara de tu rostro' },
    { id: 4, title: 'Términos', icon: 'document-text-outline', instruction: 'Lee y acepta los términos y condiciones' },
    { id: 5, title: 'Firma Digital', icon: 'create-outline', instruction: 'Dibuja tu firma en el recuadro' },
];

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
    const [currentStep, setCurrentStep] = useState(1);
    const [images, setImages] = useState<{ [key: number]: string }>({});
    const [signature, setSignature] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
    const [showCamera, setShowCamera] = useState(false);
    const [cameraStep, setCameraStep] = useState(1);
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
    const openCameraWithGuide = async (step: number) => {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                Alert.alert('Permisos requeridos', 'Necesitamos acceso a la cámara');
                return;
            }
        }
        setCameraStep(step);
        setShowCamera(true);
    };

    // Tomar foto
    const takePicture = async () => {
        if (cameraRef.current) {
            try {
                const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
                setImages(prev => ({ ...prev, [cameraStep]: photo.uri }));
                setShowCamera(false);
            } catch (error) {
                console.error('Error tomando foto:', error);
                Alert.alert('Error', 'No se pudo tomar la foto');
            }
        }
    };

    const pickImage = async (step: number, useCamera: boolean = true) => {
        if (useCamera) {
            openCameraWithGuide(step);
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

            console.log('📷 Resultado picker:', result);

            if (!result.canceled && result.assets && result.assets[0]) {
                const uri = result.assets[0].uri;
                console.log('✅ Imagen guardada para paso', step, ':', uri);
                setImages(prev => {
                    const newImages = { ...prev, [step]: uri };
                    console.log('📸 Estado images actualizado:', newImages);
                    return newImages;
                });
            }
        } catch (error) {
            console.error('Error picking image:', error);
            Alert.alert('Error', 'No se pudo obtener la imagen');
        }
    };

    const handleNext = () => {
        if (currentStep < 5) {
            // Validar pasos de fotos (1, 2, 3)
            if (currentStep <= 3 && !images[currentStep]) {
                Alert.alert('Falta documento', 'Por favor, toma la foto antes de continuar.');
                return;
            }
            // Validar términos (paso 4)
            if (currentStep === 4 && !termsAccepted) {
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
        if (!images[1] || !images[2] || !images[3]) {
            Alert.alert('Faltan documentos', 'Por favor completa todos los pasos de verificación.');
            return;
        }

        if (!signature) {
            Alert.alert('Falta firma', 'Por favor dibuja tu firma y presiona Confirmar.');
            return;
        }

        setVerifying(true);

        try {
            // Convertir imágenes a base64
            const ineFrontBase64 = await FileSystem.readAsStringAsync(images[1], {
                encoding: 'base64',
            });
            const ineBackBase64 = await FileSystem.readAsStringAsync(images[2], {
                encoding: 'base64',
            });
            const selfieBase64 = await FileSystem.readAsStringAsync(images[3], {
                encoding: 'base64',
            });

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
            {STEPS.map((step, index) => (
                <React.Fragment key={step.id}>
                    <View
                        style={[
                            styles.stepCircle,
                            currentStep === step.id && styles.stepCircleActive,
                            currentStep > step.id && styles.stepCircleCompleted,
                        ]}
                    >
                        {currentStep > step.id ? (
                            <Ionicons name="checkmark" size={16} color="#FFF" />
                        ) : (
                            <Text
                                style={[
                                    styles.stepNumber,
                                    currentStep >= step.id && styles.stepNumberActive,
                                ]}
                            >
                                {step.id}
                            </Text>
                        )}
                    </View>
                    {index < STEPS.length - 1 && (
                        <View
                            style={[
                                styles.stepLine,
                                currentStep > step.id && styles.stepLineCompleted,
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
                <Text style={styles.termsText}>{TERMS_AND_CONDITIONS}</Text>
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
                    facing={cameraStep === 3 ? 'front' : 'back'}
                >
                    {/* Overlay con guía */}
                    <View style={styles.cameraOverlay}>
                        <View style={styles.cameraHeader}>
                            <TouchableOpacity onPress={() => setShowCamera(false)}>
                                <Ionicons name="close" size={32} color="#FFF" />
                            </TouchableOpacity>
                            <Text style={styles.cameraTitle}>
                                {cameraStep === 1 ? 'Frente de ID' : 
                                 cameraStep === 2 ? 'Reverso de ID' : 'Selfie'}
                            </Text>
                            <View style={{ width: 32 }} />
                        </View>

                        {/* Guía de encuadre */}
                        <View style={styles.guideContainer}>
                            {cameraStep === 3 ? (
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
                                        Centra tu {cameraStep === 1 ? 'ID (frente)' : 'ID (reverso)'}
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

    const renderCurrentStep = () => {
        const step = STEPS[currentStep - 1];

        // Paso 4: Términos y condiciones
        if (currentStep === 4) {
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

        // Paso 5: Firma digital
        if (currentStep === 5) {
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

        // Pasos 1, 2, 3: Fotos
        return (
            <View style={styles.stepContent}>
                <View style={styles.iconContainer}>
                    <Ionicons name={step.icon as any} size={60} color="#0A2540" />
                </View>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepInstruction}>{step.instruction}</Text>

                {images[currentStep] ? (
                    <View style={styles.imagePreview}>
                        <Image
                            source={{ uri: images[currentStep] }}
                            style={styles.previewImage}
                        />
                        <TouchableOpacity
                            style={styles.retakeButton}
                            onPress={() => pickImage(currentStep, true)}
                        >
                            <Ionicons name="camera" size={20} color="#FFF" />
                            <Text style={styles.retakeText}>Retomar</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.captureButtons}>
                        <TouchableOpacity
                            style={styles.captureButton}
                            onPress={() => pickImage(currentStep, true)}
                        >
                            <Ionicons name="camera" size={40} color="#FFF" />
                            <Text style={styles.captureText}>Tomar foto</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.captureButton, styles.galleryButton]}
                            onPress={() => pickImage(currentStep, false)}
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
                    Paso {currentStep} de {STEPS.length}
                </Text>
            </View>

            {renderStepIndicator()}

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {renderCurrentStep()}
            </ScrollView>

            <View style={styles.footer}>
                {currentStep > 1 && (
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                        <Ionicons name="arrow-back" size={24} color="#0A2540" />
                        <Text style={styles.backText}>Atrás</Text>
                    </TouchableOpacity>
                )}

                {currentStep < 5 ? (
                    <TouchableOpacity
                        style={[
                            styles.nextButton,
                            (currentStep <= 3 && !images[currentStep]) && styles.nextButtonDisabled,
                            (currentStep === 4 && !termsAccepted) && styles.nextButtonDisabled,
                        ]}
                        onPress={handleNext}
                    >
                        <Text style={styles.nextText}>Siguiente</Text>
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
