require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");




const {
  User,
  RegistrarRequest,
  Property,
  TransferRequest,
  Complaint,
} = require("./models");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET =
  process.env.JWT_SECRET || "land_registry_super_secret_key_123";
const MONGODB_URI = process.env.MONGODB_URI;

// Configure CORS - allow all known frontend origins
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5000",
  "http://127.0.0.1:3000",
  process.env.CLIENT_URL,
  "https://land-registry-system.vercel.app",
  "https://frontend-land-registry.vercel.app",
  "https://frontend-aliyahya.vercel.app",
].filter(Boolean);

const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin not allowed: ' + origin));
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));
// Handle pre-flight for all routes
app.options('*', cors(corsOptions));
app.use(helmet());
app.use(express.json());
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/auth", authLimiter);

// Connect to Persistent Local Database
mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    await initAdmin();
  })
  .catch(async (err) => {
    console.error("Database connection failed:", err.message);
  });

// Setup Nodemailer Ethereal Transport
let transporter;
async function initMail() {
  try {
    if (process.env.SMTP_HOST) {
      // Use real SMTP credentials from .env
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });
      console.log("SMTP transporter configured using environment variables.");
    } else {
      // Fallback to Ethereal for development
      let testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      console.log("--------------------------------------------------");
      console.log("Nodemailer configured with Ethereal Mail.");
      console.log(`Ethereal user: ${testAccount.user}`);
      console.log(`Ethereal password: ${testAccount.pass}`);
      console.log("Emails sent will output a preview URL in console.");
      console.log("--------------------------------------------------");
    }
  } catch (err) {
    console.error("Failed to initialize mail transporter:", err);
  }
}
initMail();

async function initAdmin() {
  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminEmail = process.env.ADMIN_EMAIL || "admin@landregistry.gov";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const adminRole = "admin";

  try {
    const existingAdmin = await User.findOne({ username: adminUser });
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await User.create({
        username: adminUser,
        email: adminEmail,
        passwordHash,
        role: adminRole,
        isVerified: true,
      });
      console.log(
        `Default admin account created (${adminEmail} / ${adminPassword}).`,
      );
    }
  } catch (err) {
    console.error("Error checking or creating default admin:", err.message);
  }
}

// Helper to send emails
async function sendAuthEmail(to, subject, htmlContent) {
  if (!transporter) {
    console.warn("Mail transporter is not ready yet. Logging email body:");
    console.log(`TO: ${to}\nSUBJECT: ${subject}\nBODY: ${htmlContent}`);
    return null;
  }
  const mailOptions = {
    from: '"Land Registry System" <noreply@landregistry.gov>',
    to,
    subject,
    html: htmlContent,
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log("--------------------------------------------------");
    console.log(`Email Sent: "${subject}" to ${to}`);
    if (previewUrl) {
      console.log(`PREVIEW URL: ${previewUrl}`);
    }
    console.log("--------------------------------------------------");
    return previewUrl;
  } catch (err) {
    console.error("Error sending email:", err);
    return null;
  }
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Access token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  });
}

// ROUTES

// Signup Route
app.post("/api/auth/signup", async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !email || !password || !role) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = jwt.sign({ username, email }, JWT_SECRET, {
      expiresIn: "1d",
    });

    await User.create({
      username,
      email,
      passwordHash,
      role,
      verificationToken,
    });

    // Send Verification Email
    const verifyLink = `http://localhost:5000/api/auth/verify-email?token=${verificationToken}`;
    const htmlContent = `
            <h2>Welcome to Land Registry System</h2>
            <p>Thank you for signing up. Please verify your email by clicking the link below:</p>
            <a href="${verifyLink}" target="_blank" style="padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
            <br><br>
            <p>If you did not request this, please ignore this email.</p>
        `;
    const previewUrl = await sendAuthEmail(
      email,
      "Verify Your Email - Land Registry System",
      htmlContent,
    );

    res.status(201).json({
      message: "Signup successful. Verification email sent.",
      previewUrl,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(400)
        .json({ error: "Username or Email already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

// Verify Email Route
app.get("/api/auth/verify-email", async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send("Verification token is missing.");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOneAndUpdate(
      { email: decoded.email, isVerified: false },
      { isVerified: true, verificationToken: null },
      { new: true },
    );

    if (!user) {
      return res
        .status(400)
        .send("Email is already verified or user does not exist.");
    }

    // Redirect back to frontend login page
    res.send(`
            <html>
            <body style="font-family: sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background-color: #f8fafc;">
                <div style="text-align: center; background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
                    <h2 style="color: #16a34a;">Email Verified Successfully!</h2>
                    <p style="color: #475569;">You can now log in to the portal.</p>
                    <a href="http://localhost:3000/login?verified=true" style="padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 8px; display: inline-block; margin-top: 15px;">Go to Login</a>
                </div>
            </body>
            </html>
        `);
  } catch (err) {
    return res.status(400).send("Verification link is invalid or expired.");
  }
});

// Login Route
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ error: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch)
      return res.status(400).json({ error: "Invalid email or password" });

    if (!user.isVerified) {
      return res
        .status(400)
        .json({ error: "Please verify your email before logging in" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        role: user.role,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: "8h" },
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        username: user.username,
        role: user.role,
        email: user.email,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Forgot Password Route
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({
        message: "If this email is registered, a reset link has been sent.",
      });
    }

    const resetToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: "30m" });
    const expiresTime = (Date.now() + 30 * 60 * 1000).toString(); // 30 minutes

    await User.findByIdAndUpdate(user._id, {
      resetToken,
      resetTokenExpires: expiresTime,
    });

    const resetLink = `http://localhost:3000/forgot-password?token=${resetToken}`;
    const htmlContent = `
            <h2>Reset Your Password</h2>
            <p>You requested a password reset. Click the button below to reset it:</p>
            <a href="${resetLink}" target="_blank" style="padding: 10px 20px; background-color: #ef4444; color: white; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
            <br><br>
            <p>This link will expire in 30 minutes.</p>
            <p>If you did not request this reset, please ignore this email.</p>
        `;
    const previewUrl = await sendAuthEmail(
      email,
      "Reset Your Password - Land Registry System",
      htmlContent,
    );

    res.json({
      message: "If this email is registered, a reset link has been sent.",
      previewUrl,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Password Route
app.post("/api/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res
      .status(400)
      .json({ error: "Token and new password are required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({
      email: decoded.email,
      resetToken: token,
    });
    if (!user)
      return res
        .status(400)
        .json({ error: "Invalid token or token already used" });

    if (Number(user.resetTokenExpires) < Date.now()) {
      return res.status(400).json({ error: "Reset token has expired" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(user._id, {
      passwordHash: newHash,
      resetToken: null,
      resetTokenExpires: null,
    });

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(400).json({ error: "Reset link is invalid or has expired" });
  }
});

// Verify Token
app.get("/api/auth/verify-token", authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// REGISTRAR REQUEST ROUTES
app.post("/api/registrars", authenticateToken, async (req, res) => {
  const { requestId, name, email } = req.body;
  if (!requestId || !name || !email) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const request = await RegistrarRequest.create({
      requestId,
      name,
      email,
      appliedBy: req.user.username,
      status: "Pending",
    });
    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/registrars", authenticateToken, async (req, res) => {
  try {
    let query = {};
    if (req.user.role !== "admin") {
      query = { appliedBy: req.user.username };
    }
    const requests = await RegistrarRequest.find(query);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/registrars/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  const { status, comments } = req.body;

  try {
    const request = await RegistrarRequest.findOneAndUpdate(
      { requestId: req.params.id },
      { status, comments },
      { new: true },
    );
    if (!request) return res.status(404).json({ error: "Request not found" });

    // If approved, update the applicant user's role to 'registrar'
    if (status === "Approved") {
      await User.findOneAndUpdate(
        { username: request.appliedBy },
        { role: "registrar" },
      );
    }
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PROPERTY ROUTES
app.post("/api/properties", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "registrar") {
    return res
      .status(403)
      .json({ error: "Only admin or registrars can register properties" });
  }

  const {
    propertyId,
    ownerName,
    ownerAddress,
    location,
    area,
    ipfsHash,
    status,
    onChainVerified,
    certificateUri,
    blockchainIndex,
  } = req.body;
  if (!propertyId || !ownerName || !location || !area) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const property = await Property.create({
      propertyId,
      ownerName,
      ownerAddress,
      location,
      area,
      ipfsHash: ipfsHash || "",
      status: status || "Pending",
      registeredBy: req.user.username,
      onChainVerified: onChainVerified || false,
      certificateUri: certificateUri || "",
      blockchainIndex: blockchainIndex !== undefined ? blockchainIndex : null,
    });
    res.status(201).json(property);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Property ID already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/properties", authenticateToken, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === "owner") {
      query = { ownerName: req.user.username };
    } else if (req.user.role === "registrar") {
      query = {
        $or: [
          { registeredBy: req.user.username },
          { ownerName: req.user.username },
        ],
      };
    }
    const properties = await Property.find(query);
    res.json(properties);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/properties/:id", authenticateToken, async (req, res) => {
  const {
    status,
    ownerName,
    ownerAddress,
    onChainVerified,
    certificateUri,
    blockchainIndex,
  } = req.body;

  try {
    const updateFields = {};
    if (status !== undefined) updateFields.status = status;
    if (ownerName !== undefined) updateFields.ownerName = ownerName;
    if (ownerAddress !== undefined) updateFields.ownerAddress = ownerAddress;
    if (onChainVerified !== undefined)
      updateFields.onChainVerified = onChainVerified;
    if (certificateUri !== undefined)
      updateFields.certificateUri = certificateUri;
    if (blockchainIndex !== undefined)
      updateFields.blockchainIndex = blockchainIndex;

    const property = await Property.findOneAndUpdate(
      { propertyId: req.params.id },
      updateFields,
      { new: true },
    );
    if (!property) return res.status(404).json({ error: "Property not found" });
    res.json(property);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TRANSFER ROUTES
app.post("/api/transfers", authenticateToken, async (req, res) => {
  const {
    transferId,
    propertyId,
    currentOwner,
    currentOwnerName,
    newOwner,
    newOwnerName,
  } = req.body;
  if (!transferId || !propertyId || !currentOwner || !newOwner) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const transfer = await TransferRequest.create({
      transferId,
      propertyId,
      currentOwner,
      currentOwnerName,
      newOwner,
      newOwnerName,
      status: "Pending",
    });
    res.status(201).json(transfer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/transfers", authenticateToken, async (req, res) => {
  try {
    let query = {};
    if (req.user.role !== "admin") {
      query = {
        $or: [
          { currentOwner: req.user.username },
          { newOwner: req.user.username },
        ],
      };
    }
    const transfers = await TransferRequest.find(query);
    res.json(transfers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/transfers/:id", authenticateToken, async (req, res) => {
  const { status } = req.body;

  try {
    const transfer = await TransferRequest.findOneAndUpdate(
      { transferId: req.params.id },
      { status },
      { new: true },
    );
    if (!transfer) return res.status(404).json({ error: "Transfer not found" });

    // If approved, update the property owner name to the new owner!
    if (status === "Approved") {
      await Property.findOneAndUpdate(
        { propertyId: transfer.propertyId },
        { ownerName: transfer.newOwner },
      );
    }
    res.json(transfer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// COMPLAINT ROUTES
app.post("/api/complaints", authenticateToken, async (req, res) => {
  const { complaintId, propertyId, title, description } = req.body;
  if (!complaintId || !propertyId || !title || !description) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const complaint = await Complaint.create({
      complaintId,
      propertyId,
      title,
      description,
      raisedBy: req.user.username,
      status: "Pending",
    });
    res.status(201).json(complaint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/complaints", authenticateToken, async (req, res) => {
  try {
    let query = {};
    if (req.user.role !== "admin") {
      query = { raisedBy: req.user.username };
    }
    const complaints = await Complaint.find(query);
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/complaints/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  const { status } = req.body;

  try {
    const complaint = await Complaint.findOneAndUpdate(
      { complaintId: req.params.id },
      { status },
      { new: true },
    );
    if (!complaint)
      return res.status(404).json({ error: "Complaint not found" });
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Secure IPFS Document Upload Route - uses Pinata API
const os = require("os");
const fs = require("fs");
const upload = multer({ dest: os.tmpdir() });
app.post("/api/documents/upload", authenticateToken, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const PINATA_JWT = process.env.PINATA_JWT;
  if (!PINATA_JWT) {
    // Fallback: return filename only (no actual upload)
    return res.json({ cid: req.file.originalname || req.file.filename, gateway: "" });
  }
  try {
    const fileData = fs.readFileSync(req.file.path);
    const FormData = require("form-data");
    const formData = new FormData();
    formData.append("file", fileData, { filename: req.file.originalname || "document" });
    formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
    formData.append("pinataMetadata", JSON.stringify({ name: req.file.originalname || "land-registry-doc" }));

    const fetch = require("node-fetch");
    const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + PINATA_JWT,
        ...formData.getHeaders(),
      },
      body: formData,
    });
    // Delete temporary file
    fs.unlinkSync(req.file.path);

    if (!pinataRes.ok) {
      const errText = await pinataRes.text();
      console.error("Pinata error:", errText);
      return res.status(500).json({ error: "Pinata upload failed: " + errText });
    }
    const data = await pinataRes.json();
    const cid = data.IpfsHash;
    const gateway = "https://gateway.pinata.cloud/ipfs/" + cid;
    res.json({ cid, gateway });
  } catch (err) {
    console.error("Upload error:", err);
    // Clean up temp file if it exists
    try { fs.unlinkSync(req.file.path); } catch(_) {}
    res.status(500).json({ error: "Failed to upload document: " + err.message });
  }
});

// Only listen when running directly (not in serverless environment)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
  });
}

module.exports = app;
