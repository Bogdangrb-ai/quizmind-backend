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

/* ================= MEMORIE TEMPORARĂ ================= */

const recentQuestionsMemory = new Map();
const MAX_MEMORY_PER_TOPIC = 20;

/* ================= HELPERS ================= */

function normalizeString(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractField(text, label) {
  const regex = new RegExp(`${label}:\\s*(.+)`, "i");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

function extractRequestedCount(text) {
  const match = text.match(/Număr de întrebări:\s*(\d+)/i);
  const num = match ? parseInt(match[1], 10) : 5;
  return Number.isFinite(num) ? Math.min(Math.max(num, 1), 10) : 5;
}

function buildMemoryKey(userText) {
  const title = extractField(userText, "Titlu quiz");
  const subject = extractField(userText, "Materie / domeniu");
  const level = extractField(userText, "Nivel");
  const focusMatch = userText.match(/Cerință:\s*([\s\S]*)$/i);
  const focus = focusMatch ? focusMatch[1].trim().slice(0, 180) : "";

  return normalizeString(`${subject} | ${title} | ${level} | ${focus}`);
}

function getRecentQuestionsForKey(key) {
  return recentQuestionsMemory.get(key) || [];
}

function saveRecentQuestionsForKey(key, questions) {
  const existing = recentQuestionsMemory.get(key) || [];
  const merged = [...questions, ...existing];

  const seen = new Set();
  const unique = [];

  for (const q of merged) {
    const normalized = normalizeString(q);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(q);
  }

  recentQuestionsMemory.set(key, unique.slice(0, MAX_MEMORY_PER_TOPIC));
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function validateAndCleanQuiz(data, requestedCount = 5) {
  if (!data || typeof data !== "object") return null;
  if (!Array.isArray(data.intrebari)) return null;

  const usedQuestionSet = new Set();
  const cleanedQuestions = [];

  for (const item of data.intrebari) {
    const intrebare = String(item?.intrebare || "").trim();
    const variante = Array.isArray(item?.variante)
      ? item.variante.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    let corect = String(item?.corect || "").trim().toUpperCase();
    const explicatie = String(item?.explicatie || "").trim();

    if (!intrebare) continue;
    if (variante.length !== 4) continue;
    if (!["A", "B", "C", "D"].includes(corect)) continue;

    const normalizedQuestion = normalizeString(intrebare);
    if (usedQuestionSet.has(normalizedQuestion)) continue;
    usedQuestionSet.add(normalizedQuestion);

    cleanedQuestions.push({
      intrebare,
      variante,
      corect,
      explicatie: explicatie || "Aceasta este varianta corectă."
    });
  }

  if (cleanedQuestions.length === 0) return null;

  return {
    titlu: String(data.titlu || "Quiz generat").trim() || "Quiz generat",
    intrebari: cleanedQuestions.slice(0, requestedCount)
  };
}

function buildPrompt(userText, recentQuestions, requestedCount) {
  const recentBlock = recentQuestions.length
    ? `
Întrebări folosite recent pentru același subiect. Nu le repeta identic și nu le reformula prea apropiat:
${recentQuestions.map((q, i) => `- ${i + 1}. ${q}`).join("\n")}

Este permisă reluarea moderată a unor idei importante, dar formulată diferit și doar dacă ajută la consolidarea învățării.
`
    : `
Nu există întrebări anterioare salvate pentru acest subiect.
`;

  return `
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

Reguli OBLIGATORII:
- generează exact ${requestedCount} întrebări
- fiecare întrebare trebuie să aibă exact 4 variante
- o singură variantă corectă
- "corect" trebuie să fie doar A, B, C sau D
- întrebările trebuie să fie corecte factual
- întrebările trebuie să fie clare, naturale și fără ambiguitate
- variantele greșite trebuie să fie plauzibile, nu absurde
- evită întrebările prea triviale și prea evidente
- explică pe scurt de ce răspunsul corect este corect
- nu repeta aceeași idee în mai multe întrebări din același quiz
- dacă subiectul permite, combină:
  - întrebări de definiție
  - întrebări de înțelegere
  - întrebări de aplicare
- menține dificultatea potrivită cererii utilizatorului
- dacă utilizatorul cere ceva foarte specific, respectă acea cerință

Reguli de calitate:
- evită formulările prea lungi
- evită variante aproape identice între ele
- evită răspunsuri-capcană prost formulate
- distribuie răspunsurile corecte variat între A, B, C și D
- nu pune toate întrebările pe același tipar

Reguli de output:
- fără markdown
- fără explicații în afara JSON
- fără blocuri de cod
- doar JSON valid

${recentBlock}

Cererea utilizatorului:
${userText}
`;
}

/* ================= ROUTE TEST ================= */

app.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    message: "Server QuizMind merge"
  });
});

app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

/* ================= GENERARE QUIZ ================= */

app.post("/generate-quiz", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "Lipsește textul." });
    }

    const userText = String(text).trim();
    const requestedCount = extractRequestedCount(userText);
    const memoryKey = buildMemoryKey(userText);
    const recentQuestions = getRecentQuestionsForKey(memoryKey);

    const completion = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: buildPrompt(userText, recentQuestions, requestedCount)
    });

    const content = completion.output_text;
    const parsed = safeParseJSON(content);

    if (!parsed) {
      console.error("JSON invalid de la AI:", content);
      return res.status(500).json({ error: "JSON invalid de la AI" });
    }

    const cleaned = validateAndCleanQuiz(parsed, requestedCount);

    if (!cleaned) {
      console.error("Quiz invalid după validare:", parsed);
      return res.status(500).json({ error: "Quiz invalid de la AI" });
    }

    saveRecentQuestionsForKey(
      memoryKey,
      cleaned.intrebari.map((q) => q.intrebare)
    );

    return res.status(200).json(cleaned);
  } catch (error) {
    console.error("EROARE SERVER:", error);
    return res.status(500).json({ error: "Eroare la generare quiz" });
  }
});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server pornit pe portul ${PORT}`);
});
