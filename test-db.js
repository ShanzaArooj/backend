console.log("test-db.js starting");
const dns = require("dns");
try {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  console.log("DNS servers set to Google DNS (8.8.8.8, 8.8.4.4)");
} catch (dnsErr) {
  console.warn("Failed to set DNS servers:", dnsErr.message);
}
require("dotenv").config();
const mongoose = require("mongoose");
const {
  User,
  RegistrarRequest,
  Property,
  TransferRequest,
  Complaint,
} = require("./models");

const MONGODB_URI = process.env.MONGODB_URI;

console.log("MONGODB_URI present:", !!MONGODB_URI);

async function main() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is not set in .env");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 8000,
  });
  console.log("Connected to MongoDB for test");

  try {
    // Cleanup any test artifacts
    await User.deleteMany({ username: /^test_user_/ });
    await RegistrarRequest.deleteMany({ requestId: /^TEST-REG-/ });
    await Property.deleteMany({ propertyId: /^TEST-PROP-/ });
    await TransferRequest.deleteMany({ transferId: /^TEST-TR-/ });
    await Complaint.deleteMany({ complaintId: /^TEST-CMP-/ });

    // Create a test user
    const user = await User.create({
      username: "test_user_1",
      email: "test1@example.com",
      passwordHash: "fakehash",
      role: "owner",
      isVerified: true,
    });
    console.log("Created User:", user.username);

    // Create registrar request
    const reg = await RegistrarRequest.create({
      requestId: "TEST-REG-1",
      name: "Test Registrar",
      email: "reg@example.com",
      appliedBy: user.username,
    });
    console.log("Created RegistrarRequest:", reg.requestId);

    // Create property
    const prop = await Property.create({
      propertyId: "TEST-PROP-1",
      ownerName: user.username,
      ownerAddress: "0xABC",
      location: "Testville",
      area: "100sqm",
      registeredBy: "admin",
    });
    console.log("Created Property:", prop.propertyId);

    // Create transfer
    const tr = await TransferRequest.create({
      transferId: "TEST-TR-1",
      propertyId: prop.propertyId,
      currentOwner: user.username,
      currentOwnerName: user.username,
      newOwner: "new_owner",
      newOwnerName: "New Owner",
    });
    console.log("Created TransferRequest:", tr.transferId);

    // Create complaint
    const cmp = await Complaint.create({
      complaintId: "TEST-CMP-1",
      propertyId: prop.propertyId,
      title: "Test Issue",
      description: "Something is wrong",
      raisedBy: user.username,
    });
    console.log("Created Complaint:", cmp.complaintId);

    // Read back
    const users = await User.find({ username: user.username });
    console.log("Found Users:", users.length);

    const props = await Property.find({ propertyId: prop.propertyId });
    console.log("Found Properties:", props.length);

    // Update property status
    await Property.findOneAndUpdate(
      { propertyId: prop.propertyId },
      { status: "Verified" },
    );
    const updated = await Property.findOne({ propertyId: prop.propertyId });
    console.log("Updated Property Status:", updated.status);

    // Cleanup
    await User.deleteOne({ _id: user._id });
    await RegistrarRequest.deleteOne({ _id: reg._id });
    await Property.deleteOne({ _id: prop._id });
    await TransferRequest.deleteOne({ _id: tr._id });
    await Complaint.deleteOne({ _id: cmp._id });
    console.log("Cleaned up test documents");
  } catch (err) {
    console.error("Error during test:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  }
}

main();
