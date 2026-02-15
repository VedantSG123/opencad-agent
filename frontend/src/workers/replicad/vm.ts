/* eslint-disable @typescript-eslint/no-implied-eval */

export function runFunctionWithContext<
  T extends Record<string, unknown>,
  R = unknown,
>(code: string, context: T): R {
  const keys = Object.keys(context);

  // Build code that declares each variable from context
  const decls = keys.map((k) => `let ${k} = context['${k}'];`).join('\n');

  // Create the function, cast it to the right type so TS is happy
  const fn = (
    Function(`
    return function(context) {
      "use strict";
      ${decls}
      ${code}
    }
  `) as () => (ctx: T) => R
  )();

  return fn(context);
}
