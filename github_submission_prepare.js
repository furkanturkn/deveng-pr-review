// Get the processed review data
const reviewData = $input.first().json;
const prData = reviewData.prData;
""
// Extract repository info
const owner = prData.repository.owner.login;
const repo = prData.repository.name;
const pullNumber = prData.pull_request.number;

// Prepare the main review submission
const mainReviewPayload = {
  body: reviewData.reviewBody,
  event: reviewData.reviewState
};

// Prepare individual comments for submission
const commentsToSubmit = [];

// Flatten all comments from all files
Object.keys(reviewData.commentsByFile).forEach(filePath => {
  const fileComments = reviewData.commentsByFile[filePath];
  fileComments.forEach(comment => {
    commentsToSubmit.push({
      body: comment.body,
      path: comment.path,
      line: comment.line,
      commit_id: prData.pull_request.head.sha, // Add commit SHA
      position: comment.line // Use line as position
    });
  });
});

// Create submission URLs
const reviewUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`;
const commentsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments`;

return {
  // Main review submission
  mainReview: {
    url: reviewUrl,
    method: 'POST',
    payload: mainReviewPayload
  },
  
  // Individual comments submission
  comments: commentsToSubmit.map(comment => ({
    url: commentsUrl,
    method: 'POST',
    payload: comment
  })),
  
  // Summary info
  summary: {
    totalComments: reviewData.totalComments,
    filesReviewed: reviewData.filesReviewed,
    reviewState: reviewData.reviewState,
    prNumber: pullNumber,
    prUrl: prData.pull_request.html_url
  }
};
