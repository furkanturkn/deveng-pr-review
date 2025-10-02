# N8N PR Review Bot - Complete Implementation Guide

## Overview
This guide will help you build an automated PR review system using N8N that integrates with GitHub and OpenAI to provide intelligent code reviews.

## Flow Architecture

```
GitHub Webhook → Get PR Details → Get File Changes → Generate Review → Format Comments → Submit Review
```

## Step 1: GitHub PR Webhook & Filter

### 1.1 GitHub Webhook Setup
- **Event**: `pull_request` (opened, synchronize, reopened)
- **Content Type**: `application/json`

### 1.2 N8N Webhook Node
```json
{
  "httpMethod": "POST",
  "path": "github-pr-webhook",
  "responseMode": "responseNode"
}
```

### 1.3 Filter PR State (`filter_pr_state.js`)
```javascript
// Only proceed if there are comments to submit
const data = $input.first().json;
const hasComments = data.comments && data.comments.length > 0;

if (hasComments) {
  console.log(`Found ${data.comments.length} comments to submit`);
  return $input.all();
} else {
  console.log('No comments to submit, skipping...');
  return [];
}
```

## Step 2: Get File Changes

### 2.1 HTTP Request Node
- **Method**: GET
- **URL**: `{{ $json.body.pull_request.url }}/files`
- **Example**: `https://api.github.com/repos/Sekompos-Company/HuhuvAdmin/pulls/177/files`
- **Headers**: 
  - `Authorization`: `Bearer {{ $credentials.githubToken }}`
  - `Accept`: `application/vnd.github.v3+json`

## Step 3: Add Review Prompt (`add_review_prompt.js`)

### 3.1 Code Node - Prompt Generation
```javascript
// Get the file changes data
const fileChanges = $input.first().json;
const prData = $('GitHub Trigger').first().json.body;

// Ensure fileChanges is an array
let filesArray = [];
if (Array.isArray(fileChanges)) {
    filesArray = fileChanges;
} else if (fileChanges && Array.isArray(fileChanges.files)) {
    filesArray = fileChanges.files;
} else {
    filesArray = [];
}

// Create system prompt with Kotlin/Android rules
const systemPrompt = `You are an expert Kotlin/Android code reviewer. Analyze the provided code changes according to these specific rules:

# ✅ AI PR Check Ruleset for Kotlin Projects

## 📐 Kotlin Style Guidelines
- **Rule 1**: Indentation: 4 spaces (no tabs), End of line: LF (Line Feed)
- **Rule 2**: When using \`!!\` operator, add an inline comment explaining why it's safe

## 🏷 Naming Conventions
- **Rule 3**: Classes & Interfaces: PascalCase, don't prefix interfaces with 'I'
- **Rule 4**: Functions: camelCase, verb-based (loadUserData, processPayment)
- **Rule 5**: Variables: camelCase, noun-based (userName, isLoading)
- **Rule 6**: Constants: SCREAMING_SNAKE_CASE (MAX_RETRY_COUNT, DEFAULT_TIMEOUT_MS)
- **Rule 7**: Packages: lowercase with dot separation
- **Rule 8**: Resource names MUST include module prefix

Focus on these specific rules and provide actionable feedback with line numbers.`;

// Create user prompt with file changes
let userPrompt = `Please review the following pull request according to the Kotlin/Android rules above:

**PR Title**: ${prData.pull_request.title}
**PR Description**: ${prData.pull_request.body || 'No description provided'}
**Files Changed**: ${filesArray.length} files
**Total Changes**: +${prData.pull_request.additions} additions, -${prData.pull_request.deletions} deletions

**Code Changes**:
`;

// Add each file's changes to the prompt
filesArray.forEach((file, index) => {
  userPrompt += `
**File ${index + 1}**: ${file.filename}
**Status**: ${file.status}
**Changes**: +${file.additions} -${file.deletions}

\`\`\`diff
${file.patch || 'No patch available (renamed file)'}
\`\`\`
`;
});

userPrompt += `
Format your response as JSON:
{
  "comments": [
    {
      "path": "file_path",
      "line": line_number,
      "body": "Specific feedback referencing the rule number"
    }
  ]
}`;

return {
  systemPrompt: systemPrompt,
  userPrompt: userPrompt,
  fileCount: filesArray.length,
  totalChanges: prData.pull_request.additions + prData.pull_request.deletions,
  prTitle: prData.pull_request.title
};
```

## Step 4: OpenAI Integration

### 4.1 OpenAI Node Configuration
- **Resource**: Chat
- **Operation**: Create
- **Model**: GPT-4 (or your preferred model)
- **Messages**: 
  - System: `{{ $json.systemPrompt }}`
  - User: `{{ $json.userPrompt }}`
- **Temperature**: 0.3 (for consistent results)
- **Max Tokens**: 4000

### 4.2 OpenAI Response Format
The OpenAI node returns a structured response with comments:

```json
[
  {
    "index": 0,
    "message": {
      "role": "assistant",
      "content": {
        "comments": [
          {
            "path": "composeApp/src/commonMain/composeResources/drawable/reservations_ic_filter.xml",
            "line": 1,
            "body": "Rule 8: Resource name 'reservations_ic_filter' must include module prefix."
          },
          {
            "path": "composeApp/src/commonMain/composeResources/drawable/reservations_ic_filter.xml",
            "line": 1,
            "body": "Consider adding a description or comments to clarify the purpose of this drawable resource for future maintainers."
          },
          {
            "path": "composeApp/src/commonMain/composeResources/drawable/reservations_ic_filter.xml",
            "line": 33,
            "body": "Review the color resources used; consider defining colors in a separate colors.xml file to follow best practices for maintainability."
          }
        ]
      }
    }
  }
]
```

## Step 5: AI Response Processing (`ai_response_process.js`)

### 5.1 Code Node - Process OpenAI Response
```javascript
// Get OpenAI response
const openAIResponse = $input.first().json;
const prData = $('GitHub Trigger').first().json.body;

// Extract the review data from OpenAI response
let reviewData;
try {
  // Parse the content if it's a string
  if (typeof openAIResponse.message.content === 'string') {
    reviewData = JSON.parse(openAIResponse.message.content);
  } else {
    reviewData = openAIResponse.message.content;
  }
} catch (error) {
  console.error('Error parsing OpenAI response:', error);
  reviewData = { comments: [] };
}

// Validate response structure
if (!reviewData.comments || !Array.isArray(reviewData.comments)) {
  console.error('Invalid response format from OpenAI');
  reviewData.comments = [];
}

// Group comments by file path
const commentsByFile = {};
reviewData.comments.forEach(comment => {
  if (!commentsByFile[comment.path]) {
    commentsByFile[comment.path] = [];
  }
  commentsByFile[comment.path].push({
    path: comment.path,
    line: comment.line || 1, // Default to line 1 if line is 0 or undefined
    body: `🤖 **Automated Review**\n\n${comment.body}\n\n---\n*This comment was generated by an automated review system*`
  });
});

// Create review body
const reviewBody = `## 🤖 Automated Code Review\n\n**Files Reviewed**: ${Object.keys(commentsByFile).length}\n**Total Comments**: ${reviewData.comments.length}`;

// Determine review state based on comments
function determineReviewState(commentsCount) {
  if (commentsCount === 0) {
    return 'APPROVE'; // Approve if no issues found
  } else if (commentsCount <= 3) {
    return 'COMMENT'; // Comment for minor issues
  } else {
    return 'REQUEST_CHANGES'; // Request changes for major issues
  }
}

const reviewState = determineReviewState(reviewData.comments.length);

return {
  reviewBody: reviewBody,
  reviewState: reviewState,
  commentsByFile: commentsByFile,
  totalComments: reviewData.comments.length,
  filesReviewed: Object.keys(commentsByFile).length,
  prData: prData
};
```

### 5.2 Processed Output Example
```json
[
  {
    "reviewBody": "## 🤖 Automated Code Review\n\n**Files Reviewed**: 1\n**Total Comments**: 3",
    "reviewState": "COMMENT",
    "commentsByFile": {
      "composeApp/src/commonMain/composeResources/drawable/reservations_ic_filter.xml": [
        {
          "path": "composeApp/src/commonMain/composeResources/drawable/reservations_ic_filter.xml",
          "line": 1,
          "body": "🤖 **Automated Review**\n\nRule 8: Resource name 'reservations_ic_filter' must include module prefix.\n\n---\n*This comment was generated by an automated review system*"
        },
        {
          "path": "composeApp/src/commonMain/composeResources/drawable/reservations_ic_filter.xml",
          "line": 1,
          "body": "🤖 **Automated Review**\n\nConsider adding a description or comments to clarify the purpose of this drawable resource for future maintainers.\n\n---\n*This comment was generated by an automated review system*"
        },
        {
          "path": "composeApp/src/commonMain/composeResources/drawable/reservations_ic_filter.xml",
          "line": 33,
          "body": "🤖 **Automated Review**\n\nReview the color resources used; consider defining colors in a separate colors.xml file to follow best practices for maintainability.\n\n---\n*This comment was generated by an automated review system*"
        }
      ]
    },
    "totalComments": 3,
    "filesReviewed": 1,
    "prData": { /* Full PR data from GitHub webhook */ }
  }
]
```

## Step 6: GitHub Submission Preparation (`github_submission_prepare.js`)

### 6.1 Code Node - Prepare GitHub API Calls
```javascript
// Get the processed review data
const reviewData = $input.first().json;
const prData = reviewData.prData;

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
```

### 6.2 Prepared Output Example
```json
[
  {
    "mainReview": {
      "url": "https://api.github.com/repos/Sekompos-Company/HuhuvAdmin/pulls/177/reviews",
      "method": "POST",
      "payload": {
        "body": "## 🤖 Automated Code Review\n\n**Files Reviewed**: 1\n**Total Comments**: 3",
        "event": "COMMENT"
      }
    },
    "comments": [
      {
        "url": "https://api.github.com/repos/Sekompos-Company/HuhuvAdmin/pulls/177/comments",
        "method": "POST",
        "payload": {
          "body": "🤖 **Automated Review**\n\nRule 8: Resource name 'reservations_ic_filter' must include module prefix.\n\n---\n*This comment was generated by an automated review system*",
          "path": "composeApp/src/commonMain/composeResources/drawable/reservations_ic_filter.xml",
          "line": 1,
          "commit_id": "582e296254a5ee4e3d294e2013befe6e9ea1e666",
          "position": 1
        }
      }
    ],
    "summary": {
      "totalComments": 3,
      "filesReviewed": 1,
      "reviewState": "COMMENT",
      "prNumber": 177,
      "prUrl": "https://github.com/Sekompos-Company/HuhuvAdmin/pull/177"
    }
  }
]
```

### 6.3 Split In Batches Node
- **Node Type**: Split In Batches
- **Input**: `{{ $json.comments }}` (array of comments from github_submission_prepare)
- **Batch Size**: 1 (process one comment at a time)
- **Purpose**: Split the comments array so each comment is processed individually

### 6.4 HTTP Request Node - Send Comments to GitHub
- **Method**: POST
- **URL**: `{{ $json.url }}`
- **Example URL**: `https://api.github.com/repos/Sekompos-Company/HuhuvAdmin/pulls/177/comments`
- **Headers**: 
  - `Authorization`: `Bearer {{ $credentials.githubToken }}`
  - `Accept`: `application/vnd.github.v3+json`
  - `Content-Type`: `application/json`
- **Body**: `{{ $json.payload }}`

### 6.5 Example Comment Submission (after Split In Batches)
```json
{
  "body": "🤖 **Automated Review**\n\nRule 8: Resource name should include module prefix. Consider naming the file with the 'reservations_' prefix to reflect the feature.\n\n---\n*This comment was generated by an automated review system*",
  "path": "composeApp/src/commonMain/composeResources/drawable/reservations_ic_filter.xml",
  "line": 1,
  "commit_id": "582e296254a5ee4e3d294e2013befe6e9ea1e666",
  "position": 1
}
```

## Step 7: Configuration Requirements

### 7.1 Required Credentials
- **GitHub Token**: Personal Access Token with `repo` permissions
- **OpenAI API Key**: For GPT-4 access

### 7.2 Environment Variables
```bash
GITHUB_TOKEN=your_github_token_here
OPENAI_API_KEY=your_openai_api_key_here
WEBHOOK_SECRET=your_webhook_secret_here
```

### 7.3 GitHub Token Permissions
- `repo` (Full control of private repositories)
- `pull_requests:write` (Create and edit pull request reviews)

## Step 8: Testing and Deployment

### 8.1 Testing Checklist
- [ ] Webhook receives GitHub events correctly
- [ ] GitHub API calls return expected data
- [ ] OpenAI generates valid review responses
- [ ] Comments are posted to correct lines
- [ ] Review states are set appropriately

### 8.2 Monitoring
- Set up logging for all API calls
- Monitor OpenAI token usage
- Track review accuracy and feedback quality
- Set up alerts for failed reviews

## Step 9: Advanced Features (Optional)

### 9.1 Custom Review Rules
```javascript
// Custom rules for different file types
const reviewRules = {
  '.js': 'Focus on JavaScript best practices, security, and performance',
  '.py': 'Focus on Python PEP 8, security, and efficiency',
  '.java': 'Focus on Java conventions, design patterns, and security',
  '.ts': 'Focus on TypeScript types, interfaces, and modern practices'
};
```

### 9.2 Review Templates
```javascript
// Different review templates based on PR size
function getReviewTemplate(fileCount, lineCount) {
  if (lineCount > 500) {
    return 'comprehensive'; // Detailed review for large PRs
  } else if (fileCount > 10) {
    return 'focused'; // Focused review for many files
  } else {
    return 'standard'; // Standard review for small PRs
  }
}
```

## Conclusion

This guide provides a complete foundation for building an automated PR review system with N8N. The system will:

1. ✅ Trigger on GitHub PR events
2. ✅ Retrieve file changes via GitHub API
3. ✅ Generate intelligent reviews using OpenAI
4. ✅ Format and submit comments with proper line references
5. ✅ Handle errors gracefully
6. ✅ Provide comprehensive logging and monitoring

Remember to test thoroughly in a development environment before deploying to production!


