import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();

/* ================= CORS ================= */
app.use(cors({
  origin: [
    "https://grey-pheasant-306609.hostingersite.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ]
}));

app.use(express.json());

/* ================= OPENAI ================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ================= TEST ROUTE ================= */
app.get("/", (req, res) => {
  res.send("Server QuizMind merge 🔥");
});

/* ================= GENERATE QUIZ ================= */
app.post("/generate-quiz", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Lipsește textul." });
    }

    const completion = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
Generează un quiz în română.

Returnează STRICT JSON:

{
  "titlu": "string",
  "intrebari": [
    {
      "intrebare": "string",
      "variante": ["A","B","C","D"],
      "corect": "A",
      "explicatie": "string"
    }
  ]
}

Reguli:
- maxim 5 întrebări
- fără text în afara JSON

Input utilizator:
${text}
`
    });

    const content = completion.output_text;

    let result;

    try {
      result = JSON.parse(content);
    } catch (e) {
      console.error("JSON invalid:", content);
      return res.status(500).json({ error: "JSON invalid de la AI" });
    }

    res.json(result);

  } catch (err) {
    console.error("EROARE:", err);
    res.status(500).json({ error: "Eroare server" });
  }
});

/* ================= PORT ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server pornit pe portul " + PORT);
});
