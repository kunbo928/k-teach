import chalk from "chalk";















export function filterMultiSelectChoices(
  choices                     ,
  searchText        ,
)                      {
  const term = searchText.trim().toLowerCase();
  if (!term) return choices;
  return choices.filter(
    (choice) =>
      choice.name.toLowerCase().includes(term) ||
      choice.value.toLowerCase().includes(term),
  );
}

export function initiallySelectedValues(
  choices                     ,
)           {
  return choices
    .filter((choice) => choice.preSelected)
    .map((choice) => choice.value);
}

async function createSearchableMultiSelect() {
  const {
    createPrompt,
    useState,
    useKeypress,
    useMemo,
    usePrefix,
    isEnterKey,
    isBackspaceKey,
    isUpKey,
    isDownKey,
  } = await import("@inquirer/core");

  return createPrompt                             ((config, done) => {
    const { message, choices, pageSize = 15, validate } = config;
    const [searchText, setSearchText] = useState("");
    const [selectedValues, setSelectedValues] = useState(() =>
      initiallySelectedValues(choices),
    );
    const [cursor, setCursor] = useState(0);
    const [status, setStatus] = useState                 ("idle");
    const [error, setError] = useState               (null);
    const prefix = usePrefix({ status });

    const filteredChoices = useMemo(
      () => filterMultiSelectChoices(choices, searchText),
      [choices, searchText],
    );
    const selectedSet = useMemo(
      () => new Set(selectedValues),
      [selectedValues],
    );
    const choiceMap = useMemo(
      () => new Map(choices.map((choice) => [choice.value, choice])),
      [choices],
    );

    useKeypress((key) => {
      if (status === "done") return;
      if (isEnterKey(key)) {
        const validation = validate?.(selectedValues) ?? true;
        if (validation !== true) {
          setError(typeof validation === "string" ? validation : "Invalid");
          return;
        }
        setStatus("done");
        done(selectedValues);
        return;
      }
      if (key.name === "space") {
        const choice = filteredChoices[cursor];
        if (!choice) return;
        setError(null);
        setSelectedValues(
          selectedSet.has(choice.value)
            ? selectedValues.filter((value) => value !== choice.value)
            : [...selectedValues, choice.value],
        );
        return;
      }
      if (isBackspaceKey(key)) {
        setError(null);
        if (searchText === "" && selectedValues.length > 0) {
          setSelectedValues(selectedValues.slice(0, -1));
        } else {
          setSearchText(searchText.slice(0, -1));
          setCursor(0);
        }
        return;
      }
      if (isUpKey(key)) {
        setCursor(Math.max(0, cursor - 1));
        return;
      }
      if (isDownKey(key)) {
        setCursor(Math.min(filteredChoices.length - 1, cursor + 1));
        return;
      }
      if (key.name && key.name.length === 1 && !key.ctrl) {
        setError(null);
        setSearchText(searchText + key.name);
        setCursor(0);
      }
    });

    if (status === "done") {
      const names = selectedValues
        .map((value) => choiceMap.get(value)?.name ?? value)
        .join(", ");
      return `${prefix} ${chalk.bold(message)} ${chalk.cyan(names)}`;
    }

    const lines = [`${prefix} ${chalk.bold(message)}`];
    const selected =
      selectedValues.length > 0
        ? selectedValues
            .map((value) =>
              chalk.bgCyan.black(` ${choiceMap.get(value)?.name ?? value} `),
            )
            .join(" ")
        : chalk.dim("(none selected)");
    lines.push(`  Selected: ${selected}`);
    lines.push(
      `  Search: ${chalk.yellow("[")}${
        searchText || chalk.dim("type to filter")
      }${chalk.yellow("]")}`,
    );
    lines.push(
      `  ${chalk.cyan("↑↓")} navigate • ${chalk.cyan(
        "Space",
      )} toggle • ${chalk.cyan("Backspace")} remove • ${chalk.cyan(
        "Enter",
      )} confirm`,
    );

    if (filteredChoices.length === 0) {
      lines.push(chalk.yellow("  No matches"));
    } else {
      const start = Math.max(
        0,
        Math.min(
          cursor - Math.floor(pageSize / 2),
          filteredChoices.length - pageSize,
        ),
      );
      const visible = filteredChoices.slice(start, start + pageSize);
      for (const [index, choice] of visible.entries()) {
        const active = start + index === cursor;
        const isSelected = selectedSet.has(choice.value);
        const arrow = active ? chalk.cyan("›") : " ";
        const icon = isSelected ? chalk.green("◉") : chalk.dim("○");
        const name = active ? chalk.cyan(choice.name) : choice.name;
        const suffix = isSelected
          ? chalk.dim(" (selected)")
          : choice.detected
            ? chalk.dim(" (detected)")
            : "";
        lines.push(`  ${arrow} ${icon} ${name}${suffix}`);
      }
      if (filteredChoices.length > pageSize) {
        const currentPage = Math.floor(cursor / pageSize) + 1;
        const totalPages = Math.ceil(filteredChoices.length / pageSize);
        lines.push(chalk.dim(`  (${currentPage}/${totalPages})`));
      }
    }
    if (error) lines.push(chalk.red(`  ${error}`));
    return lines.join("\n");
  });
}

export async function searchableMultiSelect(
  config                   ,
)                    {
  const prompt = await createSearchableMultiSelect();
  return prompt(config);
}


//# sourceURL=k-teach/src/searchable-multi-select.ts