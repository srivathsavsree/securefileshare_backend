const CryptoJS = require('crypto-js');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

// Get encryption key from environment variables
const encryptionKey = process.env.ENCRYPTION_KEY;

// Encrypt a file
const encryptFile = async (filePath, destinationPath) => {
  try {
    // Read the file
    const fileData = await fs.readFile(filePath);
    
    // Convert to WordArray (required for CryptoJS)
    const wordArray = CryptoJS.lib.WordArray.create(fileData);
    
    // Encrypt the file data
    const encrypted = CryptoJS.AES.encrypt(wordArray, encryptionKey).toString();
    
    // Write the encrypted data to the destination
    await fs.writeFile(destinationPath, encrypted);
    
    return true;
  } catch (error) {
    console.error('Encryption error:', error);
    return false;
  }
};

// Decrypt a file
const decryptFile = async (encryptedFilePath, destinationPath) => {
  try {
    // Read the encrypted file
    const encryptedData = await fs.readFile(encryptedFilePath, 'utf8');
    
    // Decrypt the data
    const decrypted = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
    
    // Convert to bytes
    const decryptedBytes = decrypted.toString(CryptoJS.enc.Base64);
    
    // Convert Base64 to Buffer
    const buffer = Buffer.from(decryptedBytes, 'base64');
    
    // Write the decrypted data to the destination
    await fs.writeFile(destinationPath, buffer);
    
    return true;
  } catch (error) {
    console.error('Decryption error:', error);
    return false;
  }
};

// Generate a random download link
const generateDownloadLink = () => {
  const randomBytes = CryptoJS.lib.WordArray.random(16);
  return randomBytes.toString(CryptoJS.enc.Hex);
};

module.exports = {
  encryptFile,
  decryptFile,
  generateDownloadLink
};