import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🔁 Retry Utility
async function generateWithRetry(model, prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      if (err.message.includes("503")) {
        console.log(`Retry ${i + 1}: Model overloaded. Retrying...`);
        await new Promise(res => setTimeout(res, 2000)); // wait 2 sec
      } else {
        throw err;
      }
    }
  }
  throw new Error("All retries failed");
}

app.post("/generate-tests", async (req, res) => {
  try {
    const { requirement } = req.body;

    if (!requirement) {
      return res.status(400).json({ error: "Requirement is required" });
    }

    // 🎯 Primary Model
    const flashModel = genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    // 🧠 Backup Model
    const backupModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite"
    });

    const prompt = `
You are a QA expert.

Generate:
1. Test cases
2. Edge cases
3. Negative scenarios

Format strictly in table.

Requirement: ${requirement}
`;

    let output;

    try {
      // 🔥 Try primary model with retry
      output = await generateWithRetry(flashModel, prompt);
    } catch (err) {
      console.log("Switching to backup model...");
      // 🔁 Fallback if flash fails
      output = await generateWithRetry(backupModel, prompt);
    }

    res.json({ result: output });

  } catch (error) {
    console.error("Error:", error.message);

    res.status(500).json({
      error: "AI service is temporarily busy. Please try again later."
    });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
