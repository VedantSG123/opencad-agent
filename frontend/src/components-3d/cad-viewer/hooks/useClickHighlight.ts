import debounce from 'debounce';
import * as React from 'react';

const useToggleHighlight = (): [number | null, (index: number) => void] => {
  const [selected, setSelected] = React.useState<number | null>(null);

  const toggleSelected = debounce((index: number) => {
    if ((selected || selected === 0) && selected === index) {
      setSelected(null);
    } else {
      setSelected(index);
    }
  }, 50);

  return [selected, toggleSelected];
};

export const useClickHighlight = (selectionMode: SelectionMode = 'all') => {
  const [faceSelected, toggleFaceSelected] = useToggleHighlight();
  const [edgeSelected, toggleEdgeSelected] = useToggleHighlight();

  const updateFaceSelected = ['all', 'faces'].includes(selectionMode)
    ? (index: number) => {
        toggleFaceSelected(index);
        if (edgeSelected || edgeSelected === 0) {
          toggleEdgeSelected(edgeSelected);
        }
      }
    : null;

  const updateEdgeSelected = ['all', 'edges'].includes(selectionMode)
    ? (index: number) => {
        toggleEdgeSelected(index);
        if (faceSelected || faceSelected === 0) {
          toggleFaceSelected(faceSelected);
        }
      }
    : null;

  return { faceSelected, edgeSelected, updateFaceSelected, updateEdgeSelected };
};

export type SelectionMode = 'all' | 'face' | 'edge';
