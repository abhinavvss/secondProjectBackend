import express from "express";
import { buildPrompt } from "./promptBuilder.js";
import { validateFilledForm } from "./validator.js";
import util from "util";

const router = express.Router();

router.post("/fill-form", async (req, res) => {
  try {
    const { formArray, text } = req.body;

    if (!Array.isArray(formArray) || !text) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const prompt = buildPrompt(formArray, text);

    const { model } = await import("./gemini.js");
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json"
      }
    });
    console.log(util.inspect({result}, { depth: null, colors: true }));

    const filledForm = JSON.parse(result.response.text());

    validateFilledForm(filledForm);

    res.json({ filledForm });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Form filling failed",
      details: err.message
    });
  }
});

export default router;

