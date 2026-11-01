import { useState } from 'preact/hooks';
import { UNITS, type Food } from '../api/types';
import { Sheet } from '../ui/sheet';
import { formatAmount, parseAmount } from './amount';
import type { DraftLine } from './review-state';

interface Props {
  line: DraftLine;
  library: Food[];
  onDone: (line: DraftLine) => void;
  onRemove: () => void;
  onChooseFood: (line: DraftLine) => void;
  onClose: () => void;
}

/** Edit one line's amount, unit, name, food and optional. The source text is shown, never changed. */
export function LineEdit({ line, library, onDone, onRemove, onChooseFood, onClose }: Props) {
  const [amount, setAmount] = useState(formatAmount(line.qty));
  const [unit, setUnit] = useState(line.unit);
  const [name, setName] = useState(line.name);
  const [optional, setOptional] = useState(line.optional);
  const qty = parseAmount(amount);
  const food = library.find((f) => f.id === line.food_id);

  const edited = (): DraftLine => ({
    ...line,
    qty: qty === undefined ? line.qty : qty,
    unit,
    name: name.trim() || line.name,
    optional,
    // An amount typed by hand replaces a package's weight.
    grams: qty !== undefined && qty !== line.qty ? null : line.grams,
  });

  return (
    <Sheet title="Edit line" onClose={onClose} testId="line-edit">
      <p class="sheet-source">{line.text}</p>
      <label for="line-amount" class="field-label">
        Amount
      </label>
      <input
        id="line-amount"
        class="field"
        inputMode="decimal"
        autoComplete="off"
        value={amount}
        data-autofocus
        aria-invalid={qty === undefined}
        onInput={(e) => setAmount(e.currentTarget.value)}
      />
      {qty === undefined && <p class="field-error">Use a number like 2, 1 1/2 or ½.</p>}
      <label for="line-unit" class="field-label">
        Unit
      </label>
      <select id="line-unit" class="field" value={unit} onChange={(e) => setUnit(e.currentTarget.value)}>
        <option value="">none</option>
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <label for="line-name" class="field-label">
        Name
      </label>
      <input id="line-name" class="field" value={name} onInput={(e) => setName(e.currentTarget.value)} />
      <button type="button" class="row-btn" onClick={() => onChooseFood(edited())}>
        <span>Food</span>
        <span class={food ? 'status-matched' : 'status-unmatched'}>{food ? food.name : 'Which food is this?'}</span>
      </button>
      <label class="switch-row">
        <span>
          Optional
          <span class="hint">Not counted in nutrition or on shopping lists</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={optional}
          onChange={(e) => setOptional(e.currentTarget.checked)}
        />
      </label>
      <div class="sheet-actions">
        <button type="button" class="btn btn-primary" disabled={qty === undefined} onClick={() => onDone(edited())}>
          Done
        </button>
        <button type="button" class="btn btn-danger-text" onClick={onRemove}>
          Remove line
        </button>
      </div>
    </Sheet>
  );
}
