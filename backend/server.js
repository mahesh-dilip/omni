const express = require("express");
const cors = require("cors");
require("dotenv").config(); // Load environment variables from .env file

const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- INITIALIZATION ---
const app = express();
const port = 3001;

// Initialize Firebase Admin SDK
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Initialize Gemini AI Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Increase limit to handle base64 images

// Middleware to verify Firebase ID token
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) {
    return res.status(401).send({ error: "Unauthorized: No token provided" });
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken; // Add user info to the request object
    next();
  } catch (error) {
    console.error("Error verifying token:", error);
    return res.status(403).send({ error: "Unauthorized: Invalid token" });
  }
};

// --- API ENDPOINTS ---

// Endpoint 1: Identify Image (using gemini-1.5-flash)
app.post("/api/identify", verifyToken, async (req, res) => {
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64 || !mimeType) {
    return res.status(400).send({ error: "Missing imageBase64 or mimeType" });
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const imagePart = { inline_data: { data: imageBase64, mime_type: mimeType } };
    const prompt = `
      You are an expert at identifying objects in images. Analyze the provided image and perform the following tasks:
      1.  **Identify Name**: Provide a concise, clear name for the primary object in the image.
      2.  **Write Description**: Write a brief, one-sentence physical description of the item.
      3.  **Categorize**: Choose the single best category from this list: ["Electronics", "Tools & Hardware", "Clothing & Accessories", "Books & Media", "Collectibles & Art", "Kitchen & Home", "Sports & Outdoors", "Musical Instruments", "Health & Beauty", "Toys & Games", "Other"].
      Provide your response ONLY as a valid JSON object with the structure: {"name": "string", "description": "string", "category": "string"}`;
    
    console.log("Sending identification request to Gemini...");
    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
    console.log("Received identification from Gemini.");
    
    res.status(200).json(JSON.parse(responseText));
  } catch (error) {
    console.error("Error in /api/identify:", error);
    res.status(500).send({ error: "Failed to analyze image." });
  }
});

// Endpoint 2: Value Item (using gemini-2.0-flash with search)
app.post("/api/value", verifyToken, async (req, res) => {
  const { itemId, name, description, category } = req.body;
  if (!itemId || !name) {
    return res.status(400).send({ error: "Missing required item details." });
  }
  
  // Update Firestore immediately to show it's being valuated
  const itemRef = admin.firestore().collection("items").doc(itemId);
  await itemRef.update({ status: `valuation_started_${Date.now()}` });

  try {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        tools: [{ "google_search": {} }],
      });
    const prompt = `
      You are an expert asset appraiser. Your task is to determine the trackability and value of an item based on its user-confirmed details.
      Item Name: "${name}"
      Item Description: "${description}"
      Item Category: "${category}"
      Your tasks:
      1. **Identify if Trackable**: Based on the info, decide if this item's value is worth tracking.
      2. **Valuation**: If the item IS trackable, use your Google Search tool to find its current estimated market value. If it is NOT trackable, set the value to 0.
      Provide your response ONLY as a valid JSON object with the structure: {"is_trackable": boolean, "estimated_value": number, "currency": "USD", "reasoning": "A brief explanation for your valuation."}`;
      
    console.log(`Sending valuation request for ${itemId}...`);
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
    console.log(`Received valuation for ${itemId}.`);
    
    const analysisData = JSON.parse(responseText);
    await itemRef.update({
        ...analysisData,
        status: "analyzed",
    });

    res.status(200).send({ success: true, message: "Valuation complete." });
  } catch (error) {
    console.error(`Error in /api/value for item ${itemId}:`, error);
    await itemRef.update({ status: "error" });
    res.status(500).send({ error: "Failed to value item." });
  }
});

// Endpoint 3: Delete an Item
app.delete("/api/items/:itemId", verifyToken, async (req, res) => {
  const { itemId } = req.params;
  const { uid } = req.user; // Get the authenticated user's ID

  console.log(`Attempting to delete item ${itemId} for user ${uid}`);

  const itemRef = admin.firestore().collection("items").doc(itemId);

  try {
    const doc = await itemRef.get();
    if (!doc.exists) {
      return res.status(404).send({ error: "Item not found" });
    }

    const itemData = doc.data();

    // Security Check: Make sure the user owns this item
    if (itemData.owner !== uid) {
      return res.status(403).send({ error: "Permission denied: You do not own this item." });
    }

    // 1. Delete the image from Firebase Storage
    if (itemData.imageUrl) {
      try {
        // Extract the file path from the URL
        const filePath = decodeURIComponent(itemData.imageUrl.split("/o/")[1].split("?")[0]);
        await admin.storage().bucket().file(filePath).delete();
        console.log(`Successfully deleted image at ${filePath}`);
      } catch (storageError) {
        // Log the error but continue, as we still want to delete the database entry
        console.error(`Failed to delete image for item ${itemId}, but proceeding with Firestore deletion.`, storageError);
      }
    }

    // 2. Delete the document from Firestore
    await itemRef.delete();
    console.log(`Successfully deleted item document ${itemId}`);

    res.status(200).send({ success: true, message: "Item deleted successfully." });
  } catch (error) {
    console.error(`Error deleting item ${itemId}:`, error);
    res.status(500).send({ error: "Failed to delete item." });
  }
});

// Endpoint 4: Edit an Item's Details
app.put("/api/items/:itemId", verifyToken, async (req, res) => {
  const { itemId } = req.params;
  const { uid } = req.user;
  const { name, description, category } = req.body;

  if (!name || !category) {
    return res.status(400).send({ error: "Item name and category are required." });
  }

  console.log(`Attempting to update item ${itemId} for user ${uid}`);
  const itemRef = admin.firestore().collection("items").doc(itemId);

  try {
    const doc = await itemRef.get();
    if (!doc.exists) {
      return res.status(404).send({ error: "Item not found" });
    }

    // Security Check: Ensure the user owns this item
    if (doc.data().owner !== uid) {
      return res.status(403).send({ error: "Permission denied." });
    }

    // Update the document in Firestore with the new data
    await itemRef.update({
      name,
      description,
      category,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Successfully updated item ${itemId}`);
    res.status(200).send({ success: true, message: "Item updated." });
  } catch (error) {
    console.error(`Error updating item ${itemId}:`, error);
    res.status(500).send({ error: "Failed to update item." });
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
}); 