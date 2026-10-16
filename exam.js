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
  const previousButton = document.getElementById("previous-question");
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
  const responses = exam.questions.map(() => ({ selected: [], validated: false }));
  const questionsDialog = document.getElementById("questions-dialog");
  const questionsList = document.getElementById("questions-list");
  const openQuestionsButton = document.getElementById("open-questions");
  const favorites = new Set();
  const favoriteButton = document.getElementById("toggle-favorite");
  const allFilter = document.getElementById("filter-all");
  const favoritesFilter = document.getElementById("filter-favorites");
  let favoritesOnly = false;
  let finished = false;

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

  function isCorrectAnswer(question, selected) {
    return selected.length === question.correctAnswers.length &&
      selected.every((answer) => question.correctAnswers.includes(answer));
  }

  function updateSelectionLimit() {
    const question = exam.questions[questionIndex];
    const limitReached = question.selectionMode === "multiple" &&
      question.requiredAnswerCount !== null &&
      selectedAnswers().length >= question.requiredAnswerCount;
    for (const input of optionsFieldset.querySelectorAll("input")) {
      input.disabled = validated || (limitReached && !input.checked);
    }
  }

  function updateProgress() {
    progress.value = validatedCount;
    progressText.textContent = `Question ${questionIndex + 1} sur ${exam.questions.length}`;
    liveScore.textContent = `${score} / ${validatedCount} bonne${score === 1 ? "" : "s"} réponse${score === 1 ? "" : "s"}`;
  }

  function renderQuestion(focusHeading) {
    const question = exam.questions[questionIndex];
    const response = responses[questionIndex];
    updateFavoriteButton();
    validated = response.validated;
    validateButton.disabled = response.selected.length === 0;
    validateButton.hidden = false;
    nextButton.hidden = true;
    previousButton.hidden = questionIndex === 0;
    feedback.hidden = true;
    answerError.hidden = true;
    correctOptions.replaceChildren();
    optionsFieldset.querySelectorAll(".answer-option").forEach((option) => option.remove());
    questionSource.textContent = `Question source n° ${question.number}`;
    questionTitle.textContent = question.question;
    if (question.selectionMode === "single") {
      instructions.textContent = "Sélectionnez une seule réponse.";
    } else if (question.requiredAnswerCount !== null) {
      instructions.textContent = `Sélectionnez ${question.requiredAnswerCount} réponses. Décochez une réponse pour changer votre sélection une fois la limite atteinte. Toutes les bonnes réponses sont nécessaires pour obtenir le point.`;
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
      input.checked = response.selected.includes(option.id);
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
    if (validated) {
      showFeedback();
    }
    updateSelectionLimit();
    updateProgress();
    if (focusHeading) {
      questionTitle.focus();
    }
  }

  form.addEventListener("change", () => {
    if (!validated) {
      responses[questionIndex].selected = selectedAnswers();
    }
    updateSelectionLimit();
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
    const isCorrect = isCorrectAnswer(question, selected);
    validated = true;
    responses[questionIndex] = { selected, validated: true };
    validatedCount += 1;
    if (isCorrect) {
      score += 1;
    }

    showFeedback();
    updateProgress();
    feedbackTitle.focus();
  });

  function showFeedback() {
    const question = exam.questions[questionIndex];
    const selected = responses[questionIndex].selected;
    const correct = question.correctAnswers;
    const isCorrect = isCorrectAnswer(question, selected);

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
  }

  function renderErrorReview() {
    const container = document.getElementById("review-questions");
    container.replaceChildren();
    let errorCount = 0;

    exam.questions.forEach((question, index) => {
      const selected = responses[index].selected;
      const answered = responses[index].validated;
      if (answered && isCorrectAnswer(question, selected)) {
        return;
      }
      errorCount += 1;

      const article = document.createElement("article");
      article.className = "review-question";
      const heading = document.createElement("h3");
      heading.textContent = `Question ${index + 1} · Question source n° ${question.number}`;
      const text = document.createElement("p");
      text.className = "review-question-text";
      text.textContent = question.question;
      article.append(heading, text);
      if (!answered) {
        const notice = document.createElement("p");
        notice.textContent = "Non répondue : cette question n'a pas été validée et compte comme incorrecte.";
        article.append(notice);
      }

      for (const group of [
        { title: "Votre réponse :", answers: selected, className: "review-selected" },
        { title: "La bonne réponse :", answers: question.correctAnswers, className: "review-correct" },
      ]) {
        const section = document.createElement("div");
        section.className = group.className;
        const title = document.createElement("h4");
        title.textContent = group.title;
        const list = document.createElement("ul");
        if (group.answers.length === 0) {
          const item = document.createElement("li");
          item.textContent = "Aucune réponse sélectionnée.";
          list.append(item);
        }
        for (const option of question.options.filter((option) => group.answers.includes(option.id))) {
          const item = document.createElement("li");
          item.textContent = `${option.id}. ${option.text}`;
          list.append(item);
        }
        section.append(title, list);
        article.append(section);
      }
      container.append(article);
    });

    document.getElementById("review-summary").textContent = errorCount === 0
      ? "Aucune erreur : vous avez répondu correctement à toutes les questions !"
      : `${errorCount} question${errorCount > 1 ? "s" : ""} à revoir. Retrouvez votre sélection et le corrigé ci-dessous.`;
  }

  function goToQuestion(index) {
    if (finished) {
      return;
    }
    if (!validated) {
      responses[questionIndex].selected = selectedAnswers();
    }
    questionIndex = index;
    renderQuestion(true);
  }

  function updateFavoriteButton() {
    const favorite = favorites.has(questionIndex);
    favoriteButton.setAttribute("aria-pressed", String(favorite));
    favoriteButton.setAttribute("aria-label", favorite
      ? "Retirer cette question des favoris"
      : "Ajouter cette question aux favoris");
  }

  favoriteButton.addEventListener("click", () => {
    if (favorites.has(questionIndex)) {
      favorites.delete(questionIndex);
    } else {
      favorites.add(questionIndex);
    }
    updateFavoriteButton();
  });

  function renderQuestionList() {
    questionsList.replaceChildren();
    allFilter.setAttribute("aria-pressed", String(!favoritesOnly));
    favoritesFilter.setAttribute("aria-pressed", String(favoritesOnly));
    document.getElementById("favorites-count").textContent = String(favorites.size);
    document.getElementById("favorites-empty").hidden = !favoritesOnly || favorites.size > 0;
    document.getElementById("questions-count").textContent =
      `${validatedCount} / ${exam.questions.length} questions répondues`;
    exam.questions.forEach((question, index) => {
      if (favoritesOnly && !favorites.has(index)) {
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "question-link";
      if (index === questionIndex) {
        button.setAttribute("aria-current", "step");
      }
      const title = document.createElement("span");
      title.textContent = `Question ${index + 1}${favorites.has(index) ? " · Favori" : ""}`;
      const status = document.createElement("span");
      const answered = responses[index].validated;
      status.className = `question-status ${answered ? "question-answered" : "question-unanswered"}`;
      status.textContent = answered ? "✓ Répondue" : "○ Non répondue";
      const preview = document.createElement("span");
      preview.className = "question-preview";
      preview.textContent = question.question;
      const arrow = document.createElement("span");
      arrow.className = "question-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      button.append(title, status, preview, arrow);
      button.addEventListener("click", () => {
        questionsDialog.close();
        goToQuestion(index);
      });
      questionsList.append(button);
    });
  }

  allFilter.addEventListener("click", () => {
    favoritesOnly = false;
    renderQuestionList();
  });

  favoritesFilter.addEventListener("click", () => {
    favoritesOnly = true;
    renderQuestionList();
  });

  openQuestionsButton.addEventListener("click", () => {
    renderQuestionList();
    questionsDialog.showModal();
  });

  document.getElementById("close-questions").addEventListener("click", () => {
    questionsDialog.close();
    openQuestionsButton.focus();
  });

  questionsDialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      questionsDialog.close();
      openQuestionsButton.focus();
    }
  });

  document.getElementById("finish-exam").addEventListener("click", finishExam);

  previousButton.addEventListener("click", () => {
    if (questionIndex === 0) {
      return;
    }
    goToQuestion(questionIndex - 1);
  });

  nextButton.addEventListener("click", () => {
    if (!validated) {
      return;
    }
    if (questionIndex < exam.questions.length - 1) {
      goToQuestion(questionIndex + 1);
      return;
    }

    finishExam();
  });

  function finishExam() {
    if (finished) {
      return;
    }
    const unanswered = exam.questions.length - validatedCount;
    if (unanswered > 0 && !confirm(
      `${unanswered} question(s) non validée(s) compteront comme incorrectes. Terminer l'examen ?`,
    )) {
      return;
    }
    if (!validated) {
      responses[questionIndex].selected = selectedAnswers();
    }
    finished = true;
    stopTimer();
    quiz.hidden = true;
    results.hidden = false;
    const total = exam.questions.length;
    document.getElementById("result-score").textContent = `${score} / ${total}`;
    document.getElementById("result-description").textContent =
      `${Math.round((score / total) * 100)} % de bonnes réponses sur ${exam.title.toLowerCase()}.`;
    document.getElementById("restart-exam").href = `./exam.html?exam=${examNumber}`;
    renderErrorReview();
    document.getElementById("results-title").focus();
  }

  renderQuestion(false);
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
  document.addEventListener("visibilitychange", updateTimer);
})();
