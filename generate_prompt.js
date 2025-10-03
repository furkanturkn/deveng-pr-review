const diffs = $('Parse diff').all().map(i => i.json);
const rules = $('Notion').first().json.name

const systemPrompt = `You are a strict senior code reviewer.
Follow these coding practices:

${rules}

Rules for review:
- Only comment if there is a violation.
- No positive notes.
- Keep comments 1–2 sentences.
- Output valid JSON (add "body" only if needed).
`;

return [{
  json: {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Here are the code changes:\n" + JSON.stringify(diffs, null, 2) }
    ],
    prUrl: $('Filter PR state').first().json.body.pull_request.url
  }
}];
