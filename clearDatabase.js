// const mongoose = require('mongoose');
// require('dotenv').config();

// async function clearDatabase() {
//   try {
//     // Connect to MongoDB
//     await mongoose.connect(process.env.MONGODB_URI);
//     console.log('Connected to MongoDB');

//     // Get all collections
//     const collections = await mongoose.connection.db.collections();

//     // Drop each collection
//     for (let collection of collections) {
//       await collection.drop();
//       console.log(`Dropped collection: ${collection.collectionName}`);
//     }

//     // Also delete all files in the uploads directory
//     const fs = require('fs');
//     const path = require('path');
//     const uploadsDir = path.join(__dirname, 'uploads');
    
//     if (fs.existsSync(uploadsDir)) {
//       const files = fs.readdirSync(uploadsDir);
//       for (const file of files) {
//         if (file !== '.gitkeep') { // Keep the .gitkeep file
//           fs.unlinkSync(path.join(uploadsDir, file));
//           console.log(`Deleted file: ${file}`);
//         }
//       }
//     }

//     console.log('Database and uploads cleared successfully');
//     process.exit(0);
//   } catch (error) {
//     console.error('Error clearing database:', error);
//     process.exit(1);
//   }
// }

// clearDatabase(); 
