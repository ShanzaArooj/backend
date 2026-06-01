const mongoose = require("mongoose");

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, enum: ["admin", "registrar", "owner"] },
    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    resetToken: String,
    resetTokenExpires: String
});

// Registrar Request Schema
const registrarRequestSchema = new mongoose.Schema({
    requestId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    appliedBy: { type: String, required: true }, // username of the owner applying
    status: { type: String, required: true, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    comments: { type: String, default: "" },
    createdDate: { type: Date, default: Date.now }
});

// Property Schema
const propertySchema = new mongoose.Schema({
    propertyId: { type: String, required: true, unique: true },
    ownerName: { type: String, required: true },
    ownerAddress: { type: String, default: "" }, // wallet address
    location: { type: String, required: true },
    area: { type: String, required: true },
    ipfsHash: { type: String, default: "" },
    status: { type: String, required: true, enum: ["Pending", "Verified", "Rejected"], default: "Pending" },
    createdDate: { type: Date, default: Date.now },
    registeredBy: { type: String, required: true }, // username of registrar or admin
    onChainVerified: { type: Boolean, default: false },
    certificateUri: { type: String, default: "" },
    blockchainIndex: { type: Number, default: null }
});

// Transfer Request Schema
const transferRequestSchema = new mongoose.Schema({
    transferId: { type: String, required: true, unique: true },
    propertyId: { type: String, required: true },
    currentOwner: { type: String, required: true }, // username
    currentOwnerName: { type: String, required: true },
    newOwner: { type: String, required: true }, // username
    newOwnerName: { type: String, required: true },
    status: { type: String, required: true, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    createdDate: { type: Date, default: Date.now }
});

// Complaint Schema
const complaintSchema = new mongoose.Schema({
    complaintId: { type: String, required: true, unique: true },
    propertyId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    raisedBy: { type: String, required: true }, // username
    status: { type: String, required: true, enum: ["Pending", "Resolved"], default: "Pending" },
    createdDate: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const RegistrarRequest = mongoose.model("RegistrarRequest", registrarRequestSchema);
const Property = mongoose.model("Property", propertySchema);
const TransferRequest = mongoose.model("TransferRequest", transferRequestSchema);
const Complaint = mongoose.model("Complaint", complaintSchema);

module.exports = {
    User,
    RegistrarRequest,
    Property,
    TransferRequest,
    Complaint
};
