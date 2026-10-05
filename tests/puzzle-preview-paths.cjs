// Prints the editor's puzzle cut lines as JSON so tests can compare them with the engine's pieces.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "..", "src", "puzzle.ts"), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const puzzle = {};
new Function("exports", "require", output)(puzzle, () => ({}));
const settings = JSON.parse(process.argv[2]);
process.stdout.write(JSON.stringify(puzzle.puzzlePaths(settings)));
