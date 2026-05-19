import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PuzzlePayload } from "@shared/types/puzzles";

interface Props {
  payload: PuzzlePayload;
  onSubmit: (answer: string) => void;
  disabled: boolean;
}

export default function FillInBlankCard({ payload, onSubmit, disabled }: Props) {
  const [value, setValue] = useState('');
  if (payload.type !== 'fill-in-the-blank') return null;
  const [before, after] = payload.sentence.split('___');

  return (
    <div className="space-y-2.5">
      <p className="text-base text-foreground leading-relaxed py-2">
        {before}
        <span className="inline-block min-w-[3rem] border-b-2 border-foreground text-center px-1 text-muted-foreground">
          ___
        </span>
        {after}
      </p>
      <form
        onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); }}
        className="flex gap-2"
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="The missing word"
          maxLength={20}
          disabled={disabled}
          className="text-base uppercase"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" disabled={disabled || value.trim().length === 0}>
          Submit
        </Button>
      </form>
    </div>
  );
}
