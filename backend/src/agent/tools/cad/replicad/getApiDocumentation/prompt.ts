export const prompt = `Look up the replicad API documentation for one class, function, method, variable, interface or type alias. Returns that entity's reference documentation as markdown.

WHEN TO USE: before calling a replicad API you are not certain of - checking
  what arguments a function takes, what a method returns, which methods a class
  has, what the fields of an interface are. Reach for this rather than guessing
  at an API or inferring it from how the project happens to use it.

WHEN NOT TO USE: finding how this project uses replicad (use grep instead).
  Reading a file in the project (use read instead). Looking up anything that is
  not part of the replicad API - this store covers replicad only.

DO NOT USE FOR: searching the project's own code (use grep), reading project
  files (use read), searching \`node_modules\` for type definitions (use this
  tool - the documentation here is already extracted and cleaned).

USAGE: \`entityName\` is the name on its own for a class, function, variable,
  interface or type alias, and \`ClassName.methodName\` for a method - without
  parentheses, so \`Sketch.extrude\`, never \`Sketch.extrude()\`. \`entityType\`
  must be the entity's real kind: a method looked up as a function will not be
  found. One entity per call; call again for the next one. A class's
  documentation ends with a summary listing its methods, so look the class up
  first when you do not know the method's name. A miss says that nothing
  matched rather than guessing, so check the name and the type and retry.

EXAMPLES:
- A class: \`{ "entityName": "Sketch", "entityType": "class" }\`
- A method on a class: \`{ "entityName": "Sketch.extrude", "entityType": "method" }\`
- A top-level function: \`{ "entityName": "drawCircle", "entityType": "function" }\``
