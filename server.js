import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    message: "Server QuizMind merge"
  });
});

app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server pornit pe portul ${PORT}`);
});
