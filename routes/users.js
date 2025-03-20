const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const User = require('../models/User');

// Register a new user
// POST /api/users/register
router.post('/register', userController.registerUser);

// Login user
// POST /api/users/login
router.post('/login', userController.loginUser);

// @route   GET api/users/search
// @desc    Search users by email
// @access  Private
router.get('/search', auth, async (req, res) => {
    try {
        const searchTerm = req.query.email;
        if (!searchTerm) {
            return res.status(400).json({ message: 'Email search term is required' });
        }

        const users = await User.find({
            email: { $regex: searchTerm, $options: 'i' },
            _id: { $ne: req.user.id } // Exclude current user
        }).select('name email');

        res.json(users);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   GET api/users/me
// @desc    Get current user's profile
// @access  Private
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password -privateKey');
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   PUT api/users/me
// @desc    Update user profile
// @access  Private
router.put('/me', auth, async (req, res) => {
    try {
        const { name } = req.body;
        
        // Build update object
        const updateFields = {};
        if (name) updateFields.name = name;

        // Update user
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updateFields },
            { new: true }
        ).select('-password -privateKey');

        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

module.exports = router;