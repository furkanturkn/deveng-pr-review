// Get OpenAI response
const aiResponse = $json.message?.content?.comments || [];

// Get PR data to extract commit id (you already have it from GitHub Trigger or Get File Changes)
const prData = $('GitHub Trigger').first().json.body.pull_request;
const commitId = prData.head.sha;

const prepared = aiResponse.map(comment => {
  return {
    json: {
      path: comment.path,
      line: comment.startLine,
      side: "RIGHT",
      body: comment.body,
      commit_id: commitId
    }
  };
});

return prepared;
