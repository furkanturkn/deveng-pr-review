let fileChanges = $input.all().map(item => item.json);
if (!Array.isArray(fileChanges)) {
  if (fileChanges.files) {
    fileChanges = fileChanges.files;
  } else {
    fileChanges = [fileChanges];
  }
}

const MERGE_DISTANCE = 3;

function parsePatch(patch) {
  const hunks = [];
  if (!patch) return hunks;

  const lines = patch.split("\n");
  let currentHunk = null;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = /@@ -(\d+),?\d* \+(\d+),?\d* @@/.exec(line);
      if (match) {
        if (currentHunk) hunks.push(currentHunk);

        currentHunk = {
          startLine: parseInt(match[2], 10),
          removed: [],
          added: [],
          lastLine: parseInt(match[2], 10),
        };
      }
    } else if (currentHunk) {
      if (line.startsWith("+")) {
        currentHunk.added.push(line.substring(1));
        currentHunk.lastLine++;
      } else if (line.startsWith("-")) {
        currentHunk.removed.push(line.substring(1));
      } else {
        currentHunk.lastLine++;
      }
    }
  }
  if (currentHunk) hunks.push(currentHunk);

  // Merge hunks if close
  const merged = [];
  for (const h of hunks) {
    const last = merged[merged.length - 1];
    if (last && h.startLine - last.lastLine <= MERGE_DISTANCE) {
      last.removed.push(...h.removed);
      last.added.push(...h.added);
      last.lastLine = h.lastLine;
    } else {
      merged.push(h);
    }
  }

  return merged;
}

const result = [];

for (const file of fileChanges) {
  const hunks = parsePatch(file.patch);
  for (const h of hunks) {
    result.push({
      json: {
        path: file.filename,
        startLine: h.startLine,
        removed: h.removed,
        added: h.added,
        diff: [
          ...h.removed.map(l => `- ${l}`),
          ...h.added.map(l => `+ ${l}`)
        ].join("\n")
      }
    });
  }
}

return result;
