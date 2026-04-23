import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    message: "Server QuizMind merge"
  });
});

app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

app.post("/generate-quiz", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Lipsește textul." });
    }

    const completion = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
Generează un quiz în limba română și returnează STRICT JSON valid.

Structura exactă:
{
  "titlu": "string",
  "intrebari": [
    {
      "intrebare": "string",
      "variante": ["A", "B", "C", "D"],
      "corect": "A",
      "explicatie": "string"
    }
  ]
}

Reguli:
- exact 5 întrebări
- exact 4 variante la fiecare
- "corect" trebuie să fie doar A, B, C sau D
- fără markdown
- fără text în afara JSON

Cererea utilizatorului:
${text}
`
    });

    const content = completion.output_text;

    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      console.error("JSON invalid de la AI:", content);
      return res.status(500).json({ error: "JSON invalid de la AI" });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("EROARE SERVER:", error);
    return res.status(500).json({ error: "Eroare la generare quiz" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server pornit pe portul ${PORT}`);
});
