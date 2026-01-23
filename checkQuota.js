// Quick script to check your Gemini API quota status
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function checkQuota() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY not found in .env file");
    return;
  }

  console.log("🔍 Checking Gemini API quota status...\n");

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  // Try a simple request to see current quota status
  const modelsToTest = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.0-flash-exp"
  ];

  for (const modelName of modelsToTest) {
    try {
      console.log(`Testing ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("Hello");
      console.log(`✅ ${modelName}: Available\n`);
    } catch (error) {
      if (error.status === 429) {
        console.log(`⚠️  ${modelName}: QUOTA EXCEEDED`);
        if (error.errorDetails) {
          const retryInfo = error.errorDetails.find(
            d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
          );
          if (retryInfo?.retryDelay) {
            console.log(`   Retry after: ${retryInfo.retryDelay}\n`);
          }
        }
      } else if (error.status === 404) {
        console.log(`❌ ${modelName}: Not available (404)\n`);
      } else {
        console.log(`❌ ${modelName}: Error - ${error.message}\n`);
      }
    }
  }

  console.log("\n📊 To see detailed quota info:");
  console.log("1. Visit: https://aistudio.google.com/app/apikey");
  console.log("2. Or: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas");
}

checkQuota().catch(console.error);

