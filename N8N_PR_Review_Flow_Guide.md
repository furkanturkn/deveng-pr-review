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
```json
{
  "resource": "chat",
  "operation": "create",
  "model": "gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "{{$json.systemPrompt}}"
    },
    {
      "role": "user", 
      "content": "{{$json.userPrompt}}"
    }
  ],
  "temperature": 0.3,
  "max_tokens": 4000
}
```

### 4.2 Response Processing
The OpenAI response will be in JSON format:
```json
{
  "overall_review": "This PR introduces good improvements but has some areas for optimization...",
  "comments": [
    {
      "path": "src/utils.js",
      "line": 15,
      "body": "Consider using const instead of let for variables that won't be reassigned"
    },
    {
      "path": "src/api.js", 
      "line": 42,
      "body": "Missing error handling for this API call. Add try-catch block."
    }
  ]
}
```

## Step 5: JavaScript Code for Comment Formatting

### 5.1 Comment Processing Function
```javascript
// Process OpenAI response and format for GitHub API
function processReviewResponse(openAIResponse, prData) {
  try {
    const reviewData = JSON.parse(openAIResponse.choices[0].message.content);
    
    // Validate response structure
    if (!reviewData.comments || !Array.isArray(reviewData.comments)) {
      throw new Error('Invalid response format from OpenAI');
    }
    
    // Group comments by file path
    const commentsByFile = {};
    reviewData.comments.forEach(comment => {
      if (!commentsByFile[comment.path]) {
        commentsByFile[comment.path] = [];
      }
      commentsByFile[comment.path].push({
        path: comment.path,
        line: comment.line,
        body: comment.body
      });
    });
    
    // Create review body
    const reviewBody = `## 🤖 Automated Code Review\n\n${reviewData.overall_review}\n\n**Files Reviewed**: ${Object.keys(commentsByFile).length}\n**Total Comments**: ${reviewData.comments.length}`;
    
    return {
      reviewBody: reviewBody,
      commentsByFile: commentsByFile,
      totalComments: reviewData.comments.length,
      filesReviewed: Object.keys(commentsByFile).length
    };
    
  } catch (error) {
    console.error('Error processing OpenAI response:', error);
    return {
      reviewBody: "❌ Error processing review. Please check the logs.",
      commentsByFile: {},
      totalComments: 0,
      filesReviewed: 0,
      error: error.message
    };
  }
}

// Format individual comment for GitHub API
function formatCommentForGitHub(comment, prData) {
  return {
    path: comment.path,
    line: comment.line,
    body: `🤖 **Automated Review**\n\n${comment.body}\n\n---\n*This comment was generated by an automated review system*`
  };
}

// Determine review state based on comments
function determineReviewState(commentsCount, hasErrors) {
  if (hasErrors) {
    return 'COMMENT'; // Neutral comment if there are errors
  }
  
  if (commentsCount === 0) {
    return 'APPROVE'; // Approve if no issues found
  } else if (commentsCount <= 3) {
    return 'COMMENT'; // Comment for minor issues
  } else {
    return 'REQUEST_CHANGES'; // Request changes for major issues
  }
}

// Main processing function
const processedReview = processReviewResponse($input.first().json, $('GitHub PR Data').first().json);
const reviewState = determineReviewState(processedReview.totalComments, !!processedReview.error);

return {
  reviewBody: processedReview.reviewBody,
  reviewState: reviewState,
  commentsByFile: processedReview.commentsByFile,
  totalComments: processedReview.totalComments,
  filesReviewed: processedReview.filesReviewed,
  error: processedReview.error
};
```

### 5.2 GitHub Review Submission Function
```javascript
// Submit review to GitHub
async function submitGitHubReview(reviewData, prData, githubToken) {
  const reviewPayload = {
    body: reviewData.reviewBody,
    event: reviewData.reviewState
  };
  
  try {
    // Submit the main review
    const reviewResponse = await fetch(
      `https://api.github.com/repos/${prData.repository.owner.login}/${prData.repository.name}/pulls/${prData.pull_request.number}/reviews`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(reviewPayload)
      }
    );
    
    if (!reviewResponse.ok) {
      throw new Error(`GitHub API error: ${reviewResponse.status} ${reviewResponse.statusText}`);
    }
    
    const reviewResult = await reviewResponse.json();
    
    // Submit individual comments if any
    const commentPromises = [];
    Object.values(reviewData.commentsByFile).forEach(fileComments => {
      fileComments.forEach(comment => {
        const commentPayload = {
          body: comment.body,
          path: comment.path,
          line: comment.line
        };
        
        commentPromises.push(
          fetch(
            `https://api.github.com/repos/${prData.repository.owner.login}/${prData.repository.name}/pulls/${prData.pull_request.number}/comments`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(commentPayload)
            }
          )
        );
      });
    });
    
    const commentResults = await Promise.allSettled(commentPromises);
    
    return {
      reviewId: reviewResult.id,
      reviewUrl: reviewResult.html_url,
      commentsSubmitted: commentResults.filter(r => r.status === 'fulfilled').length,
      errors: commentResults.filter(r => r.status === 'rejected').map(r => r.reason)
    };
    
  } catch (error) {
    console.error('Error submitting review:', error);
    throw error;
  }
}

// Usage in N8N
const reviewData = $('Process Review').first().json;
const prData = $('GitHub PR Data').first().json;
const githubToken = $credentials.githubToken;

return await submitGitHubReview(reviewData, prData, githubToken);
```

## Step 6: Complete N8N Workflow Structure

### 6.1 Node Sequence
1. **Webhook** - Receive GitHub PR webhook
2. **Set** - Extract PR data and validate
3. **HTTP Request** - Get PR files from GitHub API
4. **Code** - Process file changes and create prompts
5. **OpenAI** - Generate review using GPT-4
6. **Code** - Process OpenAI response and format comments
7. **HTTP Request** - Submit review to GitHub
8. **HTTP Request** - Submit individual comments (if any)

### 6.2 Error Handling
```javascript
// Error handling function
function handleErrors(error, context) {
  const errorMessage = {
    error: error.message,
    timestamp: new Date().toISOString(),
    context: context,
    prNumber: $('GitHub PR Data').first().json.pull_request.number
  };
  
  console.error('PR Review Error:', errorMessage);
  
  // Send error notification (optional)
  return {
    success: false,
    error: errorMessage
  };
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


