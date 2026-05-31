const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/scoreme_scheduler';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log(`✅ MongoDB connected: ${mongoose.connection.host}`);
};

module.exports = connectDB;
