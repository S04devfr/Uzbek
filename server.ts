import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Initialize Gemini client with telemetry header
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // TTS Endpoint
  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voiceName, style, speed } = req.body;
      
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY muhit o'zgaruvchisi topilmadi. Iltimos, AI Studio sozlamalari (Secrets bo'limi) orqali ushbu kalitni kiriting." 
        });
      }

      if (!text || text.trim() === "") {
        return res.status(400).json({ error: "Sintez qilish uchun matn kiritish lozim." });
      }

      if (text.length > 1200) {
        return res.status(400).json({ error: "Matn uzunligi ko'pi bilan 1200 belgi bo'lishi mumkin." });
      }

      // Map Uzbek voices to Gemini prebuilt voices
      let resolvedSystemVoice = "Zephyr";
      const voiceLower = (voiceName || "").toLowerCase();
      if (voiceLower.includes("dilnoza") || voiceLower.includes("zephyr")) {
        resolvedSystemVoice = "Zephyr";
      } else if (voiceLower.includes("madina") || voiceLower.includes("kore")) {
        resolvedSystemVoice = "Kore";
      } else if (voiceLower.includes("sardor") || voiceLower.includes("puck")) {
        resolvedSystemVoice = "Puck";
      } else if (voiceLower.includes("jasur") || voiceLower.includes("charon")) {
        resolvedSystemVoice = "Charon";
      } else if (voiceLower.includes("farrux") || voiceLower.includes("fenrir")) {
        resolvedSystemVoice = "Fenrir";
      }

      // Map style values to description prompts
      let styleInstructions = "";
      switch (style) {
        case "cheerful":
        case "Xushchaqchaq":
          styleInstructions = "Say cheerfully and warm";
          break;
        case "calm":
        case "Sokin va muloyim":
          styleInstructions = "Say in a calm, gentle, and soft narrator voice";
          break;
        case "serious":
        case "Jiddiy / Rasmiy":
          styleInstructions = "Say in a serious, clear, and formal public speaker tone";
          break;
        case "dramatic":
        case "Hayajonli / Dramatik":
          styleInstructions = "Say with excitement and dramatic emphasis";
          break;
        case "natural":
        case "Tabiiy / Oddiy":
        default:
          styleInstructions = "Say naturally and clearly";
          break;
      }

      const userConfiguredPromptWithEmotion = `${styleInstructions}: ${text}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: userConfiguredPromptWithEmotion }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: resolvedSystemVoice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(500).json({ error: "Gemini TTS ovoz sintez qilmadi. Iltimos qayta urinib ko'ring." });
      }

      res.json({
        audio: base64Audio,
        metadata: {
          voiceName: voiceName || "Dilnoza",
          systemVoice: resolvedSystemVoice,
          style: style || "Tabiiy / Oddiy",
          speed: speed || 1.0,
          length: text.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error("TTS API Xatolik:", error);
      res.status(500).json({ error: error.message || "TTS sintezi davomida xatolik yuz berdi." });
    }
  });

  // Orthography Enhancer Endpoint
  app.post("/api/enhance-text", async (req, res) => {
    try {
      const { text } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY muhit o'zgaruvchisi topilmadi. Iltimos, AI Studio sozlamalari (Secrets bo'limi) orqali ushbu kalitni kiriting." 
        });
      }

      if (!text || text.trim() === "") {
        return res.status(400).json({ error: "Tahrirlash uchun matn kiritilishi lozim." });
      }

      const prompt = `Siz o'zbek tili tahrirchisiz. Berilgan o'zbekcha matnni imlo va tinish belgilari bo'yicha to'g'rilang.
Ayniqsa, o'zbek alifbosidagi o' (o‘, o') va g' (g‘, g') harflarining to'g'ri apostroflar bilan yozilishiga, tutuq belgilariga hamda grammatik qo'shimchalarga katta e'tibor bering.

Qoidalar:
1. Faqat va faqat to'g'rilangan matnni qaytaring.
2. Hech qanday izoh, tushuntirish, sarlavha yoki boshqa qo'shimcha so'z yozmang.
3. Matnni hech qanday bloklarga (masalan markdown \`\`\`) o'ramang, faqat toza matnni o'zini qaytaring.

Tahrirlanadigan matn:
${text}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      const correctedText = response.text ? response.text.trim() : text;
      res.json({ correctedText });
    } catch (error: any) {
      console.error("Enhance Text API Xatolik:", error);
      res.status(500).json({ error: error.message || "Matnni tahrirlash davomida xatolik yuz berdi." });
    }
  });

  // Vite development vs production serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Server start error:", err);
});
