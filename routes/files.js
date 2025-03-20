const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const auth = require('../middleware/auth');
const File = require('../models/File');
const User = require('../models/User');
const { sendDecryptionKey } = require('../utils/emailService');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function(req, file, cb) {
    // Create unique filename while preserving original extension exactly
    const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalExt = path.extname(file.originalname);
    cb(null, uniqueId + originalExt);
  }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 1000 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        // Add file type restrictions if needed
        cb(null, true);
    }
});

// @route   POST api/files/upload
// @desc    Upload and encrypt a file
// @access  Private
router.post('/upload', [auth, upload.single('file')], async (req, res) => {
    try {
        console.log('File upload request received:', {
            file: req.file,
            body: req.body,
            headers: req.headers
        });

        if (!req.file) {
            console.error('No file in request');
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { receiverEmail } = req.body;
        if (!receiverEmail) {
            console.error('No receiver email provided');
            return res.status(400).json({ message: 'Receiver email is required' });
        }

        // Find receiver
        const receiver = await User.findOne({ email: receiverEmail });
        if (!receiver) {
            console.error(`Receiver not found for email: ${receiverEmail}`);
            return res.status(400).json({ message: 'Receiver not found' });
        }

        // Generate encryption key
        const encryptionKey = crypto.randomBytes(32).toString('hex');

        // Store original filename without any modifications
        const originalName = req.file.originalname;

        // Create file record
        const file = new File({
            filename: req.file.filename,
            originalName: originalName, // Store exactly as received
            path: req.file.path,
            size: req.file.size,
            mimeType: req.file.mimetype,
            sender: req.user.id,
            receiver: receiver._id,
            encryptionKey,
            downloadLink: crypto.randomBytes(16).toString('hex')
        });

        await file.save();

        // Generate QR code data
        const qrCodeData = JSON.stringify({
            fileId: file._id,
            fileName: originalName
        });

        try {
            // Send email with decryption key and QR code
            await sendDecryptionKey(
                receiverEmail,
                encryptionKey,
                {
                    fileName: originalName,
                    fileId: file._id
                },
                qrCodeData
            );
        } catch (emailError) {
            console.error('Error sending email:', emailError);
            // Delete the uploaded file and file record if email fails
            fs.unlink(file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
            await file.deleteOne();
            return res.status(500).json({ 
                message: 'Error sending email. Please check your EmailJS configuration.',
                error: emailError.message
            });
        }

        res.json({
            message: 'File uploaded and shared successfully',
            fileId: file._id
        });
    } catch (err) {
        console.error('File upload error:', err);
        if (req.file) {
            // Clean up uploaded file if there's an error
            fs.unlink(req.file.path, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting file:', unlinkErr);
            });
        }
        res.status(500).json({ 
            message: 'Server error during file upload',
            error: err.message
        });
    }
});

// @route   GET api/files/shared
// @desc    Get list of files shared by user
// @access  Private
router.get('/shared', auth, async (req, res) => {
    try {
        const files = await File.find({ sender: req.user.id })
            .populate('receiver', 'name email')
            .select('-encryptionKey');
        res.json(files);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   GET api/files/received
// @desc    Get list of files received by user
// @access  Private
router.get('/received', auth, async (req, res) => {
    try {
        const files = await File.find({ 
            receiver: req.user.id,
            isDestroyed: false,
            status: { $ne: 'expired' }
        }).populate('sender', 'name email');
        res.json(files);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   POST api/files/download/:id
// @desc    Download a file
// @access  Private
router.post('/download/:id', auth, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Check if user is the receiver
        if (file.receiver.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Check if file is destroyed or expired
        if (file.isDestroyed || file.status === 'expired') {
            return res.status(400).json({ message: 'File is no longer available' });
        }

        // Verify decryption key
        const { decryptionKey } = req.body;
        if (decryptionKey !== file.encryptionKey) {
            file.downloadAttempts += 1;
            
            if (file.downloadAttempts >= file.maxAttempts) {
                file.isDestroyed = true;
                file.status = 'destroyed';
                await file.save();
                return res.status(400).json({ message: 'File has been destroyed due to too many failed attempts' });
            }
            
            await file.save();
            return res.status(400).json({ 
                message: 'Invalid decryption key',
                attemptsLeft: file.maxAttempts - file.downloadAttempts
            });
        }

        // Update file status
        file.status = 'downloaded';
        await file.save();

        // Get the file stats to set the correct content length
        const stats = fs.statSync(file.path);

        // Set response headers
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', 'attachment; filename=' + file.originalName);
        
        // Read and send the file directly
        fs.createReadStream(file.path)
            .on('error', (err) => {
                console.error('Error streaming file:', err);
                res.status(500).send('Error downloading file');
            })
            .pipe(res);

    } catch (err) {
        console.error('Download error:', err.message);
        res.status(500).send('Server error');
    }
});

// @route   DELETE api/files/:id
// @desc    Delete a file
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Check if user is the sender
        if (file.sender.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Delete file from storage
        fs.unlink(file.path, async (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            }
            // Delete file record regardless of physical file deletion
            await file.deleteOne();
            res.json({ message: 'File deleted' });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

module.exports = router;