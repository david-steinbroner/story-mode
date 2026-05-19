import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PuzzlePayload } from "@shared/types/puzzles";

interface Props {
  payload: PuzzlePayload;
  onSubmit: (answer: string) => void;
  disabled: boolean;
}

export default function CryptogramCard({ payload, onSubmit, disabled }: Props) {
  const [value, setValue] = useState('');
  if (payload.type !== 'cryptogram') return null;

  // Render ciphertext above each character's pre-revealed plaintext mapping.
  // Letters not pre-revealed show as a blank underscore.
  const rendered = payload.ciphertext.split('').map((ch) => {
    if (ch < 'A' || ch > 'Z') return { ch, decoded: ch };
    const isRevealed = payload.revealed.includes(ch);
    return { ch, decoded: isRevealed ? payload.mapping[ch] : '_' };
  });

  return (
    <div className="space-y-2.5">
      {/* First-time players don't know cryptogram mechanics. Surface the
          rule + the role of the revealed letter inline so the puzzle is
          discoverable without external instruction. */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        Each cipher letter maps to one plaintext letter. The first letter is
        revealed below — use it, the hints, and the word lengths to decode the
        rest. Type the full decoded message.
      </p>
      <div className="font-mono text-center py-3 px-2 bg-primary/10 rounded-md leading-relaxed">
        <div className="text-lg tracking-widest text-foreground">
          {rendered.map((r, i) => <span key={i}>{r.ch}</span>)}
        </div>
        <div className="text-sm tracking-widest text-muted-foreground mt-1">
          {rendered.map((r, i) => <span key={i}>{r.decoded}</span>)}
        </div>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); }}
        className="flex gap-2"
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="Decoded message"
          maxLength={50}
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
