import { darken, lighten } from 'polished';

const getMeshColorVariants = (baseColor: string = '#7E99A3') => {
  return {
    base: baseColor,
    line: darken(0.2, baseColor),
    selected: lighten(0.15, baseColor),
    lineSelected: lighten(0.25, baseColor),
  };
};

export default getMeshColorVariants;
