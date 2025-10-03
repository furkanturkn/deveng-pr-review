// Only process if PR was opened or reopened
const prAction = $input.first().json.body.action;

if (prAction === 'opened' || prAction === 'reopened') {
  return $input.all();
} else {
  // Skip processing for other actions
  return [];
}