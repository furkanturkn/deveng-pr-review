// Only proceed if there are comments to submit
const data = $input.first().json;
const hasComments = data.comments && data.comments.length > 0;

if (hasComments) {
  console.log(`Found ${data.comments.length} comments to submit`);
  return $input.all();
} else {
  // Skip sending comments if none exist
  console.log('No comments to submit, skipping...');
  return [];
}
