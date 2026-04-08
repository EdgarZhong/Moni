// Web Crypto API 封装
// 使用 AES-GCM 算法进行对称加密
// 密钥派生使用 PBKDF2

export class CryptoUtils {
  private static readonly ALGORITHM = 'AES-GCM';
  private static readonly KDF_ALGORITHM = 'PBKDF2';
  // private static readonly SALT_LENGTH = 16;
  private static readonly IV_LENGTH = 12;
  private static readonly KEY_LENGTH = 256;
  private static readonly ITERATIONS = 100000;

  // 固定的 App 级 Salt (在真实生产环境中应针对每个用户随机生成并存储，这里简化为固定值以确保跨设备/重装后的一致性)
  // 注意：这种做法安全性较低，但在纯前端无后端环境中是一种折衷
  private static readonly APP_SALT = new TextEncoder().encode('Moni_Secure_Salt_v1');

  /**
   * 从密码（或设备指纹）派生密钥
   */
  private static async deriveKey(password: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: this.KDF_ALGORITHM },
      false,
      ['deriveKey']
    );

    return window.crypto.subtle.deriveKey(
      {
        name: this.KDF_ALGORITHM,
        salt: this.APP_SALT,
        iterations: this.ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: this.ALGORITHM, length: this.KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * 加密字符串
   * @param plaintext 明文
   * @param password 密码（用于派生密钥）
   * @returns Base64 编码的密文 (IV + Ciphertext)
   */
  public static async encrypt(plaintext: string, password: string): Promise<string> {
    const key = await this.deriveKey(password);
    const iv = window.crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
    const enc = new TextEncoder();

    const ciphertext = await window.crypto.subtle.encrypt(
      {
        name: this.ALGORITHM,
        iv: iv
      },
      key,
      enc.encode(plaintext)
    );

    // 组合 IV 和 密文
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // 转换为 Base64
    return this.arrayBufferToBase64(combined.buffer);
  }

  /**
   * 解密字符串
   * @param encryptedBase64 Base64 编码的密文
   * @param password 密码
   * @returns 明文
   */
  public static async decrypt(encryptedBase64: string, password: string): Promise<string> {
    try {
      const combined = this.base64ToArrayBuffer(encryptedBase64);
      const iv = combined.slice(0, this.IV_LENGTH);
      const data = combined.slice(this.IV_LENGTH);
      const key = await this.deriveKey(password);

      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: this.ALGORITHM,
          iv: new Uint8Array(iv)
        },
        key,
        data
      );

      const dec = new TextDecoder();
      return dec.decode(decrypted);
    } catch (e) {
      console.error('Decryption failed:', e);
      throw new Error('Decryption failed: Invalid password or corrupted data');
    }
  }

  // --- Helpers ---

  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
