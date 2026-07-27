const root = document.documentElement;
const themeButton = document.querySelector("[data-theme-toggle]");
const storedTheme = localStorage.getItem("k-teach-theme");

if (storedTheme === "paper" || storedTheme === "night") {
  root.dataset.theme = storedTheme;
}

themeButton?.addEventListener("click", () => {
  const current =
    root.dataset.theme ??
    (matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "paper");
  const next = current === "night" ? "paper" : "night";
  root.dataset.theme = next;
  localStorage.setItem("k-teach-theme", next);
  themeButton.textContent = next === "night" ? "切换到纸面" : "切换到夜间";
});

for (const form of document.querySelectorAll("[data-exercise]")) {
  const input = form.querySelector("input");
  const feedback = form.querySelector("[data-feedback]");
  const reset = form.querySelector("[data-reset]");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const answer = form.dataset.answer?.trim().toLocaleLowerCase();
    const response = input?.value.trim().toLocaleLowerCase();
    const correct = Boolean(response) && response === answer;
    feedback.dataset.state = correct ? "correct" : "incorrect";
    feedback.textContent = correct
      ? `回答正确。${form.dataset.feedback}`
      : "还不对。重新解释执行顺序，或展开答案。";
  });

  reset?.addEventListener("click", () => {
    form.reset();
    feedback.dataset.state = "";
    feedback.textContent = "";
    input?.focus();
  });
}
