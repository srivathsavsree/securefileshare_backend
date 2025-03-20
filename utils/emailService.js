const { init } = require('@emailjs/nodejs');
const emailjs = require('@emailjs/nodejs').default;
const QRCode = require('qrcode');

// Initialize EmailJS
init({
  publicKey: process.env.EMAILJS_PUBLIC_KEY,
  privateKey: process.env.EMAILJS_PRIVATE_KEY
});

// Generate QR code
const generateQRCode = async (data) => {
  try {
    return await QRCode.toDataURL(data);
  } catch (err) {
    console.error('Error generating QR code:', err);
    throw err;
  }
};

// Send decryption key via email
const sendDecryptionKey = async (recipientEmail, decryptionKey, fileInfo, qrCodeData) => {
  try {
    console.log('Generating QR code...');
    const qrCodeUrl = await generateQRCode(qrCodeData);
    console.log('QR code generated successfully');

    const downloadUrl = `${process.env.FRONTEND_URL}/decrypt/${fileInfo.fileId}`;

    const templateParams = {
      to_email: recipientEmail,
      from_name: 'Secure File Share',
      file_name: fileInfo.fileName,
      decryption_key: decryptionKey,
      download_url: downloadUrl,
      qr_code: qrCodeUrl,
      message: `You have received a secure file: ${fileInfo.fileName}. Please use the decryption key to access it.`
    };

    console.log('Sending email...');
    const response = await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_ID,
      templateParams
    );
   
    console.log('Email sent successfully:', response.status);
    return response;
  } catch (err) {
    console.error('Error in sendDecryptionKey:', err);
    throw err;
  }
};

const sendEmail = async (to, subject, text) => {
  try {
    const templateParams = {
      to_email: to,
      from_name: 'Secure File Share',
      subject: subject,
      message: text
    };

    const response = await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_ID,
      templateParams
    );

    console.log('Email sent successfully:', response.status);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

module.exports = {
  sendDecryptionKey,
  sendEmail
}; 
