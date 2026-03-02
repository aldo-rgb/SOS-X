// Type declarations for sm-crypto
// SM2, SM3, SM4 Chinese encryption algorithms

declare module 'sm-crypto' {
    export const sm2: {
        /**
         * Generate SM2 key pair
         */
        generateKeyPairHex: () => { privateKey: string; publicKey: string };
        
        /**
         * Encrypt data using SM2
         * @param msg - Plain text message to encrypt
         * @param publicKey - Public key in hex format
         * @param cipherMode - 0 for C1C2C3, 1 for C1C3C2 (default)
         * @returns Encrypted string in hex format
         */
        doEncrypt: (msg: string, publicKey: string, cipherMode?: 0 | 1) => string;
        
        /**
         * Decrypt data using SM2
         * @param encryptedHex - Encrypted data in hex format
         * @param privateKey - Private key in hex format
         * @param cipherMode - 0 for C1C2C3, 1 for C1C3C2 (default)
         * @returns Decrypted plain text
         */
        doDecrypt: (encryptedHex: string, privateKey: string, cipherMode?: 0 | 1) => string;
        
        /**
         * Sign data using SM2
         */
        doSignature: (msg: string, privateKey: string, options?: {
            hash?: boolean;
            der?: boolean;
            userId?: string;
            publicKey?: string;
        }) => string;
        
        /**
         * Verify SM2 signature
         */
        doVerifySignature: (msg: string, signHex: string, publicKey: string, options?: {
            hash?: boolean;
            der?: boolean;
            userId?: string;
        }) => boolean;
    };
    
    export const sm3: (input: string | ArrayBuffer) => string;
    
    export const sm4: {
        encrypt: (data: string | number[], key: string | number[], options?: {
            mode?: 'cbc' | 'ecb';
            iv?: string | number[];
            output?: 'string' | 'array';
        }) => string | number[];
        
        decrypt: (data: string | number[], key: string | number[], options?: {
            mode?: 'cbc' | 'ecb';
            iv?: string | number[];
            output?: 'string' | 'array';
        }) => string | number[];
    };
}
