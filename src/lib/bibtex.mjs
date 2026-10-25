// Minimal BibTeX parser (entries with brace- or quote-delimited fields). Pure ESM so the build
// script can use it without a TypeScript step. Not a full BibTeX implementation: it ignores
// @string/@comment/@preamble and does not expand macros.
export function parseBibtex(text) {
  const entries = [];
  const re = /@([a-zA-Z]+)\s*\{\s*([^,\s]+)\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    const type = m[1].toLowerCase();
    if (["string", "comment", "preamble"].includes(type)) continue;
    // Find the matching closing brace of the entry.
    let depth = 1;
    let i = re.lastIndex;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
    }
    const body = text.slice(re.lastIndex, i - 1);
    entries.push({ type, key: m[2], fields: parseFields(body) });
    re.lastIndex = i;
  }
  return entries;
}

function parseFields(body) {
  const fields = {};
  const nameRe = /([a-zA-Z_-]+)\s*=\s*/g;
  let m;
  while ((m = nameRe.exec(body))) {
    let i = nameRe.lastIndex;
    let value;
    if (body[i] === "{") {
      let depth = 1;
      let j = i + 1;
      for (; j < body.length && depth > 0; j++) {
        if (body[j] === "{") depth++;
        else if (body[j] === "}") depth--;
      }
      value = body.slice(i + 1, j - 1);
      i = j;
    } else if (body[i] === '"') {
      let j = i + 1;
      while (j < body.length && !(body[j] === '"' && body[j - 1] !== "\\")) j++;
      value = body.slice(i + 1, j);
      i = j + 1;
    } else {
      const j = body.slice(i).search(/[,\n}]/);
      const end = j === -1 ? body.length : i + j;
      value = body.slice(i, end).trim();
      i = end;
    }
    fields[m[1].toLowerCase()] = value.replace(/\s+/g, " ").trim();
    nameRe.lastIndex = i;
  }
  return fields;
}
