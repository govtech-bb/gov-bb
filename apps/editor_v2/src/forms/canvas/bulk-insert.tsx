import { useState } from "react";
import { Button } from "../../ui/button";
import { Dialog } from "../../ui/dialog";
import { Textarea } from "../../ui/textarea";

export function BulkInsertDialog({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (options: string[]) => void;
}) {
  const [text, setText] = useState("");

  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => !isOpen && setText("")}
    >
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Bulk insert options</Dialog.Title>
          <Dialog.Description>Type or paste the options, one on each line.</Dialog.Description>
        </Dialog.Header>
        <Dialog.Body>
          <Textarea
            autoFocus
            rows={8}
            value={text}
            aria-label="Options, one per line"
            placeholder={"Option 1\nOption 2\nOption 3\nOption 4\nOption 5"}
            onChange={(e) => setText(e.target.value)}
          />
        </Dialog.Body>
        <Dialog.Actions>
          <Dialog.Close render={<Button size="md">Cancel</Button>} />
          <Button
            variant="accent"
            size="md"
            onClick={() => {
              onInsert(
                text
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean),
              );
              onOpenChange(false);
            }}
          >
            Insert options
          </Button>
        </Dialog.Actions>
      </Dialog.Content>
    </Dialog.Root>
  );
}
