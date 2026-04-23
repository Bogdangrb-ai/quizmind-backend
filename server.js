import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();

/* ================= CORS ================= */
/* Poți restrânge mai târziu. Acum e mai sigur pentru testare live. */
app.use(cors());
app.use(express.json());

/* ================= OPENAI ================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ================= MEMORIE TEMPORARĂ =================
   Ține minte ultimele întrebări pe subiect/context.
   Nu e permanentă între redeploy-uri, dar e foarte bună pentru MVP.
*/
const recentQuestionsMemory = new Map();
const MAX_MEMORY_PER_TOPIC = 24;

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
  const match = String(text || "").match(regex);
  return match ? match[1].trim() : "";
}

function extractRequestedCount(text) {
  const match = String(text || "").match(/Număr de întrebări:\s*(\d+)/i);
  const num = match ? parseInt(match[1], 10) : 5;
  if (!Number.isFinite(num)) return 5;
  return Math.min(Math.max(num, 1), 10);
}

function buildMemoryKey(userText) {
  const title = extractField(userText, "Titlu quiz");
  const subject = extractField(userText, "Materie / domeniu");
  const level = extractField(userText, "Nivel");
  const mode = extractField(userText, "Mod");
  const focusMatch = String(userText || "").match(/Cerință:\s*([\s\S]*)$/i);
  const focus = focusMatch ? focusMatch[1].trim().slice(0, 220) : "";

  return normalizeString(`${subject} | ${title} | ${level} | ${mode} | ${focus}`);
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

function letterToIndex(letter) {
  const value = String(letter || "").trim().toUpperCase();
  return ["A", "B", "C", "D"].includes(value) ? value : "A";
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
    const corect = letterToIndex(item?.corect);
    const explicatie = String(item?.explicatie || "").trim();

    if (!intrebare) continue;
    if (variante.length !== 4) continue;

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

function buildLevelGuidance(levelRaw) {
  const level = normalizeString(levelRaw);

  if (level.includes("scoala")) {
    return `
Adaptare pentru nivel Școală:
- folosește formulări simple, clare și naturale
- evită jargonul inutil
- prioritizează ideile de bază, noțiunile esențiale și exemplele simple
- întrebările trebuie să fie accesibile și ușor de înțeles
- explicațiile trebuie să fie foarte clare și prietenoase
`;
  }

  if (level.includes("facultate")) {
    return `
Adaptare pentru nivel Facultate:
- întrebările trebuie să ceară înțelegere reală, nu doar memorare
- include diferențe între concepte apropiate
- combină definiția cu aplicarea și interpretarea
- explicațiile trebuie să clarifice de ce răspunsul corect este cel mai bun
`;
  }

  if (level.includes("master")) {
    return `
Adaptare pentru nivel Master:
- pune accent pe analiză, nuanțe și relații între concepte
- evită întrebările banale
- include implicații, comparații și aplicări mai subtile
- explicațiile trebuie să fie concise, dar mai mature conceptual
`;
  }

  if (level.includes("doctorat")) {
    return `
Adaptare pentru nivel Doctorat:
- întrebările trebuie să fie riguroase și precise
- evită complet întrebările triviale
- include distincții fine, interpretare și logică disciplinară
- explicațiile trebuie să fie scurte, dar foarte exacte
`;
  }

  if (level.includes("profesor")) {
    return `
Adaptare pentru Profesor / predare:
- întrebările trebuie să fie utile pedagogic
- acoperă ideile esențiale și confuziile frecvente
- variantele greșite trebuie să testeze dacă elevul chiar a înțeles
- explicațiile trebuie să fie bune pentru predare și recapitulare
`;
  }

  return `
Adaptare pentru nivel General:
- folosește întrebări echilibrate și clare
- evită extremele: nici prea simple, nici prea academice
- combină definiție, înțelegere și aplicare
`;
}

function buildModeGuidance(modeRaw) {
  const mode = normalizeString(modeRaw);

  if (mode.includes("invatare")) {
    return `
Adaptare pentru modul Învățare:
- întrebările trebuie să ajute la înțelegere, nu doar verificare
- formulările pot fi puțin mai explicite
- explicațiile trebuie să fie utile și prietenoase
- include accent pe concepte esențiale și claritate
`;
  }

  if (mode.includes("testare")) {
    return `
Adaptare pentru modul Testare:
- întrebările trebuie să fie mai stricte și mai apropiate de o verificare reală
- evită indicii evidente în formulare
- variantele greșite trebuie să fie credibile
- explicațiile pot fi scurte și directe
`;
  }

  if (mode.includes("duel")) {
    return `
Adaptare pentru modul Duel live:
- întrebările trebuie să fie scurte, rapide și clare
- evită formulările lungi
- răspunsurile trebuie să poată fi citite repede
- accent pe viteză și reacție, fără a sacrifica corectitudinea
`;
  }

  if (mode.includes("flash")) {
    return `
Adaptare pentru modul Flash review:
- întrebările trebuie să fie foarte scurte și concentrate
- accent pe recapitulare rapidă
- formulează întrebări de tip reținere + verificare rapidă
- explicațiile trebuie să fie foarte concise
`;
  }

  return `
Adaptare pentru mod General:
- păstrează echilibru între claritate, verificare și utilitate
`;
}

function buildRecentQuestionsBlock(recentQuestions) {
  if (!recentQuestions.length) {
    return `
Nu există întrebări recente salvate pentru acest subiect.
`;
  }

  return `
Întrebări folosite recent pentru același subiect. Nu le repeta identic și nu le reformula prea apropiat:
${recentQuestions.map((q, i) => `- ${i + 1}. ${q}`).join("\n")}

Este permisă reluarea moderată a unor idei importante, dar formulată diferit și doar dacă ajută la consolidarea învățării.
`;
}

function buildPrompt(userText, recentQuestions, requestedCount) {
  const level = extractField(userText, "Nivel");
  const mode = extractField(userText, "Mod");

  const levelGuidance = buildLevelGuidance(level);
  const modeGuidance = buildModeGuidance(mode);
  const recentBlock = buildRecentQuestionsBlock(recentQuestions);

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
- evită întrebările prea triviale, prea evidente sau prost formulate
- explicațiile trebuie să fie scurte, corecte și utile
- nu repeta aceeași idee în mai multe întrebări din același quiz
- dacă subiectul permite, combină:
  - definiție
  - înțelegere
  - aplicare
- menține dificultatea potrivită cererii utilizatorului
- concentrează-te strict pe materia și cerința utilizatorului

Reguli de calitate:
- evită formulările prea lungi
- evită variante aproape identice între ele
- distribuie răspunsurile corecte variat între A, B, C și D
- dacă subiectul permite, fă quiz-ul să pară util pentru învățare reală, nu random
- nu produce întrebări redundant similare

${levelGuidance}

${modeGuidance}

${recentBlock}

Reguli de output:
- fără markdown
- fără explicații în afara JSON
- fără blocuri de cod
- doar JSON valid

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
