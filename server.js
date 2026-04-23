import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors({
  origin: [
    "https://grey-pheasant-306609.hostingersite.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.options("*", cors());

app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("Server QuizMind merge 🔥");
});

app.post("/generate-quiz", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Lipsește textul." });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
Generează un quiz în limba română în format JSON STRICT.

Structura trebuie să fie EXACT:

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
- maxim 5 întrebări
- întrebări clare, utile
- explicații simple
- fără text în afara JSON
`
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    const result = JSON.parse(completion.choices[0].message.content);

    res.json(result);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Eroare la generare quiz" });
  }
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server pornit pe http://localhost:${PORT}`);
});
