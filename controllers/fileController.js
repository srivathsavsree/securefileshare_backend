const File = require('../models/File');
const { encryptFile, decryptFile, generateDownloadLink } = require('../utils/encryption');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

// Upload a file
exports.uploadFile = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ msg: 'No file uploaded' });
    }

    // Generate a unique filename
    const fileId = crypto.randomBytes(16).toString('hex');
    const fileExtension = path.extname(req.file.originalname);
    const filename = `${fileId}${fileExtension}`;
    
    // Paths for original and encrypted files
    const originalPath = req.file.path;
    const encryptedPath = path.join(__dirname, '..', 'uploads', 'encrypted', filename);

    // Ensure encrypted directory exists
    await fs.ensureDir(path.dirname(encryptedPath));

    // Encrypt the file
    const encryptionSuccess = await encryptFile(originalPath, encryptedPath);
    
    if (!encryptionSuccess) {
      return res.status(500).json({ msg: 'File encryption failed' });
    }

    // Generate a download link
    const downloadLink = generateDownloadLink();

    // Create file document in database
    const file = new File({
      filename,
      originalName: req.file.originalname,
      encryptedPath,
      mimeType: req.file.mimetype,
      size: req.file.size,
      owner: req.user.id,
      downloadLink
    });

    await file.save();

    // Remove the original unencrypted file
    await fs.unlink(originalPath);

    res.json({
      msg: 'File uploaded successfully',
      file: {
        id: file._id,
        filename: file.originalName,
        downloadLink: file.downloadLink,
        expiresAt: file.expiresAt
      }
    });
  } catch (err) {
    console.error('File upload error:', err.message);
    res.status(500).send('Server error');
  }
};

// Download a file
exports.downloadFile = async (req, res) => {
  try {
    const { downloadLink } = req.params;

    // Find the file by download link
    const file = await File.findOne({ downloadLink });

    if (!file) {
      return res.status(404).json({ msg: 'File not found' });
    }

    // Check if file has expired
    if (new Date() > file.expiresAt) {
      // Remove the file if expired
      await fs.unlink(file.encryptedPath);
      await file.remove();
      return res.status(410).json({ msg: 'File has expired' });
    }

    // Check if file has reached max downloads
    if (file.downloadCount >= file.maxDownloads) {
      // Remove the file if max downloads reached
      await fs.unlink(file.encryptedPath);
      await file.remove();
      return res.status(410).json({ msg: 'File download limit reached' });
    }

    // Temporary path for decrypted file
    const tempPath = path.join(__dirname, '..', 'uploads', 'temp', file.filename);
    
    // Ensure temp directory exists
    await fs.ensureDir(path.dirname(tempPath));

    // Decrypt the file
    const decryptionSuccess = await decryptFile(file.encryptedPath, tempPath);
    
    if (!decryptionSuccess) {
      return res.status(500).json({ msg: 'File decryption failed' });
    }

    // Increment download count
    file.downloadCount += 1;
    await file.save();

    // Send the file as a download
    res.download(tempPath, file.originalName, async (err) => {
      // Delete the temporary file after download
      await fs.unlink(tempPath);
      
      // If this was the last download, remove the encrypted file too
      if (file.downloadCount >= file.maxDownloads) {
        await fs.unlink(file.encryptedPath);
        await file.remove();
      }
    });
  } catch (err) {
    console.error('File download error:', err.message);
    res.status(500).send('Server error');
  }
};

// Get user's files
exports.getUserFiles = async (req, res) => {
  try {
    const files = await File.find({ owner: req.user.id }).sort({ createdAt: -1 });
    
    // Format files for frontend
    const formattedFiles = files.map(file => ({
      id: file._id,
      filename: file.originalName,
      size: file.size,
      downloadLink: file.downloadLink,
      downloadCount: file.downloadCount,
      maxDownloads: file.maxDownloads,
      expiresAt: file.expiresAt,
      createdAt: file.createdAt
    }));
    
    res.json(formattedFiles);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Delete a file
exports.deleteFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ msg: 'File not found' });
    }

    // Check if the user owns the file
    if (file.owner.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    // Delete the file from storage
    await fs.unlink(file.encryptedPath);
    
    // Delete the file from database
    await file.remove();

    res.json({ msg: 'File deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};