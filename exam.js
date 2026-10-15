"use strict";

(() => {
  const examNumber = new URLSearchParams(location.search).get("exam");
  const errorPanel = document.getElementById("exam-error");
  const errorMessage = document.getElementById("error-message");

  function showError(message) {
    errorMessage.textContent = message;
    errorPanel.hidden = false;
    console.error(message);
  }

  if (!["1", "2", "3", "4"].includes(examNumber)) {
    showError("Aucun examen valide n'a été sélectionné. Retournez à l'accueil pour choisir l'un des quatre examens.");
    return;
  }

  if (typeof PSPO_EXAMS === "undefined" || !PSPO_EXAMS[examNumber]) {
    showError("Les données de cet examen sont indisponibles. Régénérez exam-data.js avec la commande : node generate-exam-data.mjs");
    return;
  }

  const exam = PSPO_EXAMS[examNumber];
  const quiz = document.getElementById("quiz");
  const form = document.getElementById("answer-form");
  const questionTitle = document.getElementById("question-title");
  const questionSource = document.getElementById("question-source");
  const optionsFieldset = document.getElementById("answer-options");
  const instructions = document.getElementById("answer-instructions");
  const answerError = document.getElementById("answer-error");
  const validateButton = document.getElementById("validate-answer");
  const nextButton = document.getElementById("next-question");
  const feedback = document.getElementById("answer-feedback");
  const feedbackTitle = document.getElementById("feedback-title");
  const feedbackDescription = document.getElementById("feedback-description");
  const correctOptions = document.getElementById("correct-options");
  const progress = document.getElementById("exam-progress");
  const progressText = document.getElementById("question-progress");
  const liveScore = document.getElementById("live-score");
  const results = document.getElementById("exam-results");
  const timer = document.getElementById("exam-timer");
  const timerPill = document.getElementById("timer-pill");
  const timerLabel = document.getElementById("timer-label");
  const timerNotice = document.getElementById("timer-notice");
  const durationMinutes = examNumber === "3" ? 30 : 60;
  const deadline = Date.now() + durationMinutes * 60_000;
  let timerInterval = null;
  let questionIndex = 0;
  let score = 0;
  let validatedCount = 0;
  let validated = false;

  document.title = `${exam.title} — PSPO Practice`;
  document.getElementById("exam-title").textContent = exam.title;
  progress.max = exam.questions.length;
  errorPanel.hidden = true;
  quiz.hidden = false;

  function stopTimer() {
    clearInterval(timerInterval);
    document.removeEventListener("visibilitychange", updateTimer);
  }

  function updateTimer() {
    // Une échéance réelle évite de ralentir le chrono dans un onglet en arrière-plan.
    const secondsRemaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;
    timer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    if (secondsRemaining === 0) {
      timerLabel.textContent = "Temps écoulé";
      timerPill.classList.add("timer-expired");
      timerNotice.hidden = false;
      stopTimer();
    }
  }

  function selectedAnswers() {
    return Array.from(optionsFieldset.querySelectorAll("input:checked"), (input) => input.value);
  }

  function updateProgress() {
    progress.value = validatedCount;
    progressText.textContent = `Question ${questionIndex + 1} sur ${exam.questions.length}`;
    liveScore.textContent = `${score} / ${validatedCount} bonne${score === 1 ? "" : "s"} réponse${score === 1 ? "" : "s"}`;
  }

  function renderQuestion(focusHeading) {
    const question = exam.questions[questionIndex];
    validated = false;
    validateButton.disabled = true;
    validateButton.hidden = false;
    nextButton.hidden = true;
    feedback.hidden = true;
    answerError.hidden = true;
    correctOptions.replaceChildren();
    optionsFieldset.querySelectorAll(".answer-option").forEach((option) => option.remove());
    questionSource.textContent = `Question source n° ${question.number}`;
    questionTitle.textContent = question.question;
    if (question.selectionMode === "single") {
      instructions.textContent = "Sélectionnez une seule réponse.";
    } else if (question.requiredAnswerCount !== null) {
      instructions.textContent = `Sélectionnez ${question.requiredAnswerCount} réponses. Toutes les bonnes réponses sont nécessaires pour obtenir le point.`;
    } else {
      instructions.textContent = "Sélectionnez toutes les réponses qui conviennent. Aucune réponse incorrecte ne doit être cochée.";
    }

    for (const option of question.options) {
      const label = document.createElement("label");
      label.className = "answer-option";
      const input = document.createElement("input");
      input.type = question.selectionMode === "single" ? "radio" : "checkbox";
      input.name = "answer";
      input.value = option.id;
      const letter = document.createElement("span");
      letter.className = "option-letter";
      letter.textContent = option.id;
      const text = document.createElement("span");
      text.className = "option-text";
      text.textContent = option.text;
      label.append(input, letter, text);
      optionsFieldset.append(label);
    }

    nextButton.textContent = questionIndex === exam.questions.length - 1
      ? "Voir mon résultat →"
      : "Question suivante →";
    updateProgress();
    if (focusHeading) {
      questionTitle.focus();
    }
  }

  form.addEventListener("change", () => {
    validateButton.disabled = validated || selectedAnswers().length === 0;
    answerError.hidden = true;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (validated) {
      return;
    }

    const selected = selectedAnswers();
    if (selected.length === 0) {
      answerError.textContent = "Sélectionnez au moins une réponse avant de valider.";
      answerError.hidden = false;
      return;
    }

    const question = exam.questions[questionIndex];
    const correct = question.correctAnswers;
    const isCorrect = selected.length === correct.length && selected.every((answer) => correct.includes(answer));
    validated = true;
    validatedCount += 1;
    if (isCorrect) {
      score += 1;
    }

    for (const input of optionsFieldset.querySelectorAll("input")) {
      input.disabled = true;
      const label = input.closest(".answer-option");
      const isCorrectOption = correct.includes(input.value);
      if (isCorrectOption || input.checked) {
        label.classList.add(isCorrectOption ? "option-correct" : "option-incorrect");
        const status = document.createElement("span");
        status.className = "option-status";
        status.textContent = isCorrectOption ? "Bonne réponse" : "Votre réponse · incorrecte";
        label.append(status);
      }
    }

    for (const option of question.options.filter((option) => correct.includes(option.id))) {
      const item = document.createElement("li");
      item.textContent = `${option.id}. ${option.text}`;
      correctOptions.append(item);
    }

    feedback.className = `answer-feedback ${isCorrect ? "feedback-correct" : "feedback-incorrect"}`;
    feedbackTitle.textContent = isCorrect ? "Bonne réponse !" : "Pas tout à fait.";
    feedbackDescription.textContent = isCorrect
      ? "Vous avez sélectionné exactement les bonnes réponses."
      : `Votre sélection : ${selected.join(", ")}. Réponse${correct.length > 1 ? "s" : ""} attendue${correct.length > 1 ? "s" : ""} : ${correct.join(", ")}.`;
    answerError.hidden = true;
    feedback.hidden = false;
    validateButton.disabled = true;
    validateButton.hidden = true;
    nextButton.hidden = false;
    updateProgress();
    feedbackTitle.focus();
  });

  nextButton.addEventListener("click", () => {
    if (!validated) {
      return;
    }
    if (questionIndex < exam.questions.length - 1) {
      questionIndex += 1;
      renderQuestion(true);
      return;
    }

    stopTimer();
    quiz.hidden = true;
    results.hidden = false;
    const total = exam.questions.length;
    document.getElementById("result-score").textContent = `${score} / ${total}`;
    document.getElementById("result-description").textContent =
      `${Math.round((score / total) * 100)} % de bonnes réponses sur ${exam.title.toLowerCase()}.`;
    document.getElementById("restart-exam").href = `./exam.html?exam=${examNumber}`;
    document.getElementById("results-title").focus();
  });

  renderQuestion(false);
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
  document.addEventListener("visibilitychange", updateTimer);
})();
