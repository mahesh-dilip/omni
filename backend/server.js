const express = require("express");
const cors = require("cors");
require("dotenv").config(); // Load environment variables from .env file

const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  stripCodeFences,
  storagePathFromUrl,
  buildAttributesString,
  validateValueRequest,
  validateEditRequest,
} = require("./lib/valuation");

// --- INITIALIZATION ---
const app = express();
const port = process.env.PORT || 3001;

// Initialize Firebase Admin SDK
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

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
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    console.error("Error verifying token:", error);
    return res.status(403).send({ error: "Unauthorized: Invalid token" });
  }
};

// --- API ENDPOINTS ---

// --- NEW: Consolidated Smart Extraction Endpoint ---
app.post("/api/extract-details", verifyToken, async (req, res) => {
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64 || !mimeType) {
    return res.status(400).send({ error: "Missing image data." });
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const imagePart = { inline_data: { data: imageBase64, mime_type: mimeType } };

    // --- The New, Smarter Prompt ---
    const prompt = `
      You are a multi-talented expert at analyzing images. Your goal is to identify an object, determine its key valuation attributes, and extract any of those attribute values if they are visible in the image.

      Analyze the provided image and perform these tasks in order:
      1.  **Identify**: Provide a concise name and a brief physical description for the primary object.
      2.  **Categorize**: Choose the single best category from this list: ["Electronics", "Tools & Hardware", "Clothing & Accessories", "Books & Media", "Collectibles & Art", "Kitchen & Home", "Sports & Outdoors", "Musical Instruments", "Health & Beauty", "Toys & Games", "Other"].
      3.  **Determine Attributes**: Based on the identified category, decide the 3-5 most important attributes for valuation. Always include "Condition". For "Condition", the options must be ["New", "Like New", "Good", "Fair", "Poor"].
      4.  **Extract Values**: Look closely at the image for any text, logos, or details. Try to fill in the values for the attributes you just determined. If you cannot find a value, leave it as an empty string "". For "Condition", make a reasonable guess based on visual wear and tear.

      Provide your response ONLY as a valid JSON object with the following structure:
      {
        "name": "string",
        "description": "string",
        "category": "string",
        "attributes": [
          { "name": "attribute_name", "label": "Attribute Label", "type": "select" or "text", "options": ["..."], "value": "The value you extracted or guessed, or an empty string" }
        ]
      }

      Example for an image of a MacBook with visible text:
      {
        "name": "MacBook Air 13-inch",
        "description": "A silver Apple laptop computer.",
        "category": "Electronics",
        "attributes": [
          { "name": "condition", "label": "Condition", "type": "select", "options": ["New", "Like New", "Good", "Fair", "Poor"], "value": "Good" },
          { "name": "year", "label": "Year", "type": "text", "value": "2020" },
          { "name": "storage", "label": "Storage (GB)", "type": "text", "value": "" }
        ]
      }
    `;
    
    console.log("Sending smart extraction request to Gemini...");
    const result = await model.generateContent([prompt, imagePart]);
    const responseText = stripCodeFences(result.response.text());
    console.log("Received smart extraction from Gemini.");
    
    res.status(200).json(JSON.parse(responseText));

  } catch (error) {
    console.error("Error in /api/extract-details:", error);
    res.status(500).send({ error: "Failed to process image." });
  }
});

// Endpoint 2: Value Item (using gemini-2.0-flash with search)
app.post("/api/value", verifyToken, async (req, res) => {
  const { itemId, name, description, category } = req.body;
  const valueCheck = validateValueRequest(req.body);
  if (!valueCheck.valid) {
    return res.status(400).send({ error: valueCheck.error });
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
    const responseText = stripCodeFences(result.response.text());
    console.log(`Received valuation for ${itemId}.`);
    
    const analysisData = JSON.parse(responseText);

    // Create a batch write to update both the main document and add a valuation record
    const batch = admin.firestore().batch();
    
    // Update the main item document
    batch.update(itemRef, {
      ...analysisData,
      status: "analyzed",
      lastValuationDate: admin.firestore.FieldValue.serverTimestamp()
    });

    // Add a new valuation record to the subcollection
    const valuationRef = itemRef.collection("valuations").doc();
    batch.set(valuationRef, {
      value: analysisData.estimated_value,
      date: admin.firestore.FieldValue.serverTimestamp(),
      reasoning: analysisData.reasoning
    });

    // Commit the batch
    await batch.commit();
    console.log(`Successfully updated item ${itemId} and added valuation record.`);

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
        const filePath = storagePathFromUrl(itemData.imageUrl);
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
  const { name, description, category, attributes } = req.body;

  const editCheck = validateEditRequest(req.body);
  if (!editCheck.valid) {
    return res.status(400).send({ error: editCheck.error });
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
      attributes,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Successfully updated item ${itemId} with new attributes`);
    res.status(200).send({ success: true, message: "Item updated." });
  } catch (error) {
    console.error(`Error updating item ${itemId}:`, error);
    res.status(500).send({ error: "Failed to update item." });
  }
});

// Endpoint for getting dynamic attributes based on category
app.post("/api/get-attributes", verifyToken, async (req, res) => {
  const { category, itemName } = req.body;
  if (!category || !itemName) {
    return res.status(400).send({ error: "Category and item name are required." });
  }

  try {
    // We can use a fast model for this classification/generation task
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `
      You are a product specification expert. For an item named "${itemName}" in the category "${category}", what are the 3-5 most important attributes that determine its resale value?

      Always include "Condition" as one of the attributes.
      For "Condition", the options should always be a select dropdown with these exact values: ["New", "Like New", "Good", "Fair", "Poor"].
      For other attributes like RAM or Storage, use a "text" input. For Year, also use a "text" input. For shoe or clothing sizes, use a "text" input.

      Provide your response ONLY as a valid JSON object with the following structure:
      {
        "attributes": [
          { 
            "name": "attribute_name_for_code", 
            "label": "Human-Friendly Label", 
            "type": "select" or "text", 
            "options": ["option1", "option2"] (only include this for the 'select' type) 
          }
        ]
      }

      Example for a MacBook:
      {
        "attributes": [
          { "name": "condition", "label": "Condition", "type": "select", "options": ["New", "Like New", "Good", "Fair", "Poor"] },
          { "name": "ram", "label": "RAM (GB)", "type": "text" },
          { "name": "storage", "label": "Storage (GB)", "type": "text" },
          { "name": "year", "label": "Year", "type": "text" }
        ]
      }
    `;

    console.log(`Getting attributes for: ${itemName}`);
    const result = await model.generateContent(prompt);
    const responseText = stripCodeFences(result.response.text());
    console.log("Received attributes from Gemini.");
    
    res.status(200).json(JSON.parse(responseText));

  } catch (error) {
    console.error("Error in /api/get-attributes:", error);
    // As a fallback, just ask for the condition if the AI fails
    res.status(500).json({ 
        attributes: [
            { name: "condition", label: "Condition", type: "select", options: ["New", "Like New", "Good", "Fair", "Poor"] }
        ] 
    });
  }
});

// Endpoint 5: Re-evaluate an Item
app.post("/api/items/:itemId/re-evaluate", verifyToken, async (req, res) => {
  const { itemId } = req.params;
  const { uid } = req.user;

  console.log(`Attempting to re-evaluate item ${itemId} for user ${uid}`);
  const itemRef = admin.firestore().collection("items").doc(itemId);

  try {
    const doc = await itemRef.get();
    if (!doc.exists) {
      return res.status(404).send({ error: "Item not found" });
    }

    const itemData = doc.data();

    // Security Check: Ensure the user owns this item
    if (itemData.owner !== uid) {
      return res.status(403).send({ error: "Permission denied." });
    }

    // Update status to show re-evaluation has started
    await itemRef.update({ 
      status: `re_valuation_started_${Date.now()}`,
      lastRevaluationDate: admin.firestore.FieldValue.serverTimestamp()
    });

    // Use the same valuation logic as the initial valuation
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      tools: [{ "google_search": {} }],
    });

    const prompt = `
      You are an expert asset appraiser. Your task is to determine the trackability and value of an item based on its user-confirmed details.
      Item Name: "${itemData.name}"
      Item Description: "${itemData.description || ''}"
      Item Category: "${itemData.category}"
      Your tasks:
      1. **Identify if Trackable**: Based on the info, decide if this item's value is worth tracking.
      2. **Valuation**: If the item IS trackable, use your Google Search tool to find its current estimated market value. If it is NOT trackable, set the value to 0.
      Provide your response ONLY as a valid JSON object with the structure: {"is_trackable": boolean, "estimated_value": number, "currency": "USD", "reasoning": "A brief explanation for your valuation."}`;

    console.log(`Sending re-evaluation request for ${itemId}...`);
    const result = await model.generateContent(prompt);
    const responseText = stripCodeFences(result.response.text());
    console.log(`Received re-evaluation for ${itemId}.`);

    const analysisData = JSON.parse(responseText);

    // Create a batch write to update both the main document and add a valuation record
    const batch = admin.firestore().batch();

    // Update the main item document
    batch.update(itemRef, {
      ...analysisData,
      status: "analyzed",
      lastValuationDate: admin.firestore.FieldValue.serverTimestamp()
    });

    // Add a new valuation record to the subcollection
    const valuationRef = itemRef.collection("valuations").doc();
    batch.set(valuationRef, {
      value: analysisData.estimated_value,
      date: admin.firestore.FieldValue.serverTimestamp(),
      reasoning: analysisData.reasoning
    });

    // Commit the batch
    await batch.commit();
    console.log(`Successfully re-evaluated item ${itemId} and added valuation record.`);

    res.status(200).send({ success: true, message: "Re-evaluation complete." });
  } catch (error) {
    console.error(`Error in re-evaluation for item ${itemId}:`, error);
    await itemRef.update({ status: "error" });
    res.status(500).send({ error: "Failed to re-evaluate item." });
  }
});

// --- Firestore Listener for Re-evaluation ---
function setupReevaluationListener() {
  console.log("Setting up listener for re-evaluation requests...");
  const query = db.collection("items").where("status", "==", "needs_re_evaluation");

  query.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added" || change.type === "modified") {
        const itemData = change.doc.data();
        const itemId = change.doc.id;
        console.log(`Re-evaluation request detected for item: ${itemId}`);
        performRevaluation(change.doc.ref, itemData, itemId);
      }
    });
  }, err => console.error("Listener error:", err));
}

// This helper function contains the AI logic and is only called by the server
async function performRevaluation(itemRef, itemData, itemId) {
  try {
    await itemRef.update({ status: `re_valuation_started_${Date.now()}` });
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash", tools: [{ "google_search": {} }] });

    // --- NEW: Dynamically build the attributes string for the prompt ---
    const attributesString = buildAttributesString(itemData.attributes);

    // --- MODIFIED PROMPT ---
    const prompt = `
      You are an expert asset appraiser. Your task is to determine the value of an item based on its user-confirmed details.
      
      Item Name: "${itemData.name}"
      Description: "${itemData.description}"
      Category: "${itemData.category}"
      
      Specific Attributes:
      ${attributesString}

      Your tasks:
      1. **Identify if Trackable**: Based on all this info, decide if this item's value is worth tracking.
      2. **Valuation**: If the item IS trackable, use your Google Search tool to find its current estimated market value given all the specific details provided. If it is NOT trackable, set the value to 0.
      
      Provide your response ONLY as a valid JSON object with the structure: {"is_trackable": boolean, "estimated_value": number, "currency": "USD", "reasoning": "A brief explanation for your valuation, considering the provided attributes."}
    `;

    // Retry logic...
    let attempts = 0;
    let analysisData;
    while(attempts < 3) {
      try {
        console.log(`Sending re-valuation request for ${itemId} (Attempt ${attempts + 1})`);
        const result = await model.generateContent(prompt);
        analysisData = JSON.parse(stripCodeFences(result.response.text()));
        break;
      } catch (error) {
        attempts++;
        if (attempts >= 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    await itemRef.update({
      estimated_value: analysisData.estimated_value,
      reasoning: analysisData.reasoning,
      lastValuedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "analyzed",
    });

    const historyRef = itemRef.collection("valuations").doc();
    await historyRef.set({
      value: analysisData.estimated_value,
      date: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Re-evaluation complete for ${itemId}`);

  } catch (error) {
    console.error(`Failed to re-evaluate item ${itemId}:`, error);
    await itemRef.update({ status: "error" });
  }
}

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
  setupReevaluationListener();
}); 