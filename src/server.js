// const app = require('./app');
// const connectDB = require('./config/database');
// require('dotenv').config();

// const PORT = process.env.PORT || 5000;

// // Connect to MongoDB then start server
// connectDB().then(() => {
//   app.listen(PORT, () => {
//     console.log(`\n🚀 ScoreMe Scheduler API running on port ${PORT}`);
//     console.log(`📦 Environment: ${process.env.NODE_ENV}`);
//     console.log(`🗄️  MongoDB connected\n`);
//   });
// }).catch((err) => {
//   console.error('Failed to connect to MongoDB:', err.message);
//   process.exit(1);
// });


const app = require('./app');
const connectDB = require('./config/database');

let isConnected = false;

async function connect() {
  if (!isConnected) {
    await connectDB();
    isConnected = true;
    console.log('MongoDB Connected');
  }
}

module.exports = async (req, res) => {
  await connect();
  return app(req, res);
};
