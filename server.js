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

Reguli importante:
- generează exact 5 întrebări
- fiecare întrebare trebuie să aibă exact 4 variante
- răspunsul corect trebuie să fie doar una dintre literele: "A", "B", "C", "D"
- întrebările trebuie să fie clare, naturale și fără ambiguitate
- variantele greșite trebuie să fie plauzibile, nu absurde
- evită să repeți aceeași idee în mai multe întrebări
- amestecă întrebări de definiție cu întrebări de aplicare și înțelegere
- explicațiile trebuie să fie scurte, clare și utile
- nu adăuga text în afara JSON-ului
- nu folosi markdown
- nu folosi blocuri de cod
`
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.7
    });

    const raw = completion.choices?.[0]?.message?.content;

    if (!raw) {
      return res.status(500).json({ error: "AI-ul nu a returnat conținut." });
    }

    let result;

    try {
      result = JSON.parse(raw);
    } catch (parseError) {
      console.error("JSON invalid de la OpenAI:", raw);
      return res.status(500).json({ error: "AI-ul nu a returnat JSON valid." });
    }

    if (!result || !Array.isArray(result.intrebari) || result.intrebari.length === 0) {
      return res.status(500).json({ error: "Format quiz invalid." });
    }

    const cleaned = {
      titlu: typeof result.titlu === "string" && result.titlu.trim()
        ? result.titlu.trim()
        : "Quiz generat",
      intrebari: result.intrebari.slice(0, 5).map((q, index) => {
        const variante = Array.isArray(q.variante) ? q.variante.slice(0, 4) : [];
        const corect = ["A", "B", "C", "D"].includes(String(q.corect).toUpperCase())
          ? String(q.corect).toUpperCase()
          : "A";

        while (variante.length < 4) {
          variante.push(`Variantă ${String.fromCharCode(65 + variante.length)}`);
        }

        return {
          intrebare: typeof q.intrebare === "string" && q.intrebare.trim()
            ? q.intrebare.trim()
            : `Întrebarea ${index + 1}`,
          variante,
          corect,
          explicatie: typeof q.explicatie === "string" && q.explicatie.trim()
            ? q.explicatie.trim()
            : "Aceasta este varianta corectă pe baza cerinței."
        };
      })
    };

    res.json(cleaned);

  } catch (error) {
    console.error("Eroare server:", error);
    res.status(500).json({ error: "Eroare la generare quiz" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server pornit pe portul ${PORT}`);
});
