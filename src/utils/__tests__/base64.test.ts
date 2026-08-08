import { base64ToUint8Array, uint8ArrayToBase64 } from '../base64';

describe('Base64 Utils', () => {
  it('should correctly convert Uint8Array to base64', () => {
    const bytes = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
    const base64 = uint8ArrayToBase64(bytes);
    expect(base64).toBe('aGVsbG8=');
  });

  it('should correctly convert Uint8Array to base64 with 1 padding', () => {
    const bytes = new Uint8Array([104, 101, 108, 108]); // "hell"
    const base64 = uint8ArrayToBase64(bytes);
    expect(base64).toBe('aGVsbA==');
  });

  it('should correctly convert Uint8Array to base64 with no padding', () => {
    const bytes = new Uint8Array([104, 101, 108, 108, 111, 33]); // "hello!"
    const base64 = uint8ArrayToBase64(bytes);
    expect(base64).toBe('aGVsbG8h');
  });

  it('should correctly convert base64 to Uint8Array', () => {
    const base64 = 'aGVsbG8=';
    const bytes = base64ToUint8Array(base64);
    expect(bytes).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
  });

  it('should correctly convert base64 to Uint8Array with 2 paddings', () => {
    const base64 = 'aGVsbA==';
    const bytes = base64ToUint8Array(base64);
    expect(bytes).toEqual(new Uint8Array([104, 101, 108, 108]));
  });
  
  it('should correctly convert base64 to Uint8Array with no paddings', () => {
    const base64 = 'aGVsbG8h';
    const bytes = base64ToUint8Array(base64);
    expect(bytes).toEqual(new Uint8Array([104, 101, 108, 108, 111, 33]));
  });
});
