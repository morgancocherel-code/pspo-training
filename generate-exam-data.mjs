import { readFileSync, writeFileSync } from "node:fs";

// Les scripts classiques permettent de lire les examens depuis file://, sans fetch.
// Après une modification des JSON : node generate-exam-data.mjs
const sources = [
  { number: 1, id: "exam-1" },
  { number: 2, id: "exam-2" },
  { number: 3, id: "exam-3" },
  { number: 4, id: "exam-photo" },
];

const exams = {};

for (const { number, id } of sources) {
  const filename = `Exam_${number}.json`;
  const data = JSON.parse(readFileSync(new URL(filename, import.meta.url), "utf8"));
  if (data.schemaVersion !== 1 || !Array.isArray(data.exams)) {
    throw new Error(`${filename} : format d'examen non reconnu.`);
  }

  const matches = data.exams.filter((exam) => exam.id === id);
  if (matches.length !== 1) {
    throw new Error(`${filename} : un seul examen avec l'identifiant ${id} est attendu.`);
  }

  const exam = matches[0];
  if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
    throw new Error(`${filename} : aucune question disponible.`);
  }

  const questionIds = new Set();
  for (const question of exam.questions) {
    const context = `${filename}, question ${question.number}`;
    if (
      typeof question.id !== "string" ||
      !question.id.trim() ||
      questionIds.has(question.id) ||
      typeof question.question !== "string" ||
      !question.question.trim() ||
      !Array.isArray(question.options) ||
      question.options.length < 2
    ) {
      throw new Error(`${context} : question invalide ou identifiant dupliqué.`);
    }
    questionIds.add(question.id);

    const optionIds = new Set();
    for (const option of question.options) {
      if (
        typeof option.id !== "string" ||
        !option.id.trim() ||
        optionIds.has(option.id) ||
        typeof option.text !== "string" ||
        !option.text.trim()
      ) {
        throw new Error(`${context} : proposition invalide ou identifiant dupliqué.`);
      }
      optionIds.add(option.id);
    }

    const answers = question.correctAnswers;
    if (
      !Array.isArray(answers) ||
      answers.length === 0 ||
      new Set(answers).size !== answers.length ||
      !answers.every((answer) => optionIds.has(answer))
    ) {
      throw new Error(`${context} : corrigé manquant ou invalide.`);
    }

    const count = question.requiredAnswerCount;
    if (
      !["single", "multiple"].includes(question.selectionMode) ||
      (count !== null && (!Number.isInteger(count) || count < 1 || count > optionIds.size)) ||
      (count !== null && count !== answers.length) ||
      (question.selectionMode === "single" && (count !== 1 || answers.length !== 1))
    ) {
      throw new Error(`${context} : consigne de sélection incohérente.`);
    }
  }

  exams[number] = { ...exam, title: `Examen blanc ${number}` };
}

writeFileSync(
  new URL("exam-data.js", import.meta.url),
  "// Généré depuis les JSON : node generate-exam-data.mjs\n" +
    `const PSPO_EXAMS = ${JSON.stringify(exams, null, 2)};\n`,
  "utf8",
);
console.log(
  `Données générées : ${Object.values(exams).map((exam) => `${exam.title} (${exam.questions.length} questions)`).join(", ")}.`,
);
