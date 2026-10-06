/** Independent test-only interpretation of frozen fixture data. No converter or editor functions are called.
 * This proof intentionally covers the seven non-repeating fixtures, not a respondent runtime. */
import assert from "node:assert/strict";
import type {
  LogicAction as Action,
  Condition,
  Expression,
  FormDefinitionV2 as FormDefinition,
  QuestionBlock as Question,
  RichText,
} from "../../src/forms/schema/types";

export const Missing = Symbol("Missing");

export const Invalid = Symbol("Invalid");

const Unknown = Symbol("Unknown");

type Scalar = string | number | boolean;

export type Result = Scalar | typeof Missing | typeof Invalid;

type Truth = boolean | typeof Unknown;

const unavailable = (value: Result) => value === Missing || value === Invalid;

export type RawAnswer =
  | string
  | number
  | boolean
  | null
  | RawAnswer[]
  | { [key: string]: RawAnswer }
  | undefined;

export type RawAnswers = Record<string, RawAnswer>;

function calendar(value: RawAnswer | Result): [number, number, number] | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const [year, month, day] = value.split("-").map(Number);

  if (year === undefined || month === undefined || day === undefined) return;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]!) return;

  return [year, month, day];
}

function parse(question: Question, raw: RawAnswer): Result {
  if (raw === undefined || raw === "" || (typeof raw === "string" && !raw.trim())) return Missing;

  if (question.kind === "number") {
    // Parsing is an input concern; numeric expressions never coerce strings.
    const number =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^-?\d+(?:\.\d+)?$/.test(raw.trim())
          ? Number(raw.trim())
          : NaN;

    return Number.isFinite(number) ? number : Invalid;
  }

  if (question.kind === "date") return typeof raw === "string" && calendar(raw) ? raw : Invalid;

  if (question.kind === "boolean") return typeof raw === "boolean" ? raw : Invalid;

  if (question.kind === "choice")
    return question.options?.find((option) => option.value === raw)?.value ?? Invalid;

  return typeof raw === "string" ? raw : Invalid;
}

export function evaluate(form: FormDefinition, raw: RawAnswers, today = "2026-10-04") {
  const blocks = new Map(form.blocks.map((block) => [block.id, block]));
  assert.equal(blocks.size, form.blocks.length, `${form.id}: duplicate block ID`);
  const questions = form.blocks.filter((block): block is Question => block.type === "question");
  assert.equal(
    new Set(questions.map((question) => question.key)).size,
    questions.length,
    `${form.id}: duplicate answer key`,
  );

  const rules = form.blocks.flatMap((block) =>
    block.type === "logic" ? block.rules.filter((rule) => rule.enabled !== false) : [],
  );

  const assignments = (type: Action["type"], id: string) =>
    rules.flatMap((rule) =>
      rule.actions.flatMap((action) => {
        if (action.type !== type) return [];

        if (
          action.type === "setVisible"
            ? action.targets.includes(id)
            : "target" in action && action.target === id
        )
          return [{ rule, action }];

        return [];
      }),
    );

  const expressionDependencies = (expression: Expression): string[] => {
    if (typeof expression !== "object") return [];

    if ("answer" in expression) return [`answer:${expression.answer}`];

    if ("value" in expression) return [`value:${expression.value}`];

    if ("context" in expression) return [];

    return [
      ...expression.args.flatMap(expressionDependencies),
      ...(expression.op === "lookup"
        ? [
            ...expression.entries.flatMap((entry) => expressionDependencies(entry.value)),
            ...expressionDependencies(expression.fallback),
          ]
        : []),
    ];
  };

  const conditionDependencies = (condition: Condition): string[] => {
    if (typeof condition === "boolean") return [];

    if (condition.op === "all" || condition.op === "any")
      return condition.conditions.flatMap(conditionDependencies);

    if (condition.op === "not") return conditionDependencies(condition.condition);

    if (condition.op === "selected") {
      const target = blocks.get(condition.question);
      assert(
        target?.type === "question" &&
          target.options?.some((option) => option.id === condition.option),
        `Unknown option ${condition.question}/${condition.option}`,
      );

      return [`answer:${condition.question}`];
    }

    if (condition.op === "empty") return expressionDependencies(condition.value);

    return "left" in condition
      ? [...expressionDependencies(condition.left), ...expressionDependencies(condition.right)]
      : [];
  };

  const graph = new Map<string, { dependencies: string[]; resolve: () => Result }>();
  const cache = new Map<string, Result>();

  const read = (id: string): Result => {
    if (cache.has(id)) return cache.get(id)!;
    const node = graph.get(id);
    assert(node, `Unknown reference ${id}`);
    const result = node.resolve();
    cache.set(id, result);

    return result;
  };

  const expression = (input: Expression): Result => {
    if (typeof input !== "object")
      return typeof input === "number" && !Number.isFinite(input) ? Invalid : input;

    if ("answer" in input) return read(`answer:${input.answer}`);

    if ("value" in input) return read(`value:${input.value}`);

    if ("context" in input) return input.context === "today" ? today : Missing;

    if (input.op === "coalesce") {
      for (const item of input.args) {
        const result = expression(item);

        if (result !== Missing) return result;
      }

      return Missing;
    }

    if (input.op === "lookup") {
      const key = expression(input.args[0]);

      if (unavailable(key)) return key;
      const entry = input.entries.find((entry) => entry.key === key);

      return expression(entry ? entry.value : input.fallback);
    }

    const args = input.args.map(expression);

    if (args.includes(Invalid)) return Invalid;

    if (args.includes(Missing)) return Missing;

    if (input.op === "year" || input.op === "monthsBetween" || input.op === "wholeYearsBetween") {
      const start = calendar(args[0]);

      if (!start) return Invalid;

      if (input.op === "year") return start[0];
      const end = calendar(args[1]);

      if (!end) return Invalid;

      if (input.op === "monthsBetween") return (end[0] - start[0]) * 12 + end[1] - start[1];

      if (typeof args[1] !== "string" || typeof args[0] !== "string" || args[1] < args[0])
        return Invalid;

      return (
        end[0] -
        start[0] -
        (end[1] < start[1] || (end[1] === start[1] && end[2] < start[2]) ? 1 : 0)
      );
    }

    if (input.op === "toText") return String(args[0]);

    if (input.op === "concat")
      return args.every((value) => typeof value === "string") ? args.join("") : Invalid;

    if (input.op === "daysBetween")
      return calendar(args[0]) && calendar(args[1])
        ? (Date.parse(String(args[1]) + "T00:00:00Z") -
            Date.parse(String(args[0]) + "T00:00:00Z")) /
            86_400_000
        : Invalid;

    if (!args.length || !args.every((value): value is number => typeof value === "number"))
      return Invalid;
    const numbers = args;
    let result: number = NaN;

    switch (input.op) {
      case "add":
        result = numbers.reduce((a, b) => a + b);
        break;
      case "subtract":
        result = numbers.reduce((a, b) => a - b);
        break;
      case "multiply":
        result = numbers.reduce((a, b) => a * b);
        break;
      case "divide":
        result = numbers.slice(1).some((value) => value === 0)
          ? NaN
          : numbers.reduce((a, b) => a / b);
        break;
      case "min":
        result = Math.min(...numbers);
        break;
      case "max":
        result = Math.max(...numbers);
        break;
      case "round":
        result =
          input.increment > 0 ? Math.round(numbers[0]! / input.increment) * input.increment : NaN;
        break;
    }

    return Number.isFinite(result) ? result : Invalid;
  };

  const condition = (input: Condition): Truth => {
    if (typeof input === "boolean") return input;

    if (input.op === "all" || input.op === "any") {
      const values = input.conditions.map(condition);

      if (input.op === "all")
        return values.includes(false) ? false : values.includes(Unknown) ? Unknown : true;

      return values.includes(true) ? true : values.includes(Unknown) ? Unknown : false;
    }

    if (input.op === "not") {
      const result = condition(input.condition);

      return result === Unknown ? Unknown : !result;
    }

    if (input.op === "selected") {
      const result = read(`answer:${input.question}`);

      if (unavailable(result)) return Unknown;
      const question = blocks.get(input.question);
      assert(question?.type === "question", "Selected condition must reference a question");

      return result === question.options!.find((option) => option.id === input.option)!.value;
    }

    if (input.op === "empty") {
      const result = expression(input.value);

      return result === Invalid ? Unknown : result === Missing || result === "";
    }

    if (!("left" in input)) return Unknown;

    const left = expression(input.left),
      right = expression(input.right);

    if (unavailable(left) || unavailable(right) || typeof left !== typeof right) return Unknown;

    if (input.op === "eq") return left === right;

    if (input.op === "ne") return left !== right;

    if (
      !(
        (typeof left === "number" && typeof right === "number") ||
        (typeof left === "string" && typeof right === "string")
      )
    )
      return Unknown;

    switch (input.op) {
      case "gt":
        return left > right;
      case "gte":
        return left >= right;
      case "lt":
        return left < right;
      case "lte":
        return left <= right;
      case "contains":
        return String(left).includes(String(right));
      case "startsWith":
        return String(left).startsWith(String(right));
      case "endsWith":
        return String(left).endsWith(String(right));
    }

    return Unknown;
  };

  let parent: string | undefined;

  for (const block of form.blocks) {
    const ancestor = block.type === "page" ? undefined : parent;

    if (block.type === "page") parent = block.id;
    else assert(parent, "First block must be a page");
    const visibility = assignments("setVisible", block.id);
    graph.set(`visible:${block.id}`, {
      dependencies: [
        ...(ancestor ? [`visible:${ancestor}`] : []),
        ...visibility.flatMap((item) => conditionDependencies(item.rule.when)),
      ],
      resolve: () => {
        let result = block.visible ?? true;

        for (const { rule, action } of visibility)
          if (action.type === "setVisible" && condition(rule.when) === true) result = action.value;

        return result && (!ancestor || read(`visible:${ancestor}`) === true);
      },
    });

    if (block.type === "question")
      graph.set(`answer:${block.id}`, {
        dependencies: [`visible:${block.id}`],
        resolve: () =>
          read(`visible:${block.id}`) === true
            ? parse(
                block,
                Object.hasOwn(raw, block.id)
                  ? raw[block.id]
                  : block.default &&
                      typeof block.default === "object" &&
                      !Array.isArray(block.default) &&
                      "context" in block.default
                    ? today
                    : block.default,
              )
            : Missing,
      });

    if (block.type === "calculated") {
      const overrides = assignments("setValue", block.id);
      graph.set(`value:${block.id}`, {
        dependencies: [
          ...(block.expression === undefined ? [] : expressionDependencies(block.expression)),
          ...overrides.flatMap(({ rule, action }) => [
            ...conditionDependencies(rule.when),
            ...(action.type === "setValue" ? expressionDependencies(action.value) : []),
          ]),
        ],
        resolve: () => {
          let selected = block.expression;

          for (const { rule, action } of overrides)
            if (action.type === "setValue" && condition(rule.when) === true)
              selected = action.value;
          const result = selected === undefined ? Missing : expression(selected);

          return unavailable(result) || typeof result === block.valueType ? result : Invalid;
        },
      });
    }
  }

  // Validate all potential branches, including inactive and unused definitions.
  const visited = new Set<string>(),
    visiting = new Set<string>();

  const visit = (id: string) => {
    if (visited.has(id)) return;
    assert(!visiting.has(id), `Dependency cycle at ${id}`);
    const node = graph.get(id);
    assert(node, `Unknown reference ${id}`);
    visiting.add(id);
    node.dependencies.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };

  for (const [id] of graph) visit(id);

  for (const rule of rules) {
    conditionDependencies(rule.when).forEach(visit);

    for (const action of rule.actions) {
      const targets =
        action.type === "setVisible"
          ? action.targets.map((target) =>
              typeof target === "string"
                ? target
                : "question" in target
                  ? target.question
                  : target.list,
            )
          : "target" in action
            ? [action.target]
            : [];

      targets.forEach((target) => assert(blocks.has(target), `Unknown action target ${target}`));

      if (action.type === "setValue")
        assert(
          blocks.get(action.target)?.type === "calculated",
          "setValue must target a calculated block",
        );
    }
  }

  const values = Object.fromEntries(
    form.blocks
      .filter((block) => block.type === "calculated")
      .map((block) => [block.id, read(`value:${block.id}`)]),
  );

  const visible = Object.fromEntries(
    form.blocks.map((block) => [block.id, read(`visible:${block.id}`) === true]),
  );

  const answers = Object.fromEntries(
    questions.map((question) => [question.id, read(`answer:${question.id}`)]),
  );

  const required = Object.fromEntries(
    questions.map((question) => [question.id, question.required?.value ?? false]),
  );

  const titles: Record<string, RichText> = Object.fromEntries(
    form.blocks.flatMap((block) => (block.type === "page" ? [[block.id, block.title]] : [])),
  );

  for (const rule of rules)
    if (condition(rule.when) === true)
      for (const action of rule.actions) {
        if (action.type === "setRequired") required[action.target] = action.value;

        if (action.type === "setTitle") titles[action.target] = action.value;
      }

  const errors: { target: string; message: string }[] = [];

  for (const question of questions) {
    if (!visible[question.id]) continue;
    const answer = answers[question.id]!;

    if (answer === Invalid) {
      errors.push({ target: question.id, message: `Enter a valid ${question.kind}` });
      continue;
    }

    if (answer === Missing) {
      if (required[question.id])
        errors.push({ target: question.id, message: question.required?.message ?? "Required" });
      continue;
    }

    for (const rule of question.validation ?? []) {
      let failed = false;

      switch (rule.type) {
        case "integer":
          failed = typeof answer !== "number" || !Number.isInteger(answer);
          break;
        case "minimum":
          failed =
            typeof answer !== "number" ||
            (rule.inclusive === false ? answer <= rule.value : answer < rule.value);
          break;
        case "maximum":
          failed =
            typeof answer !== "number" ||
            (rule.inclusive === false ? answer >= rule.value : answer > rule.value);
          break;
        case "minLength":
          failed = typeof answer !== "string" || answer.length < rule.value;
          break;
        case "maxLength":
          failed = typeof answer !== "string" || answer.length > rule.value;
          break;
        case "pattern":
          failed = typeof answer !== "string" || !new RegExp(rule.pattern, rule.flags).test(answer);
          break;
        case "equals":
          failed = answer !== rule.value;
          break;
        case "email":
          failed = typeof answer !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer);
          break;
        case "phone":
          failed = typeof answer !== "string" || !/^[+\d\s()-]+$/.test(answer);
          break;
        case "dateIn":
          failed = typeof answer !== "string" || !rule.value.includes(answer);
          break;
        case "dateBefore":
        case "dateAfter": {
          const bound = expression(rule.value);
          failed =
            typeof answer !== "string" ||
            typeof bound !== "string" ||
            (rule.type === "dateBefore"
              ? rule.inclusive === false
                ? answer >= bound
                : answer > bound
              : rule.inclusive === false
                ? answer <= bound
                : answer < bound);
          break;
        }

        default:
          throw Error("Fixture interpreter does not support validation " + rule.type);
      }

      if (failed) errors.push({ target: question.id, message: rule.message });
    }
  }

  for (const rule of rules)
    if (condition(rule.when) === true)
      for (const action of rule.actions)
        if (action.type === "error" && visible[action.target])
          errors.push({ target: action.target, message: action.message });
  const rawAfter = { ...raw };

  if (form.settings.hiddenAnswers === "clear")
    for (const question of questions) if (!visible[question.id]) delete rawAfter[question.id];

  const route = form.blocks
    .filter((block) => block.type === "page" && visible[block.id])
    .map((block) => block.id);

  const review = questions
    .filter(
      (question) =>
        question.review !== false && visible[question.id] && answers[question.id] !== Missing,
    )
    .map((question) => question.id);

  return {
    values,
    answers,
    visible,
    required,
    titles,
    route,
    review,
    errors,
    rawAfter,
    canEnterResult: errors.length === 0,
  };
}
