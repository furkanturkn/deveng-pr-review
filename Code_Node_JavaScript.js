// Get the file changes data
const fileChanges = $input.first().json;
const prData = $('GitHub Trigger').first().json.body;

// Debug: Check the structure
console.log('File changes type:', typeof fileChanges);
console.log('File changes:', fileChanges);

// Ensure fileChanges is an array
let filesArray = [];
if (Array.isArray(fileChanges)) {
    filesArray = fileChanges;
} else if (fileChanges && Array.isArray(fileChanges.files)) {
    filesArray = fileChanges.files;
} else if (fileChanges && typeof fileChanges === 'object') {
    // If it's a single file object, wrap it in an array
    filesArray = [fileChanges];
} else {
    console.error('Unexpected fileChanges structure:', fileChanges);
    filesArray = [];
}

// Create the system prompt with your specific Kotlin rules
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
  ✅ \`<string name="feature_onboarding_too_much_connection">\`
  ❌ \`<string name="too_much_connection">\`

## 📄 File Organization
- **Rule 9**: Screens: [Feature]Screen.kt, ViewModels: [Feature]ViewModel.kt, Contracts: [Feature]Contract.kt, UseCases: GetUserDataUseCase.kt

## 🧩 Jetpack Compose Guidelines
- **Rule 10**: Composable Structure: Top-level = [Feature]Screen(), Content = [Feature]ScreenContent()
- Visibility states: \`isProductListVisible\` NOT \`isProductListEmpty\`
- Always pass \`state\` and \`onEventSent\`

## 🧠 Contract Structure Rules
- **Rule 12**: Use [Feature]Contract with inner sealed classes Event, State, Effect
- **Rule 13**: State naming: descriptive names (branchDescription, userList, isFormValid)
- **Rule 14**: Event naming: action-based verbs (ClickLoginButton, NavigateToProfileScreen)
- **Rule 15**: Effect naming: descriptive outcome-based (NavigateToOtpScreen, ShowError)

## 🧱 Repository & Domain Method Naming
- **Rule 16**: Domain Layer: saveBranchInfo(), updateBranchInfo(), editBranchInfo()
- ❌ Avoid technical terms: put, post, fetch

## 🎨 Preview Guidelines
- **Rule 17**: Always wrap previews in AppTheme, use named previews for different states
- **Rule 18**: String keys MUST include context (placeholder, hint, label, error)
  ✅ \`feature_login_email_placeholder\`, \`feature_login_password_hint\`
  ❌ \`feature_login_email\` (not clear what it's for)

Focus on these specific rules and provide actionable feedback with line numbers.`;

// Create the user prompt with file changes
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
Please provide a detailed review focusing on the specific Kotlin/Android rules above. Include:

1. **Naming Convention Violations** (Rules 3-8, 13-15, 18)
2. **File Organization Issues** (Rule 9)
3. **Compose Structure Problems** (Rules 10-11)
4. **Contract Structure Issues** (Rules 12-15)
5. **Domain Layer Naming** (Rule 16)
6. **Preview Standards** (Rule 17)
7. **Code Quality & Best Practices**
8. **Security & Performance Issues**

Format your response as JSON:
{
  "overall_review": "General feedback about the PR",
  "comments": [
    {
      "path": "file_path",
      "line": line_number,
      "body": "Specific feedback referencing the rule number (e.g., 'Rule 8: Resource name should include module prefix')"
    }
  ]
}`;

return {
  systemPrompt: systemPrompt,
  userPrompt: userPrompt,
  fileCount: filesArray.length,
  totalChanges: prData.pull_request.additions + prData.pull_request.deletions,
  prTitle: prData.pull_request.title,
  debugInfo: {
    originalType: typeof fileChanges,
    processedCount: filesArray.length
  }
};
