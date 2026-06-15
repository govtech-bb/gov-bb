import { ChoicePills } from "./choice-pills";

// Renders a presentChoices tool-call as clickable option pills. The QUESTION is
// the model's preceding prose — presentChoices carries only the button labels —
// so there's nothing to render here but the buttons (no duplicate question). A
// click sends the chosen label as the next user message; once answered (a later
// message exists) the pills are gone, the user's reply standing in for them.
export function ChoicePrompt({
  choices,
  answered,
  onAnswer,
}: {
  choices: string[];
  answered: boolean;
  onAnswer: (text: string) => void;
}) {
  if (answered || choices.length === 0) return null;
  return <ChoicePills choices={choices} onPick={onAnswer} />;
}
