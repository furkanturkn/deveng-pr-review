# N8N PR Review Bot - Complete Implementation Guide

## Overview
This guide will help you build an automated PR review system using N8N that integrates with GitHub and OpenAI to provide intelligent code reviews.

## Flow Architecture

```
GitHub Webhook → Get PR Details → Get File Changes → Generate Review → Format Comments → Submit Review
```

## Step 1: GitHub PR Trigger Setup

### 1.1 GitHub Webhook Configuration
- **Event**: `pull_request` (opened, synchronize, reopened)
- **Content Type**: `application/json`
- **Secret**: Generate a secure webhook secret

### 1.2 N8N Webhook Node Configuration
```json
{
  "httpMethod": "POST",
  "path": "github-pr-webhook",
  "responseMode": "responseNode",
  "options": {
    "rawBody": true
  }
}
```

### 1.3 Webhook Payload Structure
The webhook will receive this structure:
```json
{
  "action": "opened|synchronize|reopened",
  "pull_request": {
    "number": 123,
    "title": "PR Title",
    "body": "PR Description",
    "head": {
      "sha": "commit_sha",
      "ref": "branch_name"
    },
    "base": {
      "ref": "main"
    },
    "user": {
      "login": "username"
    }
  },
  "repository": {
    "name": "repo_name",
    "owner": {
      "login": "owner_name"
    }
  }
}
```

## Step 2: Get File Changes Request

### 2.1 GitHub API Endpoints Used
- **Get PR Files**: `GET /repos/{owner}/{repo}/pulls/{pull_number}/files`
- **Get PR Details**: `GET /repos/{owner}/{repo}/pulls/{pull_number}`

### 2.2 N8N HTTP Request Node Configuration
```json
{
  "method": "GET",
  "url": "https://api.github.com/repos/{{$json.repository.owner.login}}/{{$json.repository.name}}/pulls/{{$json.pull_request.number}}/files",
  "headers": {
    "Authorization": "Bearer {{$credentials.githubToken}}",
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "N8N-PR-Review-Bot"
  }
}
```

### 2.3 File Changes Data Structure
```json
[
  {
    "sha": "file_sha",
    "filename": "src/example.js",
    "status": "modified|added|removed|renamed",
    "additions": 10,
    "deletions": 5,
    "changes": 15,
    "patch": "@@ -1,3 +1,3 @@\n- old line\n+ new line\n unchanged line"
  }
]
```

## Step 3: Review Prompt Template

### 3.1 System Prompt
```
You are an expert code reviewer. Analyze the provided code changes and provide constructive feedback focusing on:

1. Code Quality & Best Practices
2. Security Vulnerabilities
3. Performance Issues
4. Maintainability
5. Testing Coverage
6. Documentation

Provide specific, actionable feedback with line numbers and suggestions for improvement.
```

### 3.2 User Prompt Template
```
Please review the following pull request:

**PR Title**: {{$json.pull_request.title}}
**PR Description**: {{$json.pull_request.body}}
**Files Changed**: {{$json.files.length}} files

**Code Changes**:
{{#each $json.files}}
**File**: {{filename}}
**Status**: {{status}}
**Changes**: +{{additions}} -{{deletions}}

```diff
{{patch}}
```

{{/each}}

Please provide a detailed review with specific comments for each file, including:
- Line-specific feedback
- Code quality suggestions
- Security concerns
- Performance optimizations
- Best practices recommendations

Format your response as JSON with the following structure:
{
  "overall_review": "General feedback about the PR",
  "comments": [
    {
      "path": "file_path",
      "line": line_number,
      "body": "Specific feedback for this line"
    }
  ]
}
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


