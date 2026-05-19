import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PuzzlePayload } from "@shared/types/puzzles";

interface Props {
  payload: PuzzlePayload;  // narrowed by container, but kept loose at the props boundary
  onSubmit: (answer: string) => void;
  disabled: boolean;
}

export default function ScrambleCard({ payload, onSubmit, disabled }: Props) {
  const [value, setValue] = useState('');
  if (payload.type !== 'scramble') return null;
  return (
    <div className="space-y-2.5">
      <div
        className="text-2xl font-mono tracking-[0.4em] text-center py-3 px-2 bg-primary/10 rounded-md select-none"
        aria-label="scrambled letters"
      >
        {payload.letters.split('').join(' ')}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); }}
        className="flex gap-2"
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="Unscramble"
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
