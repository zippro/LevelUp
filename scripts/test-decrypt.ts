// Test script to figure out the NarEncryptor algorithm
// The encrypted file starts with "NARv1" header
// Then the rest is XOR-encrypted data

const crypto = require('crypto');

// Based on common Unity encryptor patterns, NarEncryptor likely uses:
// 1. A header "NARv1" (5 bytes + possible version byte)
// 2. AES-CBC or simple XOR with a key

// Let's try to decode by analyzing the pattern
const encryptedB64 = "TkFSdjENF8eAuoV9VWSd2dyrRi6BUZKiZ9XUAN2kSIDX0VCspQzTdNvtbP9acjXmmRtW5nDgQc4FGnKKo2AkWYQ0dVQi/uv9jFa5ofaiAUfLX3WJpRztYuU6HiA4AstM36VGVwhxhFEfm6zpegkpVyQmY4UdfYDlX19EIO/9gvQ";

const encryptedBuffer = Buffer.from(encryptedB64, 'base64');
console.log("First 20 bytes:", encryptedBuffer.subarray(0, 20).toString('hex'));
console.log("Header:", encryptedBuffer.subarray(0, 5).toString('utf8'));
console.log("Byte 5:", encryptedBuffer[5]); // version or separator
console.log("Byte 6:", encryptedBuffer[6]); // likely start of IV or key info

// The header is "NARv1" followed by 0x0D (CR) then 0x17
// Let's see if the rest is AES encrypted
// Common Unity pattern: NARv1 + version_byte + IV(16 bytes) + encrypted_data

const headerEnd = 5; // "NARv1" is 5 chars
console.log("\nData after header:");
console.log("Byte at 5:", encryptedBuffer[5].toString(16));

// Let's try: header(NARv1) + 1 byte + 16 byte IV + AES data
const possibleIV = encryptedBuffer.subarray(6, 22);
console.log("Possible IV:", possibleIV.toString('hex'));
console.log("Data after IV:", encryptedBuffer.subarray(22, 38).toString('hex'));

// Expected output starts with "%YAML 1.1"
const expectedStart = Buffer.from("%YAML 1.1");
console.log("\nExpected first bytes:", expectedStart.toString('hex'));

// Try XOR approach: XOR first encrypted bytes with expected output
const dataStart = encryptedBuffer.subarray(6); // skip header + version
for (let offset = 0; offset <= 16; offset++) {
    const xorKey: number[] = [];
    for (let i = 0; i < expectedStart.length; i++) {
        xorKey.push(encryptedBuffer[offset + i] ^ expectedStart[i]);
    }
    console.log(`Offset ${offset}: XOR key = ${Buffer.from(xorKey).toString('hex')}`);
}

// Try simple XOR with single byte
console.log("\n--- Single byte XOR attempts ---");
for (let key = 0; key < 256; key++) {
    const firstChar = encryptedBuffer[6] ^ key;
    if (firstChar === 0x25) { // '%' 
        const secondChar = encryptedBuffer[7] ^ key;
        if (secondChar === 0x59) { // 'Y'
            console.log(`Key ${key} (0x${key.toString(16)}): produces %Y...`);
        }
    }
}
