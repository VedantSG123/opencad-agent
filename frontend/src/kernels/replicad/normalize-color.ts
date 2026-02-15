import convert from 'color-convert';
import parse from 'parse-css-color';

export function normalizeColor(color: string) {
  const parsed = parse(color);

  if (!parsed) {
    return {
      color: '#ffffff',
      alpha: 1,
    };
  }

  if (parsed.type === 'hsl') {
    const [h, s, l] = parsed.values;
    return {
      color: convert.hsl.hex(h, s, l),
      alpha: parsed.alpha,
    };
  }

  const [r, g, b] = parsed.values;
  return {
    color: convert.rgb.hex(r, g, b),
    alpha: parsed.alpha,
  };
}
