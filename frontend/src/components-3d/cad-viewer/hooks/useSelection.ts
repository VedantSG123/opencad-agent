import debounce from 'debounce';
import * as React from 'react';

export function useSelection(
  selecedMode: string,
  validSelectedMode: string[],
): [SelectionType | null, (shapeId: string) => (index: number) => void] {
  const [selection, setSelection] = React.useState<SelectionType | null>(null);

  if (!validSelectedMode.includes(selecedMode)) {
    return [selection, () => () => {}];
  }

  const select = (shapeId: string) => {
    const handleSelect = debounce((index: number) => {
      if (
        selection &&
        selection.shapeId === shapeId &&
        selection.index === index
      ) {
        setSelection(null);
      } else {
        setSelection({ shapeId, index });
      }
    }, 50);

    return handleSelect;
  };

  return [selection, select];
}

export type SelectionType = {
  shapeId: string;
  index: number;
};
