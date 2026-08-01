const root = document.documentElement;
const themeButton = document.querySelector("[data-theme-toggle]");
const teachingThemeSelect = document.querySelector(
  "[data-teaching-theme-select]",
);
const teachingThemeReset = document.querySelector("[data-theme-reset]");
const storedTheme = localStorage.getItem("k-teach-theme");
const teachingThemes = [
  "classic-manual",
  "storybook",
  "nature-explorer",
  "active-classroom",
  "junior-lab",
  "editorial-desk",
  "future-lab",
];
const teachId = root.dataset.teachId ?? "unknown";
const themeDefault = teachingThemes.includes(root.dataset.teachingTheme)
  ? root.dataset.teachingTheme
  : "classic-manual";
const teachingThemeKey = `k-teach-teaching-theme:${teachId}`;

try {
  const preference = localStorage.getItem(teachingThemeKey);
  if (teachingThemes.includes(preference)) {
    root.dataset.teachingTheme = preference;
  }
} catch {
  // Storage is optional. The selector still changes the current page.
}

if (teachingThemeSelect) {
  teachingThemeSelect.value = root.dataset.teachingTheme;
  teachingThemeSelect.addEventListener("change", () => {
    if (!teachingThemes.includes(teachingThemeSelect.value)) return;
    root.dataset.teachingTheme = teachingThemeSelect.value;
    try {
      localStorage.setItem(teachingThemeKey, teachingThemeSelect.value);
    } catch {
      // Keep the temporary theme when storage is unavailable.
    }
  });
}

teachingThemeReset?.addEventListener("click", () => {
  root.dataset.teachingTheme = themeDefault;
  if (teachingThemeSelect) teachingThemeSelect.value = themeDefault;
  try {
    localStorage.removeItem(teachingThemeKey);
  } catch {
    // Reset still applies to the current page.
  }
});

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
