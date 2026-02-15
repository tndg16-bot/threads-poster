/**
 * Basic Test Suite for Threads Poster
 */

const ThreadsClient = require('../lib/threads-client');
const { loadConfig } = require('../lib/config');
const logger = require('../lib/logger');

async function testBasic() {
  console.log('='.repeat(60));
  console.log('Threads Poster - Basic Test Suite');
  console.log('='.repeat(60));
  console.log();

  try {
    // Load configuration
    const config = loadConfig();
    console.log('✅ Configuration loaded');
    console.log(`   Dry Run: ${config.dryRun}`);
    console.log(`   Log Level: ${config.logLevel}`);
    console.log();

    // Create client
    const client = new ThreadsClient(config);
    console.log('✅ Threads client created');
    console.log();

    // Test 1: Check authentication
    console.log('Test 1: Authentication Check');
    console.log('-'.repeat(60));
    if (!config.accessToken) {
      console.log('⚠️  No access token configured - skipping auth test');
    } else {
      const isValid = await client.checkAuth();
      if (isValid) {
        console.log('✅ Authentication successful');
        const userInfo = await client.getUserInfo();
        console.log(`   User ID: ${userInfo.id}`);
        console.log(`   Username: ${userInfo.username}`);
      } else {
        console.log('❌ Authentication failed');
        console.log('   Please check your access token in .env or config.json');
        return false;
      }
    }
    console.log();

    // Test 2: Create post container (dry run)
    console.log('Test 2: Create Post Container (Dry Run)');
    console.log('-'.repeat(60));
    const testText = `Test post from Threads Auto Poster\nTimestamp: ${new Date().toISOString()}`;

    if (config.dryRun) {
      console.log('ℹ️  Dry run mode - skipping actual API call');
      console.log(`   Text: "${testText.substring(0, 50)}..."`);
    } else {
      console.log('ℹ️  Live mode - creating actual container');
      try {
        const container = await client.createPostContainer(testText);
        console.log('✅ Container created');
        console.log(`   Container ID: ${container.id}`);
      } catch (error) {
        console.log('❌ Failed to create container');
        console.log(`   Error: ${error.message}`);
      }
    }
    console.log();

    // Test 3: Full post creation and publication (dry run)
    console.log('Test 3: Full Post Creation and Publication');
    console.log('-'.repeat(60));
    if (config.dryRun) {
      console.log('ℹ️  Dry run mode - would create and publish post');
      console.log(`   Text: "${testText.substring(0, 50)}..."`);
      console.log('✅ Dry run successful');
    } else {
      console.log('ℹ️  Live mode - creating and publishing post');
      console.log('⚠️  This will create an actual post on Threads!');
      console.log('   (Press Ctrl+C to cancel)');

      // Wait 3 seconds before posting
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        const result = await client.createAndPublishPost(testText);
        console.log('✅ Post created and published');
        console.log(`   Thread ID: ${result.threadId}`);
        console.log(`   Permalink: ${result.permalink}`);
      } catch (error) {
        console.log('❌ Failed to create and publish post');
        console.log(`   Error: ${error.message}`);
      }
    }
    console.log();

    // Test 4: Get user posts
    console.log('Test 4: Get User Posts');
    console.log('-'.repeat(60));
    if (!config.accessToken) {
      console.log('⚠️  No access token configured - skipping');
    } else {
      try {
        const posts = await client.getUserPosts(5);
        console.log(`✅ Retrieved ${posts.data?.length || 0} posts`);
        if (posts.data && posts.data.length > 0) {
          console.log('   Recent posts:');
          posts.data.slice(0, 3).forEach((post, index) => {
            console.log(`   ${index + 1}. ${post.text?.substring(0, 30) || '(no text)'}...`);
            console.log(`      Permalink: ${post.permalink || 'N/A'}`);
          });
        }
      } catch (error) {
        console.log('❌ Failed to get user posts');
        console.log(`   Error: ${error.message}`);
      }
    }
    console.log();

    console.log('='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('='.repeat(60));

    return true;

  } catch (error) {
    console.error('❌ Test suite failed with error:');
    console.error(error);
    return false;
  }
}

// Run tests
if (require.main === module) {
  testBasic()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testBasic };
