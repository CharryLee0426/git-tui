import path from "node:path";
import blessed from "blessed";

export function escapeTags(value) {
  return blessed.escape(String(value));
}

export function colorTag(color, value) {
  if (!value) return "";
  return `{${color}-fg}${escapeTags(value)}{/${color}-fg}`;
}

const languageHighlighters = [
  {
    name: "python",
    extensions: new Set([".py"]),
    lineComment: "#",
    keywords: new Set([
      "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
      "elif", "else", "except", "False", "finally", "for", "from", "global", "if", "import",
      "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass", "raise", "return",
      "True", "try", "while", "with", "yield"
    ]),
    builtins: new Set([
      "dict", "enumerate", "filter", "float", "int", "len", "list", "map", "open", "print",
      "range", "set", "str", "sum", "tuple", "type"
    ])
  },
  {
    name: "javascript",
    extensions: new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]),
    lineComment: "//",
    keywords: new Set([
      "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger",
      "default", "delete", "do", "else", "export", "extends", "finally", "for", "from",
      "function", "if", "import", "in", "instanceof", "let", "new", "of", "return", "static",
      "switch", "throw", "try", "typeof", "var", "void", "while", "yield"
    ]),
    builtins: new Set([
      "Array", "Boolean", "Date", "Error", "JSON", "Map", "Math", "Number", "Object",
      "Promise", "RegExp", "Set", "String", "console", "document", "process", "window"
    ])
  },
  {
    name: "json",
    extensions: new Set([".json"]),
    lineComment: "",
    keywords: new Set(["true", "false", "null"]),
    builtins: new Set([])
  },
  {
    name: "go",
    extensions: new Set([".go"]),
    lineComment: "//",
    keywords: new Set([
      "break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough",
      "for", "func", "go", "goto", "if", "import", "interface", "map", "package", "range",
      "return", "select", "struct", "switch", "type", "var"
    ]),
    builtins: new Set([
      "append", "bool", "byte", "cap", "close", "complex64", "complex128", "copy", "delete",
      "error", "false", "float32", "float64", "int", "int8", "int16", "int32", "int64",
      "iota", "len", "make", "new", "nil", "panic", "print", "println", "real", "recover",
      "rune", "string", "true", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr"
    ])
  }
];

function highlighterForFile(filePath) {
  const ext = path.extname(filePath || "").toLowerCase();
  return languageHighlighters.find((language) => language.extensions.has(ext));
}

function findCommentIndex(line, marker) {
  if (!marker) return -1;
  let quote = "";
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line.slice(index, index + marker.length);
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (next === marker) return index;
  }
  return -1;
}

function consumeString(line, start) {
  const quote = line[start];
  let index = start + 1;
  let escaped = false;
  while (index < line.length) {
    const char = line[index];
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === quote) {
      index += 1;
      break;
    }
    index += 1;
  }
  return index;
}

function highlightCodeLine(line, language) {
  if (!language) return escapeTags(line);
  const commentIndex = findCommentIndex(line, language.lineComment);
  const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
  let result = "";
  let index = 0;

  while (index < code.length) {
    const char = code[index];
    if (char === "\"" || char === "'" || char === "`") {
      const end = consumeString(code, index);
      result += colorTag("green", code.slice(index, end));
      index = end;
      continue;
    }

    const number = code.slice(index).match(/^(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)/);
    if (number) {
      result += colorTag("magenta", number[0]);
      index += number[0].length;
      continue;
    }

    const word = code.slice(index).match(/^[A-Za-z_$][\w$]*/);
    if (word) {
      const value = word[0];
      if (language.keywords.has(value)) result += colorTag("blue", value);
      else if (language.builtins.has(value)) result += colorTag("cyan", value);
      else result += escapeTags(value);
      index += value.length;
      continue;
    }

    result += escapeTags(char);
    index += 1;
  }

  return result + (comment ? colorTag("gray", comment) : "");
}

export function highlightLineForFile(filePath, line) {
  return highlightCodeLine(line, highlighterForFile(filePath));
}

export function clipVisible(value, start, width) {
  const text = String(value || "");
  if (start <= 0 && text.length <= width) return text;
  return text.slice(start, start + width);
}
